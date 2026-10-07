import { WebSocketServer, WebSocket } from 'ws';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage } from 'node:http';
import { crearServidorSenal } from '../src/senal/servidor.ts';
import { codificar, decodificar } from '../src/senal/humblepeer.ts';
import type { ServidorIce } from '../src/senal/humblepeer.ts';

export function crearServidorLocal(opciones: {
  puerto?: number;
  iceServers?: ServidorIce[];
  registrar?: (texto: string) => void;
} = {}) {
  const registrar = opciones.registrar ?? console.log;
  const sockets = new Map<number, WebSocket>();
  const sala = crearServidorSenal({
    iceServers: opciones.iceServers,
    enviar(conexion, bytes) {
      const socket = sockets.get(conexion);
      if (socket?.readyState !== WebSocket.OPEN) return;
      const m = decodificar(bytes);
      if ('peerId' in m) registrar(`Salida ${m.tipo}: conexión ${conexion}, peer ${m.peerId}`);
      socket.send(bytes, { binary: true }); // Un Message por frame; nunca concatenamos buffers.
    },
  });
  const servidor = new WebSocketServer({
    host: '127.0.0.1', port: opciones.puerto ?? 5181,
    verifyClient: ({ req }: { req: IncomingMessage }) => (req.headers['sec-websocket-protocol'] ?? '').split(',').some(p => p.trim() === 'humblepeer'),
    handleProtocols: protocolos => protocolos.has('humblepeer') ? 'humblepeer' : false,
  });
  servidor.on('connection', socket => {
    const conexion = sala.conectar();
    sockets.set(conexion, socket);
    registrar(`Conexión ${conexion} abierta`);
    socket.on('message', (datos, binario) => {
      if (!binario) { socket.close(1003, 'Se requieren frames binarios'); return; }
      const bytes = Array.isArray(datos) ? Buffer.concat(datos) : datos instanceof ArrayBuffer ? new Uint8Array(datos) : datos;
      try {
        const m = decodificar(bytes);
        const detalle = 'alias' in m ? `, alias ${JSON.stringify(m.alias)}` : 'peerId' in m ? `, destino ${m.peerId}` : '';
        registrar(`Entrada ${m.tipo}: conexión ${conexion}${detalle}`);
      } catch { registrar(`Mensaje inválido: conexión ${conexion}`); }
      sala.recibir(conexion, bytes);
    });
    socket.on('error', () => registrar(`Error de socket: conexión ${conexion}`));
    socket.on('close', () => {
      sala.desconectar(conexion);
      sockets.delete(conexion);
      registrar(`Conexión ${conexion} cerrada`);
    });
  });
  return servidor;
}

function leerIce(texto: string | undefined): ServidorIce[] {
  if (!texto) return [];
  const valor: unknown = JSON.parse(texto);
  if (!Array.isArray(valor)) throw new Error('SENAL_ICE debe ser una lista de ICEServer');
  // El códec valida strings requeridos, opcionales y los valores del enum.
  codificar({ tipo: 'HelloClient', peerId: 1, iceServers: valor });
  return valor;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const puerto = Number(process.env.PUERTO_SENAL ?? 5181);
  if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) throw new Error('PUERTO_SENAL debe ser un puerto entre 0 y 65535');
  const servidor = crearServidorLocal({ puerto, iceServers: leerIce(process.env.SENAL_ICE) });
  servidor.on('listening', () => {
    const direccion = servidor.address();
    console.log(`Señalización en ws://127.0.0.1:${typeof direccion === 'object' && direccion ? direccion.port : puerto} (humblepeer)`);
  });
  servidor.on('error', error => { console.error(`No se pudo iniciar la señalización: ${error.message}`); process.exitCode = 1; });
}
