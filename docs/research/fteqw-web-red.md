# FTEQW en el navegador: qué hace el motor y qué le falta (etapa 0)

Investigación del 2026-10-07 sobre el código de FTEQW (`https://github.com/fte-team/fteqw`, commit `f937b9d`,
2026-06-04, GPL v2 o posterior). Todo lo de abajo sale de **leer el código**: todavía no se compiló ni se corrió
nada. Las rutas son relativas a `engine/` del repo de FTE.

## Estado del port web

- La documentación del wiki (`quakewiki.org/wiki/FTEQW_Emscripten_Port`) es de 2017 y está desactualizada; sirve
  como idea general, no como referencia.
- El código del port vive en `web/` (`ftejslib.js` 1755 líneas, `sys_web.c`, `fs_web.c`, `gl_vidweb.c`,
  `prejs.js`, `fteshell.html`). Se compila con `make FTE_TARGET=web` (`documentation/Building.md`).
- No hay binarios web oficiales recientes: `fastdl.idtech.space/bin/` sólo trae Windows y Linux. El último build web
  que encontré es de marzo de 2022 (`triptohell.info/moodles/web/ftewebgl.wasm`, 5 MB), con 4 años de atraso
  respecto del código.
- La CI de FTE (`.github/workflows/main.yml`) compila el target web en Ubuntu con **emsdk 2.0.12** (de 2020) y
  `make FTE_TARGET=web makelibs` + `gl-rel`. Las notas de compilación dicen que en Windows hace falta Cygwin (no
  MSYS2). Esta PC no tiene `emcc`, `make`, `gcc`, `cmake`, Docker ni WSL.

## Red WebRTC nativa (cómo funciona)

- **Un `RTCPeerConnection` por cliente**, con un único DataChannel `quake` no confiable y sin orden
  (`ordered:false, maxRetransmits:0`): `web/ftejslib.js:1303-1418`. Es lo mismo que el canal `game` de CSweb.
- **El broker es un WebSocket binario** (subprotocolo `rtc_host` para el que crea la partida, `rtc_client` para el
  que se une; `net_wins.c:6361,9333`). Cada mensaje es `[tipo:1 byte][par:2 bytes LE][texto]`. Tipos
  (`netinc.h:456-464`): `PEERLOST=0`, `GREETING=1`, `NEWPEER=2`, `OFFER=3`, `CANDIDATE=4`, `ACCEPT=5`,
  `SERVERINFO=6`, `SERVERUPDATE=7`, `NAMEINUSE=8`. El broker sólo reenvía mensajes entre el anfitrión y cada cliente
  de la misma sala y reescribe el índice de par (`net_wins.c:7272-7320`). La implementación de referencia está en
  el propio servidor nativo de FTE (`net_wins.c:6480-6600`), así que **un broker propio son ~150 líneas** (por
  ejemplo, un Durable Object de Cloudflare por sala).
- **Broker por defecto**: `net_ice_broker = tls://master.frag-net.com:27950` (`net_wins.c:103`), un servicio de
  terceros. Se puede cambiar con la cvar o con la clave `rtcbroker` del manifiesto (`fs.c:1053`).
- **Servidores ICE** (`net_wins.c:8860-8970`): arma `{"iceServers":[…]}` con (1) `stun:<host del broker>`, (2) la
  cvar `net_ice_servers` (lista separada por espacios, `turn:host:3478?user=U?auth=P`, admite `?transport=`), (3) los
  `relays` que el broker manda en `NEWPEER`. La cvar `net_ice_relayonly 1` pone `iceTransportPolicy:"relay"`: es el
  equivalente de `?relay=1`. El buffer de configuración es de 4096 bytes.
- **Comandos**: no hay funciones de C exportadas. Los argumentos van en `Module.arguments` (`+sv_port_rtc /X`,
  `+connect /X`; `prejs.js` ignora los demás si hay `document.referrer`). En marcha, `FTEC.cbufadd(texto)`
  (`ftejslib.js:117`) agrega texto al búfer de comandos del motor, que corre dentro del frame: encaja con la lección
  nº 1 de CSweb. Falta confirmar en un build real que `FTEC` sea accesible desde la página.
