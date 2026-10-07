# HumbleNet: protocolo de señalización (HumblePeer)

Especificación sacada solo del código clonado. No compilé, no ejecuté nada y no usé git. Lo que no pude confirmar en el código va marcado **sin verificar** (lista completa en la sección 10).

## 0. Fuentes y convenciones

Las citas son `archivo:línea`. Cuando un nombre base aparece en más de una carpeta (por ejemplo `humblenet.h` y `humblenet_p2p.h`, que existen también en el motor), la cita es siempre la de HumbleNet. Esta tabla ubica cada archivo. `...\scratchpad\` = `C:\Users\SPOSTA~1\AppData\Local\Temp\claude\C--dev-QuakeWeb\06b22ae8-9336-48c7-9f15-e9e9b362a2e7\scratchpad\`.

| Archivo (cita) | Ruta |
|---|---|
| `humblepeer.fbs`, `humblepeer.cpp`, `humblepeer.h`, `hmac.cpp` | `...\humblenet\src\humblenet\humblepeer\` |
| `humblenet_p2p_signaling.cpp`, `humblenet_core.cpp`, `humblenet_p2p.cpp`, `humblenet_alias.cpp`, `humblenet_p2p_internal.h`, `libsocket.cpp`, `libwebsockets_asmjs.cpp`, `libwebrtc_asmjs.cpp` | `...\humblenet\src\humblenet\src\` |
| `humblenet.h`, `humblenet_p2p.h` | `...\humblenet\src\humblenet\include\` |
| `humblenet/CMakeLists.txt` | `...\humblenet\src\humblenet\CMakeLists.txt` |
| `peer-server.cpp`, `p2p_connection.cpp/.h`, `server.cpp/.h`, `game.cpp/.h`, `game_db.cpp/.h` | `...\humblenet\src\peer-server\` |
| `net_humblenet.c`, `net_ip.c` | `...\ioq3web\code\qcommon\` |
| `humblenet_socket.h` | `...\ioq3web\code\humblenet\` |
| `index.html` | `...\ioq3web\code\web\` |

## 1. Resumen

- **Transporte:** WebSocket con subprotocolo `humblepeer` y frames binarios. Cada frame es un único `Message` FlatBuffers raíz, sin prefijo de tamaño ni file identifier.
- **Keepalive de aplicación:** no hay. Solo PING/PONG de control de libwebsockets en el servidor (**sin verificar**).
- **Mensajes:** 13 tipos de unión. Saludo HelloServer, después HelloClient. Luego el servidor reenvía P2POffer, P2PAnswer, ICECandidate y P2PRelayData con el `peerId` reescrito al origen.
- **Servidor de referencia:** usa base anónima. Acepta cualquier `gameToken`, no verifica la firma y asigna un PeerId aleatorio de 31 bits, único por juego.
- **ICE:** solo viaja TURN si el servidor arranca con `--TURN-server/--TURN-username/--TURN-password`. Por defecto no hay STUN ni TURN.
- **Trampas:** hay bugs y comportamientos no obvios (sección 9). El más serio: un frame WebSocket con dos mensajes pegados hace que el cliente descarte el segundo.

## 2. Transporte (punto 1)

| Aspecto | Valor | Cita |
|---|---|---|
| URL | Se usa tal cual el valor de `net_peer_server`, sin agregar path. En la web: `wss://peer-server.thelongestyard.link`. | `net_humblenet.c:23-25`, `humblenet_p2p.cpp:38`, `humblenet_p2p_signaling.cpp:32`, `index.html:172-177` |
| Subprotocolo | `humblepeer`. El cliente lo pasa al constructor de WebSocket. El servidor lo declara en su lista de protocolos. | `humblenet_p2p_signaling.cpp:32`, `libwebsockets_asmjs.cpp:46`, `peer-server.cpp:280`, `:285` |
| Tipo de frame | Binario. El cliente usa `binaryType = "arraybuffer"`, envía `Uint8Array` y lee `event.data.byteLength`, así que un frame de texto no sirve. El servidor escribe `LWS_WRITE_BINARY`. | `libwebsockets_asmjs.cpp:47`, `:85`, `:154`, `peer-server.cpp:243`, `libsocket.cpp:480` |
| Prefijo de tamaño | Ninguno. Todos los builders usan `fbb.Finish(msg)`, no hay ningún `SizePrefixed`. | `humblepeer.cpp:141` (y el resto de builders) |
| File identifier | Ninguno. El `.fbs` no declara `file_identifier`. El parseo usa `VerifyMessageBuffer` y `GetMessage` sin identificador. | `humblepeer.fbs` (completo), `humblepeer.cpp:57`, `:63` |
| Raíz | `root_type Message;` | `humblepeer.fbs:108` |
| Parseo en el cliente | `on_data` agrega bytes al buffer y llama `parseMessage`. Esa función verifica el buffer completo, procesa un mensaje y **borra todo el buffer**. | `humblenet_p2p_signaling.cpp:191-194`, `humblepeer.cpp:57-60`, `:66`, `:73` |
| Parseo en el servidor | Acumula fragmentos y parsea cuando llega el último. Si el parseo falla, cierra la conexión. | `peer-server.cpp:203-212` |
| Keepalive de aplicación | Ninguno. El PONG está comentado. | `libwebsockets_asmjs.h:25` |
| Keepalive de transporte | El servidor fija `secs_since_valid_ping = 30` y `secs_since_valid_hangup = 100` en la política de reintentos. Según libwebsockets esto genera PING/PONG de control (**sin verificar**). | `peer-server.cpp:474-478` |
| Reconexión | No existe. Al cerrarse el WS, el cliente libera la conexión y no vuelve a conectar (hay un comentario TODO). | `humblenet_p2p_signaling.cpp:242-249` |
| Puertos del servidor | HTTP/WS en 8080 por defecto. Con `--email` y `--common-name`, HTTP pasa a 80 si no se pasó `--port`, y TLS escucha en 443. | `peer-server.cpp:348-349`, `:433-435`, `:517-531` |
| Endpoint HTTP auxiliar | `GET /lookup/<alias>` responde `{"found":true}` o `{"found":false}` con `Access-Control-Allow-Origin: *`. No es parte de la señalización WS. La librería no lo usa. La página web lo usa antes de conectar. | `peer-server.cpp:63-66`, `:77-98`, `index.html:421` |

