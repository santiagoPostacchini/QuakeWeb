export type OpcionesPartida = {
    mapa: string;
    modo: number;
    jugadoresMax: number;
    servidor: string;
    jugador: string;
};

export function sanearCvar(valor: string): string {
    return valor.replace(/["\\;\r\n\u0000]/g, '');
}

export const citarCvar = (valor: string) => `"${sanearCvar(valor)}"`;

export function armarArgumentos(opciones: OpcionesPartida): string[] {
    if (!/^[a-z0-9_-]+$/i.test(opciones.mapa)) throw new Error('Elegí un mapa válido.');
    if (![0, 1, 3, 4, 5].includes(opciones.modo)) throw new Error('Elegí un modo válido.');
    if (!Number.isInteger(opciones.jugadoresMax) || opciones.jugadoresMax < 2 || opciones.jugadoresMax > 16) {
        throw new Error('Elegí entre 2 y 16 jugadores.');
    }
    return [
        '+set', 'com_build', '1', '+set', 'sv_pure', '0',
        '+set', 'r_mode', '-2', '+set', 'net_enabled', '0',
        '+set', 'g_gametype', String(opciones.modo),
        '+set', 'sv_maxclients', String(opciones.jugadoresMax),
        '+set', 'sv_hostname', citarCvar(opciones.servidor),
        '+set', 'name', citarCvar(opciones.jugador), '+map', opciones.mapa,
    // sys_main.c agrega comillas a cada argv que contiene espacios. Dividirlos evita
    // duplicar las comillas; al unir argv, el motor recupera exactamente el valor citado.
    ].flatMap(argumento => argumento.split(' '));
}
