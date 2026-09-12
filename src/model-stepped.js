// Model organizera schodkowego ("kieszeniowego").
//
// Konstrukcja: dwa boki o schodkowo opadajacej krawedzi gornej, w ktorych
// wcieciach stoja identyczne przegrody poprzeczne. Miedzy kolejnymi
// przegrodami powstaja pochyle kieszenie na telefony, a przegrody podluzne
// (polaczone z poprzecznymi na krzyzowy wpust) dziela szerokosc na kolumny.
// Numer kazdej kieszeni jest grawerowany na przedniej przegrodzie.
//
//        numer kieszeni
//              v
//   ____     __|__
//   |   \__ |     |            przegroda poprzeczna (identyczna, N+1 szt.)
//   |      \|     |__          krawedz boku opada o `drop` na kieszen
//   |       |     |   \__
//   |_______|_____|______\     przegroda podluzna pod linia schodow

import { rectPath, ring, path, panelOutline, tabSpans, strokeNumber } from './geometry.js';

export const STEPPED_DEFAULTS = {
  t: 3.0, fit: 0.15,
  cols: 3, cellW: 100,
  pockets: 8, pocketW: 24, pocketH: 87,
  slotDepth: 26, drop: 7.5, lap: 20,
  edgeMargin: 14, underH: 70,
  tabW: 18, tabN: 3,
  schoolName: 'Szkola Podstawowa nr 1', className: 'Klasa 6'
};

export const STEPPED_SKU = {
  'K-24': { cols: 3, pockets: 8 },
  'K-30': { cols: 3, pockets: 10 },
  'K-32': { cols: 4, pockets: 8 },
  'wlasny': null
};

export function applySteppedSku(cfg) {
  const out = { ...STEPPED_DEFAULTS, sku: 'K-24', ...cfg };
  const sku = STEPPED_SKU[out.sku];
  if (sku) { out.cols = sku.cols; out.pockets = sku.pockets; }
  return out;
}

// Wymiary pochodne - jedno zrodlo prawdy dla wszystkich czesci.
export function steppedDims(cfgIn) {
  const c = applySteppedSku(cfgIn);
  const pitch = c.pocketW + c.t;                       // rozstaw przegrod poprzecznych
  const IW = c.cols * c.cellW + (c.cols - 1) * c.t;    // szerokosc wewnetrzna
  const W = IW + 2 * c.t;                              // szerokosc gabarytowa
  const D = 2 * c.edgeMargin + c.pockets * pitch + c.t; // glebokosc gabarytowa
  const slope = c.drop / pitch;                        // nachylenie krawedzi schodow
  const yTop = (x) => x * slope;                       // krawedz gorna boku
  const crossX = [];                                   // lewa krawedz kazdej przegrody
  for (let i = 0; i <= c.pockets; i++) crossX.push(c.edgeMargin + i * pitch);
  const panelH = c.slotDepth + c.pocketH;              // wysokosc przegrody poprzecznej
  const sideH = yTop(D) + c.slotDepth + c.underH;      // wysokosc boku
  const divTopAt = (x) => yTop(x) + c.slotDepth - c.lap; // krawedz gorna przegrody podluznej
  const divX = [];                                     // srodki przegrod podluznych
  for (let j = 1; j < c.cols; j++) divX.push(c.t + j * c.cellW + (j - 1) * c.t + c.t / 2);
  return { cfg: c, pitch, IW, W, D, slope, yTop, crossX, panelH, sideH, divTopAt, divX };
}

export function validateSteppedConfig(cfgIn) {
  const d = steppedDims(cfgIn);
  const c = d.cfg;
  const out = [];
  const err = (msg) => out.push({ level: 'error', msg });
  const warn = (msg) => out.push({ level: 'warn', msg });

  if (!(c.t > 0)) err('Grubosc materialu musi byc wieksza od zera.');
  if (c.fit >= c.t) err('Kompensacja szczeliny nie moze byc wieksza od grubosci materialu.');
  if (c.cols < 1 || c.pockets < 1) err('Potrzebna jest co najmniej jedna kolumna i jedna kieszen.');
  if (!(c.cellW > 0) || !(c.pocketW > 0) || !(c.pocketH > 0)) err('Wymiary kieszeni musza byc dodatnie.');
  if (c.pocketW < 12) warn('Kieszen wezsza niz 12 mm - telefon w etui moze nie wejsc.');
  if (c.lap >= c.slotDepth + c.pocketH) err('Zaklad przegrod jest wyzszy niz przegroda poprzeczna.');
  if (c.lap >= c.slotDepth + c.underH - c.t) err('Zaklad przegrod siega ponizej podstawy.');
  if (c.slotDepth <= c.lap) warn('Osadzenie przegrody w boku jest plytsze niz zaklad z przegroda podluzna.');
  if (c.edgeMargin < c.t * 2) warn('Maly zapas przy krawedzi boku - wciecie moze wylamac material.');
  if (tabSpans(d.IW, c.tabN, c.tabW).length !== c.tabN) err('Czopy podstawy nie miesza sie na szerokosci wewnetrznej.');
  if (c.drop <= 0) warn('Bez opadania krawedzi kieszenie nie beda pochyle.');
  if (d.yTop(d.D) + c.slotDepth >= d.sideH) err('Bok jest nizszy niz linia schodow.');
  return out;
}