**Cuidado con el framing.** El servidor encola en `sendBuf` y, cuando llega la escritura, manda todo el `sendBuf` en un solo frame. Si se encolan dos mensajes al mismo peer antes de esa escritura, salen pegados. El cliente procesa solo el primero y descarta el resto (`peer-server.cpp:235-257`, `p2p_connection.cpp:326-332`, `humblepeer.cpp:73`). Es un riesgo inferido del código, **sin reproducir** (sección 9).

## 3. Cómo usa el motor HumbleNet

- **`net_peer_server`** (cvar) se pasa a `humblenet_p2p_init(url, "ioquake", "ioquake-secret", NULL)` (`net_humblenet.c:23-25`). El `authToken` queda en `""` y el `reconnectToken` también (`humblenet_p2p.cpp:41`, `:43-47`). El callback de cambio está comentado (`net_humblenet.c:86`), así que la inicialización corre solo desde `HUMBLENET_Init` (`:89`).
- **`net_server_name`** (cvar) es el alias propio. Se registra desde `HUMBLENET_Update`, solo cuando ya hay PeerId (`net_humblenet.c:114-126`) y el servidor de juego está activo (`:120-122`). Antes de re-registrar, si ya estaba publicado, llama `humblenet_p2p_unregister_alias(NULL)` (`:37-38`), que manda AliasUnregister sin alias (`humblenet_alias.cpp:32-34`).
- **`connect "X.humblenet"`** (`index.html:526`). El wrapper de sockets intercepta la resolución (`humblenet_socket.h:112-141`): el nombre `X` se convierte en un ID virtual de alias (`:135`) sin tocar la red. Si el nombre empieza con `peer_`, el número se usa directo como PeerId (`:132-133`) y no hay AliasLookup.
- **Primer `sendto`** al ID virtual crea la conexión pendiente y manda AliasLookup (`humblenet_alias.cpp:127-149`). Ver 5.3.
- **Relay:** la cvar `net_peer_relay` pone el hint `p2p_use_relay` (`net_humblenet.c:98-100`, `:128-131`). Solo se mira si el valor es `'1'` (`humblenet_core.cpp:201-202`).
- **Web:** si `/lookup/` dice que el alias existe, conecta con `connect`. Si no, lo registra como anfitrión con `net_server_name` (`index.html:421`, `:525-531`).

## 4. Esquema (punto 2)

El `.fbs` no usa `(id: N)`, así que el ID de cada campo es su posición de declaración, empezando en 0. Esto es **derivado de las reglas estándar de FlatBuffers**. El header generado no está en el repo: se genera con `flatc --cpp --scoped-enums` (`humblenet/CMakeLists.txt:54-57`). El texto completo del `.fbs` está en la sección 11.

### 4.1 Tablas

