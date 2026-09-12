// Model organizera SECURE: z konfiguracji buduje liste czesci do ciecia.
//
// Czesc: { name, qty, w, h, cut: [shape], engrave: [shape], texts: [{text,x,y,size}] }
// Uklad wspolrzednych czesci: X w prawo, Y w dol, poczatek w lewym gornym rogu.

import { rectPath, ring, path, panelOutline, tabSpans, keyhole, strokeNumber } from './geometry.js';

export const DEFAULTS = {
  sku: 'S-30', cols: 3, rows: 10,
  t: 3.0, fit: 0.15, cellW: 178, cellH: 25, depth: 90,
  headerH: 32, useHeader: true, slitW: 8, tabW: 18, tabN: 3,
  solidBack: false, solidStiffener: false,
  schoolName: 'Szkola Podstawowa nr 1', className: 'Klasa 5a'
};

export const SKU = {
  'S-26': { cols: 2, rows: 13 },
  'S-30': { cols: 3, rows: 10 },
  'S-36': { cols: 3, rows: 12 },
  'wlasny': null
};

export function applySku(cfg) {
  const out = { ...DEFAULTS, ...cfg };
  const sku = SKU[out.sku];
  if (sku) { out.cols = sku.cols; out.rows = sku.rows; }
  return out;
}

// Sanity-check konfiguracji. Zwraca liste problemow; level: 'error' | 'warn'.
export function validateConfig(cfg) {
  const c = applySku(cfg);
  const out = [];
  const err = (msg) => out.push({ level: 'error', msg });
  const warn = (msg) => out.push({ level: 'warn', msg });

  if (!(c.t > 0)) err('Grubosc materialu musi byc wieksza od zera.');
  if (c.fit >= c.t) err('Kompensacja szczeliny nie moze byc wieksza od grubosci materialu.');
  if (c.fit < 0) warn('Ujemna kompensacja szczeliny daje gniazdo szersze od plyty - polaczenie bedzie luzne.');
  if (c.cols < 1 || c.rows < 1) err('Potrzebna jest co najmniej jedna kolumna i jeden rzad.');
  if (!(c.cellW > 0) || !(c.cellH > 0) || !(c.depth > 0)) err('Wymiary przegrodki musza byc dodatnie.');

  const sideTabs = tabSpans(c.depth, c.tabN, c.tabW);
  if (sideTabs.length !== c.tabN) {
    err(`Czopy (${c.tabN} x ${c.tabW} mm) nie miesza sie na glebokosci ${c.depth} mm.`);
  }
  const divTabW = dividerTabW(c);
  if (c.cols > 1 && tabSpans(c.depth, DIV_TAB_N, divTabW).length !== DIV_TAB_N) {
    err('Czopy przegrody pionowej nie miesza sie na glebokosci korpusu.');
  }
  if (c.slitW >= c.cellH) err('Szczelina wgladu jest wyzsza niz przegrodka.');
  if (c.cellH < 18) warn('Przegrodka nizsza niz 18 mm - telefon w etui moze nie wejsc.');
  if (c.depth < 60) warn('Glebokosc ponizej 60 mm - telefon bedzie wystawal poza korpus.');
  return out;
}

const DIV_TAB_N = 2;

function dividerTabW(c) {
  // Czop przegrody pionowej: 22 mm, ale nie wiecej niz 1/4 glebokosci.
  return Math.max(8, Math.min(22, c.depth / 4));
}

