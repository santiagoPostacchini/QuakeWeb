import { armarArgumentos, type OpcionesPartida } from './argumentos.ts';
import { detectarSalida, MARCA_SALIR } from './salida-motor.ts';
import { instalarLatido } from './latido.ts';

type Modulo = {
    FS: { mkdirTree(ruta: string): void; writeFile(ruta: string, datos: Uint8Array, opciones: { canOwn: boolean }): void };
    HEAPU8: Uint8Array;
    HEAP32: Int32Array;
    _clc: number;
    _Z_Malloc(tamano: number): number;
    _Z_Free(puntero: number): void;
    _Cmd_RemoveCommand(puntero: number): void;
    _Cbuf_AddText(puntero: number): void;
};
type Avisos = {
    progreso(texto: string, detalle?: string, fraccion?: number): void;
    error(causa: string, diagnostico: string): void;
    salir(): void;
};

async function bajar(url: string, progreso?: (bytes: number, total: number) => void): Promise<Uint8Array<ArrayBuffer>> {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`${url}: HTTP ${respuesta.status}`);
    const total = Number(respuesta.headers.get('Content-Length')) || 0;
    if (!respuesta.body) return new Uint8Array(await respuesta.arrayBuffer());
    const lector = respuesta.body.getReader();
    const partes: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
        const parte = await lector.read();
        if (parte.done) break;
        partes.push(parte.value);
        bytes += parte.value.length;
        progreso?.(bytes, total);
    }
    const datos = new Uint8Array(bytes);
    let offset = 0;
    for (const parte of partes) { datos.set(parte, offset); offset += parte.length; }
    return datos;
}

