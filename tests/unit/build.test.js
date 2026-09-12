import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { bundle, stripModuleSyntax } from '../../tools/build.mjs';

test('stripModuleSyntax usuwa import/export, zostawia kod', () => {
  const src = [
    "import { a } from './a.js';",
    'export const x = 1;',
    'export function f() { return 2; }',
    'const inner = "export const not-a-statement";',
    'export { x };'
  ].join('\n');
  const out = stripModuleSyntax(src);
  assert.ok(!/^\s*import\s/m.test(out));
  assert.ok(!/^export\s/m.test(out));
  assert.ok(out.includes('const x = 1;'));
  assert.ok(out.includes('function f()'));
  assert.ok(out.includes('const inner = "export const not-a-statement";'));
});

test('bundle sklada poprawny skladniowo skrypt ze wszystkich modulow', () => {
  const html = bundle();
  for (const f of ['geometry.js', 'model.js', 'model-rack.js', 'models.js', 'nest.js',
                   'layout.js', 'svg.js', 'dxf.js', 'lbrn.js', 'app.js']) {
    assert.ok(html.includes(`// ---- src/${f}`), `brak modulu ${f}`);
  }
  const js = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(js), 'bundle musi byc poprawnym JS');
  assert.ok(!/^\s*import\s+\{/m.test(js));
  assert.ok(!/^export\s/m.test(js));
});

test('plik HTML ma komplet metadanych i kontener aplikacji', () => {
  const html = bundle();
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<html lang="pl">'));
  assert.ok(html.includes('<meta charset="utf-8">'));
  assert.ok(html.includes('<div id="app"></div>'));
  assert.ok(/<title>.*Organizer SECURE.*<\/title>/.test(html));
  assert.ok(html.includes('name="generator"'));
});

test('bundle jest deterministyczny', () => {
  assert.equal(bundle(), bundle());
});

test('bundle wykonuje sie bez bledow poza przegladarka', () => {
  // Laczenie modulow w jedna przestrzen nazw potrafi zgubic nazwe (np. alias
  // importu). Uruchomienie skryptu w vm wylapuje to bez odpalania przegladarki.
  const js = bundle().match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
  const ctx = vm.createContext({ console });
  assert.doesNotThrow(() => new vm.Script(js).runInContext(ctx));
});

test('alias w imporcie zatrzymuje build zamiast psuc plik', () => {
  assert.throws(() => stripModuleSyntax("import { a as b } from './a.js';", 'src/x.js'),
                /alias w imporcie/);
});
