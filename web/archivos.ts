// Guardamos el Blob tal cual: ni base64 ni una copia del pak entero en un ArrayBuffer.
export async function archivoGuardado(archivo?: Blob): Promise<Blob | undefined> {
    const base = await new Promise<IDBDatabase>((resolver, rechazar) => {
        const pedido = indexedDB.open('quakeweb-archivos', 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore('quakeweb-paks');
        pedido.onsuccess = () => {
            pedido.result.onversionchange = () => pedido.result.close();
            resolver(pedido.result);
        };
        pedido.onerror = () => rechazar(pedido.error);
        pedido.onblocked = () => rechazar(new Error('Cerrá las otras pestañas de QuakeWeb para acceder a los archivos.'));
    });
    try {
        return await new Promise<Blob | undefined>((resolver, rechazar) => {
            const transaccion = base.transaction('quakeweb-paks', archivo ? 'readwrite' : 'readonly');
            const almacen = transaccion.objectStore('quakeweb-paks');
            const pedido = archivo ? almacen.put(archivo, 'quakeweb:pak00') : almacen.get('quakeweb:pak00');
            transaccion.oncomplete = () => resolver(archivo ?? (pedido.result instanceof Blob ? pedido.result : undefined));
            transaccion.onabort = () => rechazar(transaccion.error ?? pedido.error);
            transaccion.onerror = () => { /* onabort informa el error y evita resolver antes del commit */ };
        });
    } finally { base.close(); }
}
