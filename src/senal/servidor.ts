import { codificar, decodificar, NotFound, PeerRefused } from './humblepeer.ts';
import type { Mensaje, ServidorIce } from './humblepeer.ts';

type Juego = { peers: Map<number, number>; alias: Map<string, number>; ofertas: Set<string> };
type Peer = { peerId: number; juego: Juego };
export function crearServidorSenal(opciones: {
  iceServers?: ServidorIce[];
  enviar: (conexion: number, bytes: Uint8Array) => void;
  aleatorio?: () => number;
}) {
  const conexiones = new Map<number, Peer | undefined>();
  const juegos = new Map<string, Juego>();
  const aleatorio = opciones.aleatorio ?? Math.random;
  // Copia la configuración para que el llamador no cambie las credenciales a mitad de sesión.
  const iceServers = opciones.iceServers?.map(s => ({ ...s })) ?? [];
  let siguiente = 1;
  const enviar = (conexion: number, m: Mensaje) => opciones.enviar(conexion, codificar(m));
  function conectar(): number {
    const conexion = siguiente++;
    conexiones.set(conexion, undefined);
    return conexion;
  }
  function recibir(conexion: number, bytes: Uint8Array): void {
    if (!conexiones.has(conexion)) return;
    let m: Mensaje;
    try { m = decodificar(bytes); } catch { return; }
    const peer = conexiones.get(conexion);
    if (m.tipo === 'HelloServer') {
      if (peer || !(m.flags & 1) || !m.gameToken) return;
      let juego = juegos.get(m.gameToken);
      if (!juego) {
        juego = { peers: new Map(), alias: new Map(), ofertas: new Set() };
        juegos.set(m.gameToken, juego);
      }
      const muestra = aleatorio();
      let peerId = Number.isFinite(muestra) ? (Math.floor(muestra * 0x80000000) & 0x7fffffff) : 1;
      // Evita un bucle infinito si la fuente aleatoria devuelve siempre cero o colisiona.
      while (!peerId || juego.peers.has(peerId)) peerId = (peerId + 1) & 0x7fffffff;
      juego.peers.set(peerId, conexion);
      conexiones.set(conexion, { peerId, juego });
      // Como la referencia anónima, no verificamos gameSignature ni usamos reconnectToken.
      enviar(conexion, { tipo: 'HelloClient', peerId, reconnectToken: '', iceServers });
      return;
    }
    if (!peer) return;
    const { peerId, juego } = peer;
    switch (m.tipo) {
      case 'AliasRegister':
        if (m.alias && !juego.alias.has(m.alias)) juego.alias.set(m.alias, peerId);
        return;
      case 'AliasUnregister':
        for (const [alias, dueno] of juego.alias) {
          if (dueno === peerId && (m.alias === undefined || m.alias === alias)) juego.alias.delete(alias);
        }
        return;
      case 'AliasLookup':
        enviar(conexion, { tipo: 'AliasResolved', alias: m.alias, peerId: juego.alias.get(m.alias) ?? 0 });
        return;
      case 'P2POffer': case 'P2PAnswer': case 'ICECandidate': case 'P2PRelayData': {
        const destino = juego.peers.get(m.peerId);
        if (destino === undefined || (m.tipo === 'P2POffer' && (m.flags & 1)) ||
            (m.tipo === 'P2PAnswer' && !juego.ofertas.has(`${m.peerId}:${peerId}`))) {
          enviar(conexion, { tipo: 'P2PReject', peerId: m.peerId, reason: NotFound });
          return;
        }
        if (m.tipo === 'P2POffer') juego.ofertas.add(`${peerId}:${m.peerId}`);
        // Los SDP opcionales se conservan ausentes: la referencia los desreferencia sin validar.
        enviar(destino, { ...m, peerId });
        return;
      }
      case 'P2PReject': {
        const destino = juego.peers.get(m.peerId);
        if (destino !== undefined) enviar(destino, { tipo: 'P2PReject', peerId, reason: PeerRefused });
        return;
      }
    }
  }
  function desconectar(conexion: number): void {
    const peer = conexiones.get(conexion);
    conexiones.delete(conexion);
    if (!peer) return;
    const { juego, peerId } = peer;
    juego.peers.delete(peerId);
    for (const [alias, dueno] of juego.alias) if (dueno === peerId) juego.alias.delete(alias);
    // La referencia deja punteros colgantes; acá también limpiamos las ofertas del peer que salió.
    for (const oferta of juego.ofertas) if (oferta.split(':').includes(String(peerId))) juego.ofertas.delete(oferta);
    if (!juego.peers.size) for (const [token, valor] of juegos) if (valor === juego) juegos.delete(token);
  }
  return { conectar, recibir, desconectar };
}
