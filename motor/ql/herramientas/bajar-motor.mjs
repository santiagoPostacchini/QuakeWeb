// Baja el último build exitoso del motor (workflow "Motor Quake Live web") a web/public/motor/ para `npm run dev`.
// Uso: node motor/ql/herramientas/bajar-motor.mjs [id-de-run]   (necesita `gh` con sesión iniciada)
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = 'santiagoPostacchini/QuakeWeb';
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const run = process.argv[2] ?? gh('run', 'list', '--repo', repo, '--workflow', 'motor-ql.yml', '--status', 'success', '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId');
const tmp = mkdtempSync(join(tmpdir(), 'quakeweb-motor-'));
gh('run', 'download', run, '--repo', repo, '-n', 'motor-ql-web', '-D', tmp);
const origen = join(tmp, 'ioql', 'build', 'release-emscripten-wasm32');
const destino = new URL('../../../web/public/motor/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(join(destino, 'baseq3'), { recursive: true });
for (const f of ['quakelive_opengl2.wasm32.js', 'quakelive_opengl2.wasm32.wasm']) cpSync(join(origen, f), join(destino, f));
for (const f of ['iobin.pk3', 'pak01.pk3']) cpSync(join(origen, 'baseq3', f), join(destino, 'baseq3', f));
rmSync(tmp, { recursive: true, force: true });
console.log(`motor del run ${run} en ${destino}`);
