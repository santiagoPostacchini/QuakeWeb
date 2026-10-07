# TASKS: QuakeWeb

- Responsables: `claude` (planificación y revisión), `codex` (implementación), `gemini` (investigación, solo lectura), `humano`.
- Estados: `pendiente`, `en curso`, `hecho`, `bloqueada`.
- Cada tarea es chica, tiene criterio de aceptación verificable y su propia rama. Al terminar, quien trabajó actualiza su bloque (estado y hallazgos).

<!-- Plantilla de tarea:
### T-000: Título corto
- Responsable:
- Estado: pendiente
- Rama:
- Aceptación:
- Hallazgos:
-->

## Tareas

Las etapas completas están en [PROMPT.md](PROMPT.md); acá se parten en tareas a medida que se empiezan.

### T-001: Etapa 0, exploración del motor y de la red
- Responsable: claude
- Estado: en curso
- Rama: exploracion-motor
- Aceptación: dos pestañas juegan un deathmatch local con el motor elegido (D-004: Quake 3 con ioq3); la elección
  del camino de red queda escrita en `ARCHITECTURE.md` (D-005) y aprobada por el usuario.
- Subtareas: T-006 (build del motor en CI), T-007 (mapas de Quake Live), después dos pestañas y relay.
- Hallazgos (2026-10-07, lectura de código; todavía no se compiló ni se corrió nada):
  - Hecho: lectura de CSweb (`HANDOFF.md`, `PLAN-ONLINE.md`, `p2pnet.ts`, `engine.ts`) y del port web de FTEQW
    (`engine/web/`, `net_wins.c`, `net_ice.c`). Notas en [docs/research/fteqw-web-red.md](docs/research/fteqw-web-red.md).
  - El broker de FTE es un WebSocket binario simple; propuesta A2 (broker virtual + Trystero) en D-004.
  - El motor guarda en `localStorage` y en la Cache API `user` **sin prefijo**: hay que parchearlo (origen
    compartido con CSweb).
  - No hay build web reciente: el último es de 2022. Hay que compilar (emsdk 2.0.12 en Ubuntu, como la CI de FTE).
  - Bloqueado: no hay Quake instalado en las rutas habituales de esta PC y no hay `emcc`/`make`/Docker/WSL.
  - Nuevo: al usuario le gusta Quake Live, que es de la familia de Quake 3. Existe un port web de Quake 3 con servidor
    en una pestaña (`thelongestyard.link`, fork de ioq3 con HumbleNet, emsdk 3.1.58). Comparación en el mismo documento.
    Hay que decidir el juego (Quake 1/FTEQW o Quake 3/ioq3) antes de compilar.
  - Decidido con el usuario: Quake 3 con el fork de ioq3 y contenido de Quake Live (D-004). Lo de FTEQW queda como
    referencia.
  - Quake Live (instalación del usuario): mapas BSP 47 = BSP 46 + una sección; lógica de juego en DLL nativas de x86
    (no sirven en la web: se usa la lógica GPL de Quake 3 en QVM). El `EULA.txt` local no es de Steam.
  - Pendiente: build (T-006), mapas de QL (T-007), dos pestañas en deathmatch, prueba de relay y aprobación de D-005.

### T-006: Build web del motor en GitHub Actions
- Responsable: claude
- Estado: hecho
- Rama: exploracion-motor
- Aceptación: el workflow "Motor web" termina en verde con los parches aplicados y deja el artefacto `motor-web`
  con el cliente, el servidor dedicado y `ztm-flexible-hud.pk3`.
- Hallazgos: repo público `santiagoPostacchini/QuakeWeb`. El build tarda ~1 min 20 s. El Makefile del fork apaga los
  QVM para la web (se piden con `BUILD_GAME_QVM=1`) y con `-j` el zip quedaba sin `ztm-flexible-hud.pk3` (se suben los
  archivos sueltos). Con Vorbis el cliente pasa de 2,07 a 2,23 MB.

### T-007: Mapas de Quake Live en ioq3
- Responsable: claude
- Estado: hecho
- Rama: exploracion-motor
- Aceptación: con el build de T-006 y los archivos de Quake Live de la PC del usuario (sin publicarlos), un mapa de
  QL (por ejemplo `campgrounds`) carga y se puede recorrer en el navegador, con captura.
