// Style snapshot: every computed CSS property of every element (+ ::before / ::after) in 11 app states on
// 11 screen sizes. Proves a CSS refactor changes nothing visible (hover / focus states are not covered).
//   node tests/snapshot-styles.mjs save      -> two runs, tests/.baselines/styles-{1,2}.json (the 2nd = noise filter)
//   node tests/snapshot-styles.mjs compare   -> diff against them
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launch, withServer, sleep } from './helpers.mjs';

const DIR = path.join(ROOT, 'tests', '.baselines');
const VIEWPORTS = [[1920, 1080], [1536, 730], [1440, 900], [1366, 768], [1280, 720], [1100, 800], [1024, 700], [880, 740], [768, 1024], [390, 844], [375, 640]];
const PARALLEL = 4;
const cmd = process.argv[2];
if (cmd !== 'save' && cmd !== 'compare') {
  console.log('usage: node tests/snapshot-styles.mjs save|compare');
  process.exit(2);
}

async function collect() {
  // every declared font face, not only the ones already in use (a dialog's select would otherwise be measured
  // with the fallback font in some runs)
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
  await document.fonts.ready;
  // deterministic: CSS animations at their first frame, running transitions at their end
  document.getAnimations().forEach((a) => {
    try {
      if (a.constructor.name === 'CSSTransition') a.finish();
      else { a.pause(); a.currentTime = 0; }
    } catch (e) {}
  });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const props = Array.from(getComputedStyle(document.documentElement));
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      let i = 1;
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) i++;
      parts.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + ':' + i);
    }
    return parts.join('>');
  };
  const ser = (cs) => props.map((p) => cs.getPropertyValue(p)).join('|');
  const styles = {};
  for (const el of [document.documentElement, ...document.querySelectorAll('body, body *')]) {
    if (el.closest('#ui-intro-root')) continue;
    const key = el === document.documentElement ? 'html' : pathOf(el);
    styles[key] = ser(getComputedStyle(el));
    for (const pe of ['::before', '::after']) {
      const cs = getComputedStyle(el, pe);
      if (cs.content && cs.content !== 'none' && cs.content !== 'normal') styles[key + pe] = ser(cs);
    }
  }
  return { props, styles };
}

const STATES = {
  hero: async () => {},
  storyEnd: async (page) => { for (let i = 0; i < 6; i++) { await page.keyboard.press('PageDown'); await sleep(500); } await sleep(1200); },
  explorerM: async (page) => { await page.evaluate(() => { openChange('M'); setSeries(0); }); await sleep(900); },
  explorerC: async (page) => { await page.evaluate(() => openChange('C', 'barnard')); await sleep(900); },
  explorerD: async (page) => { await page.evaluate(() => openChange('D', 'planetx')); await sleep(900); },
  gallery: async (page) => { await page.evaluate(() => document.getElementById('galb').click()); await sleep(900); },
  search: async (page) => { await page.evaluate(() => document.getElementById('searchBtn').click()); await sleep(900); },
  irsa: async (page) => { await page.evaluate(() => document.getElementById('irsaRequestBtn').click()); await sleep(900); },
  landmarks: async (page) => { await page.evaluate(() => document.getElementById('tabLandmarks').click()); await sleep(1500); },
  toolsMenu: async (page) => { await page.evaluate(() => { document.getElementById('tools').click(); document.getElementById('cmp').click(); }); await sleep(900); },
};

async function capture(base) {
  const browser = await launch();
  const result = {};
  const queue = VIEWPORTS.slice();
  const one = async ([w, h]) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => {
      let seed = 42; // same "random" star field every run
      Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    });
    for (const [name, act] of Object.entries(STATES)) {
      const page = await ctx.newPage();
      await page.goto(base + '/?intro=0', { waitUntil: 'load' });
      await sleep(2600);
      await act(page);
      await page.mouse.move(0, 0);
      await sleep(400);
      result[`${w}x${h}/${name}`] = await page.evaluate(collect);
      await page.close();
    }
    const page = await ctx.newPage();
    await page.goto(base + '/?embed=true#target=planetx&mode=M', { waitUntil: 'load' });
    await sleep(3000);
    result[`${w}x${h}/embed`] = await page.evaluate(collect);
    await page.close();
    await ctx.close();
    process.stdout.write(`${w}x${h} `);
  };
  await Promise.all(Array.from({ length: PARALLEL }, async () => { while (queue.length) await one(queue.shift()); }));
  await browser.close();
  console.log('');
  return result;
}

const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const triples = (A, B, visit) => {
  for (const state of Object.keys(A)) {
    if (!B[state]) { visit(state, '(state missing)', null, null, null); continue; }
    const props = A[state].props;
    for (const k of new Set([...Object.keys(A[state].styles), ...Object.keys(B[state].styles)])) {
      const x = A[state].styles[k], y = B[state].styles[k];
      if (x === y) continue;
      if (x === undefined || y === undefined) { visit(state, k, '(element)', x === undefined ? 'missing' : 'present', y === undefined ? 'missing' : 'present'); continue; }
      const xs = x.split('|'), ys = y.split('|');
      props.forEach((p, i) => { if (xs[i] !== ys[i]) visit(state, k, p, xs[i], ys[i]); });
    }
  }
};

if (cmd === 'save') {
  fs.mkdirSync(DIR, { recursive: true });
  for (const n of [1, 2]) {
    const snap = await withServer(capture);
    fs.writeFileSync(path.join(DIR, `styles-${n}.json`), JSON.stringify(snap));
  }
  const noise = [];
  triples(read('styles-1.json'), read('styles-2.json'), (...t) => noise.push(t));
  console.log(`saved 2 baselines in ${DIR} (${noise.length} run-to-run differences will be ignored as noise)`);
} else {
  const base1 = read('styles-1.json');
  const flaky = new Set();
  triples(base1, read('styles-2.json'), (state, k, p) => flaky.add(`${state}|${k}|${p}`));
  const now = await withServer(capture);
  const found = [];
  triples(base1, now, (state, k, p, x, y) => { if (!flaky.has(`${state}|${k}|${p}`)) found.push(`${state}  ${k}\n    ${p}: ${x} -> ${y}`); });
  found.slice(0, 40).forEach((x) => console.log(x));
  console.log(`style snapshot: ${found.length} difference(s)${found.length > 40 ? ' (first 40 shown)' : ''}`);
  process.exit(found.length ? 1 : 0);
}
