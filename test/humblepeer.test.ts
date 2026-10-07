import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Builder, ByteBuffer } from 'flatbuffers';
import { codificar, decodificar } from '../src/senal/humblepeer.ts';
import type { Mensaje } from '../src/senal/humblepeer.ts';

const mensajes: Mensaje[] = [
  { tipo: 'HelloServer', version: 0, flags: 3, gameToken: 'ioquake', gameSignature: 'firma', authToken: 'auth', reconnectToken: 'reconectar', attributes: [{ key: 'platform', value: 'ñ 🧉' }, { key: 'timestamp', value: '123' }] },
  { tipo: 'HelloClient', peerId: 0xffffffff, reconnectToken: '', iceServers: [{ type: 1, server: 'stun:3478' }, { type: 2, server: 'turn:3478', username: 'usuario', password: 'clave' }] },
  { tipo: 'P2PConnected', peerId: 7 }, { tipo: 'P2PDisconnect', peerId: 7 },
  { tipo: 'P2POffer', peerId: 7, flags: 2, offer: 'SDP oferta' },
  { tipo: 'P2PAnswer', peerId: 7, offer: 'SDP respuesta' },
  { tipo: 'P2PReject', peerId: 7, reason: 1 }, { tipo: 'P2PReject', peerId: 7, reason: 2 },
  { tipo: 'ICECandidate', peerId: 7, offer: 'candidate:1' },
  { tipo: 'P2PRelayData', peerId: 7, data: new Uint8Array([0, 127, 128, 255]) },
  { tipo: 'AliasRegister', alias: 'Sala' }, { tipo: 'AliasUnregister', alias: 'Sala' },
  { tipo: 'AliasLookup', alias: 'Sala' }, { tipo: 'AliasResolved', alias: 'Sala', peerId: 7 },
];
for (const m of mensajes) test(`Ida y vuelta: ${m.tipo}${'reason' in m ? m.reason : ''}`, () => {
  assert.deepEqual(decodificar(codificar(m)), m);
});

test('Opcionales ausentes y vacíos se distinguen', () => {
  const vacios: Mensaje[] = [
    { tipo: 'HelloServer', version: 0, flags: 0, gameToken: '', gameSignature: '', authToken: '', reconnectToken: '', attributes: [] },
    { tipo: 'HelloServer', version: 0, flags: 1, gameToken: 'x', gameSignature: '' },
    { tipo: 'HelloClient', peerId: 0, reconnectToken: '', iceServers: [] },
    { tipo: 'HelloClient', peerId: 1, iceServers: [{ type: 2, server: '', username: '', password: '' }] },
    { tipo: 'P2POffer', peerId: 0, flags: 0 }, { tipo: 'P2PAnswer', peerId: 0, offer: '' },
    { tipo: 'ICECandidate', peerId: 0 }, { tipo: 'P2PRelayData', peerId: 0 },
    { tipo: 'P2PRelayData', peerId: 0, data: new Uint8Array() },
    { tipo: 'AliasUnregister' }, { tipo: 'AliasUnregister', alias: '' },
  ];
  for (const m of vacios) assert.deepEqual(decodificar(codificar(m)), m);
});

test('Buffer corrupto, truncado, required ausente y unión desconocida lanzan Error', () => {
  for (const bytes of [new Uint8Array(), new Uint8Array([255, 255, 255, 255]), new Uint8Array(32)]) assert.throws(() => decodificar(bytes), /HumblePeer inválido/);
  const bytes = codificar(mensajes[0]);
  for (let largo = 0; largo < bytes.length; largo++) assert.throws(() => decodificar(bytes.slice(0, largo)), Error);
  const desconocido = bytes.slice(), bb = new ByteBuffer(desconocido);
  const raiz = bb.readUint32(0);
  desconocido[raiz + bb.__offset(raiz, 4)] = 99;
  assert.throws(() => decodificar(desconocido), /tipo de unión desconocido: 99/);
  const requerido = bytes.slice(), rb = new ByteBuffer(requerido);
  const mensaje = rb.__indirect(raiz + rb.__offset(raiz, 6));
  const vt = mensaje - rb.readInt32(mensaje);
  rb.writeInt16(vt + 8, 0); // HelloServer.gameToken (campo 2).
  assert.throws(() => decodificar(requerido), /requerido gameToken/);
});

test('Lee un buffer construido independientemente con los IDs del esquema', () => {
  const b = new Builder();
  const oferta = b.createString('v=0');
  b.startObject(3);
  b.addFieldInt32(0, 123, 0); b.addFieldInt8(1, 2, 0); b.addFieldOffset(2, oferta, 0);
  const contenido = b.endObject();
  b.startObject(2); b.addFieldInt8(0, 12, 0); b.addFieldOffset(1, contenido, 0); b.finish(b.endObject());
  assert.deepEqual(decodificar(b.asUint8Array()), { tipo: 'P2POffer', peerId: 123, flags: 2, offer: 'v=0' });
  const bytes = codificar({ tipo: 'AliasResolved', alias: 'Sala', peerId: 42 });
  const bb = new ByteBuffer(bytes), raiz = bb.readUint32(0);
  assert.equal(bb.readUint8(raiz + bb.__offset(raiz, 4)), 23);
  const tabla = bb.__indirect(raiz + bb.__offset(raiz, 6));
  assert.equal(bb.__string(tabla + bb.__offset(tabla, 4)), 'Sala');
  assert.equal(bb.readUint32(tabla + bb.__offset(tabla, 6)), 42);
});
