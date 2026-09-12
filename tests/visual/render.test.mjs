// Wizualna weryfikacja renderu: strona jest otwierana w prawdziwej przegladarce
// (Chromium przez Playwright), a podglad arkusza rasteryzowany i porownany z
// zapisanym wzorcem. Zrzuty ekranu trafiaja do artifacts/visual/ do ogladu.
//
// Aktualizacja wzorca:  node tools/run-visual.mjs --update-baseline

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPlaywright, ROOT } from './_pw.mjs';
import { bundle } from '../../tools/build.mjs';

const pw = loadPlaywright();
const ARTIFACTS = resolve(ROOT, 'artifacts/visual');
const BASELINE = resolve(ROOT, 'tests/baseline/render-signature.json');
const UPDATE = process.env.UPDATE_VISUAL_BASELINE === '1';
const GRID = 24;          // podzial podgladu na komorki przy porownaniu
const RASTER = 480;       // rozdzielczosc rasteryzacji [px]

const skip = pw ? false : 'brak pakietu playwright - pomijam testy wizualne';

// Rasteryzacja SVG i policzenie pokrycia tuszem w siatce GRID x GRID.
const SIGNATURE_FN = `async (svgText, raster, grid) => {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = raster; canvas.height = raster;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, raster, raster);
  ctx.drawImage(img, 0, 0, raster, raster);
  const data = ctx.getImageData(0, 0, raster, raster).data;
  const cell = raster / grid;
  const out = [];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      let ink = 0, total = 0;
      for (let y = Math.floor(gy * cell); y < Math.floor((gy + 1) * cell); y++) {
        for (let x = Math.floor(gx * cell); x < Math.floor((gx + 1) * cell); x++) {
          const i = (y * raster + x) * 4;
          const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
          if (lum < 235) ink++;
          total++;
        }
      }
      out.push(total ? +(ink / total).toFixed(4) : 0);
    }
  }
  return out;
}`;

async function withPage(fn) {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  mkdirSync(ARTIFACTS, { recursive: true });
  const html = resolve(ARTIFACTS, 'organizer.html');
  writeFileSync(html, bundle(), 'utf8');
  await page.goto(`file://${html}`);
  await page.waitForSelector('#preview svg');
  try {
    return await fn(page, problems);
  } finally {
    await browser.close();
  }
}

test('strona renderuje sie bez bledow konsoli', { skip }, async () => {
  await withPage(async (page, problems) => {
    assert.deepEqual(problems, []);
    assert.equal(await page.locator('#preview svg').count(), 1);
    const stats = await page.$$eval('.stat b', els => els.map(e => e.textContent.trim()));
    assert.ok(stats.length >= 6, 'panel statystyk musi byc wypelniony');
    assert.match(stats[0], /^\d+$/);
  });
});

test('render SVG zgadza sie z modelem policzonym w przegladarce', { skip }, async () => {
  await withPage(async (page) => {
    const data = await page.evaluate(() => {
      const o = window.ORGANIZER;
      const sheet = o.nested.sheets[o.state.sheetIdx];
      const man = o.sheetManifest(sheet, o.model.parts, o.nestOpts());
      return {
        cutPaths: document.querySelectorAll('#CUT path').length,
        engPaths: document.querySelectorAll('#ENGRAVE path').length,
        texts: document.querySelectorAll('#TEXT text').length,
        counts: man.counts,
        sheetW: o.state.sheetW, sheetH: o.state.sheetH,
        issues: o.issues
      };
    });
    assert.equal(data.cutPaths, data.counts.polylinesCut);
    assert.equal(data.engPaths, data.counts.polylinesEngrave);
    assert.equal(data.texts, data.counts.texts);
    assert.deepEqual(data.issues, []);
  });
});

test('cala narysowana geometria miesci sie w arkuszu', { skip }, async () => {
  await withPage(async (page) => {
    const sheets = await page.evaluate(() => window.ORGANIZER.nested.sheets.length);
    for (let i = 0; i < sheets; i++) {
      await page.click(`[data-sheet="${i}"]`);
      const out = await page.evaluate(() => {
        const svg = document.querySelector('#preview svg');
        const vb = svg.viewBox.baseVal;
        const bad = [];
        for (const el of svg.querySelectorAll('#CUT path, #ENGRAVE path')) {
          const b = el.getBBox();
          if (b.x < -0.01 || b.y < -0.01 || b.x + b.width > vb.width + 0.01 || b.y + b.height > vb.height + 0.01) {
            bad.push({ x: b.x, y: b.y, w: b.width, h: b.height });
          }
        }
        return { bad, w: vb.width, h: vb.height };
      });
      assert.deepEqual(out.bad, [], `arkusz ${i + 1}: geometria poza arkuszem`);
    }
  });
});

test('przelaczanie arkuszy i opisow zmienia podglad', { skip }, async () => {
  await withPage(async (page) => {
    const count = await page.evaluate(() => window.ORGANIZER.nested.sheets.length);
    assert.ok(count >= 2, 'domyslna konfiguracja powinna dac wiecej niz jeden arkusz');
    const first = await page.$eval('#preview svg', el => el.innerHTML);
    await page.click('[data-sheet="1"]');
    const second = await page.$eval('#preview svg', el => el.innerHTML);
    assert.notEqual(first, second, 'drugi arkusz musi wygladac inaczej');
    assert.ok(await page.$eval('#OPIS', el => el.children.length > 0), 'opisy czesci widoczne');
    await page.click('#tgl');
    assert.equal(await page.$$eval('#OPIS', els => els.length), 0, 'po ukryciu nie ma warstwy opisow');
  });
});