| Tabla | ID | Campo | Tipo | Notas |
|---|---|---|---|---|
| Attribute | 0 | key | string | requerido, es la clave de orden (`humblepeer.fbs:5`) |
| | 1 | value | string | requerido (`:6`) |
| ICEServer | 0 | type | ICEServerType (ubyte) | default `STUNServer` (`:12`) |
| | 1 | server | string | requerido (`:13`) |
| | 2 | username | string | opcional (`:14`) |
| | 3 | password | string | opcional (`:15`) |
| HelloServer | 0 | version | uint | el cliente manda 0 (`:22`) |
| | 1 | flags | ubyte | el servidor exige bit 0x01 (`:23`) |
| | 2 | gameToken | string | requerido (`:24`) |
| | 3 | gameSignature | string | requerido (`:25`) |
| | 4 | authToken | string | opcional (`:26`) |
| | 5 | reconnectToken | string | opcional (`:27`) |
| | 6 | attributes | [Attribute] | opcional (`:28`) |
| HelloClient | 0 | peerId | uint | (`:32`) |
| | 1 | reconnectToken | string | opcional, el servidor manda vacío (`:33`) |
| | 2 | iceServers | [ICEServer] | opcional (`:34`) |
| P2POffer | 0 | peerId | uint | destino (cliente a servidor) u origen (servidor a destino) (`:40`) |
| | 1 | flags | ubyte | bit 0x01 = emulado (`:41`) |
| | 2 | offer | string | opcional, contiene el SDP (`:42`) |
| P2PAnswer | 0 | peerId | uint | (`:46`) |
| | 1 | offer | string | opcional, SDP (`:47`) |
| P2PConnected | 0 | peerId | uint | (`:51`) |
| P2PDisconnect | 0 | peerId | uint | (`:55`) |
| P2PReject | 0 | peerId | uint | (`:61`) |
| | 1 | reason | P2PRejectReason (ubyte) | default `NotFound` (`:62`) |
| ICECandidate | 0 | peerId | uint | (`:66`) |
| | 1 | offer | string | opcional, cadena del candidato (`:67`) |
| P2PRelayData | 0 | peerId | uint | (`:71`) |
| | 1 | data | [byte] | payload crudo, `int8` en FlatBuffers (`:72`) |
| AliasRegister | 0 | alias | string | requerido (`:78`) |
| AliasUnregister | 0 | alias | string | opcional, si falta quita todos los alias del peer (`:82`) |
| AliasLookup | 0 | alias | string | requerido (`:86`) |
| AliasResolved | 0 | alias | string | requerido (`:90`) |
| | 1 | peerId | uint | 0 = no encontrado (`:91`) |
| Message | 0 | message_type | MessageType (implícito) | campo de tipo de la unión (derivado) |
| | 1 | message | unión MessageType | (`:105`) |

### 4.2 Enums y valores de la unión

- `ICEServerType : ubyte { STUNServer = 1, TURNServer = 2 }` (`humblepeer.fbs:9`)
- `P2PRejectReason : ubyte { NotFound = 1, PeerRefused = 2 }` (`humblepeer.fbs:58`)
- `uint` = uint32, `ubyte` = uint8, `PeerId` = uint32 (`humblenet.h:69`), `ha_bool` = uint8 (`humblenet.h:68`).

Valores de la unión `MessageType` (`humblepeer.fbs:95-102`). Son **derivados de las reglas de flatc**: el primer miembro implícito vale 1 (0 es NONE), cada miembro sin valor suma 1 al anterior, y `P2PConnected = 10` y `AliasRegister = 20` son explícitos. **Sin verificar** contra el header generado.

| Valor | Tabla |
|---|---|
| 1 | HelloServer |
| 2 | HelloClient |
| 10 | P2PConnected |
| 11 | P2PDisconnect |
| 12 | P2POffer |
| 13 | P2PAnswer |
| 14 | P2PReject |
| 15 | ICECandidate |
| 16 | P2PRelayData |
| 20 | AliasRegister |
| 21 | AliasUnregister |
| 22 | AliasLookup |
| 23 | AliasResolved |

## 5. Secuencias de mensajes (punto 3)

Convención: `A` y `B` son peers, `S` es el servidor. Formato `Tipo{campos}`.

### 5.1 (a) Conexión y saludo

1. El cliente abre el WS con subprotocolo `humblepeer` (`humblenet_p2p_signaling.cpp:32`).
2. Al abrir, el cliente manda **HelloServer** (`humblenet_p2p_signaling.cpp:152-159`, `humblepeer.cpp:80-144`):
   - `flags`: `0x01|0x02` si hay WebRTC, 0 si no (`humblenet_p2p_signaling.cpp:152-156`). En la web, "hay WebRTC" significa que existe `RTCPeerConnection` (`libwebrtc_asmjs.cpp:26-27`, `:218-221`, `libsocket.cpp:318-320`).
   - `version`: 0, que no se escribe (`humblepeer.cpp:102`).
   - `gameToken`: `"ioquake"` (`net_humblenet.c:25`).
   - `gameSignature`: HMAC-SHA1 en hex minúscula, 40 caracteres (`hmac.cpp:55-64`, `hmac.h:10-11`). La clave es el secreto `"ioquake-secret"`. La entrada es, en este orden, `authToken` (si no está vacío), `reconnectToken` (siempre vacío en el motor) y después `key` más `value` de cada atributo, en orden de clave (`humblepeer.cpp:105-125`).
   - `attributes`: `platform` (en la web es `navigator.userAgent`, `humblenet_p2p_signaling.cpp:143-149`) y `timestamp` (segundos Unix, `humblepeer.cpp:100`). Van ordenados por clave (`humblepeer.cpp:112`).
   - `authToken` y `reconnectToken`: omitidos, porque el motor los pasa vacíos (`humblenet_p2p.cpp:41`, `:43-47`).
3. **S valida el mensaje** (tabla abajo) y responde **HelloClient** (`p2p_connection.cpp:166-216`).
4. HelloClient trae `peerId` (`p2p_connection.cpp:198`), `reconnectToken` vacío (`:212`) e `iceServers` solo si hay alguno (`:208-209`, ver sección 7).
5. El cliente, si ya tiene PeerId, ignora el mensaje. Si no, fija `myPeerId` y arma la lista ICE (`humblenet_p2p_signaling.cpp:362-402`).

Validaciones del servidor:

