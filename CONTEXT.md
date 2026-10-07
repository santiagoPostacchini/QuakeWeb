# CONTEXT: QuakeWeb

Lectura obligatoria para cualquier agente antes de tocar código. Mantenerlo corto y al día.

## Stack

- Lenguaje / runtime: TypeScript en el navegador, motor de Quake compilado a WebAssembly (Emscripten). Motor a
  definir en la etapa 0 (recomendado: FTEQW). Publicación estática en GitHub Pages.
- Gestor de dependencias: npm (como CSweb: Vite + TypeScript, sin frameworks de interfaz).

## Comandos

- Instalar: `(completar en la etapa 0)`
- Build: `(completar en la etapa 0)`
- Tests: `(completar)` (criterio de aceptación habitual: este comando pasa en verde)
- Lint / formato: `(completar)`

## Convenciones

- Español rioplatense (voseo) en código, comentarios, interfaz y documentos.
- Mismo origen que CSweb y el hub (`https://santiagopostacchini.github.io`): toda clave de almacenamiento lleva el
  prefijo `quakeweb:` y las bases de IndexedDB, Web Locks y caches se llaman `quakeweb-…`.
- `juego.json` en la raíz del sitio, según el contrato de HubJuegos (ver [PROMPT.md](PROMPT.md)).
- Pruebas entre pestañas con `?perfil=<nombre>` y del relay con `?relay=1`.

## Zonas que no se tocan

- Archivos de id Software: nunca se commitean ni se publican (shareware incluido, salvo aprobación explícita).
- Otros repos (CSweb, HubJuegos) y el Worker TURN de CSweb: sólo con aprobación del usuario.
- `vendor/` (binarios del motor, si se versionan): sólo se actualizan a propósito y documentando la versión.

## Flujo de trabajo

- Una tarea = una rama (`codex/<slug>` para lo delegado a Codex). Nadie commitea en `main`.
- Cambios de arquitectura o dependencias nuevas: consultar antes.
- Al terminar, actualizar `TASKS.md` (hecho, pendiente, hallazgos).
