// Interfejs generatora (przegladarka). Model i rozkroj pochodza z modulow
// src/*.js - ten plik odpowiada tylko za UI i pobieranie plikow.

import { SKU, DEFAULTS, build, netArea, validateConfig } from './model.js';
import { nest, validatePlacement, SORTS, HEURISTICS } from './nest.js';
import { sheetSvg, escapeXml } from './svg.js';
import { sheetDxf, sheetManifest } from './dxf.js';

export const state = {
  ...DEFAULTS,
  sheetW: 760, sheetH: 760, margin: 6, gap: 4, allowRot: true,
  sheetPrice: 15.07, showLabels: true, sheetIdx: 0
};

let model = null, nested = null, issues = [];

export function nestOpts() {
  return {
    sheetW: state.sheetW, sheetH: state.sheetH,
    margin: state.margin, gap: state.gap, allowRot: state.allowRot
  };
}

export function recompute() {
  model = build(state);
  nested = nest(model.parts, nestOpts());
  issues = [...validateConfig(state), ...validatePlacement(nested, nestOpts())];
  if (state.sheetIdx >= nested.sheets.length) state.sheetIdx = 0;
  return { model, nested, issues };
}

function download(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function issueHtml() {
  if (!issues.length) return '';
  const err = issues.filter(i => i.level === 'error');
  const warn = issues.filter(i => i.level !== 'error');
  const box = (cls, list, title) => list.length
    ? `<div class="${cls}"><b>${title}</b><ul>${list.map(i => `<li>${escapeXml(i.msg)}</li>`).join('')}</ul></div>` : '';
  return box('err', err, 'Bledy konfiguracji') + box('warn', warn, 'Ostrzezenia');
}

export function render() {
  recompute();
  const el = document.getElementById('app');
  const sheets = nested.sheets;
  const cost = sheets.length * state.sheetPrice;

  el.innerHTML = `
  <style>
    #app { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           color: #22201c; background: #fbfaf7; line-height: 1.5; }
    #app * { box-sizing: border-box; }
    .wrap { display: grid; grid-template-columns: 320px 1fr; gap: 0; min-height: 100vh; }
    @media (max-width: 860px) { .wrap { grid-template-columns: 1fr; } }
    .panel { background: #f2efe8; border-right: 1px solid #ddd8cc; padding: 20px; }
    .stage { padding: 20px; overflow: auto; }
    h1 { font-size: 17px; font-weight: 600; margin: 0 0 2px; }
    .sub { font-size: 12px; color: #78736a; margin: 0 0 20px; }
    fieldset { border: none; border-top: 1px solid #ddd8cc; margin: 0 0 16px; padding: 14px 0 0; }
    legend { font-size: 11px; letter-spacing: .04em; color: #78736a; padding: 0 8px 0 0; }
    label { display: block; font-size: 12px; color: #56524b; margin: 10px 0 3px; }
    input, select { width: 100%; padding: 6px 8px; font-size: 13px; border: 1px solid #cfc9bb;
            border-radius: 3px; background: #fff; color: #22201c; font-variant-numeric: tabular-nums; }
    input:focus, select:focus { outline: 2px solid #3a6ea5; outline-offset: -1px; border-color: #3a6ea5; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .chk { display: flex; align-items: center; gap: 8px; margin: 10px 0; font-size: 13px; }
    .chk input { width: auto; }
    button { padding: 9px 14px; font-size: 13px; border: 1px solid #22201c; background: #22201c;
             color: #fbfaf7; border-radius: 3px; cursor: pointer; }
    button.ghost { background: transparent; color: #22201c; }
    button:hover { opacity: .85; }
    .btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
             gap: 1px; background: #ddd8cc; border: 1px solid #ddd8cc; margin-bottom: 18px; }
    .stat { background: #fbfaf7; padding: 10px 12px; }
    .stat b { display: block; font-size: 18px; font-variant-numeric: tabular-nums; font-weight: 500; }
    .stat span { font-size: 11px; color: #78736a; }
    .tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
    .tabs button { padding: 5px 11px; font-size: 12px; background: #fff; color: #56524b; border-color: #cfc9bb; }
    .tabs button[aria-current="true"] { background: #22201c; color: #fbfaf7; border-color: #22201c; }
    .preview { border: 1px solid #ddd8cc; background: #fff; padding: 8px; }
    .preview svg { width: 100%; height: auto; display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 18px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e8e3d8; }
    th { color: #78736a; font-weight: 500; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .note { font-size: 12px; color: #78736a; margin-top: 14px; max-width: 62ch; }
    .warn, .err { padding: 9px 12px; font-size: 12px; margin-top: 14px; }
    .warn { background: #fdf2e0; border-left: 3px solid #ba7517; color: #6b4410; }
    .err { background: #fdeaea; border-left: 3px solid #b3261e; color: #7a1c16; }
    .warn ul, .err ul { margin: 4px 0 0; padding-left: 18px; }
  </style>
  <div class="wrap">
    <div class="panel">
      <h1>Organizer SECURE</h1>
      <p class="sub">Generator plikow do ciecia — laser.cat</p>

      <fieldset><legend>Rozmiar</legend>
        <label>Wariant</label>
        <select data-k="sku">${Object.keys(SKU).map(k =>
          `<option value="${k}" ${state.sku === k ? 'selected' : ''}>${k}${SKU[k] ? ` — ${SKU[k].cols * SKU[k].rows} miejsc` : ''}</option>`).join('')}</select>
        <div class="row2">
          <div><label>Kolumny</label><input type="number" data-k="cols" value="${model.cfg.cols}" min="1" max="6" ${SKU[state.sku] ? 'disabled' : ''}></div>
          <div><label>Rzędy</label><input type="number" data-k="rows" value="${model.cfg.rows}" min="1" max="20" ${SKU[state.sku] ? 'disabled' : ''}></div>
        </div>
      </fieldset>

      <fieldset><legend>Materiał i pasowanie</legend>
        <div class="row2">
          <div><label>Grubość zmierzona (mm)</label><input type="number" step="0.05" data-k="t" value="${state.t}"></div>
          <div><label>Kompensacja szczeliny</label><input type="number" step="0.01" data-k="fit" value="${state.fit}"></div>
        </div>
        <div class="row2">
          <div><label>Szerokość pióra (mm)</label><input type="number" step="1" data-k="tabW" value="${state.tabW}"></div>
          <div><label>Liczba piór</label><input type="number" step="1" min="2" max="6" data-k="tabN" value="${state.tabN}"></div>
        </div>
      </fieldset>

      <fieldset><legend>Przegródka</legend>
        <div class="row2">
          <div><label>Szerokość (mm)</label><input type="number" data-k="cellW" value="${state.cellW}"></div>
          <div><label>Wysokość (mm)</label><input type="number" data-k="cellH" value="${state.cellH}"></div>
        </div>
        <div class="row2">
          <div><label>Głębokość (mm)</label><input type="number" data-k="depth" value="${state.depth}"></div>
          <div><label>Szczelina wglądu (mm)</label><input type="number" data-k="slitW" value="${state.slitW}"></div>
        </div>
      </fieldset>

      <fieldset><legend>Opcje konstrukcyjne</legend>
        <div class="chk"><input type="checkbox" id="uh" data-k="useHeader" ${state.useHeader ? 'checked' : ''}><label for="uh" style="margin:0">Pasek nagłówkowy z grawerem</label></div>
        <div class="chk"><input type="checkbox" id="sb" data-k="solidBack" ${state.solidBack ? 'checked' : ''}><label for="sb" style="margin:0">Pełne plecy (wersja biurkowa)</label></div>
        <div class="chk"><input type="checkbox" id="ss" data-k="solidStiffener" ${state.solidStiffener ? 'checked' : ''}><label for="ss" style="margin:0">Pełna ramka drzwi</label></div>
      </fieldset>

      <fieldset><legend>Grawer</legend>
        <label>Nazwa szkoły</label><input data-k="schoolName" value="${escapeXml(state.schoolName)}">
        <label>Klasa</label><input data-k="className" value="${escapeXml(state.className)}">
      </fieldset>

      <fieldset><legend>Arkusz</legend>
        <div class="row2">
          <div><label>Szerokość (mm)</label><input type="number" data-k="sheetW" value="${state.sheetW}"></div>
          <div><label>Wysokość (mm)</label><input type="number" data-k="sheetH" value="${state.sheetH}"></div>
        </div>
        <div class="row2">
          <div><label>Margines</label><input type="number" data-k="margin" value="${state.margin}"></div>
          <div><label>Odstęp części</label><input type="number" data-k="gap" value="${state.gap}"></div>
        </div>
        <label>Cena arkusza (zł)</label><input type="number" step="0.01" data-k="sheetPrice" value="${state.sheetPrice}">
        <div class="chk"><input type="checkbox" id="ar" data-k="allowRot" ${state.allowRot ? 'checked' : ''}><label for="ar" style="margin:0">Pozwól obracać części o 90°</label></div>
      </fieldset>

      <div class="btns">
        <button id="dlsvg">Pobierz SVG</button>
        <button id="dldxf" class="ghost">Pobierz DXF</button>
        <button id="dlall" class="ghost">Wszystkie arkusze</button>
      </div>
    </div>

    <div class="stage">
      <div class="stats">
        <div class="stat"><b>${model.cells}</b><span>miejsc na telefony</span></div>
        <div class="stat"><b>${model.W.toFixed(0)} × ${model.H.toFixed(0)}</b><span>korpus, mm</span></div>
        <div class="stat"><b>${(model.D + 2 * state.t).toFixed(0)}</b><span>głębokość z drzwiami, mm</span></div>
        <div class="stat"><b>${netArea(model).toFixed(3)}</b><span>materiał netto, m²</span></div>
        <div class="stat"><b>${sheets.length}</b><span>arkuszy ${state.sheetW}×${state.sheetH}</span></div>
        <div class="stat"><b>${(nested.stats.utilization * 100).toFixed(1)}%</b><span>wykorzystanie arkusza</span></div>
        <div class="stat"><b>${cost.toFixed(2)} zł</b><span>materiał / szt.</span></div>
      </div>

      <div class="tabs">
        ${sheets.map((s, i) => `<button data-sheet="${i}" aria-current="${i === state.sheetIdx}">Arkusz ${i + 1}</button>`).join('')}
        <button id="tgl" class="ghost">${state.showLabels ? 'Ukryj opisy' : 'Pokaż opisy'}</button>
      </div>

      <div class="preview" id="preview">${sheetSvg(sheets[state.sheetIdx], model.parts, { ...nestOpts(), labels: state.showLabels })}</div>

      ${issueHtml()}

      <table>
        <thead><tr><th>Element</th><th class="num">Szt.</th><th class="num">Wymiar (mm)</th></tr></thead>
        <tbody>${model.parts.map(p =>
          `<tr><td>${escapeXml(p.name)}</td><td class="num">${p.qty}</td><td class="num">${p.w.toFixed(1)} × ${p.h.toFixed(1)}</td></tr>`).join('')}
        </tbody>
      </table>

      <p class="note">Rozkrój: MaxRects, wybrana strategia <b>${nested.strategy.sort} / ${nested.strategy.heuristic}</b> spośród ${SORTS.length * HEURISTICS.length} kombinacji sortowania i heurystyk. Wersja generatora: ${typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : 'dev'}.</p>
      <p class="note">Warstwa CUT tnie, ENGRAVE grawer. Numery przegródek są wektorem kreskowym — wchodzą do LightBurn bez konwersji czcionki. Nazwa szkoły idzie jako tekst: jeśli laser jej nie zaimportuje, zamień na krzywe w Inkscape.</p>
      <p class="note">Przed pierwszym cięciem serii zmierz suwmiarką realną grubość partii sklejki i wpisz ją w pole „grubość zmierzona”. Przy 3&nbsp;mm brzozie różnica 0,3&nbsp;mm decyduje, czy pióro wchodzi na wcisk, czy konstrukcja się rozlatuje.</p>
    </div>
  </div>`;

  el.querySelectorAll('[data-k]').forEach(inp => {
    const ev = inp.tagName === 'SELECT' || inp.type === 'checkbox' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') state[k] = inp.checked;
      else if (inp.type === 'number') state[k] = parseFloat(inp.value) || 0;
      else state[k] = inp.value;
      if (k === 'sku' && SKU[state.sku]) { state.cols = SKU[state.sku].cols; state.rows = SKU[state.sku].rows; }
      const pos = inp.selectionStart;
      render();
      const again = document.querySelector(`[data-k="${k}"]`);
      if (again && again.setSelectionRange && inp.type !== 'number') { again.focus(); again.setSelectionRange(pos, pos); }
      else if (again) again.focus();
    });
  });

  el.querySelectorAll('[data-sheet]').forEach(b =>
    b.addEventListener('click', () => { state.sheetIdx = +b.dataset.sheet; render(); }));
  const tgl = document.getElementById('tgl');
  if (tgl) tgl.addEventListener('click', () => { state.showLabels = !state.showLabels; render(); });

  const base = `organizer-${state.sku}-${model.cells}`;
  document.getElementById('dlsvg').addEventListener('click', () =>
    download(`${base}-ark${state.sheetIdx + 1}.svg`,
      sheetSvg(sheets[state.sheetIdx], model.parts, nestOpts()), 'image/svg+xml'));
  document.getElementById('dldxf').addEventListener('click', () =>
    download(`${base}-ark${state.sheetIdx + 1}.dxf`,
      sheetDxf(sheets[state.sheetIdx], model.parts, nestOpts()), 'application/dxf'));
  document.getElementById('dlall').addEventListener('click', () => {
    sheets.forEach((s, i) => setTimeout(() => {
      download(`${base}-ark${i + 1}.svg`, sheetSvg(s, model.parts, nestOpts()), 'image/svg+xml');
      download(`${base}-ark${i + 1}.dxf`, sheetDxf(s, model.parts, nestOpts()), 'application/dxf');
    }, i * 400));
  });
}

// Punkt wejscia oraz uchwyt dla testow wizualnych (Playwright).
export function boot() {
  render();
  if (typeof window !== 'undefined') {
    window.ORGANIZER = {
      state, render, recompute, nestOpts,
      build, nest, sheetSvg, sheetDxf, sheetManifest,
      get model() { return model; },
      get nested() { return nested; },
      get issues() { return issues; }
    };
  }
}

if (typeof document !== 'undefined' && document.getElementById('app')) boot();
