// Impide regresar a la GOT compartida que corrompia el servidor al cargar qagame.
// Uso: node verificar-modulos.mjs motor.wasm cgame.wasm qagame.wasm ui.wasm
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const rutas = process.argv.slice(2);
if (rutas.length !== 4) throw new Error('Indicá el motor y los tres módulos de juego.');
const modulos = rutas.map(ruta => new WebAssembly.Module(readFileSync(ruta)));
let errores = 0;
for (let i = 1; i < modulos.length; i++) {
    const nombre = basename(rutas[i]);
    const exportaciones = WebAssembly.Module.exports(modulos[i]);
    for (const entrada of ['dllEntry', ...(nombre.startsWith('qagame') ? [] : ['vmMain'])]) {
        if (!exportaciones.some(x => x.name === entrada && x.kind === 'function')) {
            console.error(`${nombre}: falta la entrada ${entrada}`);
            errores++;
        }
    }
    // Los datos internos deben resolverse respecto de __memory_base, sin publicar
    // variables ni buscar las del motor u otro modulo en GOT.mem.
    const publicadas = exportaciones.filter(x => x.kind === 'global');
    const compartidas = WebAssembly.Module.imports(modulos[i]).filter(x => x.module === 'GOT.mem');
    for (const [tipo, simbolos] of [['globales exportadas', publicadas], ['referencias GOT.mem', compartidas]]) {
        if (simbolos.length) {
            console.error(`${nombre}: ${simbolos.length} ${tipo}: ${simbolos.slice(0, 8).map(x => x.name).join(', ')}`);
            errores += simbolos.length;
        }
    }
    console.log(`${nombre}: wasm válido, ${publicadas.length + compartidas.length} problemas de aislamiento`);
}
if (errores) {
    console.error(`${errores} problemas de aislamiento/ABI`);
    process.exitCode = 1;
} else {
    console.log('Los tres módulos mantienen sus datos aislados.');
}
