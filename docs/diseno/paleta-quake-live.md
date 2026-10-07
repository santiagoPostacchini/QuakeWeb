# Paleta de la interfaz (piel Quake Live)

La página mantiene la estructura de la de CSweb (mismas pantallas, medidas y estados) para que los juegos del hub
CiberWeb tengan una misma línea, y cambia la piel por la de la interfaz de Quake Live. Sin logos ni arte de id
Software: el ícono es propio (una mira).

Colores medidos el 2026-10-07 sobre capturas del menú real de Quake Live (corriendo en el port de ioquakelive con el
`pak00.pk3` del usuario), promediando y cuantizando píxeles en el navegador:

| Elemento de QL | Color medido | Token |
|---|---|---|
| Fondo de los menús | `#000000` a `#101010` | `--bg`, `--panel`, `--inset` |
| Cabecera (barra superior) | `#502020`, sombra `#401010` | `--head`, `--head-lo` |
| Texto de menú y franjas de advertencia | `#d02000` (`#c02010`) | `--accent` |
| Enlaces secundarios ("Main Menu", "Settings") | `#901010` a `#a02020` | `--accent-dim` |
| Aro del botón principal ("JOIN MATCH") | `#e0c050`, borde interior `#c09010` | `--gold`, `--gold-lo` |
| Relleno del cartel de error | `#602000` | `--alert` |

Decisiones de forma: títulos en mayúsculas condensadas (Impact / Arial Narrow), botones rojos sobre bordó oscuro, el
principal con el aro amarillo de "JOIN MATCH", y el error como el cartel de advertencia de QL (franjas rojas y
negras con relleno ocre). Las medidas y la estructura son las de `client/style.css` de CSweb.
