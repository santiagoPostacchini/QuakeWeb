type Teclado = { lock(): Promise<void>; unlock(): void };
const teclado = (navigator as Navigator & { keyboard?: Teclado }).keyboard;
let salidaPermitida = false;
export function permitirSalida() { salidaPermitida = true; }

export function prepararAtajos(canvas: HTMLCanvasElement, casilla: HTMLInputElement, activo: () => boolean, avisar: (texto: string) => void) {
    try { casilla.checked = localStorage.getItem('quakeweb:fullscreen') !== 'false'; } catch { /* sin almacenamiento */ }
    const pantallaCompleta = async () => {
        if (!casilla.checked) return;
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen({ navigationUI: 'hide', keyboardLock: 'browser' } as FullscreenOptions);
            }
            await teclado?.lock();
        } catch { avisar('No se pudo bloquear el teclado. Ctrl+W puede cerrar la pestaña.'); }
    };
    casilla.addEventListener('change', () => {
        try { localStorage.setItem('quakeweb:fullscreen', String(casilla.checked)); } catch { /* sin almacenamiento */ }
        if (!casilla.checked) {
            teclado?.unlock();
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        }
    });
    canvas.addEventListener('mousedown', () => { if (activo()) void pantallaCompleta(); });
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            teclado?.unlock();
            if (activo()) avisar('Saliste de pantalla completa: Ctrl+W puede cerrar la pestaña. Hacé click para volver.');
        }
    });
    window.addEventListener('keydown', evento => {
        if (!activo()) return;
        if (evento.key === 'Escape' && evento.repeat) {
            evento.preventDefault();
            evento.stopImmediatePropagation();
            return;
        }
        const combinado = (evento.ctrlKey || evento.metaKey) && !/^[cvx]$/i.test(evento.key);
        if (combinado || (evento.altKey && evento.key.startsWith('Arrow'))
            || ['F1', 'F3', 'F5', 'F6', 'F7', 'BrowserBack', 'BrowserForward', 'BrowserRefresh'].includes(evento.key)
            || (evento.key === 'Escape' && document.fullscreenElement)) evento.preventDefault();
    }, true);
    window.addEventListener('beforeunload', evento => {
        if (!activo() || salidaPermitida) return;
        evento.preventDefault();
        evento.returnValue = '';
    });
    const firefox = Number(navigator.userAgent.match(/Firefox\/(\d+)/)?.[1] ?? 0);
    if (!window.isSecureContext || (!teclado && firefox < 151)) {
        avisar('Este navegador no garantiza el bloqueo de Ctrl+W. Usá Chrome, Edge o Firefox actualizado en pantalla completa.');
    }
    return pantallaCompleta;
}
