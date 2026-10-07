import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TROZO, VENTANA, POR_FUENTE, crearManifiesto, verificarTrozo, manifiestoValido,
    rutaPermitida, rutaSeleccionada, descargar, claveManifiesto, LimiteServicio, MAX_SERVICIO, MAX_PAQUETES, type AlmacenTrozos } from '../web/enjambre.ts';

function memoria(): AlmacenTrozos & { datos: Map<string, Blob> } {
    const datos = new Map<string, Blob>();
    return { datos, leer: async (c, i) => datos.get(`${c}:${i}`), guardar: async (c, i, b) => { datos.set(`${c}:${i}`, b); } };
}
const huella = '1:12345678';
test('servicio limita simultáneos y presupuesto total por par, incluso tras reconectar', () => {
    const limite = new LimiteServicio();
    for (let i = 0; i < MAX_SERVICIO; i++) assert.ok(limite.reservar(`par${i}`, TROZO, TROZO));
    assert.equal(limite.reservar('otro', TROZO, TROZO), false);
    for (let i = 0; i < MAX_SERVICIO; i++) limite.liberar();
    for (let i = 1; i < MAX_PAQUETES; i++) { assert.ok(limite.reservar('par0', TROZO, TROZO)); limite.liberar(); }
    assert.equal(limite.reservar('par0', 1, TROZO), false);
    assert.ok(limite.reservar('nuevo', TROZO, TROZO));
});
test('sólo permite rutas conocidas directas en ambos extremos', () => {
    for (const a of ['host', 'srflx', 'prflx']) for (const b of ['host', 'srflx', 'prflx']) assert.ok(rutaPermitida(a, b));
    for (const t of ['relay', undefined, 'desconocido']) { assert.equal(rutaPermitida(t, 'host'), false); assert.equal(rutaPermitida('host', t), false); }
    const stats = [{ id: 't', type: 'transport', selectedCandidatePairId: 'p' },
        { id: 'p', type: 'candidate-pair', localCandidateId: 'a', remoteCandidateId: 'b' },
        { id: 'a', candidateType: 'host' }, { id: 'b', candidateType: 'relay' }];
    assert.deepEqual(rutaSeleccionada(stats), ['host', 'relay']);
    assert.deepEqual(rutaSeleccionada([]), [undefined, undefined]);
});
test('manifiesto, tamaño y hash verifican también el último trozo', async () => {
    const blob = new Blob([new Uint8Array(TROZO + 3)]), m = await crearManifiesto(blob, huella);
    assert.ok(manifiestoValido(m)); assert.equal(m.hashes.length, 2);
    assert.ok(await verificarTrozo(m, 1, blob.slice(TROZO)));
    assert.equal(await verificarTrozo(m, 1, new Blob([new Uint8Array(3).fill(1)])), false);
    assert.equal(await verificarTrozo(m, 0, blob.slice(0, 3)), false);
    assert.equal(manifiestoValido({ ...m, hashes: [] }), false);
});
test('enjambre veta una fuente corrupta y respeta ventana y pedidos por fuente', async () => {
    const blob = new Blob([new Uint8Array(TROZO * 8 + 1)]), m = await crearManifiesto(blob, huella);
    const indices = new Set(m.hashes.map((_, i) => i)), cuenta = new Map<string, number>();
    let total = 0, maximo = 0, malos = 0;
    const resultado = await descargar(m, memoria(), {
        fuentes: async () => new Map([['mala', indices], ['buena', indices]]),
        pedir: async (p, i) => {
            cuenta.set(p, (cuenta.get(p) ?? 0) + 1); total++; maximo = Math.max(maximo, total);
            assert.ok(cuenta.get(p)! <= POR_FUENTE);
            await new Promise(r => setTimeout(r, 5));
            cuenta.set(p, cuenta.get(p)! - 1); total--;
            if (p === 'mala') { malos++; return new Blob([new Uint8Array(1)]); }
            return blob.slice(i * TROZO, (i + 1) * TROZO);
        },
    }, () => {}, new AbortController().signal, 30);
    assert.ok(maximo <= VENTANA); assert.ok(malos <= POR_FUENTE);
    assert.equal(resultado.size, blob.size);
});
test('reanuda trozos guardados y reintenta tras caída con la otra fuente', async () => {
    const blob = new Blob([new Uint8Array(TROZO * 4 + 2)]), m = await crearManifiesto(blob, huella);
    const store = memoria(), indices = new Set(m.hashes.map((_, i) => i));
    await store.guardar(claveManifiesto(m), 0, blob.slice(0, TROZO));
    const pedidos: [string, number][] = []; let caida = false;
    const resultado = await descargar(m, store, {
        fuentes: async () => new Map([['inestable', indices], ['estable', indices]]),
        pedir: async (p, i) => {
            pedidos.push([p, i]);
            if (p === 'inestable' && i > 1) { caida = true; return new Promise(() => {}); }
            return blob.slice(i * TROZO, (i + 1) * TROZO);
        },
    }, () => {}, new AbortController().signal, 20);
    assert.ok(caida); assert.ok(pedidos.every(([, i]) => i !== 0));
    assert.ok(pedidos.some(([p, i]) => p === 'estable' && i === 3));
    assert.equal(resultado.size, blob.size); assert.equal(store.datos.size, m.hashes.length);
});
test('una descarga totalmente guardada no pide datos y una falla de almacenamiento se informa', async () => {
    const blob = new Blob(['pak']), m = await crearManifiesto(blob, huella), store = memoria();
    await store.guardar(claveManifiesto(m), 0, blob);
    const transporte = { fuentes: async () => new Map([['par', new Set([0])]]), pedir: async () => blob };
    const resultado = await descargar(m, store, { ...transporte, pedir: async () => { throw new Error('No debe pedir'); } }, () => {}, new AbortController().signal);
    assert.equal(await resultado.text(), 'pak');
    await assert.rejects(descargar(m, { leer: async () => undefined, guardar: async () => { throw new Error('Sin cuota'); } },
        transporte, () => {}, new AbortController().signal), /Sin cuota/);
});
