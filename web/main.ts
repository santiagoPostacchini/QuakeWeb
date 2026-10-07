// Entrada de la página: vistas del lobby, carpeta de Quake Live (logo, fuentes y mapas del pak00.pk3 local).
// La red y el arranque del motor se suman en los pasos siguientes (T-002).
import { leerDirectorio, type EntradaZip } from './zip.ts';
import { aplicarMarca } from './marca.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- vista según el link (…/QuakeWeb/#CODIGO, 6 caracteres de ABCDEFGHJKMNPQRSTUVWXYZ23456789) ----
const CODIGO = /^#([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6})$/i;
function mostrarVista() {
    const m = CODIGO.exec(location.hash);
    $('join-view').hidden = !m;
    $('home-view').hidden = !!m;
    $('host-options').hidden = !!m;
    if (m) $('join-code').textContent = m[1].toUpperCase();
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
    ($('host-btn') as HTMLButtonElement).disabled = false;
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
