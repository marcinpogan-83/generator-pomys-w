// Rejestr modeli organizera. Kazdy model dostarcza: wartosci domyslne,
// funkcje build/validate oraz opis pol formularza (UI buduje panel z opisu,
// zamiast miec go zaszytego na sztywno).

// Uwaga: bundler (tools/build.mjs) laczy moduly w jednej przestrzeni nazw,
// dlatego importy nie moga uzywac aliasow (`as`) - nazwy sa globalne.
import { DEFAULTS, SKU, build, validateConfig, netArea } from './model.js';
import { RACK_DEFAULTS, RACK_SKU, buildRack, validateRackConfig } from './model-rack.js';
import { NUM_STYLES } from './numbering.js';

const NUM_STYLE_OPTIONS = Object.entries(NUM_STYLES).map(([value, label]) => ({ value, label }));

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
      { legend: 'Numery i grawer', fields: [
        { k: 'numStyle', label: 'Numery przegródek', type: 'select', options: NUM_STYLE_OPTIONS },
        { k: 'numSize', label: 'Wysokość numeru (mm, 0 = auto)', type: 'number', step: 0.5, half: true },
        { k: 'fontFamily', label: 'Czcionka', type: 'text', half: true },
        { k: 'schoolName', label: 'Nazwa szkoły', type: 'text' },
        { k: 'className', label: 'Klasa', type: 'text' }
      ] }
    ]
  },

  rack: {
    id: 'rack',
    label: 'Kieszeniowy — rzedy i linie',
    hint: 'Konstrukcja jak w przykladowym projekcie: przegrody poprzeczne w opadajacych wcieciach bokow, kieszenie na telefony z numerami, przegrody podluzne dzielace linie.',
    defaults: { sku: 'R-24', ...RACK_DEFAULTS },
    sku: RACK_SKU,
    build: buildRack,
    validate: validateRackConfig,
    countLabel: 'kieszeni na telefony',
    groups: [
      { legend: 'Siatka', fields: [
        { k: 'sku', label: 'Wariant', type: 'select',
          options: skuOptions(RACK_SKU, k => RACK_SKU[k] ? `${k} — ${RACK_SKU[k].rows * RACK_SKU[k].cols} miejsc` : k) },
        { k: 'rows', label: 'Rzędy (w głąb)', type: 'number', min: 1, max: 24, half: true, lockedBySku: true },
        { k: 'cols', label: 'Linie (kolumny)', type: 'number', min: 1, max: 8, half: true, lockedBySku: true }
      ] },
      { legend: 'Materiał i pasowanie', fields: [
        { k: 't', label: 'Grubość zmierzona (mm)', type: 'number', step: 0.05, half: true },
        { k: 'fit', label: 'Kompensacja szczeliny', type: 'number', step: 0.01, half: true }
      ] },
      { legend: 'Kieszeń', fields: [
        { k: 'cellW', label: 'Szerokość linii (mm)', type: 'number', half: true },
        { k: 'pocketW', label: 'Prześwit kieszeni (mm)', type: 'number', half: true },
        { k: 'pocketDepth', label: 'Głębokość kieszeni (mm)', type: 'number', half: true },
        { k: 'overTop', label: 'Wystawanie ponad szynę (mm)', type: 'number', half: true }
      ] },
      { legend: 'Korpus', fields: [
        { k: 'tilt', label: 'Pochylenie szyny (°)', type: 'number', step: 1, min: 1, max: 44, half: true },
        { k: 'railSlot', label: 'Osadzenie w boku (mm)', type: 'number', half: true },
        { k: 'frontDrop', label: 'Wysokość panelu czołowego (mm)', type: 'number', half: true },
        { k: 'footH', label: 'Łuk nóżek (mm)', type: 'number', half: true }
      ] },
      { legend: 'Zatrzaski', fields: [
        { k: 'latch', label: 'Zatrzaski przy czopach', type: 'checkbox' },
        { k: 'latchGrip', label: 'Podcięcie zatrzasku (mm)', type: 'number', step: 0.5, half: true },
        { k: 'latchTip', label: 'Wysunięcie zaczepu (mm)', type: 'number', step: 0.5, half: true },
        { k: 'tabChamfer', label: 'Sfazowanie czopa (mm)', type: 'number', step: 0.5 }
      ] },
      { legend: 'Numery i grawer', fields: [
        { k: 'numTabW', label: 'Szerokość języczka (mm)', type: 'number', half: true },
        { k: 'scoopH', label: 'Wysokość języczka (mm)', type: 'number', half: true },
        { k: 'numStyle', label: 'Numery kieszeni', type: 'select', options: NUM_STYLE_OPTIONS },
        { k: 'numSize', label: 'Wysokość numeru (mm, 0 = auto)', type: 'number', step: 0.5, half: true },
        { k: 'fontFamily', label: 'Czcionka', type: 'text', half: true },
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
