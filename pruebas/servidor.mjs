// Servidor estático para pruebas locales del motor. Sin dependencias: `node pruebas/servidor.mjs`.
// - /                → pruebas/ (páginas de prueba)
// - /motor/          → motor/build/release-emscripten-wasm32/ (el zip del workflow "Motor web", descomprimido)
// - /datos/baseq3/X  → los .pk3 de la instalación local de Quake Live (sólo lectura, nunca se copian al repo)
// Escucha sólo en 127.0.0.1: los archivos del juego no salen de esta PC.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUERTO = Number(process.env.PUERTO ?? 5180);
const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASEQ3 = process.env.QL_BASEQ3 ?? 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Quake Live\\baseq3';

const RUTAS = [
    { prefijo: '/motor/', dir: join(raiz, 'motor', 'build', 'release-emscripten-wasm32') },
    { prefijo: '/datos/baseq3/', dir: BASEQ3, soloExt: ['.pk3'] },
    { prefijo: '/', dir: join(raiz, 'pruebas') },
];

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.pk3': 'application/octet-stream',
    '.data': 'application/octet-stream',
    '.css': 'text/css; charset=utf-8',
};

// Resuelve la URL a un archivo dentro de su carpeta; null si intenta salir de ella o no está permitido
function archivoPara(pathname) {
    const ruta = RUTAS.find(r => pathname.startsWith(r.prefijo));
    if (!ruta) return null;
    let relativo = decodeURIComponent(pathname.slice(ruta.prefijo.length));
    if (relativo === '' || relativo.endsWith('/')) relativo += 'index.html';
    const archivo = normalize(join(ruta.dir, relativo));
    if (!archivo.startsWith(ruta.dir + sep)) return null;
    if (ruta.soloExt && !ruta.soloExt.includes(extname(archivo).toLowerCase())) return null;
    return archivo;
}

createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const archivo = archivoPara(pathname);
    let tamaño = -1;
    try {
        if (archivo && statSync(archivo).isFile()) tamaño = statSync(archivo).size;
    } catch { /* no existe */ }
    if (tamaño < 0) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`No encontrado: ${pathname}\n`);
        console.log(`404 ${pathname}`);
        return;
    }
    res.writeHead(200, {
        'Content-Type': TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': tamaño,
        'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(archivo).pipe(res);
    console.log(`200 ${pathname} (${(tamaño / 1048576).toFixed(1)} MB)`);
}).listen(PUERTO, '127.0.0.1', () => {
    console.log(`Pruebas en http://localhost:${PUERTO}/  (datos de Quake Live: ${BASEQ3})`);
});
