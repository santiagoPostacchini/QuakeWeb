import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarCodigo, convertirIce, huellaPak, ALFABETO, URL_SENAL } from '../web/red-util.ts';
import { SocketSenal, crearPuenteAnfitrion, instalarSocket, type TransporteSenal } from '../web/socket-senal.ts';
import { codificar, decodificar, type Mensaje } from '../src/senal/humblepeer.ts';
import { armarArgumentos } from '../web/argumentos.ts';
import { leerDirectorio } from '../web/zip.ts';
import { prepararIce } from '../web/sala.ts';

const turno = () => new Promise<void>(resolve => queueMicrotask(resolve));
test('TURN sólo se solicita con endpoint, con timeout y fallback a STUN', async () => {
    const fetchReal = globalThis.fetch;
    const llamadas: { url: string; opciones?: RequestInit }[] = [];
    globalThis.fetch = async (url, opciones) => {
        llamadas.push({ url: String(url), opciones });
        return Response.json({ iceServers: [{ urls: 'turn:relay.example:3478', username: 'u', credential: 'p' }] });
    };
    try {
        const stun = await prepararIce(); assert.equal(llamadas.length, 0); assert.equal(stun.length, 2);
        const lista = await prepararIce('https://turn.example/'); assert.equal(lista.length, 3);
        assert.equal(llamadas[0].url, 'https://turn.example/'); assert.equal(llamadas[0].opciones?.cache, 'no-store');
        assert.ok(llamadas[0].opciones?.signal instanceof AbortSignal);
        assert.deepEqual(lista[2], { urls: 'turn:relay.example:3478', username: 'u', credential: 'p' });
        globalThis.fetch = async () => { throw new Error('sin red'); };
        assert.deepEqual(await prepararIce('https://turn.example/'), stun);
    } finally { globalThis.fetch = fetchReal; }
});
test('códigos sin caracteres ambiguos, con rechazo del sesgo', () => {
    assert.equal(generarCodigo(bytes => { bytes.set([255, 254, 0, 1, 2, 3, 4, 5]); return bytes; }), 'ABCDEF');
    for (let i = 0; i < 100; i++) {
        const codigo = generarCodigo(); assert.equal(codigo.length, 6);
        assert.ok([...codigo].every(c => ALFABETO.includes(c)));
    }
});
test('ICE sin esquema, puertos por defecto, credenciales y exclusión de TLS/TCP', () => {
    assert.deepEqual(convertirIce([
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com'] },
        { urls: ['turn:relay.example:3478?transport=udp', 'turns:relay.example:443', 'turn:relay.example:80?transport=tcp'], username: 'u', credential: 'p' },
        { urls: 'stun:[::1]:3478' },
    ]), [{ type: 1, server: 'stun.l.google.com:19302' }, { type: 1, server: 'stun.cloudflare.com:3478' },
        { type: 2, server: 'relay.example:3478', username: 'u', password: 'p' }, { type: 1, server: '[::1]:3478' }]);
});
test('huella del índice ZIP estable y sensible al tamaño y nombres', async () => {
    function zip(nombre: string, tamano: number) {
        const n = new TextEncoder().encode(nombre); const b = new Uint8Array(46 + n.length + 22); const v = new DataView(b.buffer);
        v.setUint32(0, 0x02014b50, true); v.setUint32(24, tamano, true); v.setUint16(28, n.length, true); b.set(n, 46);
        const fin = 46 + n.length; v.setUint32(fin, 0x06054b50, true); v.setUint16(fin + 10, 1, true); v.setUint32(fin + 12, fin, true);
        return new Blob([b]);
    }
    const pak = zip('maps/a.bsp', 30); const indice = await leerDirectorio(pak);
    assert.equal(huellaPak(pak.size, indice), huellaPak(pak.size, new Map([...indice].reverse())));
    assert.notEqual(huellaPak(pak.size, indice), huellaPak(pak.size + 1, indice));
    assert.notEqual(huellaPak(pak.size, indice), huellaPak(pak.size, await leerDirectorio(zip('maps/b.bsp', 30))));
    assert.notEqual(huellaPak(pak.size, indice), huellaPak(pak.size, await leerDirectorio(zip('maps/a.bsp', 31))));
});
test('argumentos de anfitrión e invitado con alias y sin mapa local al conectar', () => {
    const opciones = { mapa: 'campgrounds', modo: 0, jugadoresMax: 8, servidor: 'Sala', jugador: 'Pepe' };
    const host = armarArgumentos({ ...opciones, red: { codigo: 'ABC234', invitado: false } });
    assert.equal(host[host.indexOf('net_enabled') + 1], '1');
    assert.equal(host[host.indexOf('net_peer_server') + 1], URL_SENAL);
    assert.equal(host[host.indexOf('net_server_name') + 1], 'ABC234'); assert.ok(host.includes('+map'));
    const guest = armarArgumentos({ ...opciones, red: { codigo: 'ABC234', invitado: true } });
    assert.ok(!guest.includes('+map')); assert.ok(!guest.includes('net_server_name'));
    assert.deepEqual(guest.slice(-2), ['+connect', 'ABC234.humblenet']);
    assert.throws(() => armarArgumentos({ ...opciones, red: { codigo: 'ABC;quit', invitado: true } }));
});
test('socket falso y transporte en memoria: anfitrión, dos invitados y frames separados', async () => {
    const transportes = new Map<string, TransporteSenal>();
    const ice = convertirIce([{ urls: 'stun:stun.cloudflare.com:3478' }]);
    const puente = crearPuenteAnfitrion(ice, (par, bytes) => queueMicrotask(() => transportes.get(par)?.recibir?.(bytes)));
    const host = new SocketSenal(puente.local());
    const invitados = ['uno', 'dos'].map(par => {
        const t: TransporteSenal = { recibir: null, cerrado: null, enviar: bytes => puente.recibir(par, bytes), cerrar: () => puente.desconectar(par) };
        transportes.set(par, t); return new SocketSenal(t);
    });
    const clientes = [host, ...invitados];
    const buzones = clientes.map(socket => {
        socket.binaryType = 'arraybuffer'; const buzon: Mensaje[] = [];
        socket.addEventListener('message', e => buzon.push(decodificar(new Uint8Array((e as MessageEvent).data)))); return buzon;
    });
    let abiertos = 0; host.onopen = () => abiertos++; host.addEventListener('open', () => abiertos++);
    assert.throws(() => host.send(new Uint8Array())); await turno(); assert.equal(abiertos, 2);
    const mandar = (i: number, m: Mensaje) => clientes[i].send(codificar(m));
    clientes.forEach((_, i) => mandar(i, { tipo: 'HelloServer', version: 0, flags: 3, gameToken: 'ioquake', gameSignature: '' }));
    await turno();
    const ids = buzones.map(b => { const m = b.shift()!; assert.equal(m.tipo, 'HelloClient'); if (m.tipo !== 'HelloClient') throw Error(); assert.deepEqual(m.iceServers, ice); return m.peerId; });
    assert.equal(new Set(ids).size, 3);
    mandar(0, { tipo: 'AliasRegister', alias: 'ABC234' });
    for (const i of [1, 2]) mandar(i, { tipo: 'AliasLookup', alias: 'ABC234' });
    await turno(); for (const i of [1, 2]) assert.deepEqual(buzones[i].shift(), { tipo: 'AliasResolved', alias: 'ABC234', peerId: ids[0] });
    for (const i of [1, 2]) mandar(i, { tipo: 'P2POffer', peerId: ids[0], flags: 2, offer: `oferta${i}` });
    await turno(); assert.deepEqual(buzones[0].splice(0), ids.slice(1).map((peerId, i) => ({ tipo: 'P2POffer', peerId, flags: 2, offer: `oferta${i + 1}` })));
    for (const i of [1, 2]) {
        mandar(0, { tipo: 'P2PAnswer', peerId: ids[i], offer: 'respuesta' });
        mandar(0, { tipo: 'ICECandidate', peerId: ids[i], offer: 'ice' });
        mandar(i, { tipo: 'ICECandidate', peerId: ids[0], offer: `ice${i}` });
    }
    await turno();
    for (const i of [1, 2]) assert.deepEqual(buzones[i].splice(0), [{ tipo: 'P2PAnswer', peerId: ids[0], offer: 'respuesta' }, { tipo: 'ICECandidate', peerId: ids[0], offer: 'ice' }]);
    assert.equal(buzones[0].length, 2); buzones[0].length = 0;
    let cerrados = 0; invitados[0].onclose = () => cerrados++; invitados[0].close(); invitados[0].close(); assert.equal(cerrados, 1);
    mandar(0, { tipo: 'P2POffer', peerId: ids[1], flags: 2 }); await turno();
    assert.deepEqual(buzones[0].shift(), { tipo: 'P2PReject', peerId: ids[1], reason: 1 });
    host.close(); mandar(2, { tipo: 'AliasLookup', alias: 'ABC234' }); await turno();
    assert.deepEqual(buzones[2].shift(), { tipo: 'AliasResolved', alias: 'ABC234', peerId: 0 });
    assert.throws(() => host.send(new Uint8Array())); invitados[1].close();
});
test('el envoltorio intercepta solamente la URL especial y se restaura', async () => {
    class Real { url: string; constructor(url: string) { this.url = url; } }
    const anterior = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const ventana = { WebSocket: Real };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: ventana });
    try {
        const quitar = instalarSocket(() => ({ recibir: null, cerrado: null, enviar() {}, cerrar() {} }));
        assert.ok(new ventana.WebSocket('wss://otro.example') instanceof Real);
        const Constructor = ventana.WebSocket as unknown as typeof WebSocket;
        assert.throws(() => new Constructor(URL_SENAL, 'otro'));
        const falso = new Constructor(URL_SENAL, 'humblepeer'); assert.ok(falso instanceof SocketSenal); await turno(); falso.close();
        quitar(); assert.equal(ventana.WebSocket, Real);
    } finally { if (anterior) Object.defineProperty(globalThis, 'window', anterior); else Reflect.deleteProperty(globalThis, 'window'); }
});
