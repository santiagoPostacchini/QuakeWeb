import { crearServidorSenal } from '../src/senal/servidor.ts';
import type { ServidorIce } from '../src/senal/humblepeer.ts';
import { URL_SENAL } from './red-util.ts';

export type TransporteSenal = {
    enviar(bytes: Uint8Array): void;
    recibir: ((bytes: Uint8Array) => void) | null;
    cerrar(): void;
    cerrado: (() => void) | null;
};
export class SocketSenal extends EventTarget {
    static readonly CONNECTING = 0; static readonly OPEN = 1; static readonly CLOSING = 2; static readonly CLOSED = 3;
    readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSING = 2; readonly CLOSED = 3;
    readyState = 0;
    binaryType: BinaryType = 'blob';
    bufferedAmount = 0;
    extensions = '';
    protocol = 'humblepeer';
    url = URL_SENAL;
    onopen: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onclose: ((e: Event) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    transporte: TransporteSenal;
    constructor(transporte: TransporteSenal) {
        super(); this.transporte = transporte;
        transporte.recibir = bytes => {
            if (this.readyState !== 1) return;
            const copia = Uint8Array.from(bytes);
            const e = new MessageEvent('message', { data: this.binaryType === 'arraybuffer' ? copia.buffer : new Blob([copia]) });
            this.onmessage?.(e); this.dispatchEvent(e);
        };
        transporte.cerrado = () => this.close();
        queueMicrotask(() => { if (this.readyState !== 0) return; this.readyState = 1; const e = new Event('open'); this.onopen?.(e); this.dispatchEvent(e); });
    }
    send(datos: ArrayBuffer | ArrayBufferView | Blob | string) {
        if (this.readyState !== 1) throw new DOMException('El socket todavía no está abierto.', 'InvalidStateError');
        if (typeof datos === 'string' || datos instanceof Blob) throw new TypeError('HumblePeer necesita frames binarios.');
        const bytes = datos instanceof ArrayBuffer ? new Uint8Array(datos) : new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength);
        this.transporte.enviar(Uint8Array.from(bytes));
    }
    close() {
        if (this.readyState === 3) return;
        this.readyState = 3; this.transporte.cerrar();
        const e = new Event('close'); this.onclose?.(e); this.dispatchEvent(e);
    }
    fallar() { const e = new Event('error'); this.onerror?.(e); this.dispatchEvent(e); this.close(); }
}
export function crearPuenteAnfitrion(iceServers: ServidorIce[], enviar: (par: string, bytes: Uint8Array) => void) {
    const pares = new Map<string, number>();
    let local: TransporteSenal | undefined;
    let conexionLocal: number | undefined;
    const servidor = crearServidorSenal({ iceServers, enviar: (conexion, bytes) => {
        if (conexion === conexionLocal) queueMicrotask(() => local?.recibir?.(bytes));
        else for (const [par, id] of pares) if (id === conexion) enviar(par, bytes);
    } });
    return {
        local(): TransporteSenal {
            if (conexionLocal !== undefined) servidor.desconectar(conexionLocal);
            conexionLocal = servidor.conectar();
            const id = conexionLocal;
            local = { recibir: null, cerrado: null, enviar: bytes => servidor.recibir(id, bytes), cerrar: () => servidor.desconectar(id) };
            return local;
        },
        recibir(par: string, bytes: Uint8Array) {
            let id = pares.get(par);
            if (id === undefined) { id = servidor.conectar(); pares.set(par, id); }
            servidor.recibir(id, bytes);
        },
        desconectar(par: string) { const id = pares.get(par); if (id !== undefined) servidor.desconectar(id); pares.delete(par); },
    };
}
export function instalarSocket(crear: () => TransporteSenal): () => void {
    const real = window.WebSocket;
    window.WebSocket = new Proxy(real, { construct(objeto, args) {
        if (String(args[0]) !== URL_SENAL) return Reflect.construct(objeto, args);
        const protocolos = args[1];
        if (protocolos !== 'humblepeer' && !(Array.isArray(protocolos) && protocolos.includes('humblepeer'))) throw new TypeError('Falta humblepeer.');
        return new SocketSenal(crear());
    } });
    return () => { window.WebSocket = real; };
}
