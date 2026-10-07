import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarArgumentos, citarCvar, sanearCvar } from '../web/argumentos.ts';
import { detectarSalida, MARCA_SALIR } from '../web/salida-motor.ts';

const opciones = { mapa: 'campgrounds', modo: 4, jugadoresMax: 8, servidor: 'Mi servidor', jugador: 'Jugador' };

test('sanea cvars e impide separar comandos o cerrar comillas', () => {
    assert.equal(sanearCvar('Pepe";quit\r\n\\\0'), 'Pepequit');
    assert.equal(citarCvar('Juan Pérez'), '"Juan Pérez"');
});
test('arma los argumentos del motor y conserva nombres con espacios', () => {
    assert.deepEqual(armarArgumentos(opciones), [
        '+set', 'com_build', '1', '+set', 'sv_pure', '0', '+set', 'r_mode', '-2', '+set', 'net_enabled', '0',
        '+set', 'g_gametype', '4', '+set', 'sv_maxclients', '8',
        '+set', 'sv_hostname', '"Mi', 'servidor"', '+set', 'name', '"Jugador"', '+map', 'campgrounds',
    ]);
    const argumentos = armarArgumentos({ ...opciones, jugador: 'a";quit\n' });
    assert.equal(argumentos[argumentos.indexOf('name') + 1], '"aquit"');
    const reconstruir = (argv: string[]) => argv.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ');
    assert.ok(reconstruir(armarArgumentos({ ...opciones, jugador: 'Juan Pérez + quit' })).includes('name "Juan Pérez + quit"'));
});
test('rechaza mapas con comandos y valores numéricos inválidos', () => {
    for (const mapa of ['', '../campgrounds', 'campgrounds;quit', 'campgrounds\nquit']) {
        assert.throws(() => armarArgumentos({ ...opciones, mapa }));
    }
    for (const modo of [NaN, 2, 99]) assert.throws(() => armarArgumentos({ ...opciones, modo }));
    for (const jugadoresMax of [NaN, 1, 17, 2.5]) assert.throws(() => armarArgumentos({ ...opciones, jugadoresMax }));
});
test('detecta sólo la marca completa, también con hora o colores', () => {
    assert.equal(detectarSalida(MARCA_SALIR).salir, true);
    assert.equal(detectarSalida(`[12:34:56] ^2${MARCA_SALIR}^7`).salir, true);
    assert.equal(detectarSalida(`echo ${MARCA_SALIR}`).salir, false);
    assert.equal(detectarSalida(`alias quit "echo ${MARCA_SALIR}"`).salir, false);
});
test('detecta fallas graves sin confundir advertencias del renderer', () => {
    for (const linea of ['ERROR: sin memoria', '^1ERROR: mapa inválido', '[12:00:00] Server crashed: fallo', '----- Server Shutdown (Server crashed: fallo) -----', 'Uncaught Infinity']) {
        assert.ok(detectarSalida(linea).error);
    }
    for (const linea of ['WARNING: shader ausente', '0 errors', 'Server initialized']) assert.equal(detectarSalida(linea).error, undefined);
});