| Caso | Qué hace S | Cita |
|---|---|---|
| El buffer no verifica como `Message` (falta un `required`, buffer roto) | Cierra el WS | `humblepeer.cpp:57-60`, `peer-server.cpp:208-212` |
| El primer mensaje no es HelloServer | Cierra el WS | `p2p_connection.cpp:16-21` |
| HelloServer repetido en la misma conexión | Ignora, sin respuesta | `p2p_connection.cpp:170-173` |
| `flags & 0x01 == 0` | Ignora, sin respuesta. El WS queda abierto y sin PeerId | `p2p_connection.cpp:175-178` |
| `gameToken` o `gameSignature` ausentes | Cierra | `server.cpp:19-22` |
| `gameToken` desconocido | Con la base anónima no pasa nunca: crea el juego con un ID incremental y acepta | `game_db.cpp:8-20`, `server.cpp:24-28` |
| Firma HMAC | Solo se verifica si el registro tiene `verify=true`. La base anónima pone `verify=false`, así que **la firma no se verifica** | `server.cpp:31`, `game_db.cpp:14` |
| `authToken` | No se usa, solo entra al HMAC si se verifica | `server.cpp:35-37` |
| `reconnectToken` | No se valida y la respuesta siempre lo manda vacío (TODO en el código) | `p2p_connection.cpp:212-213` |
| `version`, `timestamp` | No se leen | `p2p_connection.cpp:166-216` |
| `platform` | Solo se loguea | `p2p_connection.cpp:188-199` |

### 5.2 (b) Registro de alias (anfitrión)

1. Requisito: el peer ya tiene PeerId (`net_humblenet.c:114-126`).
2. A manda **AliasRegister{alias}**. `alias` es requerido y no puede estar vacío (`humblenet_alias.cpp:17-24`, `humblepeer.cpp:249-257`).
3. S:
   - Si el alias está libre, lo asigna al peer en `game.aliases` (`p2p_connection.cpp:259-267`).
   - Si ya es de otro peer del mismo juego, loguea y **no responde** (`:261-263`).
   - Si ya es del mismo peer, no hace nada (`:265-267`).
4. **No hay confirmación.** El motor marca el alias como publicado sin esperar respuesta (`net_humblenet.c:40-43`).
5. **Cambio de nombre:** A manda **AliasUnregister sin alias**, que quita todos sus alias (`p2p_connection.cpp:291-296`, `humblepeer.cpp:262`, `humblenet_alias.cpp:32-34`). Después manda el AliasRegister nuevo.
6. **AliasUnregister con alias:** solo borra si el alias es del propio peer (`p2p_connection.cpp:279-290`).
7. **Al cerrarse el WS** de A, S borra los alias de A (`peer-server.cpp:183-184`, `game.cpp:7-10`).

### 5.3 (c) Resolver alias y conectar (A = invitado, B = anfitrión)

1. A llama a `sendto` sobre el ID virtual. Crea la conexión pendiente y manda **AliasLookup{alias}** (`humblenet_alias.cpp:127-149`, `humblepeer.cpp:269-277`). A diferencia de `can_try_peer`, no revisa `myPeerId` (`humblenet_core.cpp:111-113`).
2. S:
   - Si el alias existe, manda **AliasResolved{alias, peerId = dueño}** a A.
   - Si no existe, manda **AliasResolved{alias, peerId = 0}** a A (`p2p_connection.cpp:305-313`).
3. A procesa AliasResolved (`humblenet_p2p_signaling.cpp:503-508`, `humblenet_alias.cpp:50-96`):
   - Si `peerId == 0`, cierra la conexión pendiente (`humblenet_alias.cpp:64-69`).
   - Si B está en la blacklist local, cierra la conexión (`:75-80`).
   - Si no, pone `otherPeer = B`, registra `pendingPeerConnectionsOut[B]`, crea el RTCPeerConnection y genera el offer (`:71-93`).
4. A manda **P2POffer{peerId = B, flags = 0x02, offer = SDP}**. Sale desde `on_sdp` apenas termina `setLocalDescription` (`humblenet_core.cpp:315-342`, `libwebrtc_asmjs.cpp:38` trickle activado, `:72-85`, `humblepeer.cpp:197-205`).
5. S procesa P2POffer (`p2p_connection.cpp:25-70`):
   - Si `flags & 0x01`, responde **P2PReject{B, NotFound}** a A (`:33-41`).
   - Si B no está en el juego, responde **P2PReject{B, NotFound}** a A (`:43-47`).
   - Si B no tiene `webRTCsupport`, responde **P2PReject{B, PeerRefused}** a A (`:53-58`). En la práctica no pasa, porque todo peer que completó el saludo tiene `webRTCsupport=true` (`:202`).
   - Si no, marca `A.connectedPeers += B` (`:63`) y manda a B **P2POffer{peerId = A, flags y offer iguales}** (`:66`).
6. B procesa P2POffer{peerId = A} (`humblenet_p2p_signaling.cpp:282-327`):
   - Si ya tiene una entrante pendiente de A, ignora (`:287-291`).
   - Si `flags & 0x01` o no hay WebRTC, manda **P2PReject{A, PeerRefused}** (`:295-298`). **No hace return**, sigue creando la conexión (ver sección 9).
   - Crea la conexión entrante y aplica el offer (`:301-318`). Si falla, cierra y manda **P2PReject{A, PeerRefused}** (`:320-325`).
