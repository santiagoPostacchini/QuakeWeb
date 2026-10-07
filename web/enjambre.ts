export const TROZO = 2 * 1024 * 1024;
export const VENTANA = 6;
export const POR_FUENTE = 2;
export const MAX_SERVICIO = 2;
export const MAX_PAQUETES = 2;
export class LimiteServicio {
    activos = 0;
    readonly bytes = new Map<string, number>();
    reservar(par: string, largo: number, tamano: number): boolean {
        if (this.activos >= MAX_SERVICIO || largo <= 0 || largo > TROZO
            || (this.bytes.get(par) ?? 0) + largo > tamano * MAX_PAQUETES) return false;
        this.activos++; this.bytes.set(par, (this.bytes.get(par) ?? 0) + largo); return true;
    }
    liberar() { this.activos--; }
}
export type Manifiesto = { tamano: number; trozo: number; huella: string; hashes: string[] };
export interface AlmacenTrozos {
    leer(clave: string, i: number): Promise<Blob | undefined>;
    guardar(clave: string, i: number, blob: Blob): Promise<void>;
}
export function rutaPermitida(local?: string, remota?: string): boolean {
    return [local, remota].every(t => t === 'host' || t === 'srflx' || t === 'prflx');
}
export function rutaSeleccionada(stats: Iterable<Record<string, unknown>>): [string | undefined, string | undefined] {
    const lista = [...stats];
    const transporte = lista.find(s => s.type === 'transport' && s.selectedCandidatePairId);
    const nominados = lista.filter(s => s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated === true);
    const par = transporte ? lista.find(s => s.id === transporte.selectedCandidatePairId)
        : nominados.length === 1 ? nominados[0] : undefined;
    const tipo = (id: unknown) => lista.find(s => s.id === id)?.candidateType as string | undefined;
    return par ? [tipo(par.localCandidateId), tipo(par.remoteCandidateId)] : [undefined, undefined];
}
export function manifiestoValido(m: Manifiesto): boolean {
    return !!m && Number.isSafeInteger(m.tamano) && m.tamano > 0 && m.tamano <= 2 * 1024 ** 3
        && m.trozo === TROZO && /^\d+:[a-f0-9]{8}$/.test(m.huella)
        && Array.isArray(m.hashes) && m.hashes.length === Math.ceil(m.tamano / TROZO)
        && m.hashes.every(h => /^[a-f0-9]{64}$/.test(h));
}
export async function hashBlob(blob: Blob): Promise<string> {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
        .map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function crearManifiesto(blob: Blob, huella: string): Promise<Manifiesto> {
    const hashes: string[] = [];
    for (let i = 0; i < blob.size; i += TROZO) hashes.push(await hashBlob(blob.slice(i, i + TROZO)));
    return { tamano: blob.size, trozo: TROZO, huella, hashes };
}
export async function verificarTrozo(m: Manifiesto, i: number, blob: Blob): Promise<boolean> {
    return Number.isInteger(i) && i >= 0 && i < m.hashes.length
        && blob.size === Math.min(TROZO, m.tamano - i * TROZO) && await hashBlob(blob) === m.hashes[i];
}
export const claveManifiesto = (m: Manifiesto) => JSON.stringify(m);
export interface TransporteTrozos {
    fuentes(): Promise<Map<string, Set<number>>>;
    pedir(par: string, i: number, signal: AbortSignal): Promise<Blob>;
}
export async function descargar(m: Manifiesto, almacen: AlmacenTrozos, transporte: TransporteTrozos,
    progreso: (bytes: number, fuentes: number, disponibles: Set<number>) => void, signal: AbortSignal,
    timeout = 15000): Promise<Blob> {
    if (!manifiestoValido(m)) throw new Error('Manifiesto inválido.');
    const clave = claveManifiesto(m), partes: Blob[] = [], disponibles = new Set<number>(), vetados = new Set<string>();
    let bytes = 0;
    for (let i = 0; i < m.hashes.length; i++) {
        signal.throwIfAborted();
        const blob = await almacen.leer(clave, i);
        if (blob && await verificarTrozo(m, i, blob)) { partes[i] = blob; disponibles.add(i); bytes += blob.size; }
    }
    const vuelos = new Map<number, Promise<void>>(), cuenta = new Map<string, number>(), descanso = new Map<string, number>();
    try {
        while (disponibles.size < m.hashes.length || vuelos.size) {
            signal.throwIfAborted();
            const fuentes = await transporte.fuentes();
            const aptas = [...fuentes].filter(([p]) => !vetados.has(p) && (descanso.get(p) ?? 0) <= Date.now());
            progreso(bytes, aptas.length, new Set(disponibles));
            for (let i = 0; i < m.hashes.length && vuelos.size < VENTANA; i++) {
                if (disponibles.has(i) || vuelos.has(i)) continue;
                const fuente = aptas.filter(([p, tiene]) => tiene.has(i) && (cuenta.get(p) ?? 0) < POR_FUENTE)
                    .sort(([a], [b]) => (cuenta.get(a) ?? 0) - (cuenta.get(b) ?? 0))[0];
                if (!fuente) continue;
                const par = fuente[0]; cuenta.set(par, (cuenta.get(par) ?? 0) + 1);
                const tarea = (async () => {
                    const control = new AbortController();
                    const abortar = () => control.abort(signal.reason);
                    signal.addEventListener('abort', abortar, { once: true });
                    const reloj = setTimeout(() => control.abort(new Error('Tiempo de pedido agotado.')), timeout);
                    let persistiendo = false;
                    try {
                        const blob = await Promise.race([transporte.pedir(par, i, control.signal), new Promise<never>((_, no) => {
                            control.signal.addEventListener('abort', () => no(control.signal.reason), { once: true });
                        })]);
                        if (!await verificarTrozo(m, i, blob)) { vetados.add(par); return; }
                        if (vetados.has(par)) return;
                        persistiendo = true;
                        await almacen.guardar(clave, i, blob);
                        partes[i] = blob; disponibles.add(i); bytes += blob.size;
                    } catch (e) {
                        if (signal.aborted || persistiendo) throw e;
                        descanso.set(par, Date.now() + timeout);
                    } finally {
                        clearTimeout(reloj); signal.removeEventListener('abort', abortar);
                        vuelos.delete(i); cuenta.set(par, (cuenta.get(par) ?? 1) - 1);
                    }
                })();
                vuelos.set(i, tarea);
            }
            if (vuelos.size) await Promise.race(vuelos.values());
            else if (disponibles.size < m.hashes.length) await new Promise<void>(r => setTimeout(r, 250));
        }
        progreso(bytes, (await transporte.fuentes()).size, disponibles);
        return new Blob(partes);
    } finally { await Promise.allSettled(vuelos.values()); }
}
