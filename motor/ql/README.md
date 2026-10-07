# Motor Quake Live: ioquakelive portado a la web (D-006)

Base: `https://github.com/tjone270/ioquakelive` (GPL-2.0), commit `fb4414618c120d773590e5aebef8a3f7e23d2833`
(2026-09-16). Implementación abierta de Quake Live build 1069 sobre ioquake3; necesita el `pak00.pk3` legítimo de
quien tenga Quake Live (nunca se versiona ni se publica).

El workflow [`.github/workflows/motor-ql.yml`](../../.github/workflows/motor-ql.yml) baja ese commit (con los
submódulos `libogg` y `libvorbis`), aplica [`parches/`](parches) en orden y compila con Emscripten 3.1.58.

## Plan del port

1. El motor compila para la web (cliente, sin red). ← en curso
2. La lógica de juego (`cgame`, `qagame`, `ui`) compila como módulos wasm (`SIDE_MODULE`) y el motor los carga con
   `dlopen` (`MAIN_MODULE`). Cuidar los símbolos globales duplicados entre módulos (`-fvisibility=hidden`).
3. Un mapa de QL corre en el navegador con las reglas de ioquakelive.
4. Red: HumbleNet del fork web de "The Longest Yard" (`motor/` de este repo) y señalización propia (T-009).

## Cómo trabajar los parches

Clon local de trabajo en `motor/ql/fuente/` (ignorado por Git), en el commit fijado. Los cambios se commitean ahí y se
exportan con `git format-patch <commit fijado>..HEAD -o ../parches/`. Codex puede trabajar dentro de ese clon con
`delegate-codex` (ramas `codex/…` del clon).

## Parches

| Archivo | Qué hace | Estado |
|---|---|---|
| (ninguno todavía) | | |
