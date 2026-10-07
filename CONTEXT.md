# CONTEXT: QuakeWeb

Lectura obligatoria para cualquier agente antes de tocar código. Mantenerlo corto y al día.

## Stack

- Juego y motor: **Quake 3** con el fork de ioquake3 de "The Longest Yard" (`jdarpinian/ioq3`, commit fijo),
  compilado a WebAssembly con Emscripten 3.1.58. Contenido objetivo: los archivos de Quake Live del anfitrión.
  Ver [ARCHITECTURE.md](ARCHITECTURE.md) (D-004) y [motor/README.md](motor/README.md).
- Página: TypeScript en el navegador (como CSweb: Vite + TypeScript, sin frameworks de interfaz; todavía no existe).
  Publicación estática en GitHub Pages.

## Comandos

- Build del motor: workflow "Motor web" en GitHub Actions ([.github/workflows/motor.yml](.github/workflows/motor.yml));
  se dispara con cambios en `motor/**` o a mano. Deja el zip como artefacto `motor-web`. No hay toolchain local
  (esta PC no tiene `emcc`, `make` ni compilador de C).
- Instalar / build de la página / tests / lint: `(completar cuando exista la página)`

## Convenciones

- Español rioplatense (voseo) en código, comentarios, interfaz y documentos.
- Mismo origen que CSweb y CiberWeb (`https://santiagopostacchini.github.io`): toda clave de almacenamiento lleva
  el prefijo `quakeweb:` y las bases de IndexedDB, Web Locks y caches se llaman `quakeweb-…`. **La página del fork de ioq3
  no lo respeta** (`code/web/index.html`: `localStorage` `username`/`model`, Cache API `thelongestyard` y un montaje
  IDBFS): no la usamos; la página propia monta IDBFS y nombra todo con el prefijo.
- Cambios al motor: sólo como parches en `motor/parches/` (generados con `git diff` sobre el commit fijado), anotados
  en la tabla de [motor/README.md](motor/README.md).
- No tocar otros repos ni sus ramas por accidente: los comandos de Git se ejecutan siempre con `-C C:\dev\QuakeWeb`.
- Link para unirse estable: `…/QuakeWeb/#CODIGO` (CiberWeb lo usa; ver [PROMPT.md](PROMPT.md)).
- Pruebas entre pestañas con `?perfil=<nombre>` y del relay con `?relay=1`.

## Zonas que no se tocan

- Archivos de id Software (Quake 3, Quake Live, demos): nunca se commitean ni se publican. Se usan sólo desde la
  instalación local de cada jugador. Nada de ingeniería inversa de los binarios de Quake Live sin confirmar el EULA
  oficial (el `EULA.txt` de la instalación local no es de Steam).
- Otros repos (CSweb, CiberWeb) y el Worker TURN de CSweb: sólo con aprobación del usuario.
- `motor/parches/`: sólo se cambian a propósito, documentando el porqué.

## Flujo de trabajo

- Una tarea = una rama (`codex/<slug>` para lo delegado a Codex). Nadie commitea en `main`.
- Cambios de arquitectura o dependencias nuevas: consultar antes.
- Al terminar, actualizar `TASKS.md` (hecho, pendiente, hallazgos).
