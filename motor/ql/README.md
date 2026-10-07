# Motor Quake Live: ioquakelive portado a la web (D-006)

Base: `https://github.com/tjone270/ioquakelive` (GPL-2.0), commit `fb4414618c120d773590e5aebef8a3f7e23d2833`
(2026-09-16). Implementación abierta de Quake Live build 1069 sobre ioquake3; necesita el `pak00.pk3` legítimo de
quien tenga Quake Live (nunca se versiona ni se publica).

El workflow [`.github/workflows/motor-ql.yml`](../../.github/workflows/motor-ql.yml) baja ese commit (con los
submódulos `libogg` y `libvorbis`), aplica [`parches/`](parches) en orden y compila con Emscripten 3.1.58.

## Plan del port

1. El motor compila para la web (cliente, sin red). Verificado en GitHub Actions.
2. La lógica de juego (`cgame`, `qagame`, `ui`) compila como módulos wasm (`SIDE_MODULE`) y el motor los carga con
   `dlopen` (`MAIN_MODULE`). Cuidar los símbolos globales duplicados entre módulos (`-fvisibility=hidden`).
3. `campgrounds` carga con las reglas, menú y HUD de ioquakelive; jugador entra y se mueve (T-010).
4. Red: HumbleNet del fork web de "The Longest Yard" (`motor/` de este repo) y señalización propia (T-009).

## Cómo trabajar los parches

Clon local de trabajo en `motor/ql/fuente/` (ignorado por Git), en el commit fijado. Los cambios se commitean ahí y se
exportan con `git format-patch <commit fijado>..HEAD -o ../parches/`. Codex puede trabajar dentro de ese clon con
`delegate-codex` (ramas `codex/…` del clon).

## Parches

| Archivo | Qué hace | Estado |
|---|---|---|
| `0001` | Motor `MAIN_MODULE`, lógica `SIDE_MODULE=2`, entradas `dllEntry`/`vmMain`. | build y navegador |
| `0002` | Motor PIC; qagame usa `dllEntry` y tabla de funciones, sin `vmMain`. | build y navegador |
| `0003` | Memoria inicial de 256 MB que puede crecer hasta 2 GB; elimina plantillas ausentes. | build y navegador |
| `0004` | Nombres de funciones en las pilas de errores de wasm. | build |
| `0006` | Oculta símbolos internos de los módulos para evitar colisiones de la GOT. | build y navegador |
| `0007` | Atlas de fuentes en RGBA para la web: WebGL 2 no tiene `GL_TEXTURE_SWIZZLE` y el atlas `GL_R8` dibujaba cada letra dentro de una caja negra. | build |
| `0008` | El marcador no suelta las teclas: al abrirlo, cgame levanta `KEYCATCH_SCORES` y `Key_SetCatcher` llamaba a `Key_ClearStates`, que mandaba `-scores` y lo cerraba con Tab mantenido. Falla también del ioquakelive nativo. | build |
| `0009` | Red HumbleNet (WebRTC, BSD-3) traída del fork web de ioquake3: `net_peer_server` (señalización) y `net_server_name` (sala); el invitado entra con `connect SALA.humblenet`. Sin `-lc++` explícito: `MAIN_MODULE=1` ya enlaza libc++. | build y navegador |

Se retiró `0005`: era diagnóstico temporal y salteaba `Z_Free` ante configstrings NULL. La corrección conserva
los controles originales del motor. El salto en la numeración mantiene la referencia del parche de aislamiento.

## Validación de módulos

Después de recortar los segmentos de ceros, el workflow ejecuta `herramientas/verificar-modulos.mjs`. Revisa que
los wasm sean válidos, que cada módulo exponga las entradas ABI esperadas y que no publique variables globales
ni las importe mediante `GOT.mem`. El build falla si la compilación o esta verificación fallan.

El build anterior (`37674407445`) tenía 2198 exportaciones/referencias de datos sin aislar. qagame resolvía
`sv_fps` y `sv_mapname` contra los punteros del motor, aunque usa estructuras `vmCvar_t`; después de inicializar
el juego se perdían las configstrings y se corrompía el heap. Con `-fvisibility=hidden`, los tres módulos pasan
el chequeo y `campgrounds` alcanza `CA_ACTIVE` (build `37676925727`, 25,7 s en esta PC, 8 s leyendo el pak local).

Prueba local: `node pruebas/servidor.mjs`, después `http://127.0.0.1:5180/ql/?mapa=campgrounds`. Entrá con el menú
Join Match o con `team free` en la consola del juego. F2 muestra u oculta el registro de diagnóstico.
Faltan la red de este motor y la comparación completa de reglas/modos con el juego original (T-008).
