# QuakeWeb

> Quake en el navegador: creá una partida y jugá con tus compañeros, sin instalar nada y sin abrir puertos.

## Qué es

Proyecto hermano de [CSweb](https://github.com/santiagoPostacchini/CSweb) (Counter-Strike 1.6 en el navegador). La
pestaña de quien crea la partida corre el servidor; los demás entran con un link o un código por WebRTC, con relay
TURN si la red lo exige, y reciben del anfitrión los archivos del juego. Los archivos de Quake no se publican: los
pone cada anfitrión desde su instalación (Steam o GOG).

Se publica en `https://santiagopostacchini.github.io/QuakeWeb/` y aparece en el hub de juegos, CiberWeb (`https://santiagopostacchini.github.io/CiberWeb/`).

**Estado**: sin empezar. El plan completo está en [PROMPT.md](PROMPT.md).

## Cómo se usa

(completar cuando exista la etapa 1: cómo crear una partida, cómo unirse, requisitos de navegador)

## Documentación del proyecto

- [PROMPT.md](PROMPT.md): encargo completo para el agente (objetivo, motor, etapas, lecciones de CSweb).
- [CONTEXT.md](CONTEXT.md): convenciones, comandos de build/test, zonas que no se tocan.
- [ARCHITECTURE.md](ARCHITECTURE.md): decisiones de diseño y su razón.
- [TASKS.md](TASKS.md): tareas con estado y responsable.
