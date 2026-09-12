// Uruchamia komplet testow: jednostkowe (Node), wizualne (Playwright)
// i walidacje DXF (Python + ezdxf). Brakujace srodowisko (np. playwright albo
// ezdxf) jest raportowane jako pominiecie, a nie jako blad.

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, env) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

const results = [];
function step(name, cmd, args, { optional = false, env } = {}) {
  process.stdout.write(`\n=== ${name}\n`);
  const res = run(cmd, args, env);
  const status = res.error ? 'brak srodowiska' : res.status === 0 ? 'ok' : 'blad';
  results.push({ name, status, optional });
  return res.status === 0;
}

step('build', 'node', ['tools/build.mjs']);
const unitTests = readdirSync(resolve(root, 'tests/unit'))
  .filter(f => f.endsWith('.test.js')).sort().map(f => `tests/unit/${f}`);
step('testy jednostkowe', 'node', ['--test', ...unitTests]);

const exportDir = mkdtempSync(resolve(tmpdir(), 'organizer-'));
step('eksport referencyjny (SECURE)', 'node', ['tools/export-cli.mjs', '--out', resolve(exportDir, 'secure')]);
step('eksport referencyjny (schodkowy)', 'node', ['tools/export-cli.mjs', '--model', 'stepped', '--out', resolve(exportDir, 'stepped')]);
step('walidacja DXF (ezdxf)', 'python3', ['-m', 'pytest', 'tests/python', '-q'], { optional: true });
step('testy wizualne (playwright)', 'node', ['tools/run-visual.mjs'], { optional: true });

console.log('\n=== podsumowanie');
let failed = 0;
for (const r of results) {
  console.log(` ${r.status === 'ok' ? '+' : r.optional ? '~' : '!'} ${r.name}: ${r.status}`);
  if (r.status !== 'ok' && !r.optional) failed++;
}
process.exit(failed ? 1 : 0);
