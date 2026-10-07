import { Builder, ByteBuffer } from 'flatbuffers';

export type Atributo = { key: string; value: string };
export type ServidorIce = { type: 1 | 2; server: string; username?: string; password?: string };
export const NotFound = 1;
export const PeerRefused = 2;
export type Mensaje =
  | { tipo: 'HelloServer'; version: number; flags: number; gameToken: string; gameSignature: string; authToken?: string; reconnectToken?: string; attributes?: Atributo[] }
  | { tipo: 'HelloClient'; peerId: number; reconnectToken?: string; iceServers?: ServidorIce[] }
  | { tipo: 'P2PConnected' | 'P2PDisconnect'; peerId: number }
  | { tipo: 'P2POffer'; peerId: number; flags: number; offer?: string }
  | { tipo: 'P2PAnswer' | 'ICECandidate'; peerId: number; offer?: string }
  | { tipo: 'P2PReject'; peerId: number; reason: 1 | 2 }
  | { tipo: 'P2PRelayData'; peerId: number; data?: Uint8Array }
  | { tipo: 'AliasRegister' | 'AliasLookup'; alias: string }
  | { tipo: 'AliasUnregister'; alias?: string }
  | { tipo: 'AliasResolved'; alias: string; peerId: number };

type Campo = readonly [nombre: string, formato: 'uint' | 'ubyte' | 'string' | 'bytes' | 'Attribute' | 'ICEServer', requeridoODefault?: boolean | number];
const tablas: Record<string, readonly Campo[]> = {
  Attribute: [['key', 'string', true], ['value', 'string', true]],
  ICEServer: [['type', 'ubyte', 1], ['server', 'string', true], ['username', 'string'], ['password', 'string']],
  HelloServer: [['version', 'uint'], ['flags', 'ubyte'], ['gameToken', 'string', true], ['gameSignature', 'string', true], ['authToken', 'string'], ['reconnectToken', 'string'], ['attributes', 'Attribute']],
  HelloClient: [['peerId', 'uint'], ['reconnectToken', 'string'], ['iceServers', 'ICEServer']],
  P2PConnected: [['peerId', 'uint']], P2PDisconnect: [['peerId', 'uint']],
  P2POffer: [['peerId', 'uint'], ['flags', 'ubyte'], ['offer', 'string']],
  P2PAnswer: [['peerId', 'uint'], ['offer', 'string']],
  P2PReject: [['peerId', 'uint'], ['reason', 'ubyte', 1]],
  ICECandidate: [['peerId', 'uint'], ['offer', 'string']],
  P2PRelayData: [['peerId', 'uint'], ['data', 'bytes']],
  AliasRegister: [['alias', 'string', true]], AliasUnregister: [['alias', 'string']],
  AliasLookup: [['alias', 'string', true]], AliasResolved: [['alias', 'string', true], ['peerId', 'uint']],
};
export const tiposMensaje = { HelloServer: 1, HelloClient: 2, P2PConnected: 10, P2PDisconnect: 11, P2POffer: 12, P2PAnswer: 13, P2PReject: 14, ICECandidate: 15, P2PRelayData: 16, AliasRegister: 20, AliasUnregister: 21, AliasLookup: 22, AliasResolved: 23 } as const;
const fallo = (detalle: string): never => { throw new Error(`HumblePeer inválido: ${detalle}`); };

export function codificar(m: Mensaje): Uint8Array {
  const b = new Builder(256);
  function tabla(nombre: string, objeto: object): number {
    const campos = tablas[nombre];
    const valores = objeto as Record<string, unknown>;
    const preparados = campos.map(([clave, formato, requerido]) => {
      const valor = valores[clave];
      if (formato === 'uint' || formato === 'ubyte') {
        if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > (formato === 'uint' ? 0xffffffff : 255)) fallo(`campo ${clave}`);
        return valor as number;
      }
      if (valor === undefined) { if (requerido === true) fallo(`falta ${clave}`); return 0; }
      if (formato === 'string') {
        if (typeof valor !== 'string') fallo(`campo ${clave}`);
        return b.createString(valor as string);
      }
      if (formato === 'bytes') {
        if (!(valor instanceof Uint8Array)) fallo(`campo ${clave}`);
        return b.createByteVector(valor as Uint8Array);
      }
      if (!Array.isArray(valor)) fallo(`vector ${clave}`);
      const offsets = (valor as object[]).map(v => tabla(formato, v));
      b.startVector(4, offsets.length, 4);
      for (let i = offsets.length - 1; i >= 0; i--) b.addOffset(offsets[i]);
      return b.endVector();
    });
    b.startObject(campos.length);
    for (let i = campos.length - 1; i >= 0; i--) {
      const [, formato, predeterminado] = campos[i];
      const defecto = typeof predeterminado === 'number' ? predeterminado : 0;
      if (formato === 'uint') b.addFieldInt32(i, preparados[i], defecto);
      else if (formato === 'ubyte') b.addFieldInt8(i, preparados[i], defecto);
      else b.addFieldOffset(i, preparados[i], 0);
    }
    return b.endObject();
  }
  const tipo = tiposMensaje[m.tipo];
  if (!tipo) fallo('tipo de unión desconocido');
  const contenido = tabla(m.tipo, m);
  b.startObject(2);
  b.addFieldOffset(1, contenido, 0);
  b.addFieldInt8(0, tipo, 0);
  b.finish(b.endObject());
  const bytes = b.asUint8Array();
  decodificar(bytes); // Valida también los enums antes de devolver el buffer.
  return bytes;
}