export function build(cfgIn) {
  const cfg = applySku(cfgIn);
  const { t, fit, cols, rows, cellW, cellH, depth, headerH, useHeader,
          slitW, tabW, tabN, solidBack, solidStiffener, schoolName, className } = cfg;

  const clear = 0.2;                   // luz na dlugosci czopa
  const slotT = t - fit;               // grubosc gniazda (wpust) - pasowanie ciasne
  const lapW  = t - fit;               // szerokosc polzakladki

  // pasy poziome od gory: opcjonalny naglowek + R rzedow przegrodek
  const bands = [];
  if (useHeader) bands.push({ h: headerH, header: true });
  for (let i = 0; i < rows; i++) bands.push({ h: cellH, header: false });

  const IW = cols * cellW + (cols - 1) * t;
  const IH = bands.reduce((a, b) => a + b.h, 0) + (bands.length - 1) * t;
  const W = IW + 2 * t;
  const H = IH + 2 * t;
  const D = depth;

  // y gornej krawedzi kazdej plyty poziomej (0..bands.length), wsp. plyty bocznej
  const hy = [0];
  bands.forEach(b => hy.push(hy[hy.length - 1] + t + b.h));

  // srodek kazdego pionowego przedzialu, wsp. wewnetrzne (0 = lewe lico wewn.)
  const divCx = [];
  for (let j = 1; j < cols; j++) divCx.push(j * cellW + (j - 1) * t + t / 2);

  const sideSpans = tabSpans(D, tabN, tabW);
  const divTabW = dividerTabW(cfg);
  const divSpans = tabSpans(D, DIV_TAB_N, divTabW);

  const parts = [];
  const add = (name, qty, w, h, cut, engrave, texts) =>
    parts.push({ name, qty, w, h, cut, engrave: engrave || [], texts: texts || [] });

  // --- BOKI ------------------------------------------------------------------
  // X = glebokosc, Y = wysokosc. Gniazda na czopy plyt poziomych.
  {
    const cut = [rectPath(0, 0, D, H)];
    for (const y of hy) {
      for (const s of sideSpans) {
        cut.push(rectPath(s.start - clear / 2, y + fit / 2, s.w + clear, slotT));
      }
    }
    add('Bok', 2, D, H, cut);
  }

  // --- PLYTY POZIOME ---------------------------------------------------------
  // X = szerokosc (z czopami), Y = glebokosc.
  const mkHoriz = (name, qty, kind) => {
    const outline = panelOutline(IW, D, t, {
      top: null, bottom: null,
      left: { n: tabN, w: tabW }, right: { n: tabN, w: tabW }
    });
    const cut = [{ ...outline, pts: outline.pts.map(p => [p[0] + t, p[1]]) }];
    for (const cx of divCx) {
      const x = cx + t;
      if (kind === 'cap') {
        // gniazda przelotowe na czopy przegrody
        for (const s of divSpans) {
          cut.push(rectPath(x - slotT / 2, s.start - clear / 2, slotT, s.w + clear));
        }
      } else {
        // polzakladka otwarta od przodu (y = 0): trzy odcinki, bez ciecia po
        // krawedzi plyty
        cut.push(path([[x - lapW / 2, 0], [x - lapW / 2, D / 2],
                       [x + lapW / 2, D / 2], [x + lapW / 2, 0]]));
      }
    }
    add(name, qty, IW + 2 * t, D, cut);
  };
  mkHoriz('Plyta gorna / dolna', 2, 'cap');
  if (bands.length - 1 > 0) mkHoriz('Polka', bands.length - 1, 'shelf');

  // --- PRZEGRODY PIONOWE -----------------------------------------------------
  // X = glebokosc, Y = wysokosc wewnetrzna, czopy gora/dol.
  if (cols > 1) {
    const outline = panelOutline(D, IH, t, {
      top: { n: DIV_TAB_N, w: divTabW }, bottom: { n: DIV_TAB_N, w: divTabW },
      left: null, right: null
    });
    const cut = [{ ...outline, pts: outline.pts.map(p => [p[0], p[1] + t]) }];
    for (let k = 1; k < bands.length; k++) {
      const y = hy[k] - t + t;   // gorna krawedz polki k we wsp. przegrody
      cut.push(path([[D, y - lapW / 2], [D / 2, y - lapW / 2],
                     [D / 2, y + lapW / 2], [D, y + lapW / 2]]));
    }
    add('Przegroda pionowa', cols - 1, D, IH + 2 * t, cut);
  }

  // --- PLECY -----------------------------------------------------------------
  if (solidBack) {
    const cut = [rectPath(0, 0, W, H)];
    for (const x of [W * 0.25, W * 0.75]) cut.push(keyhole(x, 30, 9, 4.5, 14));
    add('Plecy (pelne)', 1, W, H, cut);
  } else {
    const railH = 70;
    const cut = [rectPath(0, 0, W, railH)];
    for (const x of [W * 0.25, W * 0.75]) cut.push(keyhole(x, 20, 9, 4.5, 14));
    add('Listwa tylna (z otworami kluczowymi)', 2, W, railH, cut);
  }

  // --- DRZWI -----------------------------------------------------------------
  {
    const cut = [rectPath(0, 0, W, H)];
    const engrave = [];
    const texts = [];
    const numW = 13;                                  // pas na numer przegrodki
    const markW = 5;                                  // pas znacznikow zawiasow
    const slitLen = Math.max(10, Math.round(cellW * 0.55));
    let cellNo = 1;
    bands.forEach((b, bi) => {
      const yTop = hy[bi] + t;                 // gorna krawedz wnetrza pasa
      if (b.header) {
        texts.push({ text: schoolName, x: W / 2, y: yTop + b.h * 0.42, size: 9 });
        texts.push({ text: className, x: W / 2, y: yTop + b.h * 0.78, size: 7 });
        return;
      }
      for (let c = 0; c < cols; c++) {
        const cellX = t + c * (cellW + t);
        const yMid = yTop + b.h / 2;
        // numer po lewej, szczelina wgladu wysrodkowana w pozostalym polu
        const slitX = cellX + markW + numW + (cellW - markW - numW - slitLen) / 2;
        cut.push(rectPath(slitX, yMid - slitW / 2, slitLen, slitW));
        strokeNumber(cellNo, cellX + markW / 2 + numW / 2, yMid - 5.5, 11)
          .forEach(s => engrave.push(s));
        cellNo++;
      }
    });
    // Znaczniki otworow pod zawiasy (lewa krawedz) i skobel (prawa). Zawiasy
    // trzymaja sie pasa markW przy krawedzi, zeby nie wchodzic na numery.
    for (const y of [H * 0.2, H * 0.8]) engrave.push(rectPath(0.5, y - 12, markW, 24));
    engrave.push(rectPath(W - 26, H / 2 - 15, 22, 30));
    add('Drzwi', 1, W, H, cut, engrave, texts);
  }

  // --- WZMOCNIENIE DRZWI -----------------------------------------------------
  if (solidStiffener) {
    const m = 26;
    add('Ramka wzmacniajaca drzwi', 1, W, H,
        [rectPath(0, 0, W, H), rectPath(m, m, W - 2 * m, H - 2 * m)]);
  } else {
    add('Listwa wzmacniajaca (pion)', 2, 30, H, [rectPath(0, 0, 30, H)]);
    add('Nakladka pod skobel', 2, 60, 50, [rectPath(0, 0, 60, 50)]);
  }

  return {
    cfg, parts, W, H, D, IW, IH, bands,
    cells: cols * rows,
    issues: validateConfig(cfg)
  };
}

// Pole netto materialu [m2].
export function netArea(model) {
  let a = 0;
  for (const p of model.parts) a += p.qty * p.w * p.h;
  return a / 1e6;
}
