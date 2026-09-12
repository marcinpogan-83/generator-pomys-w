// Znalezienie Playwrighta: lokalny node_modules albo instalacja globalna
// (w kontenerach CI przegladarka bywa zainstalowana globalnie).

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const GLOBAL_DIRS = [
  process.env.NODE_PATH,
  '/opt/node22/lib/node_modules',
  '/usr/local/lib/node_modules',
  '/usr/lib/node_modules'
].filter(Boolean).flatMap(p => p.split(':'));

export function loadPlaywright() {
  const require = createRequire(resolve(ROOT, 'package.json'));
  try {
    return require('playwright');
  } catch { /* szukamy dalej */ }
  for (const dir of GLOBAL_DIRS) {
    const candidate = resolve(dir, 'playwright');
    if (existsSync(candidate)) {
      try { return require(candidate); } catch { /* nastepny */ }
    }
  }
  return null;
}
