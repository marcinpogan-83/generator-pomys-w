// Opis numeru przegrodki: wektor kreskowy albo tekst w wybranej czcionce.
//
// Wektor kreskowy wchodzi do kazdej maszyny bez instalowania czcionki, ale ma
// jeden krok pisma. Tryb "czcionka" zapisuje numer jako encje tekstu (SVG
// font-family, DXF STYLE, LightBurn Font), wiec mozna uzyc dowolnego kroju
// zainstalowanego w programie sterujacym laserem.

import { strokeNumber } from './geometry.js';

export const NUM_STYLES = {
  kreskowy: 'Wektor kreskowy (bez czcionki)',
  czcionka: 'Tekst w czcionce'
};

export const DEFAULT_FONT = 'Arial';

// Wysokosc numeru: wartosc z konfiguracji albo domyslna dla modelu.
export function numberSize(cfg, auto) {
  const v = Number(cfg.numSize);
  return v > 0 ? v : auto;
}

/**
 * Zwraca { shapes, texts } dla jednego numeru.
 * @param {Object} cfg konfiguracja modelu (numStyle, numSize, fontFamily)
 * @param {number|string} value numer przegrodki
 * @param {number} cx srodek numeru w poziomie
 * @param {number} yTop gorna krawedz numeru
 * @param {number} auto domyslna wysokosc numeru [mm]
 */
export function numberMark(cfg, value, cx, yTop, auto) {
  const size = numberSize(cfg, auto);
  if (cfg.numStyle === 'czcionka') {
    return {
      shapes: [],
      texts: [{ text: String(value), x: cx, y: yTop + size * 0.78, size,
                font: cfg.fontFamily || DEFAULT_FONT }]
    };
  }
  return { shapes: strokeNumber(value, cx, yTop, size), texts: [] };
}