export function decodificar(bytes: Uint8Array): Mensaje {
  const bb = new ByteBuffer(bytes);
  function rango(pos: number, largo: number, alineacion = 1): void {
    if (!Number.isInteger(pos) || pos < 0 || largo < 0 || pos + largo > bytes.length || pos % alineacion !== 0) fallo('offset o longitud fuera del buffer');
  }
  function apuntado(pos: number): number {
    rango(pos, 4, 4);
    const desplazamiento = bb.readUint32(pos);
    if (desplazamiento < 4) fallo('offset nulo o hacia atrás');
    const destino = pos + desplazamiento;
    rango(destino, 4, 4);
    return destino;
  }
  function campos(pos: number): (id: number, ancho: number) => number {
    rango(pos, 4, 4);
    const vt = pos - bb.readInt32(pos);
    rango(vt, 4, 2);
    const largo = bb.readUint16(vt), tamano = bb.readUint16(vt + 2);
    if (largo < 4 || largo % 2 || tamano < 4) fallo('vtable inválida');
    rango(vt, largo, 2); rango(pos, tamano);
    return (id, ancho) => {
      const entrada = 4 + id * 2;
      if (entrada >= largo) return 0;
      const offset = bb.readUint16(vt + entrada);
      if (!offset) return 0;
      if (offset < 4 || offset + ancho > tamano) fallo('campo fuera de su tabla');
      rango(pos + offset, ancho, ancho);
      return pos + offset;
    };
  }
  function tabla(nombre: string, pos: number): Record<string, unknown> {
    const campo = campos(pos), resultado: Record<string, unknown> = {};
    tablas[nombre].forEach(([clave, formato, requerido], id) => {
      const p = campo(id, formato === 'ubyte' ? 1 : 4);
      if (formato === 'uint' || formato === 'ubyte') {
        resultado[clave] = p ? (formato === 'uint' ? bb.readUint32(p) : bb.readUint8(p)) : (typeof requerido === 'number' ? requerido : 0);
        if ((nombre === 'ICEServer' && clave === 'type' || nombre === 'P2PReject' && clave === 'reason') && resultado[clave] !== 1 && resultado[clave] !== 2) fallo(`enum ${clave} desconocido`);
        return;
      }
      if (!p) { if (requerido === true) fallo(`falta el campo requerido ${clave}`); return; }
      const inicio = apuntado(p), largo = bb.readUint32(inicio), datos = inicio + 4;
      if (formato === 'string') {
        rango(datos, largo + 1);
        if (bytes[datos + largo] !== 0) fallo(`string ${clave} sin terminador`);
        try { resultado[clave] = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(datos, datos + largo)); }
        catch { fallo(`string ${clave} no es UTF-8`); }
      } else if (formato === 'bytes') {
        rango(datos, largo); resultado[clave] = bytes.slice(datos, datos + largo);
      } else {
        rango(datos, largo * 4, 4);
        resultado[clave] = Array.from({ length: largo }, (_, i) => tabla(formato, apuntado(datos + i * 4)));
      }
    });
    return resultado;
  }
  const raiz = apuntado(0), campo = campos(raiz), p = campo(0, 1);
  const tipo = p ? bb.readUint8(p) : 0;
  const nombre = Object.entries(tiposMensaje).find(([, valor]) => valor === tipo)?.[0];
  if (!nombre) fallo(`tipo de unión desconocido: ${tipo}`);
  const contenido = campo(1, 4);
  if (!contenido) fallo('falta la tabla de la unión');
  return { tipo: nombre, ...tabla(nombre!, apuntado(contenido)) } as Mensaje;
}