// Sólo la cola se modifica desde eventos; las llamadas nativas se hacen antes del frame.
export async function arrancarMotor(pak: Blob, opciones: OpcionesPartida, canvas: HTMLCanvasElement, avisos: Avisos) {
    const argumentos = armarArgumentos(opciones);
    const lineas: string[] = [];
    const cola: string[] = [];
    let modulo: Modulo;
    let detenido = false;
    let entro = false;
    let primerFrame = true;
    let salidaPendiente = false;
    let latido: ReturnType<typeof instalarLatido> | undefined;
    let vigilante = 0;
    let espera = 0;
    let resolver!: () => void;
    let rechazar!: (error: Error) => void;
    const listo = new Promise<void>((si, no) => { resolver = si; rechazar = no; });
    // La descarga puede fallar antes de que se espere la entrada al mapa.
    void listo.catch(() => undefined);
    const anotar = (texto: string) => {
        lineas.push(...texto.split(/\r?\n/));
        lineas.splice(0, Math.max(0, lineas.length - 120));
    };
    const fallar = (causa: unknown) => {
        if (detenido) return;
        detenido = true;
        const detalle = causa instanceof Error ? causa.message : String(causa);
        anotar(causa instanceof Error ? causa.stack ?? detalle : detalle);
        clearTimeout(espera);
        clearInterval(vigilante);
        latido?.detener();
        document.removeEventListener('visibilitychange', visibilidad);
        window.removeEventListener('error', errorGlobal);
        window.removeEventListener('unhandledrejection', rechazoGlobal);
        setTimeout(() => avisos.error(`El motor se detuvo: ${detalle}`, lineas.join('\n')), 0);
        rechazar(new Error(detalle));
    };
    const salida = (texto: string) => {
        anotar(texto);
        const resultado = detectarSalida(texto);
        if (resultado.error) fallar(resultado.error);
        if (resultado.salir && !detenido && !salidaPendiente) {
            salidaPendiente = true;
            setTimeout(() => {
                try { if (!detenido) avisos.salir(); }
                finally { salidaPendiente = false; }
            }, 0);
        }
    };
    const errorGlobal = (evento: ErrorEvent) => {
        if (evento.error === Infinity || /Uncaught Infinity/.test(evento.message)) fallar('Uncaught Infinity');
        else if (evento.error instanceof WebAssembly.RuntimeError) fallar(evento.error);
    };
    const rechazoGlobal = (evento: PromiseRejectionEvent) => {
        if (evento.reason === Infinity) fallar('Uncaught Infinity');
        else if (evento.reason instanceof WebAssembly.RuntimeError) fallar(evento.reason);
    };
    const encolar = (comandos: string[]) => { if (!detenido) cola.push(...comandos); };
    const visibilidad = () => encolar([`set r_norefresh ${document.hidden ? 1 : 0}`]);
    const conTexto = (texto: string, llamada: (puntero: number) => void) => {
        const datos = new TextEncoder().encode(`${texto}\0`);
        // Este build exporta el asignador de zona, pero no malloc ni ccall.
        const puntero = modulo._Z_Malloc(datos.length);
        if (!puntero) throw new Error('No hay memoria para encolar comandos.');
        try { modulo.HEAPU8.set(datos, puntero); llamada(puntero); }
        finally { modulo._Z_Free(puntero); }
    };
    try {
        avisos.progreso('Leyendo pak00.pk3…', `${(pak.size / 1048576).toFixed(0)} MB desde tus archivos`);
        // Una sola lectura completa; FS toma posesión de este buffer.
        const pak00 = new Uint8Array(await pak.arrayBuffer());
        avisos.progreso('Bajando el motor…');
        const url = new URL('./motor/', document.baseURI).href;
        const [wasm, iobin, pak01, fabrica] = await Promise.all([
            bajar(`${url}quakelive_opengl2.wasm32.wasm`, (bytes, total) => avisos.progreso(
                'Bajando el motor…', `${(bytes / 1048576).toFixed(1)} MB${total ? ` de ${(total / 1048576).toFixed(1)} MB` : ''}`,
                total ? bytes / total : undefined)),
            bajar(`${url}baseq3/iobin.pk3`), bajar(`${url}baseq3/pak01.pk3`),
            import(/* @vite-ignore */ `${url}quakelive_opengl2.wasm32.js`),
        ]);
        avisos.progreso('Iniciando Quake Live…', `Cargando ${opciones.mapa}`);
        latido = instalarLatido();
        window.addEventListener('error', errorGlobal);
        window.addEventListener('unhandledrejection', rechazoGlobal);
        document.addEventListener('visibilitychange', visibilidad);
        espera = window.setTimeout(() => fallar('El mapa no terminó de cargar en 120 segundos.'), 120000);
        const iniciado = fabrica.default({
            canvas, arguments: argumentos, wasmBinary: wasm,
            locateFile: (archivo: string) => `${url}${archivo}`,
            print: salida, printErr: salida, onAbort: fallar,
            preRun: [(motor: Modulo) => {
                modulo = motor;
                motor.FS.mkdirTree('/baseq3');
                motor.FS.writeFile('/baseq3/pak00.pk3', pak00, { canOwn: true });
                motor.FS.writeFile('/baseq3/iobin.pk3', iobin, { canOwn: true });
                motor.FS.writeFile('/baseq3/pak01.pk3', pak01, { canOwn: true });
            }],
            preMainLoop: () => {
                if (detenido) return false;
                try {
                    if (primerFrame) {
                        primerFrame = false;
                        // Los comandos nativos tienen prioridad sobre alias en ioquakelive.
                        for (const nombre of ['quit', 'exit']) conTexto(nombre, p => modulo._Cmd_RemoveCommand(p));
                        cola.unshift(`alias quit "echo ${MARCA_SALIR}"`, `alias exit "echo ${MARCA_SALIR}"`);
                        visibilidad();
                    }
                    if (cola.length) conTexto(`${cola.splice(0).join('\n')}\n`, p => modulo._Cbuf_AddText(p));
                } catch (error) { fallar(error); return false; }
            },
            postMainLoop: () => {
                // clc.state es el primer campo de clientConnection_t; CA_ACTIVE = 8.
                if (!detenido && !entro && modulo.HEAP32[modulo._clc >>> 2] === 8) {
                    entro = true;
                    clearTimeout(espera);
                    vigilante = window.setInterval(() => {
                        if (performance.now() - latido!.ultimoFrame() > 15000) fallar('El motor dejó de entregar frames.');
                    }, 2000);
                    resolver();
                }
            },
        }) as Promise<Modulo>;
        void iniciado.catch(fallar);
        await listo;
        return { encolar, diagnostico: () => lineas.join('\n') };
    } catch (error) { fallar(error); throw error; }
}
