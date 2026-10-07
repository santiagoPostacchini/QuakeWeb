import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { crearServidorLocal } from '../herramientas/senal-local.ts';
import { codificar, decodificar } from '../src/senal/humblepeer.ts';
import type { Mensaje } from '../src/senal/humblepeer.ts';

test('WebSocket: dos saludos e intercambio de oferta en frames binarios', { timeout: 5000 }, async t => {
  const registros: string[] = [];
  const servidor = crearServidorLocal({ puerto: 0, registrar: texto => registros.push(texto) });
  t.after(async () => {
    for (const socket of servidor.clients) socket.terminate();
    await new Promise<void>((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
  });
  await once(servidor, 'listening');
  const direccion = servidor.address();
  assert.ok(direccion && typeof direccion === 'object');
  const url = `ws://127.0.0.1:${direccion.port}`;
  const a = new WebSocket(url, 'humblepeer'), b = new WebSocket(url, ['otro', 'humblepeer']);
  t.after(() => { a.terminate(); b.terminate(); });
  await Promise.all([once(a, 'open'), once(b, 'open')]);
  assert.equal(a.protocol, 'humblepeer'); assert.equal(b.protocol, 'humblepeer');
  async function intercambio(socket: WebSocket, m: Mensaje) {
    const llegada = once(socket, 'message');
    socket.send(codificar(m));
    const [bytes, binario] = await llegada;
    assert.equal(binario, true);
    return decodificar(bytes);
  }
  const saludo: Mensaje = { tipo: 'HelloServer', version: 0, flags: 3, gameToken: 'ioquake', gameSignature: '' };
  const [sa, sb] = await Promise.all([intercambio(a, saludo), intercambio(b, saludo)]);
  assert.ok(sa.tipo === 'HelloClient' && sb.tipo === 'HelloClient');
  assert.notEqual(sa.peerId, sb.peerId);
  const recibida = once(b, 'message');
  a.send(codificar({ tipo: 'P2POffer', peerId: sb.peerId, flags: 2, offer: 'SDP privado' }));
  const [bytes, binario] = await recibida;
  assert.equal(binario, true);
  assert.deepEqual(decodificar(bytes), { tipo: 'P2POffer', peerId: sa.peerId, flags: 2, offer: 'SDP privado' });
  a.send(codificar({ tipo: 'AliasRegister', alias: 'Sala' }));
  await intercambio(a, { tipo: 'AliasLookup', alias: 'Sala' });
  assert.ok(registros.some(r => r.includes('AliasRegister') && r.includes('Sala')));
  assert.ok(registros.some(r => r.includes('Salida P2POffer')));
  assert.ok(registros.every(r => !r.includes('SDP privado')));
  for (const protocolo of [undefined, 'otro']) {
    const rechazado = new WebSocket(url, protocolo);
    t.after(() => rechazado.terminate());
    const [error] = await once(rechazado, 'error');
    assert.match(error.message, /401/);
  }
  const cerrado = once(a, 'close');
  a.send('texto');
  const [codigo] = await cerrado;
  assert.equal(codigo, 1003);
});
