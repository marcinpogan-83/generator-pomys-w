// Model organizera kieszeniowego - konstrukcja jak w przykladowym projekcie
// LightBurn (organizer klasowy na telefony).
//
// Zasada: dwa boki maja szyne opadajaca pod katem `tilt`, a w niej wciecia
// co `pitch`. W te wciecia wchodza czopy IDENTYCZNYCH przegrod poprzecznych.
// Miedzy przegrodami powstaja kieszenie na telefony; przegrody podluzne biegna
// wzdluz spadku i dziela kazda kieszen na kolumny (polaczenie na krzyzowy
// wpust). Calosc stoi na pochylonym dnie, z tylu zamyka ja panel tylny,
// z przodu panel czolowy z grawerem klasy.
//
// Liczba miejsc = rows * cols: `rows` to rzedy (kieszenie w glab), `cols` to
// linie (kolumny w szerokosci). Kazda kieszen ma grawerowany numer na jezyczku
// przegrody zamykajacej ja od tylu.
//
//   przekroj boczny (x w glab, y w dol):
//
//   szyna:  \__|‾|__|‾|__|‾|__          |‾| = przegroda poprzeczna w wcieciu
//            \  |  |  |  |  |  \        pomiedzy nimi - kieszen na telefon
//             \_|__|__|__|__|___\       dno pochylone rownolegle do szyny

import { ring, path, rectPath, tabSpans, strokeNumber } from './geometry.js';

export const RACK_DEFAULTS = {
  t: 3.0, fit: 0.15,
  rows: 8, cols: 3,
  cellW: 100,          // szerokosc kolumny (linii)
  pocketW: 21,         // przeswit kieszeni na telefon
  tilt: 20,            // kat pochylenia szyny i dna [stopnie]
  railSlot: 26,        // glebokosc wciecia w szynie
  overTop: 31,         // ile przegroda wystaje ponad szyne
  pocketDepth: 82,     // glebokosc kieszeni: od szyny do dna (pionowo)
  numTabW: 27.5,       // szerokosc jezyczka z numerem
  numTabOffset: 3,     // odsuniecie jezyczka od lewej krawedzi kolumny
  scoopH: 29,          // wysokosc jezyczka = glebokosc wybrania na palec
  frontDrop: 56,       // ile panel czolowy schodzi ponizej szyny
  endTabH: 30,         // wysokosc czopow paneli tylnego/czolowego
  floorTabLen: 28,     // dlugosc czopow dna
  footH: 15,           // wysokosc luku (nozek) w dolnej krawedzi boku
  underFloor: 3,       // ile bok wystaje ponizej dna z przodu
  schoolName: 'Szkola Podstawowa nr 1', className: 'Klasa 6'
};

export const RACK_SKU = {
  'R-24': { rows: 8, cols: 3 },
  'R-30': { rows: 10, cols: 3 },
  'R-32': { rows: 8, cols: 4 },
  'R-15': { rows: 5, cols: 3 },
  'wlasny': null
};

export function applyRackSku(cfg) {
  const out = { ...RACK_DEFAULTS, sku: 'R-24', ...cfg };
  const sku = RACK_SKU[out.sku];
  if (sku) { out.rows = sku.rows; out.cols = sku.cols; }
  return out;
}

const rad = (deg) => deg * Math.PI / 180;

// Wymiary pochodne - jedno zrodlo prawdy dla wszystkich czesci.
export function rackDims(cfgIn) {
  const c = applyRackSku(cfgIn);
  const th = rad(c.tilt);
  const slope = Math.tan(th);
  const pitch = c.pocketW + c.t;                      // rozstaw przegrod
  const IW = c.cols * c.cellW + (c.cols - 1) * c.t;   // szerokosc wewnetrzna
  const W = IW + 4 * c.t;                             // przegroda z czopami (2t na strone)
  // przegrody na glebokosci: k = 0 (tylna), 1..rows-1 (standardowe), rows (czolowa)
  const panelX = [];
  for (let k = 0; k <= c.rows; k++) panelX.push(c.t + k * pitch);
  const D = c.t + c.rows * pitch + 2 * c.t;           // glebokosc gabarytowa
  const railY = (x) => x * slope;                     // szyna (y w dol od tylnego naroza)
  const floorY = (x) => railY(x) + c.pocketDepth;     // gorne lico dna
  const sideH = floorY(D) + c.underFloor;             // wysokosc boku
  const panelH = c.overTop + c.pocketDepth;           // wysokosc przegrody standardowej
  const divH = c.pocketDepth * Math.cos(th) + 3;      // wysokosc przegrody podluznej
  const divOverRail = c.pocketDepth - divH / Math.cos(th);  // gora przegrody wzgl. szyny
  const overlap = c.pocketDepth - divOverRail;        // pionowy zaklad przegrod
  const lapPanel = overlap / 2 + 1;                   // wpust od dolu przegrody poprzecznej
  const lapDiv = overlap / 2 + 1;                     // wpust od gory przegrody podluznej
  // srodki przegrod podluznych w ukladzie przegrody poprzecznej
  const divX = [];
  for (let j = 1; j < c.cols; j++) divX.push(2 * c.t + j * c.cellW + (j - 1) * c.t + c.t / 2);
  // dlugosc wzdluz spadku miedzy panelem tylnym a czolowym
  const runX = panelX[c.rows] - (panelX[0] + c.t);
  const floorLen = runX / Math.cos(th);               // dno i gorna krawedz przegrody
  return {
    cfg: c, th, slope, pitch, IW, W, D, panelX, railY, floorY, sideH, panelH,
    divH, divOverRail, overlap, lapPanel, lapDiv, divX, floorLen, runX
  };
}

