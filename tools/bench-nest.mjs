// Porownanie nowego rozkroju z oryginalnym (tests/baseline/legacy-nest.js).
//   node tools/bench-nest.mjs [liczba losowych przypadkow]

import { build } from '../src/model.js';
import { nest, validatePlacement } from '../src/nest.js';
import { legacyNest } from '../tests/baseline/legacy-nest.js';

const N = Number(process.argv[2] || 200);
const OPTS = { margin: 6, gap: 4, allowRot: true };

let seed = 20240912;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const bboxArea = items => {
  let mx = 0, my = 0;
  for (const it of items) { mx = Math.max(mx, it.x + it.w); my = Math.max(my, it.y + it.h); }
  return mx * my;
};

let checked = 0, fewerSheets = 0, moreSheets = 0, tighterLast = 0, looserLast = 0;
let legacySheets = 0, newSheets = 0, ms = 0;

for (let i = 0; i < N; i++) {
  const cfg = {
    sku: 'wlasny', cols: 1 + Math.floor(rnd() * 4), rows: 4 + Math.floor(rnd() * 14),
    cellW: 120 + Math.round(rnd() * 90), cellH: 20 + Math.round(rnd() * 15),
    depth: 70 + Math.round(rnd() * 50), solidBack: rnd() < 0.5, solidStiffener: rnd() < 0.5
  };
  const model = build(cfg);
  if (model.issues.some(p => p.level === 'error')) continue;
  const opts = { ...OPTS, sheetW: 600 + Math.round(rnd() * 700), sheetH: 600 + Math.round(rnd() * 400) };
  const t0 = performance.now();
  const res = nest(model.parts, opts);
  ms += performance.now() - t0;
  if (res.stats.oversize) continue;
  const problems = validatePlacement(res, opts);
  if (problems.length) { console.log('UWAGA: niepoprawny rozkroj', JSON.stringify(cfg), problems[0].msg); continue; }
  const legacy = legacyNest(model.parts, opts.sheetW, opts.sheetH, opts.margin, opts.gap, true);
  checked++;
  legacySheets += legacy.length;
  newSheets += res.stats.sheetCount;
  if (res.stats.sheetCount < legacy.length) fewerSheets++;
  else if (res.stats.sheetCount > legacy.length) moreSheets++;
  else {
    const a = bboxArea(legacy[legacy.length - 1].items);
    const b = bboxArea(res.sheets[res.sheets.length - 1].items);
    if (b < a - 1) tighterLast++; else if (b > a + 1) looserLast++;
  }
}

const pct = (a, b) => ((1 - a / b) * 100).toFixed(2);
console.log(`przypadkow: ${checked}`);
console.log(`arkusze lacznie: oryginal ${legacySheets}, nowy ${newSheets} (${pct(newSheets, legacySheets)}% mniej)`);
console.log(`mniej arkuszy: ${fewerSheets}, wiecej arkuszy: ${moreSheets}`);
console.log(`ciasniej upakowany ostatni arkusz: ${tighterLast}, luzniej: ${looserLast}`);
console.log(`sredni czas rozkroju: ${(ms / Math.max(1, checked)).toFixed(1)} ms`);
