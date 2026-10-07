# Investigación (solo lectura, con fuentes) para reimplementar las reglas de juego de Quake Live sobr…

- Fecha: 2026-10-07T15:43:48-03:00
- Agente: Gemini vía agy
- Consulta: Investigación (solo lectura, con fuentes) para reimplementar las reglas de juego de Quake Live sobre el código GPL de Quake 3 (ioquake3: code/game, code/cgame, bg_pmove.c). Respondé en español rioplatense (voseo). Contexto: tenemos el contenido de Quake Live (mapas, modelos, sonidos) corriendo en ioquake3 en el navegador, pero con la lógica de juego de Quake 3. La lógica de Quake Live está en DLL nativas cerradas que no podemos usar. Queremos que se juegue como Quake Live reescribiendo las regl…

## Respuesta

Acá tenés la investigación que pediste:

**1. Física y Movimiento (QL vs Q3)**
| Diferencias | Cvars clave | Fuente y Confianza |
|---|---|---|
| Step height 22 (Q3:18). Salto 275 (Q3:270). PQL suma *air control*. | `pmove_fixed`, `pm_airaccelerate` | [ChurchOfQuake](https://churchofquake.com/) (Media) |

**2. Armas, Daño e Ítems**
| Elemento | Valores y mecánicas | Fuente y Confianza |
|---|---|---|
| **Armas** | RL: 84 dmg, Rail: 80. Knockback es multiplicador (`g_knockback_lg` 1.50). | [ChurchOfQuake](https://churchofquake.com/wiki/) (Alta) |
| **Ítems** | Mega Health: 35s, Armadura: 25s, Armas: 5s, Powerups: 120s. | [Quake.pub](https://quake.pub/) (Alta) |

**3. Modos, Reimplementaciones y Docs**
| Tema | Detalles y URLs | Fuente y Confianza |
|---|---|---|
| **Modos** | Los límites (`fraglimit`, `timelimit`) van en `.factories`, no server.cfg. | [Foros Steam](https://steamcommunity.com/app/282440/) (Alta) |
| **Proyectos** | `tjone270/ioquakelive` en ioquake3 reimplementa físicas y reglas. | [GitHub ioquakelive](https://github.com/tjone270/ioquakelive) (Alta) |
| **Cvars** | Docs de Minqlx usan prefijo `qlx_` (ej. `qlx_owner`, `qlx_plugins`). | [GitHub minqlx](https://github.com/MinoMino/minqlx) (Alta) |

**Lo que no pude verificar:**
* Munición inicial/máxima y cadencia exacta (en ms) de todas las armas (incluidas HMG, Nailgun, Chaingun, etc.) y valores matemáticos exactos de fricción (`pm_friction`). Al ser código cerrado, esto depende del *factory* (ruleset) cargado por el servidor y no hay tablas oficiales exhaustivas.
