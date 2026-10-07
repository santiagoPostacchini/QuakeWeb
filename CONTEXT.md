# CONTEXT: QuakeWeb

Lectura obligatoria para cualquier agente antes de tocar código. Mantenerlo corto y al día.

## Stack

- Motor objetivo: **ioquakelive**, commit fijo `fb4414618c120d773590e5aebef8a3f7e23d2833`, portado a WebAssembly
  con Emscripten 3.1.58 (D-006). Contenido: los archivos locales de Quake Live del anfitrión.
  Ver [motor/ql/README.md](motor/ql/README.md). El fork de "The Longest Yard" (`motor/`) conserva la prueba de
  mapas y red anterior (D-004); todavía falta portar su transporte al motor objetivo.
- Página: TypeScript en el navegador (como CSweb: Vite + TypeScript, sin frameworks de interfaz; todavía no existe).
  Publicación estática en GitHub Pages.

## Comandos

- Build del motor: workflow "Motor web" en GitHub Actions ([.github/workflows/motor.yml](.github/workflows/motor.yml));
  se dispara con cambios en `motor/**` o a mano. Deja el zip como artefacto `motor-web`. No hay toolchain local
  (esta PC no tiene `emcc`, `make` ni compilador de C).
- Build de ioquakelive: workflow "Motor Quake Live web" ([.github/workflows/motor-ql.yml](.github/workflows/motor-ql.yml)),
  artefacto `motor-ql-web`. `node pruebas/servidor.mjs` sirve pruebas en `http://127.0.0.1:5180/ql/?mapa=campgrounds`.
  Espera el build en `motor/ql/build/` y lee `pak00.pk3` directamente de la instalación Steam local.
- Instalar: `npm ci`. Página: `npm run dev` (Vite, http://localhost:5173; `quakeweb.cargarPakLocal()` en la consola carga
  el pak00.pk3 de la instalación local, sólo en desarrollo) y `npm run build` (sale en `dist/`).
- Tests: `npm test` (node --test). Tipos: `npm run typecheck`. Criterio habitual: los dos en verde.

## Convenciones

- Español rioplatense (voseo) en código, comentarios, interfaz y documentos.
- Mismo origen que CSweb y CiberWeb (`https://santiagopostacchini.github.io`): toda clave de almacenamiento lleva
  el prefijo `quakeweb:` y las bases de IndexedDB, Web Locks y caches se llaman `quakeweb-…`. **La página del fork de ioq3
  no lo respeta** (`code/web/index.html`: `localStorage` `username`/`model`, Cache API `thelongestyard` y un montaje
  IDBFS): no la usamos; la página propia monta IDBFS y nombra todo con el prefijo.
- Cambios al motor: sólo como parches en `motor/parches/` (generados con `git diff` sobre el commit fijado), anotados
  en la tabla de [motor/README.md](motor/README.md).
- Cambios a ioquakelive: parches en `motor/ql/parches/`, aplicados en orden sobre el commit D-006.
  Sus módulos wasm deben mantener los símbolos internos ocultos; revisar con `motor/ql/herramientas/verificar-modulos.mjs`.
- No tocar otros repos ni sus ramas por accidente: los comandos de Git se ejecutan siempre con `-C C:\dev\QuakeWeb`.
- Link para unirse estable: `…/QuakeWeb/#CODIGO` (CiberWeb lo usa; ver [PROMPT.md](PROMPT.md)).
- Pruebas entre pestañas con `?perfil=<nombre>` y del relay con `?relay=1`.

## Zonas que no se tocan

- Archivos de id Software (Quake 3, Quake Live, demos), incluidos el logo y las fuentes de Quake Live: nunca se
  commitean ni se publican. La interfaz los toma en tiempo de ejecución del pak00.pk3 local (`web/marca.ts`). Se usan sólo desde la
  instalación local de cada jugador. Nada de ingeniería inversa de los binarios de Quake Live sin confirmar el EULA
  oficial (el `EULA.txt` de la instalación local no es de Steam).
- Otros repos (CSweb, CiberWeb) y el Worker TURN de CSweb: sólo con aprobación del usuario.
- `motor/parches/`: sólo se cambian a propósito, documentando el porqué.

## Flujo de trabajo

- Una tarea = una rama (`codex/<slug>` para lo delegado a Codex). Nadie commitea en `main`.
- Cambios de arquitectura o dependencias nuevas: consultar antes.
- Al terminar, actualizar `TASKS.md` (hecho, pendiente, hallazgos).
