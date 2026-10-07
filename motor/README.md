# Motor: ioquake3 para la web

QuakeWeb no versiona el código del motor: el workflow [`.github/workflows/motor.yml`](../.github/workflows/motor.yml)
baja un commit fijo del fork, le aplica los parches de [`parches/`](parches) y lo compila con Emscripten. El resultado
(un zip) queda como artefacto del workflow.

## Versión fijada

| Pieza | Valor |
|---|---|
| Fork | `https://github.com/jdarpinian/ioq3`, rama `thelongestyard.link` (código de `thelongestyard.link`) |
| Commit | `e4ce732d67994b3b5f0be4bc901aa982c6e79af4` (2026-04-12, "Default to no peer server…") |
| Base | ioquake3, GPL v2. La red usa HumbleNet (WebRTC), incluido en el fork |
| Emscripten | 3.1.58 (el mismo que la CI del fork) |

Para actualizar: cambiar `IOQ3_COMMIT` en el workflow, verificar que los parches sigan aplicando y anotar el cambio acá.

## Qué genera

`build/release-emscripten-wasm32.zip` con:

- `ioquake3_opengl2.wasm32.js` / `.wasm`: el cliente (con servidor de partida incluido).
- `ioq3ded.wasm32.js` / `.wasm`: servidor dedicado.
- `ztm-flexible-hud.pk3`: la lógica del juego de Quake 3 (código GPL) compilada a QVM (`cgame`, `qagame`, `ui`), con el
  HUD flexible de ZTM. Reemplaza a las DLL nativas de Quake Live, que no corren en WebAssembly.
- Las páginas de prueba del fork (`index.html`, `server.html`).

Los datos del juego no están en el build: se cargan en el navegador desde la instalación de cada jugador.

## Parches

| Archivo | Qué hace | Estado |
|---|---|---|
| `0001-bsp47-quake-live.patch` | Acepta mapas BSP versión 47 (Quake Live) además de la 46. La 47 tiene una sección extra (nº 17) que se ignora. | escrito, sin probar |

Los parches se generan con `git diff` sobre el commit fijado y tienen que aplicar con `git apply` sin conflictos.

## Licencia

ioquake3 y el fork son GPL v2: si publicamos el build, el código fuente correspondiente es este commit más los parches
de esta carpeta, y hay que enlazarlo desde la página.