- Hallazgos: parche `motor/parches/0001-bsp47-quake-live.patch` (acepta BSP 47). Verificado en 3 mapas que las 17
  secciones comunes tienen los tamaños de registro de Quake 3; la 18ª (nº 17) son múltiplos de 128 bytes.
  - Prueba 1 (2026-10-07, build `37666614058`, `pruebas/mapa-ql/?mapa=campgrounds`, panel del navegador de Claude):
    `pak00.pk3` (917,5 MiB) llega en 7,1 s desde localhost; el motor monta 9285 archivos y ejecuta el `default.cfg`
    de QL; compilar los 57 shaders GLSL lleva 2,8 s. **El mapa carga** en el servidor y en el renderer ("loaded 3329
    faces, 404 meshes, 186 trisurfs"). Corta en la lógica de juego: `DEFAULT_MODEL (sarge) failed to register`
    (el ícono del jugador es `.png` en QL; parche 0002) y faltan 105 sonidos (`.ogg` en QL; build con Vorbis).
  - Prueba 2 (build `37667246540`, con parche 0002 y Vorbis): **el jugador entra a `campgrounds` y se mueve** (W/D
    desde el panel del navegador). Página → "entered the game" en 15,2 s (8,8 s son leer `pak00.pk3` del disco local;
    `CL_InitCGame` 2,4 s). Sonidos faltantes: de 105 a 33. Captura local (no se versiona: es arte de id):
    `motor/build/capturas/t007-campgrounds.jpg`.
  - Pendiente de pulido (no bloquea): la mira sale como un cuadrado blanco (Quake 3 busca `crosshaira…j`, QL trae
    `crosshair1…N`), 33 sonidos con otros nombres (`sound/feedback/*`, `menu*.wav`), `scripts/arenas.txt` de QL supera
    el tope de 8192 bytes de la UI de Quake 3, faltan imágenes de algunos shaders (`menuback`, `teleportEffect`,
    `viewBloodBlend`) y el parámetro de shader `novlcollapse` es desconocido. El menú de Quake 3 no tiene su arte.

### T-002: Etapa 1, crear y unirse
- Responsable: claude
- Estado: pendiente
- Rama:
- Aceptación: un invitado en otra PC de la misma red entra con el link y juega; la segunda vez no vuelve a bajar
  los archivos; el link `…/QuakeWeb/#CODIGO` lleva directo a la partida.
- Hallazgos:

### T-003: Etapa 2, entre redes
- Responsable: claude
- Estado: pendiente
- Rama:
- Aceptación: anfitrión en una casa e invitado en datos móviles, y dos PCs de una red corporativa, conectan sin
  configurar nada; el diagnóstico muestra el camino usado.
- Hallazgos:

### T-004: Etapa 3, robustez
- Responsable: claude
- Estado: pendiente
- Rama:
- Aceptación: cerrar la pestaña del anfitrión con 3 jugadores deja la partida andando con otro anfitrión en menos
  de 20 s; Ctrl+W no cierra la pestaña en pantalla completa.
- Hallazgos:

### T-005: Etapa 4, rendimiento y pulido
- Responsable: claude
- Estado: pendiente
- Rama:
- Aceptación: números antes/después del arranque y del frame en este archivo, y capturas de todas las pantallas.
- Hallazgos:

### T-008: Que se juegue como Quake Live
- Responsable: claude (investigación: gemini)
- Estado: pendiente
- Rama:
- Aceptación: la meta final del proyecto es correr Quake Live en el navegador. Con el contenido de QL ya cargando
  (T-007), falta su jugabilidad: física de movimiento, armas, armadura e ítems, modos (Duel, FFA, TDM, CA, CTF), HUD,
  mira y menús. Se reescribe sobre el código GPL de Quake 3 (`code/game`, `code/cgame`, `bg_pmove.c`) como parches en
  `motor/parches/`, con valores tomados de fuentes públicas y anotados con su fuente. Criterio por etapa: una tabla
  "Quake Live vs QuakeWeb" en este archivo con cada regla medida en el juego.
- Hallazgos: investigación encargada a Gemini (`docs/research/quake-live-reglas.md`). La ingeniería inversa de las
  DLL de QL sigue descartada hasta confirmar el EULA oficial.

### T-009: Señalización de HumbleNet propia (dos pestañas)
- Responsable: claude (revisión e integración), codex (implementación).
- Estado: en curso; implementación acotada hecha y verificada.
- Rama: `codex/senal-humblenet` (base `exploracion-motor`).
- Aceptación: servidor compatible que permita un deathmatch entre dos pestañas con mapas de QL.
- Hecho: esquema con licencia BSD-3, códec FlatBuffers manual de los 13 mensajes y validación de buffers.
- Hecho: lógica sin transporte (saludo, juegos, alias, negociación y relay) y WebSocket local `humblepeer`.
- Verificación: `npm test` pasa (22 tests); `npm run typecheck` pasa; sin dependencias nuevas.
- Hallazgos: se conservan opcionales ausentes, se limpian ofertas al desconectar y cada mensaje usa su propio frame.
- Pendiente: revisión e integración; probar deathmatch con el motor en dos pestañas (no realizado acá).