export function validateRackConfig(cfgIn) {
  const d = rackDims(cfgIn);
  const c = d.cfg;
  const out = [];
  const err = (msg) => out.push({ level: 'error', msg });
  const warn = (msg) => out.push({ level: 'warn', msg });

  if (!(c.t > 0)) err('Grubosc materialu musi byc wieksza od zera.');
  if (c.fit >= c.t) err('Kompensacja szczeliny nie moze byc wieksza od grubosci materialu.');
  if (c.rows < 1 || c.cols < 1) err('Potrzebny jest co najmniej jeden rzad i jedna linia.');
  if (!(c.cellW > 0) || !(c.pocketW > 0)) err('Szerokosc kolumny i kieszeni musi byc dodatnia.');
  if (c.pocketW < 12) warn('Kieszen wezsza niz 12 mm - telefon w etui moze nie wejsc.');
  if (c.cellW < 70) warn('Kolumna wezsza niz 70 mm - telefon moze nie zmiescic sie na szerokosc.');
  if (c.tilt <= 0 || c.tilt >= 45) err('Kat pochylenia musi miescic sie miedzy 0 a 45 stopni.');
  if (c.railSlot >= c.pocketDepth) err('Wciecie w szynie jest glebsze niz kieszen.');
  if (c.overTop <= c.scoopH) warn('Jezyczek z numerem chowa sie ponizej szyny - numer bedzie slabo widoczny.');
  if (c.numTabW + 2 * c.numTabOffset > c.cellW) err('Jezyczek z numerem nie miesci sie w kolumnie.');
  if (c.frontDrop >= c.pocketDepth) warn('Panel czolowy zaslania cala kieszen - telefonu nie da sie wyjac.');
  if (d.lapPanel >= d.panelH) err('Zaklad przegrod jest wyzszy niz przegroda poprzeczna.');
  if (d.divH <= d.lapDiv) err('Przegroda podluzna jest nizsza niz jej wlasny wpust.');
  if (tabSpans(d.floorLen, 2, c.floorTabLen).length !== 2) {
    err('Czopy dna nie miesza sie na dlugosci dna.');
  }
  if (c.footH >= c.underFloor + c.pocketDepth) warn('Luk nozek siega powyzej dna.');
  return out;
}

// Prostokatny slot obrocony o kat th, opisany odcinkiem srodkowym (px,py)->(qx,qy)
// i gruboscia w (prostopadle, w kierunku "w dol").
function tiltedSlot(px, py, qx, qy, w) {
  const dx = qx - px, dy = qy - py;
  const len = Math.hypot(dx, dy);
  let nx = -dy / len, ny = dx / len;            // normalna do odcinka
  if (ny < 0) { nx = -nx; ny = -ny; }           // zawsze skierowana w dol
  const sx = nx, sy = ny;
  return ring([
    [px, py], [qx, qy], [qx + sx * w, qy + sy * w], [px + sx * w, py + sy * w]
  ]);
}

