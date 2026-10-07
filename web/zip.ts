// Lector mínimo de .pk3/.zip sobre un Blob: lee sólo el directorio central (al final del archivo) y extrae entradas
// sueltas bajo demanda, sin cargar el archivo entero en memoria (pak00.pk3 de Quake Live pesa 917 MB).
// Soporta "stored" (0) y "deflate" (8), que son los que usan los pk3.

export type EntradaZip = {
    nombre: string;
    metodo: number;
    comprimido: number;
    tamano: number;
    offsetLocal: number;
};

const leer = async (blob: Blob, inicio: number, fin: number) => new DataView(await blob.slice(inicio, fin).arrayBuffer());

export async function leerDirectorio(blob: Blob): Promise<Map<string, EntradaZip>> {
    // Fin del directorio central: firma 0x06054b50 en los últimos 64 KB + 22 bytes
    const cola = Math.min(blob.size, 65536 + 22);
    const fin = await leer(blob, blob.size - cola, blob.size);
    let eocd = -1;
    for (let i = fin.byteLength - 22; i >= 0; i--) {
        if (fin.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('no es un zip/pk3 válido');
    const cantidad = fin.getUint16(eocd + 10, true);
    const largoDir = fin.getUint32(eocd + 12, true);
    const offsetDir = fin.getUint32(eocd + 16, true);
    const dir = await leer(blob, offsetDir, offsetDir + largoDir);
    const decodificador = new TextDecoder();
    const entradas = new Map<string, EntradaZip>();
    let p = 0;
    for (let i = 0; i < cantidad; i++) {
        if (dir.getUint32(p, true) !== 0x02014b50) throw new Error('directorio central dañado');
        const largoNombre = dir.getUint16(p + 28, true);
        const largoExtra = dir.getUint16(p + 30, true);
        const largoComentario = dir.getUint16(p + 32, true);
        const nombre = decodificador.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, largoNombre));
        entradas.set(nombre.toLowerCase(), {
            nombre,
            metodo: dir.getUint16(p + 10, true),
            comprimido: dir.getUint32(p + 20, true),
            tamano: dir.getUint32(p + 24, true),
            offsetLocal: dir.getUint32(p + 42, true),
        });
        p += 46 + largoNombre + largoExtra + largoComentario;
    }
    return entradas;
}

export async function extraer(blob: Blob, e: EntradaZip): Promise<Uint8Array<ArrayBuffer>> {
    const cabecera = await leer(blob, e.offsetLocal, e.offsetLocal + 30);
    if (cabecera.getUint32(0, true) !== 0x04034b50) throw new Error(`${e.nombre}: cabecera local dañada`);
    const datos = e.offsetLocal + 30 + cabecera.getUint16(26, true) + cabecera.getUint16(28, true);
    const crudo = blob.slice(datos, datos + e.comprimido);
    if (e.metodo === 0) return new Uint8Array(await crudo.arrayBuffer());
    if (e.metodo !== 8) throw new Error(`${e.nombre}: compresión ${e.metodo} no soportada`);
    const flujo = crudo.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
}