- **Archivos**: `Module.files = {"id1/pak0.pak": ArrayBuffer | URL | Promise}` los mete en el sistema de archivos
  virtual antes de arrancar (`prejs.js:50-110`). Sirve para cargar los `.pak` desde IndexedDB.

## Riesgos del origen compartido con CSweb

Hay tres lugares donde el motor guarda cosas en el navegador **sin prefijo propio**; hay que parchearlos antes de
publicar (hoy rompen la regla de `quakeweb:`):

1. `localStorage` con el **nombre del archivo como clave** (`ftejslib.js:1009-1011`, `1138-1144`): `cfg_save` y
   cualquier archivo que no sea `.pak/.pk3/.kpf`. Hay que anteponer `quakeweb:fs:`.
2. Cache API con nombre **`user`** (`prejs.js:24`; `fteshell.html:351`) para los `.pak` descargados.
   Pasarlo a `quakeweb-user`.
3. Service worker `fte_pwa_sw.js` (cache `v1`, scope `./`) que registra `fteshell.html`. No usamos esa página, así
   que no se registra: confirmarlo en el build.

## Qué NO hace el motor (y la página tiene que resolver)

- **Sala, código de 6 letras y descubrimiento**: el motor conecta por nombre de sala (`/NOMBRE`) a través del
  broker; no hay roster ni migración.
- **Transferencia de archivos** anfitrión → invitado: el canal del motor es no confiable y sólo lleva el protocolo
  de Quake. El enjambre de `.pak` necesita un canal confiable aparte (el `files` de CSweb).
- **Diagnóstico de red**: el `RTCPeerConnection` queda en `FTEH.h[id].pc`; se puede leer `getStats()` desde un
  parche de `ftejslib.js`, pero no hay reinicio de ICE ni medición de RTT.
- **Migración de anfitrión** y **Keyboard Lock/Ctrl+W**: a cargo de la página (como en CSweb).

## Los dos caminos de red

- **A. Red nativa de FTE**: el motor crea sus propios `RTCPeerConnection`; hay que dar un broker y los servidores
  ICE. Sub-variantes:
  - **A1. Broker propio en la nube** (Worker + Durable Object): el broker también entrega credenciales TURN en
    `NEWPEER`. Sin Trystero para el juego.
  - **A2. "Broker virtual" dentro de la página**: se reemplaza `emscriptenfte_ws_connect` para que la URL del broker
    apunte a un objeto JS que habla el protocolo binario de arriba y lo conecta con la señalización de CSweb
    (Trystero). La sala, el código y el enjambre de archivos ya usan esa señalización, así que **todo comparte una
    sola señalización**. Cero cambios en el C del motor; sólo en `ftejslib.js` (que igual hay que parchear).
- **B. Red de CSweb**: el juego viaja por el `Link` de CSweb y se inyecta en el motor reemplazando
  `emscriptenfte_rtc_create` para devolver un handle respaldado por nuestro DataChannel. Da el mismo diagnóstico y
  el reinicio de ICE de CSweb, pero hay que reimplementar lo que el motor ya hace (alta/baja de pares, índices).

## Recomendación provisional

**A2** (red nativa del motor + broker virtual sobre Trystero, con el Worker TURN de CSweb). Razones: usa el código
de red de Quake que FTE ya probó, evita infraestructura nueva, reutiliza lo ya probado entre redes de CSweb para
señalización, relay y archivos, y no depende del broker de terceros. Es una **recomendación a validar**, no una
decisión: falta compilar el motor, correr dos pestañas y medir. Si A2 falla en las pruebas, el plan B es A1.

## Alternativa: Quake 3 (lo más cercano a Quake Live)

Quake Live es una evolución de Quake 3 Arena (mismo linaje de motor y de juego: arenas, railgun, CTF, duelo); Quake 1
es otro juego (más lento, sin rail, otra física). Si el objetivo es el estilo Quake Live, el juego es **Quake 3**.
Hallazgos del 2026-10-07, también sólo de leer código y documentación:

- **Ya existe un port web de Quake 3 con servidor en una pestaña**: `https://thelongestyard.link/`, de James
  Darpinian ("modeless"), código en `github.com/jdarpinian/ioq3` (rama `thelongestyard.link`, GPL v2, último
  commit 2026-04-12), basado en ioquake3. La red usa **HumbleNet** (`github.com/jdarpinian/HumbleNet`, último commit
  2026-07-04): DataChannels WebRTC y un "peer server" de señalización por WebSocket (`net_peer_server`). El primero
  que abre una sala con `+set net_server_name X +map q3dm17` pasa a ser el servidor y los demás hacen
  `+connect "X.humblenet"` (`code/web/index.html:523-535`). Es el mismo modelo que pide el encargo.
- **TURN**: el peer server manda los servidores ICE (con usuario y clave) en el mensaje de saludo
  (`humblenet_p2p_signaling.cpp:374-394`), así que se puede inyectar el relay como en el broker de FTE.
- **Señalización**: el peer server de HumbleNet es C++ (no corre en un Worker) y usa FlatBuffers. El port
  `WofWca/quake3.xdc` (marzo de 2026) muestra el camino: simula el WebSocket de señalización y el WebRTC en el
  navegador, con otro transporte. Para QuakeWeb sería lo equivalente a A2: un "peer server virtual" dentro de la
  página, sobre Trystero.
- **Build**: CI del fork con **emsdk 3.1.58** (`.github/workflows/build.yml`), mucho más nuevo que el 2.0.12 de FTE.
- **Datos**: el sitio original usa el **demo de Quake 3** (`pak0.pk3` de 49.289.300 bytes), que baja de Internet
  Archive y cachea en una Cache API llamada `thelongestyard` (hay que renombrarla a `quakeweb-…`). Con el juego
  completo hay que armar un paquete desde `baseq3/` (el `pak0.pk3` completo es de cientos de MB: no medido, no hay
  Quake 3 en esta PC). Alternativa libre: OpenArena (assets GPL, cientos de MB). Sobre el demo, según páginas de empaquetadores de
  distribuciones (FreshPorts, TinyCore, pkgsrc), tiene licencia restrictiva de Loki: **no se puede redistribuir**, y trae
  4 mapas y 6 personajes. Entonces no podría viajar del anfitrión a los invitados ni publicarse; cada jugador tendría que
  bajarlo él mismo (como hace thelongestyard). No leí la licencia original.
- **Quake Live**: su motor y su código de juego son cerrados; no hay forma de correrlos en ioq3. No verifiqué el EULA de
  Quake Live (la búsqueda sólo devolvió el de Quake 3 Arena, que prohíbe ingeniería inversa y obras derivadas). Quake
  Live no está instalado en esta PC.
- **Riesgos**: depende de un fork de una sola persona (22 estrellas) y de su fork de HumbleNet (5 estrellas; el
  HumbleNet original, 574 estrellas, no recibe cambios desde enero de 2022); hay que modificar el motor para el
  origen compartido (la Cache API `thelongestyard` y el `localStorage`) y para el transporte de archivos; no se
  midió cuántos jugadores aguanta una pestaña como servidor.

Comparación rápida con Quake 1 + FTEQW:

| | Quake 1 + FTEQW | Quake 3 + ioq3 (fork thelongestyard) |
|---|---|---|
| Parecido a Quake Live | bajo | alto |
| Red en el navegador | nativa del motor, broker de ~150 líneas | HumbleNet, peer server C++/FlatBuffers |
| Mantenimiento upstream | proyecto activo, port web oficial | un fork de una persona sobre ioq3 |
| Tamaño de datos | decenas de MB | demo 49 MB / completo cientos de MB |
| Datos libres | LibreQuake, shareware | demo, OpenArena |
| Emscripten | 2.0.12 (CI de FTE) | 3.1.58 (CI del fork) |

## Lo que no está verificado

- Que el build web actual compile con emsdk 2.0.12 y con uno más nuevo.
- Que dos pestañas jueguen un deathmatch (`sv_port_rtc` / `connect`) con el broker por defecto y con uno propio.
- Que `FTEC.cbufadd` y `FTEH` estén accesibles desde la página en el build.
- Tamaño real del wasm y de los `.pak` de la re-edición (no hay Quake instalado en las rutas habituales de esta PC).
- Que TURN de Cloudflare funcione con el formato `turn:host:port?user=U?auth=P` del motor.