7. B manda **P2PAnswer{peerId = A, offer = SDP answer}** (`libwebrtc_asmjs.cpp:316-324`, `humblenet_core.cpp:330-334`, `humblepeer.cpp:207-215`).
8. S procesa P2PAnswer (`p2p_connection.cpp:72-108`):
   - Si A no está en el juego, responde **P2PReject{A, NotFound}** a B (`:80-85`).
   - Si A no tiene a B en `connectedPeers` (no hubo P2POffer previo), responde **P2PReject{A, NotFound}** a B (`:91-99`).
   - Si no, marca `B.connectedPeers += A` (`:102`) y manda a A **P2PAnswer{peerId = B, offer}** (`:105`).
9. A procesa P2PAnswer{peerId = B}: busca `pendingPeerConnectionsOut[B]` y aplica la respuesta. Si no existe, loguea y descarta (`humblenet_p2p_signaling.cpp:329-359`).
10. **ICE trickle**, en ambos sentidos. Cada candidato local se manda como **ICECandidate{peerId = otro, offer = cadena del candidato}** (`libwebrtc_asmjs.cpp:86-115`, `humblenet_core.cpp:345-364`, `humblepeer.cpp:217-225`). S:
    - Si el destino existe, reenvía **ICECandidate{peerId = origen, offer}** (`p2p_connection.cpp:110-127`). No revisa `connectedPeers`, así que no hay autorización.
    - Si el destino no existe, responde **P2PReject{destino, NotFound}** al origen (`:120-122`).
    - El receptor busca en `pendingPeerConnectionsIn[origen]` y después en `pendingPeerConnectionsOut[origen]`. Si está en CONNECTING, aplica el candidato (`humblenet_p2p_signaling.cpp:405-433`, `libwebrtc_asmjs.cpp:355-376`).
11. **Conexión establecida:** ICE en `completed` y canal de datos abierto. Eso pasa a CONNECTED (`libwebrtc_asmjs.cpp:125-127`, `humblenet_core.cpp:426-455`). **No hay mensaje de señalización para esto**: no existe una función de envío para P2PConnected en `humblepeer.h`.

**Rechazos.** Si A recibe P2PReject{B, NotFound o PeerRefused} con conexión pendiente hacia B, B queda en blacklist 5 s y la conexión se cierra (`humblenet_p2p_signaling.cpp:435-459`, `humblenet_core.cpp:78-80`). Si B rechaza, manda **P2PReject{peerId = A, PeerRefused}** a S. S reenvía a A **P2PReject{peerId = B, PeerRefused}** (`p2p_connection.cpp:149-156`). Un P2PReject con NotFound del cliente también sale como PeerRefused (`:157-159`).

### 5.4 (d) Desconexión

- **Entre pares no hay mensaje.** El cliente nunca manda P2PDisconnect: la función solo está definida (`humblepeer.cpp:227-236`, `humblepeer.h:106`) y no tiene llamadas. Si el servidor lo recibe, solo loguea y no reenvía (`p2p_connection.cpp:228-230`). El cliente, si lo recibe, también solo loguea (`humblenet_p2p_signaling.cpp:469-475`). P2PConnected sigue el mismo patrón (`:461-467`, `p2p_connection.cpp:223-227`).
- **Cierre del WS de un peer:** S quita el peer de `game.peers` y borra sus alias (`peer-server.cpp:174-185`). No avisa a otros peers, porque no hay código que lo haga. Las referencias en `connectedPeers` de otros peers no se limpian (`p2p_connection.h:38`, `peer-server.cpp:160-192`).
- **En el cliente**, al cerrarse el WS: `p2pConn.reset()` y nada más (`humblenet_p2p_signaling.cpp:242-256`).
- **Conexión WebRTC caída:** ICE en `failed` o `disconnected` cierra; `closed` dispara `on_disconnected` (`libwebrtc_asmjs.cpp:119-136`).
- **Cierre local:** `humblenet_connection_close` no manda nada por señalización (`humblenet_core.cpp:135-168`, `:295-305`).

### 5.5 (e) P2PRelayData

1. A, si el hint `p2p_use_relay == '1'` y la conexión está CONNECTED, manda cada escritura como **P2PRelayData{peerId = B, data}** y devuelve `bufsize` (`humblenet_core.cpp:198-207`). La longitud va en `uint16_t` (`humblepeer.cpp:238`, `humblenet_core.cpp:203`).
2. S, si B existe, manda a B **P2PRelayData{peerId = A, data}** (`p2p_connection.cpp:232-249`). Si no existe, responde **P2PReject{B, NotFound}** a A (`:242-244`).
3. B busca en `humbleNetState.connections` la conexión con `otherPeer == A` y apila los bytes en `recvBuffer` (`humblenet_p2p_signaling.cpp:477-499`). Si no la encuentra, loguea "does not exist" y los bytes se pierden.
4. **Sin verificar:** si la conexión entrante queda registrada con `otherPeer` seteado (sección 10).

## 6. PeerId, peers desconocidos y alias (punto 4)

