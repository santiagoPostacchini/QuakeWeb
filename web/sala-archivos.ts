import { joinRoom as nostr, type Room } from '@trystero-p2p/nostr';
import { joinRoom as torrent } from '@trystero-p2p/torrent';
import { almacenTrozos } from './archivos.ts';
import { crearManifiesto, manifiestoValido, claveManifiesto, descargar, rutaSeleccionada, rutaPermitida,
    TROZO, LimiteServicio, type Manifiesto } from './enjambre.ts';

type Control = { t: 'estado'; m: Manifiesto | null; rangos: number[][] } | { t: 'pedir'; i: number; clave: string; id: number };
function rangos(indices: Set<number>): number[][] {
    const salida: number[][] = [];
    for (const i of [...indices].sort((a, b) => a - b)) {
        const ultimo = salida.at(-1);
        if (ultimo && ultimo[1] + 1 === i) ultimo[1] = i;
        else salida.push([i, i]);
    }
    return salida;
}
export function entrarArchivos(codigo: string, anfitrion: boolean, local: () => { blob: Blob; huella: string } | null,
    huellaEsperada: () => string | undefined, hostEsperado: () => string | null,
    aviso: (texto: string, fraccion?: number) => void) {
    class Directa extends RTCPeerConnection {
        constructor(config?: RTCConfiguration) {
            super({ ...config, iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] });
        }
    }
    const salas: Room[] = [];
    for (const join of [nostr, torrent]) {
        try { salas.push(join({ appId: 'quakeweb-archivos', rtcPolyfill: Directa }, codigo)); } catch { /* La otra estrategia sigue disponible. */ }
    }
    let activo = true, m: Manifiesto | null = null, completo: Blob | null = null, preparando = false;
    let disponibles = new Set<number>(), secuencia = 0, verificandoLocal = false;
    const fuentes = new Map<string, { m: Manifiesto; indices: Set<number> }>();
    const diagnosticos = new Map<string, { ruta: string; recibidos: number; servidos: number }>();
    const servicio = new LimiteServicio();
    const pendientes = new Map<number, { par: string; resolver: (blob: Blob) => void }>();
    const control = new AbortController();
    const controles = salas.map(s => s.makeAction<Control>('archctl'));
    const datos = salas.map(s => s.makeAction<Uint8Array>('archdata'));
    function registro(par: string) {
        if (!diagnosticos.has(par)) diagnosticos.set(par, { ruta: 'desconocida', recibidos: 0, servidos: 0 });
        return diagnosticos.get(par)!;
    }
    async function directa(sala: Room, par: string) {
        try {
            const conexion = sala.getPeers()[par];
            if (!conexion) return false;
            const ruta = rutaSeleccionada((await conexion.getStats()).values());
            registro(par).ruta = ruta.map(t => t ?? 'desconocida').join('/');
            return rutaPermitida(...ruta);
        } catch { registro(par).ruta = 'desconocida'; return false; }
    }
    async function publicar() {
        if (!activo) return;
        await Promise.allSettled(salas.flatMap(s => Object.keys(s.getPeers()).map(p => directa(s, p))));
        const pak = local();
        if (!m && anfitrion && pak && !preparando) {
            preparando = true;
            try {
                const resultado = await crearManifiesto(pak.blob, pak.huella);
                if (!activo) return;
                m = resultado; completo = pak.blob;
                disponibles = new Set(m.hashes.map((_, i) => i));
            } catch (e) { aviso(`No se pudieron preparar los archivos: ${(e as Error).message}`); }
            finally { preparando = false; }
        }
        await Promise.allSettled(controles.map(c => c.send({ t: 'estado', m, rangos: rangos(disponibles) })));
    }
    salas.forEach((s, n) => {
        s.onPeerJoin = par => { registro(par); void publicar(); };
        s.onPeerLeave = par => {
            if (!salas.some(sala => sala.getPeers()[par])) fuentes.delete(par);
        };
        controles[n].onMessage = (mensaje, { peerId: par }) => {
            void (async () => {
                if (!activo || !mensaje) return;
                if (mensaje.t === 'estado') {
                    if (!mensaje.m || !manifiestoValido(mensaje.m) || mensaje.m.huella !== huellaEsperada()) return;
                    if (!m && par === hostEsperado()) m = mensaje.m;
                    if (!m || claveManifiesto(m) !== claveManifiesto(mensaje.m) || !Array.isArray(mensaje.rangos)) return;
                    const indices = new Set<number>();
                    if (mensaje.rangos.length > m.hashes.length) return;
                    for (const rango of mensaje.rangos) {
                        if (!Array.isArray(rango) || rango.length !== 2) return;
                        const [a, b] = rango;
                        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a || b >= m.hashes.length) return;
                        for (let i = a; i <= b; i++) indices.add(i);
                    }
                    fuentes.set(par, { m: mensaje.m, indices });
                    const pak = local();
                    if (pak?.huella === m.huella && pak.blob.size === m.tamano && !completo && !verificandoLocal) {
                        // Un pak local sólo se anuncia tras verificar sus hashes contra el anfitrión.
                        verificandoLocal = true;
                        try {
                            const propio = await crearManifiesto(pak.blob, pak.huella);
                            if (activo && claveManifiesto(propio) === claveManifiesto(m)) {
                                completo = pak.blob; disponibles = new Set(m.hashes.map((_, i) => i));
                            }
                        } finally { verificandoLocal = false; }
                    }
                    return;
                }
                if (mensaje.t !== 'pedir' || !m || mensaje.clave !== claveManifiesto(m)
                    || !Number.isInteger(mensaje.id) || !Number.isInteger(mensaje.i) || !disponibles.has(mensaje.i)
                    || !await directa(s, par) || !activo) return;
                const largo = Math.min(TROZO, m.tamano - mensaje.i * TROZO);
                if (!servicio.reservar(par, largo, m.tamano)) return;
                try {
                    const blob = completo?.slice(mensaje.i * TROZO, (mensaje.i + 1) * TROZO)
                        ?? await almacenTrozos.leer(claveManifiesto(m), mensaje.i);
                    if (!blob || !activo || !await directa(s, par)) return;
                    await datos[n].send(new Uint8Array(await blob.arrayBuffer()),
                        { target: par, metadata: { id: mensaje.id } });
                    registro(par).servidos++;
                } finally { servicio.liberar(); }
            })().catch(e => aviso(`Archivos: ${(e as Error).message}`));
        };
        datos[n].onMessage = (bytes, { peerId: par, metadata }) => {
            const id = (metadata as { id?: number } | undefined)?.id;
            const pedido = id === undefined ? undefined : pendientes.get(id);
            if (!pedido || pedido.par !== par || !(bytes instanceof Uint8Array) || bytes.byteLength > TROZO) return;
            void directa(s, par).then(ok => {
                if (ok && activo) { registro(par).recibidos++; pedido.resolver(new Blob([Uint8Array.from(bytes)])); }
            });
        };
    });
    let descargando = false;
    const reloj = setInterval(() => { void publicar(); }, 3000);
    void publicar();
    return {
        diagnostico: () => ['Archivos (sólo STUN):', ...[...diagnosticos].map(([p, d]) =>
            `${p}: ${d.ruta}; recibidos ${d.recibidos}, servidos ${d.servidos}`)].join('\n'),
        async descargar(): Promise<Blob> {
            if (descargando) throw new Error('La descarga ya está en curso.');
            descargando = true;
            const inicio = performance.now(); let base = -1;
            try {
                while (!m) {
                    control.signal.throwIfAborted();
                    aviso('Preparando los archivos del anfitrión…');
                    await new Promise(r => setTimeout(r, 500));
                    const peers = salas.flatMap(s => Object.keys(s.getPeers()).map(p => ({ s, p })));
                    if (performance.now() - inicio > 15000 && !(await Promise.all(peers.map(({ s, p }) => directa(s, p)))).some(Boolean))
                        aviso('No hay conexión directa con ningún jugador (hace falta la misma red o un router que permita conexión directa). Elegí tu carpeta de Quake Live.');
                }
                const manifiesto = m;
                const blob = await descargar(manifiesto, almacenTrozos, {
                    fuentes: async () => {
                        const salida = new Map<string, Set<number>>();
                        for (const [par, fuente] of fuentes) {
                            if (claveManifiesto(fuente.m) !== claveManifiesto(manifiesto)) continue;
                            for (const s of salas) if (await directa(s, par)) { salida.set(par, fuente.indices); break; }
                        }
                        return salida;
                    },
                    pedir: async (par, i, signal) => {
                        for (let n = 0; n < salas.length; n++) if (await directa(salas[n], par)) {
                            signal.throwIfAborted();
                            const id = ++secuencia;
                            return new Promise<Blob>((resolver, rechazar) => {
                                const limpiar = () => { pendientes.delete(id); signal.removeEventListener('abort', abortar); };
                                const abortar = () => { limpiar(); rechazar(signal.reason); };
                                pendientes.set(id, { par, resolver: blob => { limpiar(); resolver(blob); } });
                                signal.addEventListener('abort', abortar, { once: true });
                                void controles[n].send({ t: 'pedir', i, clave: claveManifiesto(manifiesto), id }, { target: par })
                                    .catch(e => { limpiar(); rechazar(e); });
                            });
                        }
                        throw new Error('Se perdió la conexión directa.');
                    },
                }, (bytes, cantidad, tiene) => {
                    disponibles = tiene;
                    if (base < 0) base = bytes;
                    const velocidad = (bytes - base) / Math.max(1, (performance.now() - inicio) / 1000) / 1024 ** 2;
                    aviso(cantidad ? `${(bytes / 1024 ** 2).toFixed(1)} / ${(manifiesto.tamano / 1024 ** 2).toFixed(1)} MB · ${velocidad.toFixed(1)} MB/s · ${cantidad} fuentes`
                        : 'No hay conexión directa con ningún jugador (hace falta la misma red o un router que permita conexión directa). Elegí tu carpeta de Quake Live.', bytes / manifiesto.tamano);
                }, control.signal);
                completo = blob; await publicar(); return blob;
            } finally { descargando = false; }
        },
        huella: () => m?.huella,
        async salir() { activo = false; control.abort(new Error('Se cerró la sala de archivos.')); clearInterval(reloj); await Promise.allSettled(salas.map(s => s.leave())); },
    };
}
