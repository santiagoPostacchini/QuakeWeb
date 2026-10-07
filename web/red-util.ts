import type { ServidorIce } from '../src/senal/humblepeer.ts';
import type { EntradaZip } from './zip.ts';

export const URL_SENAL = 'ws://quakeweb.senal/';
export const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generarCodigo(azar = (bytes: Uint8Array<ArrayBuffer>) => crypto.getRandomValues(bytes)): string {
    let codigo = '';
    while (codigo.length < 6) {
        const bytes = azar(new Uint8Array(16));
        for (const byte of bytes) {
            if (byte < 256 - 256 % ALFABETO.length) codigo += ALFABETO[byte % ALFABETO.length];
            if (codigo.length === 6) break;
        }
    }
    return codigo;
}
export function convertirIce(lista: RTCIceServer[]): ServidorIce[] {
    return lista.flatMap(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).map(url => {
        const m = /^(stun|turn):(?:\/\/)?(\[[\da-f:]+\]|[a-z\d.-]+)(?::(\d+))?(?:\?transport=udp)?$/i.exec(url);
        // HumbleNet agrega el esquema y no representa TLS ni transporte TCP.
        if (!m) return [];
        return [{ type: (m[1].toLowerCase() === 'stun' ? 1 : 2) as 1 | 2,
            server: `${m[2]}:${m[3] ?? '3478'}`, ...(s.username ? { username: s.username } : {}),
            ...(s.credential ? { password: s.credential } : {}) }];
    }).flat());
}
export function huellaPak(tamano: number, entradas: Map<string, EntradaZip>): string {
    const indice = [...entradas.values()].sort((a, b) => a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0)
        .map(e => [e.nombre, e.tamano, e.comprimido, e.metodo]);
    let hash = 2166136261;
    for (const byte of new TextEncoder().encode(JSON.stringify(indice))) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    return `${tamano}:${hash.toString(16).padStart(8, '0')}`;
}