- **Asignación** (`game.h:17-25`): entero aleatorio de 31 bits (`getentropy` con máscara `0x7FFFFFFF`), distinto de 0 y de cualquier peer activo del mismo juego. No es secuencial. Si el cliente reconecta (nuevo WS), recibe otro PeerId, porque no hay reconexión.
- **Ámbito:** un `Game` por `gameToken` (`game_db.cpp:8-20`, `server.cpp:66-72`). Peers de juegos distintos no se ven: todas las búsquedas usan `game->peers` (`p2p_connection.cpp:43`, `:80`, `:118`, `:137`, `:240`). Con el token fijo `ioquake`, todos los clientes del motor comparten juego.
- **Alias:** por juego (`game.h:31`). La comparación es exacta y distingue mayúsculas (`unordered_map<string>`, `p2p_connection.cpp:259`, `:305`). El único punto sin distinguir mayúsculas es el sufijo `.humblenet` (`humblenet_socket.h:106`).

Casos de peer o alias desconocido:

| Entrada | Respuesta del servidor | Cita |
|---|---|---|
| P2POffer a un PeerId inexistente | P2PReject{destino, NotFound} al origen | `p2p_connection.cpp:43-47` |
| P2POffer con `flags & 0x01` | P2PReject{destino, NotFound} al origen | `:33-41` |
| P2PAnswer a inexistente, o sin P2POffer previo | P2PReject{destino, NotFound} al origen | `:80-85`, `:91-99` |
| ICECandidate a inexistente | P2PReject{destino, NotFound} al origen | `:120-122` |
| P2PRelayData a inexistente | P2PReject{destino, NotFound} al origen | `:242-244` |
| P2PReject sobre un peer inexistente | Solo log, sin respuesta | `:137-148` |
| AliasLookup de alias inexistente | AliasResolved{alias, peerId = 0} | `:311-313` |
| AliasRegister de alias ajeno | Solo log, sin respuesta | `:259-263` |
| AliasUnregister de alias ajeno | Solo log | `:287-289` |
| Mensaje antes de HelloServer | Cierra el WS | `:16-21` |
| AliasResolved o HelloClient recibido por el servidor | Log de error o warning, sin respuesta | `:218-221`, `:317-319` |

Del lado del cliente: AliasResolved con 0 cierra la conexión (`humblenet_alias.cpp:64-69`). P2PReject bloquea al peer 5 s (`humblenet_core.cpp:78-80`).

## 7. Credenciales STUN/TURN (punto 5)

### 7.1 Servidor

- Los flags son `--TURN-server`, `--TURN-username` y `--TURN-password`. Tienen que venir los tres o ninguno (`peer-server.cpp:374-391`, `:425-429`). Se guardan en `Server` (`server.h:26-28`, `peer-server.cpp:463-467`).
- STUN: `stunServerAddress` existe, pero su asignación en `main` está comentada (`peer-server.cpp:462`). Por defecto no hay STUN.
- Armado de la lista (`server.cpp:82-90`): STUN solo si `stunServerAddress` no está vacío (`:84-86`). TURN solo si los tres valores no están vacíos (`:87-89`), como `ICEServer(server, user, pass)`, tipo TURN (`humblepeer.h:31-32`).
- `iceServers` se incluye en HelloClient solo si la lista no está vacía (`humblepeer.cpp:166-168`, `CreateFBBVectorIfNotEmpty` en `:31-39`). Con la configuración por defecto, HelloClient no trae ICE. El cliente lo loguea como "No STUN/TURN credentials provided by the server" (`humblenet_p2p_signaling.cpp:389-390`).

### 7.2 Formato en el cable

- ICEServer: `type` (ICEServerType), `server` (string requerido), `username` y `password` (opcionales) (`humblepeer.fbs:9-16`).
- STUN: `type` = 1, que es el default del esquema, y `server` (`humblepeer.cpp:158-159`).
- TURN: `type` = 2, `server`, `username` y `password` (`humblepeer.cpp:160-161`).
- `server` se manda tal cual se configuró. El cliente le agrega el esquema, así que tiene que ir como `host:puerto`, sin `stun:` ni `turn:`.

### 7.3 Cliente y navegador

- **Parseo** (`humblenet_p2p_signaling.cpp:376-391`): STUN toma `server`. TURN solo se acepta si trae `username` y `password`, aunque sean vacíos (`:382-386`). Lo que no encaje se descarta sin log.
- **Propagación** (`:393-401`): TURN va a `internal_add_turn_server` (`libsocket.cpp:333-338`, luego `libwebrtc_add_turn_server`). STUN va a `internal_set_stun_servers` (`libsocket.cpp:322-331`, luego `libwebrtc_set_stun_servers`).
- **En el navegador** (`libwebrtc_asmjs.cpp`):
  - STUN: `{ urls: "stun:" + server }` (`:240`).
  - TURN: `{ urls: "turn:" + server, username: <username>, credential: <password> }` (`:251-253`).
  - Ambos se agregan a `Module.__libwebrtc.options.iceServers` (`:234`, `:249-250`).
  - Cada conexión nueva hace `new RTCPeerConnection(this.options, null)` (`:35-36`, `:258-264`). Se crean desde `humblenet_connect_peer` (`humblenet_core.cpp:270`), desde `internal_alias_resolved_to` (`humblenet_alias.cpp:84`) y desde un P2POffer entrante (`humblenet_p2p_signaling.cpp:306`).
