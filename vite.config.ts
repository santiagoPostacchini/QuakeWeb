// Página de QuakeWeb (crear/unirse partidas en el navegador), publicada en GitHub Pages.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
    root: r('./web'),
    // rutas relativas: funciona en https://<usuario>.github.io/QuakeWeb/
    base: './',
    build: {
        outDir: r('./dist'),
        emptyOutDir: true,
        assetsInlineLimit: 0,
        chunkSizeWarningLimit: 4096,
    },
    server: {
        port: 5173,
        fs: { allow: [r('.')] },
    },
});
