// Render snapshot: the HTML the viewer generates for all 23 targets in every explorer mode (asides, overlays,
// strips, charts, links, flags), the gallery, landmarks, benchmark grid, share link and anomaly report.
// Take one before a refactor, compare after: anything that differs is a behaviour change.
//   node tests/snapshot-render.mjs save       -> tests/.baselines/render.json
//   node tests/snapshot-render.mjs compare    -> diff against it
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launch, withServer, sleep } from './helpers.mjs';

const DIR = path.join(ROOT, 'tests', '.baselines');
const FILE = path.join(DIR, 'render.json');
const cmd = process.argv[2];
if (cmd !== 'save' && cmd !== 'compare') {
  console.log('usage: node tests/snapshot-render.mjs save|compare');
  process.exit(2);
}

async function capture(base) {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/?intro=0', { waitUntil: 'load' });
  await sleep(2500);
  await page.evaluate(async () => { // every cutout loaded: strips and difference images need them
    const urls = new Set();
    FIELD.forEach((s) => s.frames.forEach((f) => urls.add(f.u)));
    await Promise.all([...urls].map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u; })));
  });
  const snap = await page.evaluate(async () => {
    const H = (s) => { const e = document.querySelector(s); return e ? e.innerHTML : null; };
    const T = (s) => { const e = document.querySelector(s); return e ? e.textContent : null; };
    const A = (s, a) => { const e = document.querySelector(s); return e ? e.getAttribute(a) : null; };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { static: {}, series: [], colors: [], diff: [], epochs: {} };
    Object.assign(out.static, {
      hs: H('#hs'), bot: H('#bot'), gg: H('#gg'), gf: H('#gf'), bench: H('#storyBenchmarkGrid'), tlx: H('#tlx'), sa: H('#sa'), grM: H('#grM'),
      pxBadge: T('#storyPxPassBadge'), pxImg: A('#storyPxImg', 'src'), share: getShareUrl('planetx', 'M'), cl: T('#cl'), cr: T('#cr'),
      parse: [parseCoord('08h 55m 10s', false), parseCoord('-07° 14′ 43″', true), parseCoord('133.795', false), findClosestTarget(269.45, 4.69)],
    });
    const toggles = ['#coaddToggle', '#gaiaWiseOverlayToggle', '#contamMaskToggle'];
    const setToggles = (on) => toggles.forEach((s) => { const e = document.querySelector(s); if (e) e.checked = on; });
    for (let i = 0; i < FIELD.length; i++) {
      openChange('M');
      setSeries(i);
      await wait(30);
      const rec = { id: FIELD[i].id };
      for (const on of [false, true]) {
        setToggles(on);
        selectFrame(Math.min(1, FIELD[i].frames.length - 1));
        rec[on ? 'on' : 'off'] = {
          asN: H('#asN'), cap2: H('#cap2'), mvS: H('#mvS'), mvT: T('#mvT'), asT: T('#asT'),
          strip: Array.from(document.querySelectorAll('#strip .cell')).map((c) => c.className + '|' + c.textContent).join(';'),
          simbad: A('#xrefSimbad', 'href'), aladin: A('#xrefAladin', 'href'), irsa: A('#xrefIrsa', 'href'),
          flag: T('#contamFlagBadge'), hud: T('#mvCoaddHud'), fov: document.querySelector('#cutoutFovSelect').value, msMax: A('#ms', 'max'),
        };
      }
      setToggles(false);
      document.querySelector('#mC').click();
      await wait(10);
      out.colors.push({ id: FIELD[i].id, cch: H('#cch'), cap2: H('#cap2'), csT: T('#csT'), csI: A('#csI', 'src'), cwMax: A('#cw', 'max') });
      document.querySelector('#mD').click();
      await wait(10);
      out.diff.push({ id: FIELD[i].id, diffT: T('#diffT'), asN: H('#asN'), sda: H('#sda'), sdb: H('#sdb') });
      out.series.push(rec);
    }
    openChange('S');
    await wait(10);
    out.epochs.S = { cap2: H('#cap2'), chart: H('#chart'), tgA: T('#tgA'), tgB: T('#tgB'), tlx: H('#tlx') };
    document.querySelector('#mF').click();
    await wait(10);
    out.epochs.F = { cap2: H('#cap2'), chart: H('#chart'), tgB: T('#tgB'), tlx: H('#tlx') };
    closeChange();
    await wait(400);
    openChange('M'); setSeries(0); selectFrame(1);
    const rep = generateAnomalyReport();
    delete rep.discovery_id;
    delete rep.timestamp_utc;
    out.static.report = rep;
    closeChange();
    await wait(400);
    out.static.bodyClass = document.body.className;
    return out;
  });
  snap.errors = errors;
  await browser.close();
  return snap;
}

function diff(a, b, p = '', out = []) {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p + '.' + k, out);
  } else if (a !== b) {
    const sa = String(a), sb = String(b);
    let i = 0;
    while (i < sa.length && sa[i] === sb[i]) i++;
    out.push(`${p} @${i}\n    before: ${sa.slice(Math.max(0, i - 60), i + 140)}\n    after:  ${sb.slice(Math.max(0, i - 60), i + 140)}`);
  }
  return out;
}

const snap = await withServer(capture);
if (cmd === 'save') {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(snap));
  console.log(`saved ${FILE} (${snap.series.length} targets, ${snap.errors.length} page errors)`);
} else {
  const d = diff(JSON.parse(fs.readFileSync(FILE, 'utf8')), snap);
  d.forEach((x) => console.log(x));
  console.log(`render snapshot: ${d.length} difference(s)`);
  process.exit(d.length ? 1 : 0);
}