- **Credenciales:** usuario y clave son estáticos, viajan en claro en el WS y son iguales para todos los clientes. No hay expiración. El servidor no genera credenciales efímeras (`server.cpp:87-89`).
- **Acumulación:** `options.iceServers` se agrega con `push` en cada llamada y nunca se vacía (`libwebrtc_asmjs.cpp:234`, `:241`, `:249-250`). Dos HelloClient en la misma página duplicarían entradas (**sin verificar**: hoy no hay reconexión).

## 8. Mínimo para ser compatible (para tu servidor TypeScript)

- Abrí WS, aceptá el subprotocolo `humblepeer` y devolvelo en el handshake. Qué pasa en el navegador si no lo devolvés: **sin verificar**.
- Leé cada frame binario como un único buffer FlatBuffers raíz `Message`, sin prefijo de tamaño. Mandá cada mensaje en su propio frame binario, nunca pegues dos.
- Validá los campos `required` de la sección 4 y cerrá ante buffers inválidos.
- El primer mensaje tiene que ser HelloServer. Exigí el bit 0x01 de `flags`. El original, si falta, ignora el mensaje sin responder y deja al cliente colgado. Vos podés cerrar la conexión, que es más claro.
- Aceptá cualquier `gameToken` no vacío y no verifiques la firma, como hace el original. Si la verificás, usá HMAC-SHA1 según 5.1, sin el bug de reconexión (sección 9).
- Asigná PeerId como en `game.h:17-25`, por juego, nunca 0.
- Reenvío: P2POffer, P2PAnswer, ICECandidate y P2PRelayData, con `peerId` reescrito al origen. P2PAnswer exige un P2POffer previo entre el mismo par. Un P2PReject del cliente se reenvía como PeerRefused.
- Alias: AliasRegister sin respuesta si hay conflicto, AliasUnregister con o sin alias, y AliasLookup responde AliasResolved (0 si no existe).
- Al cerrar un WS: quitá el peer del juego y todos sus alias.
- `iceServers` en HelloClient es opcional. Si lo mandás, `server` es `host:puerto`.
- P2PConnected y P2PDisconnect no los manda el cliente. Si llegan, alcanza con loguearlos.

## 9. Hallazgos: comportamientos no obvios

1. **Reescritura de PeerId:** el servidor cambia `peerId` por el origen en cada mensaje reenviado (`p2p_connection.cpp:66`, `:105`, `:126`, `:248`). Sin eso, el receptor no sabe a quién responder.
2. **Reject convertido:** un P2PReject con NotFound del cliente sale como PeerRefused (`p2p_connection.cpp:157-159`).
3. **Campo opcional desreferenciado:** `offer` y el candidato son opcionales en el esquema (`humblepeer.fbs:42`, `:47`, `:67`) pero el servidor los desreferencia sin chequeo (`p2p_connection.cpp:66`, `:105`, `:126`). Un mensaje sin ese campo probablemente tira el proceso (**sin verificar**). El cliente hace lo mismo (`humblenet_p2p_signaling.cpp:314`, `:350`, `:423`).
4. **Cliente sin return:** en el rechazo de P2POffer no hay return. Después de mandar PeerRefused, sigue creando la conexión entrante (`humblenet_p2p_signaling.cpp:295-298`).
5. **HMAC de reconexión:** el servidor mete `authToken` dos veces en lugar de `reconnectToken` (`server.cpp:35-41`). Solo afecta si `verify=true`, cosa que hoy no pasa.
6. **Flags sin efecto:** el servidor calcula `trickleICE` (`p2p_connection.cpp:203`) y nunca lo lee. El bit 0x02 de HelloServer no tiene efecto del lado servidor.
7. **Comentarios desactualizados:** `humblepeer.h:46-47` dice que el offer es JSON, pero el código manda el SDP crudo (`libwebrtc_asmjs.cpp:77`). El comentario de `humblenet_core.cpp:327` dice "no trickle ICE" para el bit 0x02, pero la página activa trickle (`libwebrtc_asmjs.cpp:38`). Nadie lee ese bit en el receptor.
8. **Punteros colgantes:** `connectedPeers` guarda punteros a objetos que se destruyen al cerrar (`p2p_connection.h:38`, `peer-server.cpp:189`). No se limpian (**sin verificar** el efecto).
9. **Sin STUN por defecto** (`peer-server.cpp:462`): ICE queda con candidatos host. El efecto real detrás de NAT es **sin verificar**.
10. **HelloServer sin respuesta:** si llega sin bit 0x01, o el navegador no tiene RTCPeerConnection (`libwebrtc_asmjs.cpp:26-27`), el cliente se queda esperando. No encontré timeout (**sin verificar**).
11. **Longitud en uint16:** el relay trunca la longitud a 16 bits (`humblepeer.cpp:238`).
12. **`/lookup/` solo mira el primer juego:** usa `games.begin()` de un `unordered_map`, cuyo orden no está definido (`peer-server.cpp:57-61`, `server.h:23`).
13. **Alias sin confirmación:** el motor no espera respuesta a AliasRegister (`net_humblenet.c:40-43`). Con un alias duplicado, el anfitrión cree que se registró.
14. **Acumulación de ICE** entre HelloClient (`libwebrtc_asmjs.cpp:234`, `:241`, `:249-250`).
15. **Mensajes pegados** en un frame (sección 2).

