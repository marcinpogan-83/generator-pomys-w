// Buduje jednoplikowa wersje i uruchamia testy wizualne (Playwright).
//   node tools/run-visual.mjs [--update-baseline]

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const update = process.argv.includes('--update-baseline');

const build = spawnSync('node', ['tools/build.mjs'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const res = spawnSync('node', ['--test', 'tests/visual/render.test.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, UPDATE_VISUAL_BASELINE: update ? '1' : '0' }
});
process.exit(res.status ?? 1);
