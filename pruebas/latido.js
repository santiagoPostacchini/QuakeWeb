// Latido para pestañas ocultas (lección 6 de CSweb): con la pestaña en segundo plano el navegador deja de
// llamar a requestAnimationFrame y el motor se congela; si esa pestaña es el anfitrión, se congela la partida
// para todos. Un Web Worker (que el navegador no frena igual) avisa cada ~16 ms y, mientras la pestaña está
// oculta, se ejecutan los callbacks pendientes. Con la pestaña visible manda el requestAnimationFrame normal.
// Se carga antes que el motor: <script src="/latido.js"></script>
(() => {
    const rafOriginal = window.requestAnimationFrame.bind(window);
    let pendientes = [];
    const codigo = 'setInterval(() => postMessage(0), 16);';
    const ticker = new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' })));
    ticker.onmessage = () => {
        if (!document.hidden) {
            pendientes = pendientes.filter(f => !f.hecho);
            return;
        }
        const ahora = performance.now();
        const listos = pendientes;
        pendientes = [];
        for (const f of listos) f(ahora);
    };
    window.requestAnimationFrame = (cb) => {
        const f = (t) => {
            if (f.hecho) return;
            f.hecho = true;
            cb(t);
        };
        f.hecho = false;
        pendientes.push(f);
        return rafOriginal(f);
    };
})();
