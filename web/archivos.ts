// Guardamos el Blob tal cual: ni base64 ni una copia del pak entero en un ArrayBuffer.
import type { AlmacenTrozos } from './enjambre.ts';

export const almacenTrozos: AlmacenTrozos = {
    leer: (clave, i) => operar('quakeweb-trozos', `${clave}:${i}`),
    guardar: async (clave, i, blob) => { await operar('quakeweb-trozos', `${clave}:${i}`, blob); },
};
// Con el pak completo guardado, los trozos de la descarga sobran (serían otros ~900 MB).
export const borrarTrozos = () => operar('quakeweb-trozos', '', null);
export async function archivoGuardado(archivo?: Blob): Promise<Blob | undefined> {
    return operar('quakeweb-paks', 'quakeweb:pak00', archivo);
}
async function operar(store: string, clave: string, archivo?: Blob | null): Promise<Blob | undefined> {
    const base = await new Promise<IDBDatabase>((resolver, rechazar) => {
        const perfil = new URLSearchParams(location.search).get('perfil');
        const pedido = indexedDB.open(`quakeweb-archivos${perfil ? `-${encodeURIComponent(perfil)}` : ''}`, 2);
        pedido.onupgradeneeded = () => {
            for (const nombre of ['quakeweb-paks', 'quakeweb-trozos'])
                if (!pedido.result.objectStoreNames.contains(nombre)) pedido.result.createObjectStore(nombre);
        };
        pedido.onsuccess = () => {
            pedido.result.onversionchange = () => pedido.result.close();
            resolver(pedido.result);
        };
        pedido.onerror = () => rechazar(pedido.error);
        pedido.onblocked = () => rechazar(new Error('Cerrá las otras pestañas de QuakeWeb para acceder a los archivos.'));
    });
    try {
        return await new Promise<Blob | undefined>((resolver, rechazar) => {
            const transaccion = base.transaction(store, archivo !== undefined ? 'readwrite' : 'readonly');
            const almacen = transaccion.objectStore(store);
            const pedido = archivo === null ? almacen.clear() : archivo ? almacen.put(archivo, clave) : almacen.get(clave);
            transaccion.oncomplete = () => resolver(archivo ?? (archivo === null ? undefined : pedido.result instanceof Blob ? pedido.result : undefined));
            transaccion.onabort = () => rechazar(transaccion.error ?? pedido.error);
            transaccion.onerror = () => { /* onabort informa el error y evita resolver antes del commit */ };
        });
    } finally { base.close(); }
}
