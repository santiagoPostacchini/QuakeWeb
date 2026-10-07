// Página de QuakeWeb (crear/unirse partidas en el navegador), publicada en GitHub Pages.
import { defineConfig, type Plugin } from 'vite';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Sólo en desarrollo: /@pak00 sirve el pak00.pk3 de la instalación local de Quake Live (QL_BASEQ3 o la ruta de
// Steam), para probar sin elegir la carpeta a mano. Nunca entra en el build.
const QL_PAK00 = `${process.env.QL_BASEQ3 ?? 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Quake Live\\baseq3'}\\pak00.pk3`;
const pakLocal = (): Plugin => ({
    name: 'quakeweb-pak-local',
    apply: 'serve',
    configureServer(server) {
        server.middlewares.use('/@pak00', (_req, res) => {
            try {
                res.setHeader('Content-Length', statSync(QL_PAK00).size);
                res.setHeader('Content-Type', 'application/octet-stream');
                createReadStream(QL_PAK00).pipe(res);
            } catch {
                res.statusCode = 404;
                res.end('pak00.pk3 no encontrado');
            }
        });
    },
});

export default defineConfig({
    plugins: [pakLocal()],
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
