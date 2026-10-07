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
- Aceptación: dos pestañas juegan un deathmatch local con FTEQW (u otro motor justificado); la elección entre la
  red nativa del motor y la de CSweb queda escrita en `ARCHITECTURE.md` (D-004) y aprobada por el usuario.
- Hallazgos (2026-10-07, lectura de código; todavía no se compiló ni se corrió nada):
  - Hecho: lectura de CSweb (`HANDOFF.md`, `PLAN-ONLINE.md`, `p2pnet.ts`, `engine.ts`) y del port web de FTEQW
    (`engine/web/`, `net_wins.c`, `net_ice.c`). Notas en [docs/research/fteqw-web-red.md](docs/research/fteqw-web-red.md).
  - El broker de FTE es un WebSocket binario simple; propuesta A2 (broker virtual + Trystero) en D-004.
  - El motor guarda en `localStorage` y en la Cache API `user` **sin prefijo**: hay que parchearlo (origen
    compartido con CSweb).
  - No hay build web reciente: el último es de 2022. Hay que compilar (emsdk 2.0.12 en Ubuntu, como la CI de FTE).
  - Bloqueado: no hay Quake instalado en las rutas habituales de esta PC y no hay `emcc`/`make`/Docker/WSL.
  - Pendiente: build del motor, dos pestañas en deathmatch, prueba de relay y aprobación del usuario.

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
