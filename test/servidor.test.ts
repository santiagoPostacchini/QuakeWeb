import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidorSenal } from '../src/senal/servidor.ts';
import { codificar, decodificar } from '../src/senal/humblepeer.ts';
import type { Mensaje, ServidorIce } from '../src/senal/humblepeer.ts';

function escenario() {
  const buzones = new Map<number, Mensaje[]>();
  const iceServers: ServidorIce[] = [{ type: 1, server: 'stun.ejemplo:3478' }, { type: 2, server: 'turn.ejemplo:3478', username: 'u', password: 'p' }];
  const servidor = crearServidorSenal({ iceServers, aleatorio: () => 0.5, enviar(c, bytes) { buzones.get(c)!.push(decodificar(bytes)); } });
  function cliente(gameToken = 'ioquake') {
    const conexion = servidor.conectar(), buzon: Mensaje[] = [];
    buzones.set(conexion, buzon);
    const mandar = (m: Mensaje) => servidor.recibir(conexion, codificar(m));
    mandar({ tipo: 'HelloServer', version: 0, flags: 3, gameToken, gameSignature: '' });
    const saludo = buzon.shift()!;
    assert.equal(saludo.tipo, 'HelloClient');
    if (saludo.tipo !== 'HelloClient') throw new Error('Faltó el saludo');
    assert.deepEqual(saludo.iceServers, iceServers);
    assert.equal(saludo.reconnectToken, '');
    assert.ok(saludo.peerId > 0 && saludo.peerId <= 0x7fffffff);
    return { conexion, buzon, mandar, peerId: saludo.peerId };
  }
  return { servidor, cliente, buzones };
}

test('Saludo, alias, oferta, respuesta, ICE, relay, rechazo y desconexión', () => {
  const { servidor, cliente } = escenario();
  const anfitrion = cliente(), invitado = cliente();
  assert.notEqual(anfitrion.peerId, invitado.peerId);
  anfitrion.mandar({ tipo: 'AliasRegister', alias: 'Sala' });
  invitado.mandar({ tipo: 'AliasLookup', alias: 'Sala' });
  assert.deepEqual(invitado.buzon.shift(), { tipo: 'AliasResolved', alias: 'Sala', peerId: anfitrion.peerId });
  const oferta: Mensaje = { tipo: 'P2POffer', peerId: anfitrion.peerId, flags: 2, offer: 'oferta' };
  invitado.mandar(oferta);
  assert.deepEqual(anfitrion.buzon.shift(), { ...oferta, peerId: invitado.peerId });
  for (const m of [
    { tipo: 'P2PAnswer', peerId: invitado.peerId, offer: 'respuesta' },
    { tipo: 'ICECandidate', peerId: invitado.peerId, offer: 'candidato' },
    { tipo: 'P2PRelayData', peerId: invitado.peerId, data: new Uint8Array([255, 0]) },
  ] satisfies Mensaje[]) {
    anfitrion.mandar(m);
    assert.deepEqual(invitado.buzon.shift(), { ...m, peerId: anfitrion.peerId });
  }
  for (const m of [
    { tipo: 'P2POffer', peerId: 123, flags: 2 }, { tipo: 'P2PAnswer', peerId: 123 },
    { tipo: 'ICECandidate', peerId: 123 }, { tipo: 'P2PRelayData', peerId: 123 },
  ] satisfies Mensaje[]) {
    invitado.mandar(m);
    assert.deepEqual(invitado.buzon.shift(), { tipo: 'P2PReject', peerId: 123, reason: 1 });
  }
  servidor.desconectar(anfitrion.conexion);
  invitado.mandar({ tipo: 'AliasLookup', alias: 'Sala' });
  assert.deepEqual(invitado.buzon.shift(), { tipo: 'AliasResolved', alias: 'Sala', peerId: 0 });
  servidor.desconectar(anfitrion.conexion);
});

test('Alias ajenos, mayúsculas y unregister individual o total', () => {
  const { cliente } = escenario(); const a = cliente(), b = cliente();
  a.mandar({ tipo: 'AliasRegister', alias: 'Sala' });
  b.mandar({ tipo: 'AliasRegister', alias: 'Sala' });
  b.mandar({ tipo: 'AliasUnregister', alias: 'Sala' });
  b.mandar({ tipo: 'AliasLookup', alias: 'Sala' });
  assert.deepEqual(b.buzon.shift(), { tipo: 'AliasResolved', alias: 'Sala', peerId: a.peerId });
  a.mandar({ tipo: 'AliasRegister', alias: 'sala' });
  a.mandar({ tipo: 'AliasUnregister', alias: 'Sala' });
  b.mandar({ tipo: 'AliasLookup', alias: 'Sala' });
  assert.equal((b.buzon.shift() as { peerId: number }).peerId, 0);
  b.mandar({ tipo: 'AliasLookup', alias: 'sala' });
  assert.equal((b.buzon.shift() as { peerId: number }).peerId, a.peerId);
  a.mandar({ tipo: 'AliasUnregister' });
  b.mandar({ tipo: 'AliasLookup', alias: 'sala' });
  assert.equal((b.buzon.shift() as { peerId: number }).peerId, 0);
});

test('Ignora mensajes inválidos, previos al saludo y saludos repetidos', () => {
  const { servidor, cliente, buzones } = escenario(); const c = servidor.conectar();
  buzones.set(c, []);
  servidor.recibir(c, codificar({ tipo: 'AliasRegister', alias: 'prematuro' }));
  servidor.recibir(c, new Uint8Array([0, 1, 2]));
  assert.deepEqual(buzones.get(c), []);
  const a = cliente();
  a.mandar({ tipo: 'HelloServer', version: 0, flags: 3, gameToken: 'otro', gameSignature: '' });
  assert.equal(a.buzon.length, 0);
  a.mandar({ tipo: 'AliasLookup', alias: 'prematuro' });
  assert.equal((a.buzon.shift() as { peerId: number }).peerId, 0);
});

test('Separa juegos y exige oferta previa; reenvía rechazos como PeerRefused', () => {
  const { cliente } = escenario(); const a = cliente(), b = cliente(), otro = cliente('otro');
  a.mandar({ tipo: 'AliasRegister', alias: 'Sala' });
  otro.mandar({ tipo: 'AliasLookup', alias: 'Sala' });
  assert.equal((otro.buzon.shift() as { peerId: number }).peerId, 0);
  a.mandar({ tipo: 'P2PAnswer', peerId: b.peerId });
  assert.deepEqual(a.buzon.shift(), { tipo: 'P2PReject', peerId: b.peerId, reason: 1 });
  a.mandar({ tipo: 'P2PReject', peerId: b.peerId, reason: 1 });
  assert.deepEqual(b.buzon.shift(), { tipo: 'P2PReject', peerId: a.peerId, reason: 2 });
});