export function buildRack(cfgIn) {
  const dims = rackDims(cfgIn);
  const { cfg, th, IW, W, D, panelX, railY, floorY, sideH, panelH,
          divH, divOverRail, lapPanel, lapDiv, divX, floorLen, runX } = dims;
  const { t, fit, rows, cols, cellW, railSlot, overTop, pocketDepth, numTabW,
          numTabOffset, scoopH, frontDrop, endTabH, floorTabLen, footH,
          schoolName, className } = cfg;

  const clear = 0.2;
  const slotT = t - fit;
  const parts = [];
  const add = (name, qty, w, h, cut, engrave, texts) =>
    parts.push({ name, qty, w, h, cut, engrave: engrave || [], texts: texts || [] });

  // czopy paneli tylnego i czolowego liczone od szyny w dol
  const backTabYs = [12, 12 + endTabH + 24];

  // --- BOK -------------------------------------------------------------------
  {
    const pts = [[0, 0]];
    // szyna z wcieciami na przegrody standardowe
    for (let k = 1; k < rows; k++) {
      const x = panelX[k];
      const bottom = railY(x + slotT / 2) + railSlot;
      pts.push([x, railY(x)]);
      pts.push([x, bottom]);
      pts.push([x + slotT, bottom]);
      pts.push([x + slotT, railY(x + slotT)]);
    }
    pts.push([D, railY(D)]);
    pts.push([D, sideH]);
    // dolna krawedz z lukiem (nozki)
    if (footH > 0) {
      const a0 = D * 0.27, a1 = D * 0.73;
      pts.push([a1 + footH, sideH]);
      pts.push([a1, sideH - footH]);
      pts.push([a0, sideH - footH]);
      pts.push([a0 - footH, sideH]);
    }
    pts.push([0, sideH]);
    const cut = [ring(pts)];

    // gniazda czopow panelu tylnego (2) i czolowego (1)
    const backX = panelX[0];
    for (const dy of backTabYs) {
      cut.push(rectPath(backX - clear / 2, railY(backX) + dy, slotT + clear, endTabH));
    }
    const frontX = panelX[rows];
    cut.push(rectPath(frontX - clear / 2, railY(frontX) + 12, slotT + clear, endTabH));

    // gniazda czopow dna - pochylone, na linii dna
    for (const u of tabSpans(runX, 2, floorTabLen * Math.cos(th))) {
      const x0 = panelX[0] + t + u.start, x1 = x0 + u.w;
      cut.push(tiltedSlot(x0, floorY(x0), x1, floorY(x1), slotT));
    }
    add('Bok', 2, D, sideH, cut);
  }

  // --- PRZEGRODY POPRZECZNE --------------------------------------------------
  // X = szerokosc, Y = wysokosc (0 = szczyt jezyczkow).
  const cellX = (c) => 2 * t + c * (cellW + t);

  const crossOutline = (height, opts) => {
    const { sideTabs, lapSlots } = opts;
    const pts = [];
    // gorna krawedz: jezyczki z numerami + wybrania na palec
    pts.push([2 * t, scoopH]);
    for (let c = 0; c < cols; c++) {
      const x0 = cellX(c) + numTabOffset, x1 = x0 + numTabW;
      pts.push([x0, scoopH]); pts.push([x0, 0]);
      pts.push([x1, 0]); pts.push([x1, scoopH]);
    }
    pts.push([2 * t + IW, scoopH]);
    // prawa krawedz z czopami
    for (const tab of sideTabs) {
      pts.push([2 * t + IW, tab.y]);
      pts.push([W, tab.y]);
      pts.push([W, tab.y + tab.h]);
      pts.push([2 * t + IW, tab.y + tab.h]);
    }
    pts.push([2 * t + IW, height]);
    pts.push([2 * t, height]);
    // lewa krawedz z czopami (od dolu do gory)
    for (const tab of [...sideTabs].reverse()) {
      pts.push([2 * t, tab.y + tab.h]);
      pts.push([0, tab.y + tab.h]);
      pts.push([0, tab.y]);
      pts.push([2 * t, tab.y]);
    }
    const cut = [ring(pts)];
    // wpusty krzyzowe od dolnej krawedzi
    if (lapSlots) {
      for (const cx of divX) {
        cut.push(path([[cx - slotT / 2, height], [cx - slotT / 2, height - lapPanel],
                       [cx + slotT / 2, height - lapPanel], [cx + slotT / 2, height]]));
      }
    }
    return cut;
  };

  const numbersFor = (k) => {           // przegroda k zamyka kieszen (rows - k)
    const pocket = rows - k;
    return Array.from({ length: cols }, (_, c) => (pocket - 1) * cols + c + 1);
  };

  const engraveNumbers = (numbers) => {
    const engrave = [];
    numbers.forEach((n, c) => {
      const cx = cellX(c) + numTabOffset + numTabW / 2;
      strokeNumber(n, cx, 5, scoopH * 0.62).forEach(s => engrave.push(s));
    });
    return engrave;
  };

  for (let k = 1; k < rows; k++) {
    const numbers = numbersFor(k);
    const cut = crossOutline(panelH, {
      sideTabs: [{ y: overTop, h: railSlot }],
      lapSlots: true
    });
    add(`Przegroda ${k} (kieszenie ${numbers[0]}-${numbers[numbers.length - 1]})`,
        1, W, panelH, cut, engraveNumbers(numbers));
  }

  // --- PANEL TYLNY -----------------------------------------------------------
  {
    const height = overTop + sideH - railY(panelX[0]);
    const cut = crossOutline(height, {
      sideTabs: backTabYs.map(dy => ({ y: overTop + dy, h: endTabH })),
      lapSlots: false
    });
    // gniazda czopow przegrod podluznych
    for (const cx of divX) {
      cut.push(rectPath(cx - slotT / 2, overTop + divOverRail, slotT, endTabH));
    }
    const numbers = numbersFor(0);
    add(`Panel tylny (kieszenie ${numbers[0]}-${numbers[numbers.length - 1]})`,
        1, W, height, cut, engraveNumbers(numbers));
  }

  // --- PANEL CZOLOWY ---------------------------------------------------------
  {
    const height = overTop + frontDrop;
    const pts = [[2 * t, 0], [2 * t + IW, 0]];
    const tab = { y: overTop + 12, h: endTabH };
    pts.push([2 * t + IW, tab.y]);
    pts.push([W, tab.y]);
    pts.push([W, tab.y + tab.h]);
    pts.push([2 * t + IW, tab.y + tab.h]);
    pts.push([2 * t + IW, height]);
    pts.push([2 * t, height]);
    pts.push([2 * t, tab.y + tab.h]);
    pts.push([0, tab.y + tab.h]);
    pts.push([0, tab.y]);
    pts.push([2 * t, tab.y]);
    const cut = [ring(pts)];
    for (const cx of divX) {
      cut.push(rectPath(cx - slotT / 2, overTop + divOverRail, slotT, endTabH));
    }
    const texts = [
      { text: schoolName, x: W / 2, y: height * 0.42, size: 9 },
      { text: className, x: W / 2, y: height * 0.78, size: 13 }
    ];
    add('Panel czolowy', 1, W, height, cut, [], texts);
  }

  // --- PRZEGRODY PODLUZNE ----------------------------------------------------
  // Uklad czesci: u wzdluz spadku (0 = lico panelu tylnego przy gornej
  // krawedzi), v prostopadle w dol. Pion swiata jest w tym ukladzie pochylony,
  // dlatego krawedzie czolowe i wpusty biegna skosnie.
  if (cols > 1) {
    const tanT = Math.tan(th);
    const cosT = Math.cos(th);
    const U = runX / cosT;                      // dlugosc gornej krawedzi
    const down = (u, v) => [u + v * tanT, v];   // punkt "pionowo w dol" o v
    const tabU = t / cosT;                      // grubosc panelu wzdluz u
    const vTab0 = 12 * cosT;                    // czop 12 mm ponizej krawedzi
    const vTab1 = vTab0 + endTabH * cosT;
    const vLap = lapDiv * cosT;                 // glebokosc wpustu w osi v

    const pts = [];
    // gorna krawedz z wpustami na przegrody poprzeczne
    pts.push([0, 0]);
    for (let k = 1; k < rows; k++) {
      const u0 = (panelX[k] - (panelX[0] + t)) / cosT;
      const u1 = u0 + tabU;
      pts.push([u0, 0]);
      pts.push(down(u0, vLap));
      pts.push(down(u1, vLap));
      pts.push([u1, 0]);
    }
    pts.push([U, 0]);
    // krawedz przednia (pionowa w swiecie) z czopem w panel czolowy
    pts.push(down(U, vTab0));
    pts.push(down(U + tabU, vTab0));
    pts.push(down(U + tabU, vTab1));
    pts.push(down(U, vTab1));
    pts.push(down(U, divH));
    // dolna krawedz
    pts.push(down(0, divH));
    // krawedz tylna z czopem w panel tylny
    pts.push(down(0, vTab1));
    pts.push(down(-tabU, vTab1));
    pts.push(down(-tabU, vTab0));
    pts.push(down(0, vTab0));

    const shape = ring(pts);
    const minX = Math.min(...shape.pts.map(q => q[0]));
    const moved = { ...shape, pts: shape.pts.map(q => [q[0] - minX, q[1]]) };
    const w = Math.max(...moved.pts.map(q => q[0]));
    add('Przegroda podluzna', cols - 1, w, divH, [moved]);
  }

  // --- DNO -------------------------------------------------------------------
  {
    const len = floorLen;
    const pts = [[t, 0], [t + IW, 0]];
    for (const s of tabSpans(len, 2, floorTabLen)) {
      pts.push([t + IW, s.start]);
      pts.push([t + IW + t, s.start]);
      pts.push([t + IW + t, s.start + s.w]);
      pts.push([t + IW, s.start + s.w]);
    }
    pts.push([t + IW, len]);
    pts.push([t, len]);
    for (const s of [...tabSpans(len, 2, floorTabLen)].reverse()) {
      pts.push([t, s.start + s.w]);
      pts.push([0, s.start + s.w]);
      pts.push([0, s.start]);
      pts.push([t, s.start]);
    }
    add('Dno (pochyle)', 1, IW + 2 * t, len, [ring(pts)]);
  }

  return {
    cfg, parts, dims,
    W, H: sideH + overTop, D,
    cells: rows * cols,
    rows, cols,
    issues: validateRackConfig(cfgIn)
  };
}
