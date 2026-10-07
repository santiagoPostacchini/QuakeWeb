// Entrada de la página: vistas del lobby, carpeta de Quake Live (logo, fuentes y mapas del pak00.pk3 local).
// El anfitrión juega localmente; unirse se suma con la red (T-002).
import { leerDirectorio, type EntradaZip } from './zip.ts';
import { aplicarMarca } from './marca.ts';
import { arrancarMotor } from './motor.ts';
import { archivoGuardado } from './archivos.ts';
import { sanearCvar } from './argumentos.ts';
import { prepararAtajos, permitirSalida } from './atajos.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- vista según el link (…/QuakeWeb/#CODIGO, 6 caracteres de ABCDEFGHJKMNPQRSTUVWXYZ23456789) ----
const CODIGO = /^#([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6})$/i;
function mostrarVista() {
    const m = CODIGO.exec(location.hash);
    $('join-view').hidden = !m;
    $('home-view').hidden = !!m;
    $('host-options').hidden = !!m;
    if (m) {
        $('join-code').textContent = m[1].toUpperCase();
        $('join-hostname').textContent = 'todavía sin red';
        $('host-online').hidden = true;
        $('join-hint').textContent = 'Unirse por código o link llega con la red. Por ahora podés crear una partida local.';
    }
}
addEventListener('hashchange', mostrarVista);
$('go-home').addEventListener('click', (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname + location.search); mostrarVista(); });
$('code-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const codigo = ($('code') as HTMLInputElement).value.trim().toUpperCase();
    if (CODIGO.test(`#${codigo}`)) location.hash = codigo;
    else error(`"${codigo}" no es un código válido: son 6 letras o números.`);
});

// ---- nombre del jugador ----
const NOMBRE = 'quakeweb:nombre';
const nombre = $('name') as HTMLInputElement;
try { nombre.value = localStorage.getItem(NOMBRE) ?? ''; } catch { /* sin almacenamiento */ }
nombre.addEventListener('change', () => { try { localStorage.setItem(NOMBRE, nombre.value.trim()); } catch { /* sin almacenamiento */ } });

// ---- opciones de la partida ----
const MODOS: [string, string][] = [['0', 'Free For All'], ['1', 'Duel'], ['3', 'Team Deathmatch'], ['4', 'Clan Arena'], ['5', 'Capture The Flag']];
for (const [v, t] of MODOS) ($('gametype') as HTMLSelectElement).add(new Option(t, v));
for (const n of [2, 4, 8, 12, 16]) ($('max-players') as HTMLSelectElement).add(new Option(String(n), String(n), n === 8, n === 8));

// ---- mensajes ----
function error(texto: string) {
    const e = $('error');
    e.textContent = texto;
    e.hidden = !texto;
}
let temporizador = 0;
function toast(texto: string) {
    const t = $('toast');
    t.textContent = texto;
    t.classList.add('show');
    clearTimeout(temporizador);
    temporizador = window.setTimeout(() => t.classList.remove('show'), 3000);
}

// ---- carpeta de Quake Live ----
let pak00: Blob | null = null;
let entradas: Map<string, EntradaZip> | null = null;

async function usarPak(archivo: Blob) {
    const estado = $('files-status');
    estado.textContent = 'leyendo…';
    estado.classList.remove('ok');
    const dir = await leerDirectorio(archivo);
    pak00 = archivo;
    entradas = dir;
    await aplicarMarca(archivo, dir);
    const mapas = [...dir.values()].map(e => /^maps\/([^/]+)\.bsp$/i.exec(e.nombre)?.[1]).filter((m): m is string => !!m).sort();
    const lista = $('map') as HTMLSelectElement;
    lista.replaceChildren(...mapas.map(m => new Option(m, m, m === 'campgrounds', m === 'campgrounds')));
    estado.textContent = `listos · ${mapas.length} mapas`;
    estado.classList.add('ok');
    $('folder-hint').hidden = true;
    ($('host-btn') as HTMLButtonElement).disabled = mapas.length === 0 || motorDetenido;
}

$('folder').addEventListener('change', async (ev) => {
    error('');
    const archivos = [...((ev.target as HTMLInputElement).files ?? [])];
    // webkitRelativePath: "Quake Live/baseq3/pak00.pk3" (sirve elegir la carpeta del juego o la propia baseq3)
    const pak = archivos.find(f => /(^|\/)baseq3\/pak00\.pk3$/i.test(f.webkitRelativePath)) ?? archivos.find(f => /^pak00\.pk3$/i.test(f.name));
    if (!pak) {
        error('No encontré baseq3/pak00.pk3 en esa carpeta. Elegí la carpeta "Quake Live" de Steam (steamapps\\common\\Quake Live).');
        return;
    }
    try {
        await usarPak(pak);
        toast('Archivos de Quake Live listos');
        await guardarPak(pak);
    } catch (e) {
        error(`No se pudo leer pak00.pk3: ${(e as Error).message}`);
    }
});

