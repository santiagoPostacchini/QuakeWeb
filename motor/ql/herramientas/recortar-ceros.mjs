// Recorta los ceros finales de los segmentos de datos activos de módulos wasm de Emscripten (SIDE_MODULE).
// Uso: node motor/ql/herramientas/recortar-ceros.mjs archivo.wasm [...]   (los modifica en el lugar)
//
// Por qué: wasm-ld escribe la bss y los estáticos en cero de un módulo dinámico como bytes en cero dentro del
// segmento de datos. En cgame eran 13 MB de los cuales 58 KB no son cero, y Chrome no deja compilar ni instanciar
// sincrónicamente (como hace dlopen) un wasm de más de 8 MB en el hilo principal. El cargador de Emscripten reserva
// la memoria del módulo con getMemory(), que la pone en cero (library_dylink.js de 3.1.58: "must be zero initialized
// since its used for all static data, including bss"), y el tamaño reservado sale de la sección dylink.0, que no se
// toca. Así que esos ceros finales sobran. Los segmentos pasivos (memory.init) no se tocan.
import { readFileSync, writeFileSync } from 'node:fs';

function leerLeb(bytes, pos) {
    let valor = 0, desplazamiento = 0, byte;
    do {
        byte = bytes[pos++];
        valor += (byte & 0x7f) * 2 ** desplazamiento;
        desplazamiento += 7;
    } while (byte & 0x80);
    return [valor, pos];
}

function lebSinSigno(valor) {
    const salida = [];
    do {
        let byte = valor % 128;
        valor = Math.floor(valor / 128);
        if (valor) byte |= 0x80;
        salida.push(byte);
    } while (valor);
    return salida;
}

// Expresión constante del offset (i32.const / global.get ... end): se copia tal cual hasta el 0x0b final
function finDeExpresion(bytes, pos) {
    while (bytes[pos] !== 0x0b) {
        const op = bytes[pos++];
        if (op === 0x41 || op === 0x42 || op === 0x23) {
            [, pos] = leerLeb(bytes, pos);
        } else {
            throw new Error(`opcode 0x${op.toString(16)} inesperado en la expresión de offset`);
        }
    }
    return pos + 1;
}

export function recortar(bytes) {
    if (bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) throw new Error('no es un wasm');
    const partes = [bytes.subarray(0, 8)];
    let pos = 8, ahorro = 0;
    while (pos < bytes.length) {
        const id = bytes[pos];
        const [largo, inicio] = leerLeb(bytes, pos + 1);
        const fin = inicio + largo;
        if (id !== 11) {
            partes.push(bytes.subarray(pos, fin));
            pos = fin;
            continue;
        }
        // Sección de datos: se reescribe recortando los segmentos activos
        const contenido = [];
        let [cantidad, p] = leerLeb(bytes, inicio);
        contenido.push(...lebSinSigno(cantidad));
        for (let i = 0; i < cantidad; i++) {
            const inicioSegmento = p;
            let bandera;
            [bandera, p] = leerLeb(bytes, p);
            if (bandera === 2) [, p] = leerLeb(bytes, p); // índice de memoria
            if (bandera !== 1) p = finDeExpresion(bytes, p);
            const cabecera = bytes.subarray(inicioSegmento, p);
            let tamaño;
            [tamaño, p] = leerLeb(bytes, p);
            let util = tamaño;
            if (bandera !== 1) while (util > 0 && bytes[p + util - 1] === 0) util--;
            ahorro += tamaño - util;
            contenido.push(...cabecera, ...lebSinSigno(util));
            for (let k = 0; k < util; k++) contenido.push(bytes[p + k]);
            p += tamaño;
        }
        if (p !== fin) throw new Error('la sección de datos no terminó donde decía');
        partes.push(Uint8Array.of(11, ...lebSinSigno(contenido.length)), Uint8Array.from(contenido));
        pos = fin;
    }
    const salida = new Uint8Array(partes.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of partes) { salida.set(x, o); o += x.length; }
    return { salida, ahorro };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('recortar-ceros.mjs')) {
    for (const archivo of process.argv.slice(2)) {
        const antes = readFileSync(archivo);
        const { salida, ahorro } = recortar(antes);
        if (!WebAssembly.validate(salida)) throw new Error(`${archivo}: el resultado no valida`);
        writeFileSync(archivo, salida);
        console.log(`${archivo}: ${antes.length} → ${salida.length} bytes (${ahorro} ceros recortados)`);
    }
}
