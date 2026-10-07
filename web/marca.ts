// Logo y fuentes de Quake Live tomados en tiempo de ejecución del pak00.pk3 de quien abre la página. Son de
// id Software / ZeniMax: no se publican ni se versionan (CONTEXT.md); viven sólo en este navegador, igual que el
// resto de los archivos del juego. Sin pak00 cargado, la cabecera muestra el título en texto con fuentes del sistema.
import { extraer, type EntradaZip } from './zip.ts';

const LOGO = 'ui/assets/main_menu/ql_logo.png';
const FUENTES: [familia: string, archivo: string][] = [
    ['Handel Gothic', 'fonts/handelgothic.ttf'],      // títulos de QL
    ['Noto Sans', 'fonts/notosans-regular.ttf'],      // texto de la interfaz de QL
    ['Droid Sans Mono', 'fonts/droidsansmono.ttf'],   // consola
];

const urls: string[] = [];

export async function aplicarMarca(pak00: Blob, entradas: Map<string, EntradaZip>) {
    const pendientes: Promise<unknown>[] = [];
    const logo = entradas.get(LOGO);
    if (logo) {
        pendientes.push(extraer(pak00, logo).then((png) => {
            const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
            urls.push(url);
            document.documentElement.style.setProperty('--logo-ql', `url("${url}")`);
            document.documentElement.classList.add('con-logo');
            const icono = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
            icono.type = 'image/png';
            icono.href = url;
        }));
    }
    for (const [familia, archivo] of FUENTES) {
        const e = entradas.get(archivo);
        if (!e) continue;
        pendientes.push(extraer(pak00, e).then(async (ttf) => {
            const cara = new FontFace(familia, ttf.buffer as ArrayBuffer);
            document.fonts.add(await cara.load());
        }));
    }
    const resultados = await Promise.allSettled(pendientes);
    const fallas = resultados.filter(r => r.status === 'rejected');
    if (fallas.length) console.warn('QuakeWeb: no se pudo aplicar parte del logo o las fuentes de QL', fallas);
    document.documentElement.classList.add('con-fuentes-ql');
}
