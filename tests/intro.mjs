// The intro and the landing: flying stars -> SPHEREx SKY title (it waits: never auto-dismissed) -> the first
// scroll reveals the page -> each further gesture (wheel, PageDown) moves exactly one section.
// Several screen sizes, both motion modes.
// usage: node tests/intro.mjs
import { launch, withServer, sleep, checks, MODES, newContext } from './helpers.mjs';

const SIZES = [[1536, 730], [1920, 1080], [1280, 720]];

async function run(base, motion, [w, h]) {
  const { check, report } = checks(`intro ${base} [${motion}, ${w}x${h}]`);
  const browser = await launch();
  const ctx = await newContext(browser, motion, { viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = () => page.evaluate(() => ({
    intro: !!document.getElementById('ui-intro-root'),
    locked: document.documentElement.classList.contains('intro-lock'),
    title: getComputedStyle(document.getElementById('introType') || document.body).visibility,
    header: getComputedStyle(document.getElementById('top')).opacity,
    y: Math.round(scrollY),
  }));

  await page.goto(base + '/', { waitUntil: 'load' });
  await sleep(9000);
  const s1 = await state();
  check('title screen up, page scroll locked', s1.intro && s1.locked && s1.title === 'visible', s1);
  await page.mouse.move(w / 2, h / 2);
  await page.mouse.wheel(0, 200);
  await sleep(3000);
  const s2 = await state();
  check('first scroll ends the intro without moving the page', !s2.intro && !s2.locked && s2.y === 0 && +s2.header > 0.9, s2);
  for (let i = 1; i <= 3; i++) {
    await page.mouse.wheel(0, 200);
    await sleep(2500);
    const s = await state();
    check(`scroll ${i} lands on section ${i + 1}`, s.y === i * h, s.y);
  }
  await page.keyboard.press('PageDown');
  await sleep(2500);
  check('PageDown moves one more section', (await state()).y === 4 * h);
  check('no page errors', errors.length === 0, errors);
  await browser.close();
  return report();
}

const failed = await withServer(async (base) => {
  let n = 0;
  for (const motion of MODES) for (const size of SIZES) n += await run(base, motion, size);
  return n;
});
process.exit(failed ? 1 : 0);