## 10. Dudas: sin verificar

- **libwebsockets:** `3rdparty/libwebsockets` es un submódulo vacío en esta copia (`.gitmodules`). La semántica exacta de `lws_retry_bo_t` y de los PING/PONG queda **sin verificar**. Tampoco sé qué fork se usa.
- **FlatBuffers:** `3rdparty/flatbuffers` también está vacío. La compatibilidad con FlatBuffers de TypeScript queda **sin verificar**, y también el orden exacto de `CreateVectorOfSortedTables` (¿byte a byte?).
- **Valores de la unión y IDs de campo:** derivados de las reglas de flatc. El header generado no está en el repo (`humblenet/CMakeLists.txt:54-57`).
- **Subprotocolo:** qué hace el navegador si el servidor no devuelve `humblepeer`. El código no lo maneja explícitamente.
- **Path:** el servidor no mira la URI en el callback WS (`peer-server.cpp:68-217`). Si libwebsockets acepta el upgrade en cualquier path, es **sin verificar**.
- **Tamaño máximo de frame:** el código no pone límite. Si hay un límite en libwebsockets, es **sin verificar**.
- **Timeout de HelloClient:** no encontré ninguno en el cliente. Que no exista en otra capa es **sin verificar**.
- **Carrera de ICE:** `libwebrtc_add_ice_candidate` no espera `setRemoteDescription`, que es asíncrono (`libwebrtc_asmjs.cpp:314`, `:345`, `:355-376`). Si el candidato llega antes, el impacto es **sin verificar**.
- **sdpMid:** no se manda, y el cliente usa `sdpMLineIndex = 0` (`libwebrtc_asmjs.cpp:363-364`). Cómo lo toman los navegadores es **sin verificar**.
- **Mensajes pegados:** el riesgo de la sección 2 es inferido. No lo reproduje.
- **Relay entrante:** `on_accept` crea un `Connection` nuevo si el socket no está en `connections` (`humblenet_core.cpp:367-383`). Ese objeto podría no tener `otherPeer`, y entonces el relay entrante no encuentra conexión (`humblenet_p2p_signaling.cpp:486-490`). **Sin verificar**.
- **Versión desplegada:** el servidor `wss://peer-server.thelongestyard.link` (`index.html:172`) puede correr otra versión del código. **Sin verificar**.
- **P2POffer a uno mismo:** no hay chequeo (`p2p_connection.cpp:43-66`). El efecto es **sin verificar**.
- **getentropy:** no se chequea el retorno (`game.h:21`).
- **Sin WebRTC en el navegador:** `libwebrtc_add_turn_server` no chequea `Module.__libwebrtc` (`libwebrtc_asmjs.cpp:247-256`, `libsocket.cpp:334`). Qué pasa en runtime es **sin verificar**.

## 11. Apéndice: humblepeer.fbs (copia literal)

Copia del archivo fuente. Los fines de línea CRLF se normalizaron a LF; el contenido no cambia.

```fbs
namespace humblenet.HumblePeer;

// Component tables
table Attribute {
	key:string (required, key);
	value:string (required);
}

enum ICEServerType : ubyte { STUNServer = 1, TURNServer = 2}

table ICEServer {
	type			: ICEServerType = STUNServer;
	server			:string (required);
	username		:string;
	password		:string;
}

// Message tables

// Hello
table HelloServer {
	version			: uint;
	flags			: ubyte;
	gameToken		: string (required);
	gameSignature	: string (required);
	authToken		: string;
	reconnectToken	: string;
	attributes		: [Attribute];
}

table HelloClient {
	peerId			: uint;
	reconnectToken	: string;
	iceServers		: [ICEServer];
}

// P2P Handshaking

table P2POffer {
	peerId			: uint;
	flags			: ubyte;
	offer			: string;
}

table P2PAnswer {
	peerId			: uint;
	offer			: string;
}

table P2PConnected {
	peerId			: uint;
}

table P2PDisconnect {
	peerId			: uint;
}

enum P2PRejectReason : ubyte { NotFound = 1, PeerRefused = 2 }

table P2PReject {
	peerId			: uint;
	reason			: P2PRejectReason = NotFound;
}

table ICECandidate {
	peerId			: uint;
	offer			: string;
}

table P2PRelayData {
	peerId			: uint;
	data			: [byte];
}

// Name alias handling

table AliasRegister {
	alias			: string (required);
}

table AliasUnregister {
	alias			: string;
}

table AliasLookup {
	alias			: string (required);
}

table AliasResolved {
	alias			: string (required);
	peerId			: uint;
}

// Message switch
union MessageType {
	// Main peer-server connection (1 -> 9)
	HelloServer, HelloClient,
	// P2P Negotiation specific messages (10 -> 19)
	P2PConnected = 10, P2PDisconnect, P2POffer, P2PAnswer, P2PReject, ICECandidate, P2PRelayData,
	// Name Alias system (20 -> 29)
	AliasRegister = 20, AliasUnregister, AliasLookup, AliasResolved,
}

table Message {
	message			: MessageType;
}

root_type Message;
```
