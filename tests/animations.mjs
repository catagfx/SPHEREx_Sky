// Animation regression checks: the motion that once stopped silently. The OS is emulated asking for reduced motion
// (like a Windows PC with "Animation effects" off): full mode must still animate everything, calm mode
// (Tools > Reduce motion) only fades. Also fails when a CSS animation takes `transform` away from GSAP.
// usage: node tests/animations.mjs
import { launch, withServer, sleep, checks, MODES, newContext } from './helpers.mjs';

const W = 1536, H = 730;
const QUIET_TITLE_MS = 16000; // the intro title must still be up this long after load (it is never auto-dismissed)

// In the page: elements where a running CSS animation animates `transform` while GSAP holds a transform on them.
// The CSS animation wins, so the GSAP motion is silently lost (use the `translate` property for ambient motion).
function transformFights() {
  const out = [];
  for (const a of document.getAnimations()) {
    if (a.constructor.name !== 'CSSAnimation' || a.playState !== 'running') continue;
    const el = a.effect && a.effect.target;
    if (!el || !(el.style?.transform || el.getAttribute('transform'))) continue;
    if (a.effect.getKeyframes().some((k) => 'transform' in k)) {
      const cls = typeof el.className === 'string' ? el.className : el.className.baseVal;
      out.push(`<${el.tagName.toLowerCase()} class="${cls}"> ${a.animationName}`);
    }
  }
  return out;
}

// In the page: what the hero is doing right now.
function heroState() {
  const moving = (el) => { const t = getComputedStyle(el).transform; return t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)'; };
  const op = (el) => +getComputedStyle(el).opacity;
  const svg = document.querySelector('.hero-constellation');
  const lines = svg ? [...svg.querySelectorAll('.cl-lines line')] : [];
  const stars = svg ? [...svg.querySelectorAll('.cl-stars circle')] : [];
  const facts = [...document.querySelectorAll('.hero-fact')];
  return {
    revealed: !document.getElementById('ui-intro-root'),
    wordsMoving: [...document.querySelectorAll('#ht *')].some(moving),
    ht: op(document.getElementById('ht')),
    btnsMoving: [...document.querySelectorAll('.hero-btn')].some(moving),
    facts: facts.map(op),
    factsMoving: facts.some(moving),
    svgOpacity: svg ? op(svg) : 0,
    lines: lines.length,
    stars: stars.length,
    linesDrawing: lines.some((l) => parseFloat(getComputedStyle(l).strokeDashoffset) > 0.01),
    starsPopping: stars.some((c) => op(c) < 1),
  };
}

function ambientState() {
  const sky = document.querySelector('.hero-sky');
  const names = [...new Set(document.getAnimations()
    .filter((a) => a.constructor.name === 'CSSAnimation' && a.playState === 'running' && sky.contains(a.effect.target))
    .map((a) => a.animationName))].sort();
  return { translate: getComputedStyle(sky).translate, names };
}