// Pruebas locales (sólo con `npm run dev`): el servidor de desarrollo sirve el pak00.pk3 de la instalación local
if (import.meta.env.DEV) {
    (window as unknown as { quakeweb: unknown }).quakeweb = {
        cargarPakLocal: async () => usarPak(await (await fetch('/@pak00')).blob()),
        estado: () => ({ pak00: pak00?.size ?? 0, entradas: entradas?.size ?? 0 }),
    };
}

mostrarVista();

async function guardarPak(archivo: Blob) {
    try { await archivoGuardado(archivo); }
    catch (causa) {
        error(causa instanceof DOMException && causa.name === 'QuotaExceededError'
            ? 'No hay espacio para guardar pak00.pk3. Este origen comparte la cuota con CSweb. Podés jugar ahora y elegir la carpeta la próxima vez.'
            : 'No se pudieron guardar los archivos en este navegador. Podés jugar ahora y elegir la carpeta la próxima vez.');
    }
}

// La restauración termina antes de habilitar la selección, para no pisar una carpeta recién elegida.
const selectorCarpeta = $('folder') as HTMLInputElement;
selectorCarpeta.disabled = true;
void archivoGuardado().then(async archivo => {
    if (archivo) await usarPak(archivo);
}).catch(() => error('No se pudieron recuperar los archivos guardados. Elegí de nuevo la carpeta Quake Live.'))
    .finally(() => { selectorCarpeta.disabled = false; });

let arrancando = false;
let motorDetenido = false;
const canvas = $('canvas') as HTMLCanvasElement;
const activo = () => arrancando || document.body.classList.contains('playing');
const pedirPantallaCompleta = prepararAtajos(canvas, $('fullscreen') as HTMLInputElement, activo, toast);

function mostrarFalla(causa: string, diagnostico: string) {
    arrancando = false;
    motorDetenido = true;
    document.body.classList.remove('playing');
    $('loading').hidden = true;
    $('lobby').hidden = false;
    document.exitPointerLock();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    error(`${causa} Recargá la página para volver a intentar.`);
    $('diag-text').textContent = diagnostico;
    $('diag').hidden = false;
    ($('host-btn') as HTMLButtonElement).disabled = true;
}

$('diag-copy').addEventListener('click', () => {
    void navigator.clipboard.writeText($('diag-text').textContent ?? '').then(
        () => toast('Diagnóstico copiado'),
        () => toast('No se pudo copiar. Seleccioná el texto del diagnóstico y copialo.'));
});
$('join-btn').addEventListener('click', () => error('Unirse por código o link llega con la red. Por ahora podés crear una partida local.'));

$('host-btn').addEventListener('click', async () => {
    if (arrancando || motorDetenido || document.body.classList.contains('playing')) return;
    if (!sanearCvar(nombre.value).trim()) { error('Escribí tu nombre para jugar.'); nombre.focus(); return; }
    const mapa = ($('map') as HTMLSelectElement).value;
    if (!pak00 || !entradas?.has(`maps/${mapa.toLowerCase()}.bsp`)) { error('Elegí la carpeta Quake Live y un mapa válido.'); return; }
    arrancando = true;
    error('');
    $('diag').hidden = true;
    ($('host-btn') as HTMLButtonElement).disabled = true;
    $('lobby').hidden = true;
    $('loading').hidden = false;
    // Se pide dentro del click, antes de perder el gesto del usuario por la lectura del pak.
    void pedirPantallaCompleta();
    try {
        await arrancarMotor(pak00, {
            mapa, modo: Number(($('gametype') as HTMLSelectElement).value),
            jugadoresMax: Number(($('max-players') as HTMLSelectElement).value),
            servidor: ($('hostname') as HTMLInputElement).value, jugador: nombre.value.trim(),
        }, canvas, {
            progreso: (texto, detalle = '', fraccion) => {
                $('loading-text').textContent = texto;
                $('loading-detail').textContent = detalle;
                $('bar').classList.toggle('indeterminate', fraccion === undefined);
                $('bar').style.width = fraccion === undefined ? '' : `${Math.max(0, Math.min(1, fraccion)) * 100}%`;
            },
            error: mostrarFalla,
            salir: () => {
                if (confirm('¿Salir de la partida?')) { permitirSalida(); location.reload(); }
            },
        });
        arrancando = false;
        $('loading').hidden = true;
        document.body.classList.add('playing');
        canvas.focus();
        toast('Hacé click para capturar el mouse · Esc menú · ~ consola');
    } catch { /* el motor informa la causa y el diagnóstico con mostrarFalla */ }
});