test('zmiana konfiguracji przelicza model i rysunek', { skip }, async () => {
  await withPage(async (page) => {
    await page.selectOption('[data-k="sku"]', 'wlasny');
    await page.fill('[data-k="rows"]', '4');
    await page.fill('[data-k="cols"]', '2');
    const after = await page.evaluate(() => ({
      cells: window.ORGANIZER.model.cells,
      sheets: window.ORGANIZER.nested.sheets.length,
      paths: document.querySelectorAll('#CUT path').length
    }));
    assert.equal(after.cells, 8);
    assert.ok(after.paths > 0);
    const stat = await page.$eval('.stat b', el => el.textContent.trim());
    assert.equal(stat, '8');
  });
});

test('bledna konfiguracja jest pokazana uzytkownikowi', { skip }, async () => {
  await withPage(async (page) => {
    await page.fill('[data-k="depth"]', '40');
    await page.waitForSelector('.err');
    const text = await page.$eval('.err', el => el.textContent);
    assert.match(text, /czop/i);
  });
});

test('przelaczenie typu organizera przebudowuje model i rysunek', { skip }, async () => {
  await withPage(async (page, problems) => {
    const before = await page.evaluate(() => ({
      type: window.ORGANIZER.state.modelType,
      cells: window.ORGANIZER.model.cells,
      parts: window.ORGANIZER.model.parts.map(p => p.name)
    }));
    await page.selectOption('[data-k="modelType"]', 'stepped');
    await page.waitForSelector('#preview svg');
    const after = await page.evaluate(() => ({
      type: window.ORGANIZER.state.modelType,
      cells: window.ORGANIZER.model.cells,
      parts: window.ORGANIZER.model.parts.map(p => p.name),
      issues: window.ORGANIZER.issues,
      cut: document.querySelectorAll('#CUT path').length,
      eng: document.querySelectorAll('#ENGRAVE path').length
    }));
    assert.equal(before.type, 'secure');
    assert.equal(after.type, 'stepped');
    assert.ok(after.parts.some(n => n.startsWith('Przegroda poprzeczna')), 'brak przegrod poprzecznych');
    assert.ok(after.parts.includes('Panel czolowy'));
    assert.notDeepEqual(after.parts, before.parts);
    assert.deepEqual(after.issues, []);
    assert.ok(after.cut > 0 && after.eng > 0, 'rysunek musi miec ciecie i grawer');
    assert.deepEqual(problems, []);
    const rows = await page.$$eval('tbody tr td:first-child', els => els.map(e => e.textContent));
    assert.deepEqual(rows, after.parts);
  });
});

test('formularz pokazuje pola wlasciwe dla wybranego modelu', { skip }, async () => {
  await withPage(async (page) => {
    const keys = () => page.$$eval('[data-scope="model"]', els => els.map(e => e.dataset.k));
    const secure = await keys();
    assert.ok(secure.includes('cellH') && secure.includes('slitW'));
    await page.selectOption('[data-k="modelType"]', 'stepped');
    await page.waitForSelector('#preview svg');
    const stepped = await keys();
    assert.ok(stepped.includes('pockets') && stepped.includes('pocketW') && stepped.includes('drop'));
    assert.ok(!stepped.includes('slitW'), 'pola modelu SECURE nie moga zostac po przelaczeniu');
  });
});

test('raster podgladu zgadza sie z wzorcem', { skip }, async () => {
  await withPage(async (page) => {
    const signatures = {};
    for (const type of ['secure', 'stepped']) {
      await page.selectOption('[data-k="modelType"]', type);
      await page.waitForSelector('#preview svg');
      const sheets = await page.evaluate(() => window.ORGANIZER.nested.sheets.length);
      for (let i = 0; i < sheets; i++) {
        await page.click(`[data-sheet="${i}"]`);
        const svg = await page.evaluate(() => {
          const o = window.ORGANIZER;
          return o.sheetSvg(o.nested.sheets[o.state.sheetIdx], o.model.parts, o.nestOpts());
        });
        signatures[`${type}-sheet-${i + 1}`] = await page.evaluate(
          ([fn, s, r, g]) => new Function('return ' + fn)()(s, r, g),
          [SIGNATURE_FN, svg, RASTER, GRID]);
        await page.locator('#preview').screenshot({ path: resolve(ARTIFACTS, `${type}-sheet-${i + 1}.png`) });
      }
      await page.screenshot({ path: resolve(ARTIFACTS, `strona-${type}.png`), fullPage: true });
    }
    writeFileSync(resolve(ARTIFACTS, 'signature.json'), JSON.stringify({ grid: GRID, raster: RASTER, signatures }, null, 2));

    if (UPDATE || !existsSync(BASELINE)) {
      writeFileSync(BASELINE, JSON.stringify({ grid: GRID, raster: RASTER, signatures }, null, 2) + '\n');
      console.log(`zapisano nowy wzorzec: ${BASELINE}`);
      return;
    }
    const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
    assert.equal(base.grid, GRID);
    assert.deepEqual(Object.keys(signatures), Object.keys(base.signatures), 'inna liczba arkuszy niz we wzorcu');
    for (const [name, sig] of Object.entries(signatures)) {
      const ref = base.signatures[name];
      assert.equal(sig.length, ref.length);
      let worst = 0, sum = 0;
      for (let i = 0; i < sig.length; i++) {
        const d = Math.abs(sig[i] - ref[i]);
        worst = Math.max(worst, d);
        sum += d;
      }
      const mean = sum / sig.length;
      assert.ok(worst <= 0.06, `${name}: komorka rozni sie o ${worst.toFixed(3)} (limit 0.06) - obejrzyj artifacts/visual/${name}.png`);
      assert.ok(mean <= 0.01, `${name}: srednia roznica ${mean.toFixed(4)} (limit 0.01)`);
      assert.ok(sig.some(v => v > 0.01), `${name}: podglad jest pusty`);
    }
  });
});
