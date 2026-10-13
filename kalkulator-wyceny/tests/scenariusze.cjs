// Scenariusze E2E kalkulatora (Playwright + Chromium).
// Uruchomienie: NODE_PATH=$(npm root -g) node kalkulator-wyceny/tests/scenariusze.cjs kalkulator-wyceny/kalkulator.html
const { chromium } = require('playwright');
const path = require('path');
const file = path.resolve(process.argv[2]);
const URL = 'file://' + file;

const amt = s => parseFloat(String(s).replace(/[^\d,\-−]/g, '').replace('−', '-').replace(',', '.')) || 0;

async function fresh(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route(/^https?:/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(URL);
  return { ctx, page, errors };
}
async function fill(page, sel, v) { await page.fill(sel, ''); await page.fill(sel, v); }
const lines = page => page.$$eval('#tLines li', ls => ls.map(l => ({ lbl: (l.querySelector('.lbl')?.childNodes[0]?.textContent || l.textContent).trim(), det: l.querySelector('.det')?.textContent || '', amt: l.querySelector('.amt')?.textContent || '' })));

(async () => {
  const browser = await chromium.launch();
  const R = {};

  // T1 start
  { const { ctx, page, errors } = await fresh(browser);
    R.t1_start = { total: await page.textContent('#tTotal'), errors, docCount: await page.evaluate(() => document.querySelectorAll('html').length) };
    await ctx.close(); }

  // T2 obliczenie podstawowe + rabat
  { const { ctx, page } = await fresh(browser);
    await fill(page, '#qty', '10'); await fill(page, '#cut0', '4:30');
    R.t2_basic = { lines: await lines(page), total: await page.textContent('#tTotal'), piece: await page.textContent('#tPiece') };
    await ctx.close(); }

  // T3 fmtMin 119,6 min
  { const { ctx, page } = await fresh(browser);
    await fill(page, '#cut0', '119:36');
    const l = await lines(page); R.t3_fmtMin = { det: l[0]?.det, stats: await page.textContent('#stats') };
    await fill(page, '#cut0', '120');
    R.t3_fmtMin.det120 = (await lines(page))[0]?.det;
    await ctx.close(); }

  // T4 minimum zamówienia + tekst do skopiowania
  { const { ctx, page } = await fresh(browser);
    await fill(page, '#cut0', '1'); await fill(page, '#oDays', '30');
    await page.click('#copy'); await page.waitForTimeout(150);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    R.t4_min = { lines: await lines(page), total: await page.textContent('#tTotal'), clip };
    await ctx.close(); }

  // T5 zaokrąglenia: suma pozycji vs Razem (fuzz)
  { const { ctx, page } = await fresh(browser);
    let bad = [], n = 0;
    const rnd = (a, b) => (a + Math.random() * (b - a));
    for (let i = 0; i < 150; i++) {
      const s = { qty: String(1 + Math.floor(rnd(1, 40))), cut: rnd(0.3, 9).toFixed(2).replace('.', ','), eng: rnd(0, 5).toFixed(1).replace('.', ','),
        sand: rnd(0, 3).toFixed(1).replace('.', ','), design: String(Math.floor(rnd(0, 37))), sheet: rnd(10, 60).toFixed(2).replace('.', ','), per: String(Math.floor(rnd(2, 17))) };
      await fill(page, '#qty', s.qty); await fill(page, '#cut0', s.cut); await fill(page, '#eng0', s.eng); await fill(page, '#sandMin', s.sand);
      await fill(page, '#designMin', s.design); await fill(page, '#sheet0', s.sheet); await fill(page, '#per0', s.per);
      const l = await lines(page); const tot = amt(await page.textContent('#tTotal'));
      const sum = Math.round(l.reduce((a, x) => a + amt(x.amt), 0) * 100) / 100;
      n++; if (Math.abs(sum - tot) > 0.001) bad.push({ s, sum, tot });
    }
    R.t5_rounding = { cases: n, mismatches: bad.length, example: bad[0] };
    // VAT: netto + VAT = brutto?
    await page.check('input[name=vat][value=vat]');
    let vbad = 0;
    for (let i = 0; i < 60; i++) {
      await fill(page, '#cut0', rnd(0.3, 9).toFixed(2).replace('.', ',')); await fill(page, '#qty', String(1 + Math.floor(rnd(1, 30))));
      const net = amt((await page.textContent('#tVatLbl')).split(',').slice(0, 2).join(',')); const vat = amt(await page.textContent('#tVat')); const tot = amt(await page.textContent('#tTotal'));
      if (Math.abs(Math.round((net + vat) * 100) / 100 - tot) > 0.001) vbad++;
    }
    R.t5_rounding.vatMismatches = vbad;
    await ctx.close(); }

  // T6 rabat — opis vs zakres
  { const { ctx, page } = await fresh(browser);
    await fill(page, '#qty', '20'); await fill(page, '#cut0', '2'); await fill(page, '#pers', '20');
    R.t6_discount = { lines: await lines(page) };
    await ctx.close(); }

  // T7 magazyn: dodanie, wybór, arkusze, zdejmowanie, cofnięcie
  { const { ctx, page, errors } = await fresh(browser);
    await page.click('#tabStock'); await page.click('#addReg');
    const id = await page.getAttribute('.reg-row:not(.reg-th)', 'data-rid');
    await fill(page, `#r_name_${id}`, 'Sklejka 4 mm'); await fill(page, `#r_w_${id}`, '600'); await fill(page, `#r_h_${id}`, '400');
    await fill(page, `#r_price_${id}`, '38'); await fill(page, `#r_qty_${id}`, '5');
    await page.click('#tabQuote');
    await page.selectOption('#msel0', id);
    await fill(page, '#pw0', '100'); await fill(page, '#ph0', '100'); await fill(page, '#qty', '30'); await fill(page, '#cut0', '1');
    const calcTxt = await page.textContent('#mcalc0'); const perHint = await page.textContent('#perHint0');
    const l = await lines(page);
    await page.click('#takeStock'); await page.waitForTimeout(50);
    const takeVal = await page.inputValue(`#tAmt_${id}`);
    await page.click('#takeOk');
    const after = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), 'lasercat-kalk-materialy-v1');
    const taken = await page.textContent('#takenNote');
    await page.click('#takeUndo');
    const undone = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), 'lasercat-kalk-materialy-v1');
    R.t7_stock = { calcTxt, perHint, matLine: l.find(x => /Materiał/.test(x.lbl)), takeVal, qtyAfter: after[0].qty, taken, qtyUndo: undone[0].qty, errors };
    await ctx.close(); }

  // T8 oferta / PDF poza środowiskiem Claude
  { const { ctx, page } = await fresh(browser);
    await fill(page, '#cut0', '5'); await page.click('#genOffer'); await page.waitForTimeout(100);
    R.t8_offer = { modalOpen: !(await page.isHidden('#modal')), pdfHidden: await page.isHidden('#pdfBtn'), hasPrint: !!(await page.$('#printBtn')) && await page.isVisible('#printBtn'), number: await page.textContent('.of-meta dd') };
    // focus trap: Tab z ostatniego przycisku
    await page.focus('#mClose'); for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    R.t8_offer.focusInModal = await page.evaluate(() => document.getElementById('modal').contains(document.activeElement));
    await ctx.close(); }

  // T9 XSS
  { const { ctx, page } = await fresh(browser);
    const p = '<img src=x onerror="window.__x=1">';
    await fill(page, '#pname', p); await fill(page, '#mname0', p); await fill(page, '#oClient', p); await fill(page, '#oNotes', p); await fill(page, '#cut0', '3');
    await page.click('#genOffer'); await page.waitForTimeout(200);
    R.t9_xss = { executed: await page.evaluate(() => !!window.__x) };
    await ctx.close(); }

  // T10 synchronizacja: nieudany zapis + snapshot z serwera
  { const mock = () => {
      const server = new Map([['srv1', { name: 'Akryl 3 mm', cat: 'std', w: '600', h: '400', price: '50', qty: '2', created: 1 }]]);
      let snapCb; window.__fail = false; window.__setCalls = 0;
      const docs = () => [...server].map(([id, v]) => ({ id, exists: true, data: () => ({ ...v }) }));
      const col = {
        get: async () => ({ empty: server.size === 0, docs: docs() }),
        onSnapshot: (cb) => { snapCb = cb; },
        doc: id => ({ set: async v => { window.__setCalls++; if (window.__fail) throw { code: 'permission-denied' }; server.set(id, v); }, delete: async () => { server.delete(id); } })
      };
      window.__pushSnap = () => snapCb && snapCb({ docs: docs() });
      window.claude = { use: async n => n === 'db' ? { doc: () => ({ collection: () => col }) } : n === 'user' ? { id: async () => 'u1' } : null };
      localStorage.setItem('lasercat-kalk-materialy-v1', JSON.stringify([{ id: 'local1', name: 'Lokalna sklejka', cat: 'std', w: '', h: '', price: '20', qty: '1', created: 5 }]));
    };
    const { ctx, page } = await fresh(browser, { init: mock });
    await page.waitForTimeout(300);
    const namesAfterInit = await page.evaluate(() => JSON.parse(localStorage.getItem('lasercat-kalk-materialy-v1')).map(x => x.name));
    await page.click('#tabStock');
    await page.evaluate(() => { window.__fail = true; });
    await fill(page, '#r_name_srv1', 'Akryl ZMIENIONY');
    await page.click('#tabQuote'); await page.waitForTimeout(300); // flush
    const sync = await page.textContent('#syncNote');
    await page.evaluate(() => window.__pushSnap()); await page.waitForTimeout(100);
    const nameAfterSnap = await page.evaluate(() => JSON.parse(localStorage.getItem('lasercat-kalk-materialy-v1')).find(x => x.id === 'srv1')?.name);
    R.t10_sync = { namesAfterInit, syncNote: sync, nameAfterSnap };
    await ctx.close(); }

  // T11 wydajność
  { const init = () => {
      const a = []; for (let i = 0; i < 300; i++) a.push({ id: 'm' + i, name: 'Materiał ' + i, cat: 'std', w: '600', h: '400', price: '30', qty: '3', created: i });
      localStorage.setItem('lasercat-kalk-materialy-v1', JSON.stringify(a));
      window.__ls = 0; window.__lsBytes = 0; const o = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__ls++; window.__lsBytes += String(v).length; return o.call(this, k, v); };
    };
    const { ctx, page } = await fresh(browser, { init });
    // klawiatura w magazynie
    await page.click('#tabStock');
    await page.focus('#r_name_m5');
    await page.evaluate(() => { window.__ls = 0; window.__lsBytes = 0; });
    let t0 = Date.now();
    await page.keyboard.type('abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwx', { delay: 0 });
    const stockType = Date.now() - t0;
    const stockLs = await page.evaluate(() => ({ n: window.__ls, kb: Math.round(window.__lsBytes / 1024) }));
    // render magazynu
    const renderReg = await page.evaluate(() => { const t = performance.now(); for (let i = 0; i < 20; i++) { document.getElementById('tabQuote').click(); document.getElementById('tabStock').click(); } return (performance.now() - t) / 20; });
    await page.click('#tabQuote');
    // klawiatura w wycenie: liczba przebudów listy pozycji
    const muts = await page.evaluate(async () => {
      let n = 0; const mo = new MutationObserver(r => { n += r.length; }); mo.observe(document.getElementById('tLines'), { childList: true });
      const el = document.getElementById('cut0'); el.focus();
      const t = performance.now();
      for (let i = 0; i < 100; i++) { el.value = String(i % 9 + 1); el.dispatchEvent(new Event('input', { bubbles: true })); }
      const dt = performance.now() - t;
      await new Promise(r => setTimeout(r, 20)); const before = n;
      el.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 20));
      mo.disconnect(); return { perInputMs: +(dt / 100).toFixed(2), rebuildsOnChange: n - before };
    });
    // checkbox: input+change => ile przeliczeń
    const cb = await page.evaluate(async () => {
      let n = 0; const mo = new MutationObserver(r => { n += r.length; }); mo.observe(document.getElementById('tLines'), { childList: true });
      document.querySelector('[data-p=pack]').click(); await new Promise(r => setTimeout(r, 20)); mo.disconnect(); return n;
    });
    // select materiału z 300 pozycjami
    const selMs = await page.evaluate(() => { const t = performance.now(); const s = document.getElementById('msel0'); for (let i = 0; i < 20; i++) { s.value = 'm' + i; s.dispatchEvent(new Event('change', { bubbles: true })); } return +((performance.now() - t) / 20).toFixed(2); });
    R.t11_perf = { stockType50keysMs: stockType, stockLocalStorageWrites: stockLs, renderRegMs: +renderReg.toFixed(2), quote: muts, checkboxRebuilds: cb, selectChangeMs: selMs };
    await ctx.close(); }

  // T12 mobile
  { const { ctx, page } = await fresh(browser, { viewport: { width: 360, height: 740 } });
    await fill(page, '#cut0', '3');
    R.t12_mobile = { hOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), barVisible: await page.isVisible('#bar') };
    await page.click('#tabStock'); await page.click('#addReg');
    R.t12_mobile.stockOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await ctx.close(); }

  // T13 walidacja wejścia
  { const { ctx, page } = await fresh(browser);
    await fill(page, '#qty', 'abc'); await fill(page, '#cut0', '3');
    const tn = await page.textContent('#tName');
    await page.click('#rates summary'); await fill(page, '#s_rateStd', '');
    const t0 = await page.textContent('#tTotal');
    await fill(page, '#oDays', '0'); await page.click('#genOffer');
    const until = await page.$$eval('.of-meta dd', d => d.map(x => x.textContent));
    R.t13_input = { tName: tn, qtyInvalid: await page.evaluate(() => document.getElementById('qty').getAttribute('aria-invalid')), totalAfterEmptyRate: t0, offerDates: until };
    await ctx.close(); }

  // T14 trwałość po przeładowaniu
  { const { ctx, page } = await fresh(browser);
    await fill(page, '#pname', 'Tabliczka'); await fill(page, '#cut0', '2:15'); await page.waitForTimeout(400);
    await page.reload();
    R.t14_persist = { name: await page.inputValue('#pname'), cut: await page.inputValue('#cut0'), total: await page.textContent('#tTotal') };
    await ctx.close(); }

  // T15 ramka artefaktu: confirm() zwraca false bez okna
  { const { ctx, page } = await fresh(browser, { init: () => { window.confirm = () => false; } });
    const yes = async () => { await page.waitForTimeout(50); if (await page.$('#askYes') && await page.isVisible('#askYes')) await page.click('#askYes'); await page.waitForTimeout(50); };
    await fill(page, '#pname', 'Do skasowania'); await fill(page, '#cut0', '3');
    await page.click('#reset'); await yes();
    const nameAfterReset = await page.inputValue('#pname');
    await page.click('#rates summary'); await fill(page, '#s_rateStd', '9'); await page.press('#s_rateStd', 'Tab');
    await page.click('#resetRates'); await yes();
    const rateAfter = await page.inputValue('#s_rateStd');
    await page.click('#tabStock'); await page.click('#addReg');
    await page.click('[data-rdel]'); await yes();
    const regRows = await page.$$eval('.reg-row:not(.reg-th)', r => r.length);
    R.t15_confirm = { nameAfterReset, rateAfter, regRowsAfterDelete: regRows };
    await ctx.close(); }

  await browser.close();
  console.log(JSON.stringify(R, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