// Krawedz schodkowa z prostokatnymi wcieciami (uzywana przez bok i przegrode
// podluzna). Zwraca punkty od x = 0 do x = D wzdluz opadajacej krawedzi.
function steppedEdge(D, yAt, notches) {
  const pts = [[0, yAt(0)]];
  for (const n of notches) {
    const bottom = yAt((n.x0 + n.x1) / 2) + n.depth;
    pts.push([n.x0, yAt(n.x0)]);
    pts.push([n.x0, bottom]);
    pts.push([n.x1, bottom]);
    pts.push([n.x1, yAt(n.x1)]);
  }
  pts.push([D, yAt(D)]);
  return pts;
}

export function buildStepped(cfgIn) {
  const dims = steppedDims(cfgIn);
  const { cfg, IW, W, D, yTop, crossX, panelH, sideH, divTopAt, divX, pitch } = dims;
  const { t, fit, cols, pockets, slotDepth, lap, tabW, tabN, underH,
          schoolName, className } = cfg;

  const clear = 0.2;
  const slotT = t - fit;
  const innerBottom = sideH - t;        // gorne lico podstawy
  const frontH = underH - t;            // panel czolowy stoi na podstawie
  const backH = innerBottom - slotDepth;
  const parts = [];
  const add = (name, qty, w, h, cut, engrave, texts) =>
    parts.push({ name, qty, w, h, cut, engrave: engrave || [], texts: texts || [] });

  // --- BOK -------------------------------------------------------------------
  // X = glebokosc, Y = wysokosc. Wciecia: przegrody poprzeczne (krawedz gorna),
  // plecy (krawedz tylna), panel czolowy (krawedz przednia), gniazda podstawy.
  {
    const notches = crossX.map(x => ({ x0: x, x1: x + slotT, depth: slotDepth }));
    const pts = steppedEdge(D, yTop, notches);
    // krawedz przednia z wcieciami na czopy panelu czolowego
    const frontTabs = tabSpans(frontH, 2, Math.min(24, frontH / 3));
    const frontY0 = sideH - underH;
    pts.push([D, frontY0]);
    for (const s of frontTabs) {
      pts.push([D, frontY0 + s.start]);
      pts.push([D - t, frontY0 + s.start]);
      pts.push([D - t, frontY0 + s.start + s.w]);
      pts.push([D, frontY0 + s.start + s.w]);
    }
    pts.push([D, sideH]);
    pts.push([0, sideH]);
    // krawedz tylna z wcieciami na czopy plecow
    const backTabs = tabSpans(backH, 2, Math.min(24, backH / 4));
    for (const s of [...backTabs].reverse()) {
      const y0 = slotDepth + s.start;
      pts.push([0, y0 + s.w]);
      pts.push([t, y0 + s.w]);
      pts.push([t, y0]);
      pts.push([0, y0]);
    }
    const cut = [ring(pts)];
    // gniazda na czopy podstawy
    for (const s of tabSpans(D, tabN, tabW)) {
      cut.push(rectPath(s.start - clear / 2, sideH - t + fit / 2, s.w + clear, slotT));
    }
    add('Bok', 2, D, sideH, cut);
  }

  // --- PRZEGRODY POPRZECZNE --------------------------------------------------
  // X = szerokosc, Y = wysokosc. Czopy boczne siedza we wcieciach bokow,
  // dolna krawedz ma wpusty na przegrody podluzne.
  const crossPanel = (name, qty, numbers) => {
    // obrys: korpus IW szeroki, czopy o dlugosci slotDepth przy dolnej krawedzi
    const tabY = panelH - slotDepth;
    const pts = [
      [t, 0], [t + IW, 0],
      [t + IW, tabY], [W, tabY], [W, panelH],
      [0, panelH], [0, tabY], [t, tabY]
    ];
    const cut = [ring(pts)];
    for (const cx of divX) {
      // wpust krzyzowy od dolnej krawedzi na polowe zakladu
      const x = cx + 0;
      cut.push(path([[x - slotT / 2, panelH], [x - slotT / 2, panelH - lap / 2],
                     [x + slotT / 2, panelH - lap / 2], [x + slotT / 2, panelH]]));
    }
    const engrave = [];
    if (numbers) {
      numbers.forEach((n, c) => {
        const cx = t + c * (cfg.cellW + t) + cfg.cellW / 2;
        strokeNumber(n, cx, 8, 12).forEach(s => engrave.push(s));
      });
    }
    add(name, qty, W, panelH, cut, engrave);
  };
  for (let i = 0; i <= pockets; i++) {
    const numbers = i === 0 ? null
      : Array.from({ length: cols }, (_, c) => (i - 1) * cols + c + 1);
    crossPanel(i === 0 ? 'Przegroda poprzeczna (tylna)' : `Przegroda poprzeczna ${i} (kieszenie ${(i - 1) * cols + 1}-${i * cols})`,
               1, numbers);
  }

  // --- PRZEGRODY PODLUZNE ----------------------------------------------------
  // X = glebokosc, Y = wysokosc (od krawedzi gornej przegrody do podstawy).
  if (cols > 1) {
    const y0 = divTopAt(0);
    const localTop = (x) => divTopAt(x) - y0;
    const notches = crossX.map(x => ({ x0: x, x1: x + slotT, depth: lap / 2 }));
    const pts = steppedEdge(D, localTop, notches);
    const bottom = innerBottom - y0;
    pts.push([D, bottom]);
    // czopy w dolnej krawedzi wchodzace w podstawe
    for (const s of [...tabSpans(D, tabN, tabW)].reverse()) {
      pts.push([s.start + s.w, bottom]);
      pts.push([s.start + s.w, bottom + t]);
      pts.push([s.start, bottom + t]);
      pts.push([s.start, bottom]);
    }
    pts.push([0, bottom]);
    add('Przegroda podluzna', cols - 1, D, bottom + t, [ring(pts)]);
  }

  // --- PODSTAWA --------------------------------------------------------------
  // X = szerokosc (z czopami w boki), Y = glebokosc.
  {
    const outline = panelOutline(IW, D, t, {
      top: null, bottom: null,
      left: { n: tabN, w: tabW }, right: { n: tabN, w: tabW }
    });
    const cut = [{ ...outline, pts: outline.pts.map(p => [p[0] + t, p[1]]) }];
    for (const cx of divX) {
      for (const s of tabSpans(D, tabN, tabW)) {
        cut.push(rectPath(cx - slotT / 2, s.start - clear / 2, slotT, s.w + clear));
      }
    }
    add('Podstawa', 1, IW + 2 * t, D, cut);
  }

  // --- PLECY -----------------------------------------------------------------
  {
    const outline = panelOutline(IW, backH, t, {
      top: null, bottom: null,
      left: { n: 2, w: Math.min(24, backH / 4) }, right: { n: 2, w: Math.min(24, backH / 4) }
    });
    add('Plecy', 1, W, backH, [{ ...outline, pts: outline.pts.map(p => [p[0] + t, p[1]]) }]);
  }

  // --- PANEL CZOLOWY ---------------------------------------------------------
  {
    const h = frontH;
    const outline = panelOutline(IW, h, t, {
      top: null, bottom: null,
      left: { n: 2, w: Math.min(24, h / 3) }, right: { n: 2, w: Math.min(24, h / 3) }
    });
    const texts = [
      { text: schoolName, x: W / 2, y: h * 0.42, size: 9 },
      { text: className, x: W / 2, y: h * 0.75, size: 12 }
    ];
    add('Panel czolowy', 1, W, h,
        [{ ...outline, pts: outline.pts.map(p => [p[0] + t, p[1]]) }], [], texts);
  }

  return {
    cfg, parts, dims,
    W, H: sideH, D,
    cells: cols * pockets,
    pockets, cols,
    issues: validateSteppedConfig(cfgIn)
  };
}