async function run(base, mode) {
  const full = mode === 'full';
  const { check, report } = checks(`animations ${base} [${mode}]`);
  const browser = await launch();
  const ctx = await newContext(browser, mode, { viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /GSAP/.test(m.text()))) errors.push(m.text()); });
  const fights = new Set();
  const sample = async (fn, ms, every = 120) => {
    const out = [];
    for (const end = Date.now() + ms; Date.now() < end; await sleep(every)) {
      out.push(await page.evaluate(fn));
      (await page.evaluate(transformFights)).forEach((f) => fights.add(f));
    }
    return out;
  };

  const t0 = Date.now();
  // not 'load': with the built bundle the textures can hold the load event until the star cover is already gone
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  // the dev server starts the app after the first paint: wait for it
  const stars = await page.waitForFunction(() => !!document.querySelector('#load canvas'), null, { timeout: 10000, polling: 50 }).then(() => true, () => false);
  const calmClass = await page.evaluate(() => document.documentElement.classList.contains('reduce-motion'));
  check(full ? 'full motion by default, although the OS asks for reduced motion' : 'calm mode from the stored choice', calmClass === !full, { calmClass });

  // 1. intro: the star field, then the title, which waits for the visitor
  check('intro: the star field runs (WebGL canvas)', stars);
  const typed = await page.waitForFunction(() => {
    const l = [...document.querySelectorAll('#introType .ch')];
    return l.length > 0 && l.every((c) => getComputedStyle(c).opacity === '1');
  }, null, { timeout: 15000 }).then(() => true, () => false);
  check('intro: the title is typed in', typed);
  await sleep(Math.max(0, QUIET_TITLE_MS - (Date.now() - t0)));
  const waiting = await page.evaluate(() => ({
    intro: !!document.getElementById('ui-intro-root'),
    locked: document.documentElement.classList.contains('intro-lock'),
    title: +getComputedStyle(document.getElementById('introType')).opacity,
  }));
  check(`intro: the title is still waiting for a scroll after ${QUIET_TITLE_MS / 1000} s`, waiting.intro && waiting.locked && waiting.title === 1, waiting);

  // 2. hero entrance
  await page.mouse.move(W / 2, H / 2);
  await page.mouse.wheel(0, 200);
  await page.waitForFunction(() => !document.getElementById('ui-intro-root'), null, { timeout: 6000 }).catch(() => {});
  const ent = await sample(heroState, 4800);
  const seen = (k) => ent.some((s) => s[k]);
  const end = await page.evaluate(heroState);
  if (full) {
    check('hero: the title words fly in', seen('wordsMoving'));
    check('hero: the buttons pop in', seen('btnsMoving'));
    check('hero: the constellation lines draw themselves', seen('linesDrawing'));
    check('hero: the constellation stars pop in', seen('starsPopping'));
  } else {
    check('hero (calm): the title fades in without moving', ent.some((s) => s.ht < 1) && !seen('wordsMoving'));
    check('hero (calm): nothing travels', !seen('btnsMoving') && !seen('linesDrawing'));
    check('hero (calm): the constellation fades in', ent.some((s) => s.svgOpacity > 0 && s.svgOpacity < 1));
  }
  check('hero: everything in place at the end', end.ht === 1 && !end.wordsMoving && end.facts.length === 4 && end.facts.every((o) => o === 1), end);
  check('hero: the constellation is complete', end.lines >= 10 && end.stars >= 10 && !end.linesDrawing && !end.starsPopping, { lines: end.lines, stars: end.stars });

  // 3. ambient motion of the hero sky
  const a1 = await page.evaluate(ambientState);
  await sleep(1300);
  const a2 = await page.evaluate(ambientState);
  if (full) {
    check('ambient: the sky floats and twinkles', a1.translate !== a2.translate && ['clDrift', 'clFloat', 'clTwinkle'].every((n) => a2.names.includes(n)), { a1, a2 });
  } else {
    check('ambient (calm): the sky stays still', a1.translate === a2.translate && a2.names.length === 0, { a1, a2 });
  }

  // 4. next section: the card comes in, one gesture = one section
  await page.mouse.wheel(0, 200);
  const card = () => {
    const c = document.querySelectorAll('.story-section')[1].querySelector('.showcase-card'); // whichever section is 2nd
    const t = getComputedStyle(c).transform;
    return { op: +getComputedStyle(c).opacity, moving: t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)', y: Math.round(scrollY) };
  };
  const sec = await sample(card, 2600);
  const last = sec[sec.length - 1];
  check('section 2: one gesture lands on it', last.y === H, last.y);
  check(full ? 'section 2: the card rises in' : 'section 2 (calm): the card fades in without moving',
    sec.some((s) => s.op < 1) && (full ? sec.some((s) => s.moving) : !sec.some((s) => s.moving)) && last.op === 1, sec.slice(0, 3));

  check('no CSS animation fights GSAP over transform', fights.size === 0, [...fights]);

  // 5. Tools > Reduce motion switches the mode (and back), without replaying the intro
  if (full) {
    const toggle = async () => {
      await page.click('#tools');
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#motionToggle')]);
      await sleep(1200);
      return page.evaluate(() => ({
        calm: document.documentElement.classList.contains('reduce-motion'),
        pressed: document.getElementById('motionToggle').getAttribute('aria-pressed'),
        intro: !!document.getElementById('ui-intro-root'),
      }));
    };
    const on = await toggle();
    check('Tools > Reduce motion turns calm mode on (no intro replay)', on.calm && on.pressed === 'true' && !on.intro, on);
    const off = await toggle();
    check('...and pressing it again goes back to full motion', !off.calm && off.pressed === 'false' && !off.intro, off);
  }

  check('no page errors / GSAP warnings', errors.length === 0, errors.slice(0, 5));
  await browser.close();
  return report();
}

const failed = await withServer(async (base) => {
  let n = 0;
  for (const mode of MODES) n += await run(base, mode);
  return n;
});
process.exit(failed ? 1 : 0);
