# ARCHITECTURE: QuakeWeb

## Visión general

Página estática en GitHub Pages. La pestaña del anfitrión corre el motor de Quake (WebAssembly) como servidor; los
invitados corren el mismo motor como clientes y se conectan por WebRTC, con relay TURN de Cloudflare cuando no hay
camino directo. Los archivos del juego viajan del anfitrión a los invitados y quedan en IndexedDB. El modelo y
buena parte del código vienen de CSweb.

## Decisiones

Una entrada por decisión. No se borran: si una cambia, se marca como reemplazada y se agrega la nueva.

### D-001: Proyecto separado de CSweb (2026-10-07)

- Contexto: el dueño quiere sumar más juegos al modelo de CSweb y una página que los reúna.
- Decisión: QuakeWeb es un repo y un sitio propios. Copia y adapta código de CSweb, sin depender de él. El hub
  (CiberWeb) es otro proyecto que sólo enlaza a los juegos y guarda sus propios datos de cada uno.
- Razón: cada juego evoluciona a su ritmo sin arriesgar los otros; si un juego recibe un reclamo legal, no arrastra
  a los demás repos.
- Alternativas descartadas: monorepo con un núcleo compartido (más reuso, pero acopla los juegos y el riesgo).
- Estado: vigente

### D-002: Los archivos del juego los pone el anfitrión (2026-10-07)

- Contexto: los datos de Quake son de id Software / ZeniMax.
- Decisión: no se publican. La página arma un paquete desde la instalación del anfitrión (Steam/GOG) y lo
  transfiere a los invitados, como CSweb. El shareware o LibreQuake sólo con aprobación del dueño.
- Razón: es lo que funcionó en CSweb sin exponer el repo a reclamos.
- Alternativas descartadas: publicar el shareware por defecto (la licencia lo permite con condiciones; queda como
  opción a decidir).
- Estado: vigente

### D-003: Mismo origen que CSweb y el hub (2026-10-07)

- Contexto: todo se publica bajo `https://santiagopostacchini.github.io`.
- Decisión: aprovechar el origen compartido (el Worker TURN ya lo autoriza) y aislar el almacenamiento con el
  prefijo `quakeweb:`.
- Razón: evita configurar otro Worker y otro dominio; el riesgo de pisarse con CSweb se controla con prefijos.
- Alternativas descartadas: dominio propio (costo y configuración extra sin beneficio por ahora).
- Estado: vigente

### D-004: Motor y camino de red (borrador de la etapa 0)

- Contexto: FTEQW trae servidor en el navegador y WebRTC con broker; la red de CSweb (Trystero + relay propio) ya
  está probada entre redes. Detalle de lo leído en el código: [docs/research/fteqw-web-red.md](docs/research/fteqw-web-red.md).
- Propuesta (sin aprobar, sin probar): **motor FTEQW; red nativa del motor (A) con un "broker virtual" dentro de la
  página (A2)** que habla el protocolo binario del broker de FTE y lo conecta con la señalización de CSweb
  (Trystero) y el Worker TURN de CSweb. Un solo sistema de señalización para sala, código, juego y archivos.
- Razón: el motor ya maneja un `RTCPeerConnection` por cliente con DataChannel no confiable (igual al canal `game`
  de CSweb) y recibe servidores TURN por la cvar `net_ice_servers`; el broker son ~150 líneas y no hay que tocar el
  C del motor. Evita depender del broker de terceros (`master.frag-net.com`).
- Alternativas: **A1** broker propio en la nube (Worker + Durable Object); **B** red de CSweb inyectada al motor
  (más trabajo, mejor diagnóstico).
- Condición para aprobarla: compilar el motor, dos pestañas en un deathmatch y la prueba del relay.
- Estado: pendiente
