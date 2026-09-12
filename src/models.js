// Rejestr modeli organizera. Kazdy model dostarcza: wartosci domyslne,
// funkcje build/validate oraz opis pol formularza (UI buduje panel z opisu,
// zamiast miec go zaszytego na sztywno).

// Uwaga: bundler (tools/build.mjs) laczy moduly w jednej przestrzeni nazw,
// dlatego importy nie moga uzywac aliasow (`as`) - nazwy sa globalne.
import { DEFAULTS, SKU, build, validateConfig, netArea } from './model.js';
import { STEPPED_DEFAULTS, STEPPED_SKU, buildStepped, validateSteppedConfig } from './model-stepped.js';

const skuOptions = (sku, labelFor) =>
  Object.keys(sku).map(k => ({ value: k, label: labelFor(k) }));

export const MODELS = {
  secure: {
    id: 'secure',
    label: 'SECURE — szafka z drzwiami',
    hint: 'Zamykana szafka: przegrodki w siatce kolumn i rzedow, drzwi ze szczelinami wgladu.',
    defaults: { ...DEFAULTS },
    sku: SKU,
    build,
    validate: validateConfig,
    countLabel: 'miejsc na telefony',
    groups: [
      { legend: 'Rozmiar', fields: [
        { k: 'sku', label: 'Wariant', type: 'select',
          options: skuOptions(SKU, k => SKU[k] ? `${k} — ${SKU[k].cols * SKU[k].rows} miejsc` : k) },
        { k: 'cols', label: 'Kolumny', type: 'number', min: 1, max: 6, half: true, lockedBySku: true },
        { k: 'rows', label: 'Rzędy', type: 'number', min: 1, max: 20, half: true, lockedBySku: true }
      ] },
      { legend: 'Materiał i pasowanie', fields: [
        { k: 't', label: 'Grubość zmierzona (mm)', type: 'number', step: 0.05, half: true },
        { k: 'fit', label: 'Kompensacja szczeliny', type: 'number', step: 0.01, half: true },
        { k: 'tabW', label: 'Szerokość pióra (mm)', type: 'number', step: 1, half: true },
        { k: 'tabN', label: 'Liczba piór', type: 'number', step: 1, min: 2, max: 6, half: true }
      ] },
      { legend: 'Przegródka', fields: [
        { k: 'cellW', label: 'Szerokość (mm)', type: 'number', half: true },
        { k: 'cellH', label: 'Wysokość (mm)', type: 'number', half: true },
        { k: 'depth', label: 'Głębokość (mm)', type: 'number', half: true },
        { k: 'slitW', label: 'Szczelina wglądu (mm)', type: 'number', half: true }
      ] },
      { legend: 'Opcje konstrukcyjne', fields: [
        { k: 'useHeader', label: 'Pasek nagłówkowy z grawerem', type: 'checkbox' },
        { k: 'solidBack', label: 'Pełne plecy (wersja biurkowa)', type: 'checkbox' },
        { k: 'solidStiffener', label: 'Pełna ramka drzwi', type: 'checkbox' }
      ] },
      { legend: 'Grawer', fields: [
        { k: 'schoolName', label: 'Nazwa szkoły', type: 'text' },
        { k: 'className', label: 'Klasa', type: 'text' }
      ] }
    ]
  },

  stepped: {
    id: 'stepped',
    label: 'Schodkowy — kieszenie pochyłe',
    hint: 'Stojak schodkowy: przegrody poprzeczne w opadajacych wcieciach bokow, kieszenie na telefony z numerami.',
    defaults: { sku: 'K-24', ...STEPPED_DEFAULTS },
    sku: STEPPED_SKU,
    build: buildStepped,
    validate: validateSteppedConfig,
    countLabel: 'kieszeni na telefony',
    groups: [
      { legend: 'Rozmiar', fields: [
        { k: 'sku', label: 'Wariant', type: 'select',
          options: skuOptions(STEPPED_SKU, k => STEPPED_SKU[k] ? `${k} — ${STEPPED_SKU[k].cols * STEPPED_SKU[k].pockets} miejsc` : k) },
        { k: 'cols', label: 'Kolumny', type: 'number', min: 1, max: 6, half: true, lockedBySku: true },
        { k: 'pockets', label: 'Kieszenie', type: 'number', min: 1, max: 20, half: true, lockedBySku: true }
      ] },
      { legend: 'Materiał i pasowanie', fields: [
        { k: 't', label: 'Grubość zmierzona (mm)', type: 'number', step: 0.05, half: true },
        { k: 'fit', label: 'Kompensacja szczeliny', type: 'number', step: 0.01, half: true },
        { k: 'tabW', label: 'Szerokość pióra (mm)', type: 'number', step: 1, half: true },
        { k: 'tabN', label: 'Liczba piór', type: 'number', step: 1, min: 2, max: 6, half: true }
      ] },
      { legend: 'Kieszeń', fields: [
        { k: 'cellW', label: 'Szerokość kolumny (mm)', type: 'number', half: true },
        { k: 'pocketW', label: 'Szerokość kieszeni (mm)', type: 'number', half: true },
        { k: 'pocketH', label: 'Wysokość przegrody (mm)', type: 'number', half: true },
        { k: 'slotDepth', label: 'Osadzenie w boku (mm)', type: 'number', half: true }
      ] },
      { legend: 'Schody i korpus', fields: [
        { k: 'drop', label: 'Opad na kieszeń (mm)', type: 'number', step: 0.5, half: true },
        { k: 'lap', label: 'Zakład przegród (mm)', type: 'number', step: 1, half: true },
        { k: 'edgeMargin', label: 'Zapas przy krawędzi (mm)', type: 'number', half: true },
        { k: 'underH', label: 'Wysokość korpusu (mm)', type: 'number', half: true }
      ] },
      { legend: 'Grawer', fields: [
        { k: 'schoolName', label: 'Nazwa szkoły', type: 'text' },
        { k: 'className', label: 'Klasa', type: 'text' }
      ] }
    ]
  }
};

export const DEFAULT_MODEL = 'secure';

export function modelDef(type) {
  const def = MODELS[type];
  if (!def) throw new Error(`Nieznany model organizera: ${type}`);
  return def;
}

export function buildModel(type, cfg) {
  return modelDef(type).build(cfg);
}

export function validateModel(type, cfg) {
  return modelDef(type).validate(cfg);
}

export function modelDefaults(type) {
  return { ...modelDef(type).defaults };
}

export { netArea };
