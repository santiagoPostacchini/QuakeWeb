import { joinRoom as nostr, type Room, type DataPayload, type MessageAction } from '@trystero-p2p/nostr';
import { joinRoom as torrent } from '@trystero-p2p/torrent';
import { convertirIce } from './red-util.ts';
import { crearPuenteAnfitrion, instalarSocket, type TransporteSenal } from './socket-senal.ts';

export type InfoPartida = { servidor: string; mapa: string; modo: number; jugadores: number; max: number; huella: string };
export async function prepararIce(endpoint?: string): Promise<RTCIceServer[]> {
    const lista: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
    if (endpoint?.trim()) {
        try {
            const respuesta = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
            if (!respuesta.ok) throw new Error('TURN no disponible');
            const datos = await respuesta.json();
            const servidores = Array.isArray(datos) ? datos : datos.iceServers;
            if (Array.isArray(servidores)) for (const s of servidores) {
                if (s && (typeof s.urls === 'string' || Array.isArray(s.urls) && s.urls.every((u: unknown) => typeof u === 'string')))
                    lista.push({ urls: s.urls, username: typeof s.username === 'string' ? s.username : undefined,
                        credential: typeof s.credential === 'string' ? s.credential : undefined });
            }
        } catch { /* Se continúa con STUN si el endpoint no responde. */ }
    }
    return convertirIce(lista).map(s => ({ urls: `${s.type === 1 ? 'stun' : 'turn'}:${s.server}`, username: s.username, credential: s.password }));
}
export function entrarSala(codigo: string, ice: RTCIceServer[], anfitrion: InfoPartida | null,
    cambio: (info: InfoPartida | null) => void, aviso: (texto: string) => void) {
    const estrategias: { nombre: string; sala: Room }[] = [];
    const rutas = new Map<string, Set<number>>();
    let host: string | null = null;
    let info: InfoPartida | null = anfitrion;
    let activo = true;
    let instalada = false;
    let socket: TransporteSenal | undefined;
    let restaurar: (() => void) | undefined;
    const colas = new Map<string, Promise<void>>();
    // El polyfill evita que cada estrategia reemplace la lista ICE por sus defaults.
    class Conexion extends RTCPeerConnection {
        constructor(config?: RTCConfiguration) { super({ ...config, iceServers: ice }); }
    }
    for (const [nombre, join] of [['nostr', nostr], ['torrent', torrent]] as const) {
        try { estrategias.push({ nombre, sala: join({ appId: 'quakeweb', rtcPolyfill: Conexion }, codigo) }); }
        catch { aviso(`No se pudo iniciar ${nombre}.`); }
    }
    if (!estrategias.length) throw new Error('No se pudo iniciar la búsqueda de la partida.');
    const frames = estrategias.map(e => e.sala.makeAction<Uint8Array>('humble'));
    const infos = estrategias.map(e => e.sala.makeAction<InfoPartida>('info'));
    const controles = estrategias.map(e => e.sala.makeAction<string>('control'));
    function enviar<T extends DataPayload>(acciones: MessageAction<T>[], par: string, datos: T) {
        const anterior = colas.get(par) ?? Promise.resolve();
        const siguiente = anterior.then(async () => {
            if (!activo) return;
            const ruta = [...(rutas.get(par) ?? [])].sort()[0];
            if (ruta === undefined) throw new Error('Se perdió el par.');
            await acciones[ruta].send(datos, { target: par });
        }).catch(() => { aviso('Se encontró la partida pero no conecta. Revisá la red y el diagnóstico.'); socket?.cerrado?.(); });
        colas.set(par, siguiente);
    }
    const puente = anfitrion ? crearPuenteAnfitrion(convertirIce(ice), (par, bytes) => enviar(frames, par, bytes)) : null;
    function publicar() {
        if (!anfitrion) return;
        info = { ...anfitrion, jugadores: 1 + jugando.size };
        cambio(info);
        for (const par of rutas.keys()) enviar(infos, par, info);
    }
    const jugando = new Set<string>();
    estrategias.forEach(({ sala }, i) => {
        sala.onPeerJoin = par => {
            const ruta = rutas.get(par) ?? new Set<number>(); ruta.add(i); rutas.set(par, ruta);
            publicar();
        };
        sala.onPeerLeave = par => {
            rutas.get(par)?.delete(i);
            if (rutas.get(par)?.size) return;
            rutas.delete(par); colas.delete(par); jugando.delete(par); puente?.desconectar(par); publicar();
            if (par === host) { host = null; info = null; cambio(null); socket?.cerrado?.(); aviso('El anfitrión se desconectó.'); }
        };
        infos[i].onMessage = (datos, { peerId }) => {
            if (!activo || anfitrion || host && host !== peerId || !datos || typeof datos.servidor !== 'string'
                || !/^[a-z0-9_-]+$/i.test(datos.mapa) || ![0, 1, 3, 4, 5].includes(datos.modo)
                || !Number.isInteger(datos.max) || datos.max < 2 || datos.max > 16 || !Number.isInteger(datos.jugadores)
                || !/^\d+:[a-f0-9]{8}$/.test(datos.huella)) return;
            host = peerId; info = datos; cambio(datos);
        };
        frames[i].onMessage = (bytes, { peerId }) => {
            if (!activo || !(bytes instanceof Uint8Array)) return;
            if (puente) puente.recibir(peerId, bytes);
            else if (peerId === host) socket?.recibir?.(bytes);
        };
        controles[i].onMessage = (dato, { peerId }) => {
            if (dato === 'cerrar') { puente?.desconectar(peerId); jugando.delete(peerId); publicar(); }
            if (dato === 'jugando' && anfitrion) { jugando.add(peerId); publicar(); }
        };
    });
    const reloj = setInterval(publicar, 3000);
    const espera = setTimeout(() => {
        if (!info && activo) aviso(rutas.size ? 'Hay pares en la sala, pero el anfitrión no responde: no conecta.'
            : 'No se encontró la partida. Revisá el código y que el anfitrión tenga la página abierta.');
    }, 15000);
    return {
        codigo,
        info: () => info,
        anfitrion: () => host,
        instalar() {
            if (instalada) throw new Error('El motor ya tiene un socket de señalización.');
            instalada = true;
            restaurar = instalarSocket(() => {
                if (puente) { socket = puente.local(); return socket; }
                if (!host) throw new Error('No se encontró al anfitrión.');
                const par = host;
                socket = { recibir: null, cerrado: null, enviar: bytes => enviar(frames, par, bytes),
                    cerrar: () => enviar(controles, par, 'cerrar') };
                return socket;
            });
        },
        jugando() { if (host) enviar(controles, host, 'jugando'); },
        diagnostico() {
            return [`Sala: ${codigo}`, ...estrategias.map((e, i) => `${e.nombre}: ${[...rutas].filter(([, r]) => r.has(i)).map(([p]) => p).join(', ') || 'sin pares conectados'}`),
                `ICE: ${ice.flatMap(s => s.urls).join(', ')}`].join('\n');
        },
        async salir() {
            if (!activo) return;
            activo = false; clearTimeout(espera); clearInterval(reloj);
            socket?.cerrado?.(); restaurar?.();
            await Promise.allSettled(estrategias.map(e => e.sala.leave()));
        },
    };
}
