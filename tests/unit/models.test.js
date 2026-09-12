import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, DEFAULT_MODEL, modelDef, modelDefaults, buildModel, validateModel } from '../../src/models.js';

const TYPES = Object.keys(MODELS);

test('rejestr zawiera oba modele i domyslny jest poprawny', () => {
  assert.deepEqual(TYPES.sort(), ['rack', 'secure']);
  assert.ok(MODELS[DEFAULT_MODEL]);
});

test('kazdy model buduje sie z wlasnych wartosci domyslnych', () => {
  for (const type of TYPES) {
    const m = buildModel(type, modelDefaults(type));
    assert.ok(m.parts.length > 0, `${type}: brak czesci`);
    assert.ok(m.cells > 0, `${type}: brak miejsc`);
    assert.ok(m.W > 0 && m.H > 0 && m.D > 0, `${type}: brak wymiarow gabarytowych`);
    assert.deepEqual(validateModel(type, modelDefaults(type)), [], `${type}: domyslna konfiguracja musi byc poprawna`);
    for (const p of m.parts) {
      assert.ok(p.name && p.qty > 0 && p.w > 0 && p.h > 0, `${type}: niepelny opis czesci`);
      assert.ok(Array.isArray(p.cut) && Array.isArray(p.engrave) && Array.isArray(p.texts));
    }
  }
});

test('opis formularza pokrywa sie z konfiguracja modelu', () => {
  for (const type of TYPES) {
    const def = modelDef(type);
    const cfg = modelDefaults(type);
    assert.ok(def.label && def.hint && def.countLabel, `${type}: brak opisow`);
    const keys = def.groups.flatMap(g => g.fields.map(f => f.k));
    assert.equal(new Set(keys).size, keys.length, `${type}: powtorzone pole formularza`);
    for (const g of def.groups) {
      for (const f of g.fields) {
        assert.ok(f.k in cfg, `${type}: pole ${f.k} nie istnieje w konfiguracji`);
        assert.ok(f.label, `${type}: pole ${f.k} bez etykiety`);
        assert.ok(['number', 'text', 'checkbox', 'select'].includes(f.type), `${type}: zly typ pola ${f.k}`);
        if (f.type === 'select') {
          assert.ok(f.options.length > 0);
          assert.ok(f.options.some(o => o.value === cfg[f.k]), `${type}: brak opcji dla wartosci ${cfg[f.k]}`);
        }
      }
    }
    // kazdy wariant katalogowy da sie zbudowac
    for (const sku of Object.keys(def.sku)) {
      const m = buildModel(type, { ...cfg, sku });
      assert.ok(m.parts.length > 0, `${type}/${sku}`);
    }
  }
});

test('zmiana kluczowego parametru zmienia liczbe miejsc', () => {
  const secure = buildModel('secure', { ...modelDefaults('secure'), sku: 'wlasny', cols: 2, rows: 5 });
  assert.equal(secure.cells, 10);
  const rack = buildModel('rack', { ...modelDefaults('rack'), sku: 'wlasny', rows: 5, cols: 2 });
  assert.equal(rack.cells, 10);
});

test('nieznany model konczy sie czytelnym bledem', () => {
  assert.throws(() => modelDef('brak'), /Nieznany model/);
});
