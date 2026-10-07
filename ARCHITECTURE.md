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

### D-004: Juego y motor: Quake 3 con ioquake3, apuntando al estilo Quake Live (2026-10-07)

- Contexto: el encargo recomendaba Quake 1 con FTEQW, pero al usuario le gusta Quake Live, que es de la familia de
  Quake 3. Detalle de la investigación: [docs/research/fteqw-web-red.md](docs/research/fteqw-web-red.md).
- Decisión (aprobada por el usuario): **Quake 3 con el fork de ioquake3 de "The Longest Yard"**
  (`jdarpinian/ioq3`, commit fijo, ver [motor/README.md](motor/README.md)), compilado en GitHub Actions con
  Emscripten 3.1.58 y con parches propios en `motor/parches/`. Objetivo de contenido: los archivos de Quake Live de
  quien lo tenga instalado (mapas, texturas, modelos), con la lógica de juego GPL de Quake 3 en QVM, porque la de
  Quake Live son DLL nativas de x86 que no corren en WebAssembly.
- Razón: ese fork ya corre el servidor en una pestaña con clientes por WebRTC (HumbleNet), que es el modelo de
  QuakeWeb; los mapas de Quake Live (BSP 47) tienen la misma estructura que los de Quake 3 más una sección.
- Alternativas descartadas: Quake 1 con FTEQW (red nativa más simple, pero lejos de Quake Live); ingeniería inversa
  de las DLL de Quake Live (trabajo grande y sin confirmar que el EULA oficial lo permita).
- Riesgos: el fork lo mantiene una sola persona; las reglas de juego de Quake Live hay que reescribirlas.
- Estado: vigente. Reemplaza el borrador anterior de D-004 (FTEQW + broker virtual), que queda descartado.

### D-005: Camino de red (borrador, pendiente de la etapa 0)

- Contexto: el fork usa HumbleNet, con un "peer server" de señalización propio (C++/FlatBuffers) que también reparte
  los servidores TURN. CSweb usa Trystero + `Link` propio + Worker TURN, ya probado entre redes.
- Propuesta (sin aprobar, sin probar): dejar la red del motor (DataChannels de HumbleNet) y reemplazar el peer server
  por uno **virtual dentro de la página** que lo conecte con la señalización de CSweb (Trystero) y el Worker TURN,
  como hizo `WofWca/quake3.xdc` con otro transporte. Una sola señalización para sala, código, juego y archivos.
- Alternativas: peer server propio en una VM (no corre en un Worker); red de CSweb inyectada en el motor.
- Condición para aprobarla: dos pestañas en un deathmatch y la prueba del relay.
- Estado: pendiente
