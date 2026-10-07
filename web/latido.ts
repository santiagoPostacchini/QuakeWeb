// El worker entrega frames si el navegador deja de hacerlo, incluso con la ventana tapada.
export function instalarLatido(): { ultimoFrame: () => number; detener: () => void } {
    const raf = window.requestAnimationFrame.bind(window);
    const cancelar = window.cancelAnimationFrame.bind(window);
    const pendientes = new Map<number, { llamada: FrameRequestCallback; desde: number }>();
    let ultimo = performance.now();
    let frenado = false;
    const url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16);'], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    window.requestAnimationFrame = llamada => {
        const id = raf(t => {
            if (!pendientes.delete(id)) return;
            frenado = false;
            ultimo = performance.now();
            llamada(t);
        });
        pendientes.set(id, { llamada, desde: performance.now() });
        return id;
    };
    window.cancelAnimationFrame = id => { pendientes.delete(id); cancelar(id); };
    worker.onmessage = () => {
        const ahora = performance.now();
        frenado ||= [...pendientes.values()].some(p => ahora - p.desde >= 100);
        if (!frenado) return;
        for (const [id, p] of [...pendientes]) {
            pendientes.delete(id);
            cancelar(id);
            ultimo = ahora;
            p.llamada(ahora);
        }
    };
    return {
        ultimoFrame: () => ultimo,
        detener: () => {
            worker.terminate();
            for (const id of pendientes.keys()) cancelar(id);
            pendientes.clear();
            window.requestAnimationFrame = raf;
            window.cancelAnimationFrame = cancelar;
        },
    };
}
