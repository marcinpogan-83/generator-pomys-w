// Buduje jednoplikowa wersje generatora (dist/organizer-generator.html),
// ktora dziala po dwukliku, bez serwera i bez zaleznosci.
//
// "Bundler" jest celowo minimalny: laczy wlasne moduly ESM w ustalonej
// kolejnosci i usuwa deklaracje import/export. Dziala tylko dla kodu z tego
// repozytorium (brak zaleznosci zewnetrznych, brak importow dynamicznych).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['geometry.js', 'numbering.js', 'model.js', 'model-rack.js', 'models.js', 'nest.js', 'layout.js', 'svg.js', 'dxf.js', 'lbrn.js', 'app.js'];

export function stripModuleSyntax(code, file = '?') {
  // Bundler laczy moduly w jednej przestrzeni nazw - alias importu (`as`)
  // zgubilby nazwe, wiec lepiej zatrzymac build niz wypuscic zepsuty plik.
  const alias = code.match(/^\s*import\s+\{[^}]*\bas\b[^}]*\}/m);
  if (alias) throw new Error(`${file}: alias w imporcie nie jest obslugiwany przez bundler: ${alias[0].trim()}`);
  return code
    .replace(/^\s*import\s+[^;]*?from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^export\s+(const|let|var|function|class|async)\b/gm, '$1')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
}

export function bundle() {
  const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
  const chunks = ORDER.map(f => {
    const src = readFileSync(resolve(root, 'src', f), 'utf8');
    return `// ---- src/${f} ${'-'.repeat(Math.max(0, 60 - f.length))}\n${stripModuleSyntax(src, `src/${f}`)}`;
  });
  const js = `(function () {\n'use strict';\nconst BUILD_VERSION = ${JSON.stringify(version)};\n${chunks.join('\n')}\n})();`;
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Organizer SECURE — generator plików do cięcia</title>
<meta name="generator" content="organizer-secure-generator ${version}">
<style>html,body{margin:0;padding:0;background:#fbfaf7}</style>
</head>
<body>
<div id="app"></div>
<script>
${js}
</script>
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = bundle();
  mkdirSync(resolve(root, 'dist'), { recursive: true });
  const out = resolve(root, 'dist/organizer-generator.html');
  writeFileSync(out, html, 'utf8');
  console.log(`dist: ${out} (${(html.length / 1024).toFixed(1)} kB)`);
}
