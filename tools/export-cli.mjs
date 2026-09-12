// Bezglowy eksport arkuszy (SVG + DXF + manifest JSON).
// Uzywany przez testy (walidacja ezdxf, testy wizualne) i do generowania
// plikow produkcyjnych z linii polecen.
//
//   node tools/export-cli.mjs --out out/S-30 --sku S-30 --sheet 760x760
//   node tools/export-cli.mjs --out out/R-24 --model rack --sku R-24
//   node tools/export-cli.mjs --out out/custom --set cols=4 --set rows=8

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { netArea } from '../src/model.js';
import { MODELS, DEFAULT_MODEL, modelDef, modelDefaults } from '../src/models.js';
import { nest, validatePlacement } from '../src/nest.js';
import { sheetSvg } from '../src/svg.js';
import { sheetDxf, sheetManifest } from '../src/dxf.js';
import { sheetLbrn } from '../src/lbrn.js';

export function exportProject(cfgIn, nestIn, outDir, modelType = DEFAULT_MODEL) {
  const def = modelDef(modelType);
  const cfg = { ...modelDefaults(modelType), ...cfgIn };
  const opts = { sheetW: 760, sheetH: 760, margin: 6, gap: 4, allowRot: true, ...nestIn };
  const model = def.build(cfg);
  const nested = nest(model.parts, opts);
  const placement = validatePlacement(nested, opts);

  const files = [];
  const sheets = nested.sheets.map((sheet, i) => {
    const name = `sheet-${i + 1}`;
    const dxf = sheetDxf(sheet, model.parts, opts);
    const svg = sheetSvg(sheet, model.parts, { ...opts, labels: true });
    const lbrn = sheetLbrn(sheet, model.parts, opts);
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, `${name}.dxf`), dxf, 'utf8');
      writeFileSync(resolve(outDir, `${name}.svg`), svg, 'utf8');
      writeFileSync(resolve(outDir, `${name}.lbrn2`), lbrn, 'utf8');
      files.push(`${name}.dxf`, `${name}.svg`, `${name}.lbrn2`);
    }
    return { name, dxf: `${name}.dxf`, svg: `${name}.svg`, lbrn: `${name}.lbrn2`,
             ...sheetManifest(sheet, model.parts, opts) };
  });

  const manifest = {
    generator: 'organizer-secure-generator',
    model: modelType,
    modelLabel: def.label,
    // konfiguracja po rozwinieciu wariantu katalogowego (model zna swoje SKU)
    config: model.cfg || cfg,
    nest: opts,
    strategy: nested.strategy,
    stats: { ...nested.stats, netAreaM2: netArea(model), cells: model.cells },
    body: { W: model.W, H: model.H, D: model.D },
    issues: [...model.issues, ...placement],
    parts: model.parts.map(p => ({ name: p.name, qty: p.qty, w: p.w, h: p.h })),
    sheets
  };
  if (outDir) {
    writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    files.push('manifest.json');
  }
  return { model, nested, manifest, files };
}

function parseArgs(argv) {
  const cfg = {}, nestOpts = {};
  let out = null, model = DEFAULT_MODEL;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--out') out = next();
    else if (a === '--model') {
      model = next();
      if (!MODELS[model]) throw new Error(`Nieznany model: ${model} (dostepne: ${Object.keys(MODELS).join(', ')})`);
    }
    else if (a === '--sku') cfg.sku = next();
    else if (a === '--sheet') { const [w, h] = next().split('x').map(Number); nestOpts.sheetW = w; nestOpts.sheetH = h; }
    else if (a === '--margin') nestOpts.margin = Number(next());
    else if (a === '--gap') nestOpts.gap = Number(next());
    else if (a === '--no-rot') nestOpts.allowRot = false;
    else if (a === '--set') {
      const [k, v] = next().split('=');
      cfg[k] = v === 'true' ? true : v === 'false' ? false : (isNaN(Number(v)) ? v : Number(v));
      if (k === 'cols' || k === 'rows') cfg.sku = cfg.sku || 'wlasny';
    } else throw new Error(`Nieznany argument: ${a}`);
  }
  return { cfg, nestOpts, out, model };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { cfg, nestOpts, out, model } = parseArgs(process.argv.slice(2));
  const outDir = out ? resolve(process.cwd(), out) : null;
  const { manifest } = exportProject(cfg, nestOpts, outDir, model);
  console.log(`model: ${manifest.modelLabel}`);
  console.log(`arkusze: ${manifest.stats.sheetCount}, wykorzystanie: ${(manifest.stats.utilization * 100).toFixed(1)}%, strategia: ${manifest.strategy.sort}/${manifest.strategy.heuristic}`);
  for (const issue of manifest.issues) console.log(`  [${issue.level}] ${issue.msg}`);
  if (outDir) console.log(`zapisano w ${outDir}`);
  if (manifest.issues.some(i => i.level === 'error')) process.exit(2);
}
