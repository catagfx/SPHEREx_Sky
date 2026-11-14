// Regression checks for behaviour that once broke: the story page keeping its section paging after dialogs,
// hero buttons, deep links, the CO₂ scan, "Locate in 360° Sky", the header highlight, no console errors.
// usage: node tests/behaviour.mjs
import { launch, withServer, sleep, checks, MODES, newContext } from './helpers.mjs';

async function run(base, motion) {
  const { check, report } = checks(`behaviour ${base} [${motion}]`);
  const browser = await launch();
  const ctx = await newContext(browser, motion, { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /GSAP/.test(m.text()))) errors.push(m.text()); });

  await page.goto(base + '/?intro=0', { waitUntil: 'load' });
  await sleep(2500);
  const y = () => page.evaluate(() => Math.round(scrollY));
  const vh = await page.evaluate(() => innerHeight);
  const activeNav = () => page.evaluate(() => (document.querySelector('.nav-tab.active') || {}).dataset?.nav || null);

  // dialogs must give the story page back as they found it
  await page.evaluate(() => document.getElementById('galb').click());
  await sleep(800);
  check('Gallery highlights its menu item', (await activeNav()) === 'gallery');
  await page.evaluate(() => document.getElementById('gx').click());
  await sleep(900);
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 200);
  await sleep(2200);
  check('after the Gallery: hero-mode kept, one wheel = one section', (await page.evaluate(() => document.body.classList.contains('hero-mode'))) && (await y()) === vh, await y());
  check('after the Gallery: the highlight returns to the page', (await activeNav()) !== 'gallery', await activeNav());

  await page.evaluate(() => openChange('M'));
  await sleep(600);
  await page.evaluate(() => closeChange());
  await sleep(900);
  await page.mouse.wheel(0, 200);
  await sleep(2200);
  check('after the explorer: paging continues', (await y()) === 2 * vh, await y());
  check('after the explorer: Free-Look is not highlighted', (await activeNav()) !== 'sky', await activeNav());

  await page.keyboard.press('Home');
  await sleep(2200);
  await page.evaluate(() => document.getElementById('btnExploreStory').click());
  await sleep(2500);
  const px = await page.evaluate(() => ({ y: Math.round(scrollY), top: Math.round(document.getElementById('secPlanetX').getBoundingClientRect().top + scrollY) }));
  check('"Explore Discovery Story" lands exactly on Planet X', Math.abs(px.y - px.top) <= 1, px);

  // hero buttons
  await page.keyboard.press('Home');
  await sleep(2200);
  await page.evaluate(() => { window.speechSynthesis && (speechSynthesis.speak = () => {}); document.getElementById('tmu').click(); document.getElementById('h3').click(); });
  await sleep(500);
  const tour = await page.evaluate(() => ({ tour: !document.getElementById('tour').hidden, how: !document.getElementById('how').hidden }));
  check('hero "Guided Audio Tour" starts the tour', tour.tour && !tour.how, tour);
  await page.evaluate(() => document.getElementById('tst').click());
  await sleep(400);
  check('ending the tour gives the story page back', await page.evaluate(() => document.body.classList.contains('hero-mode')));
  await page.evaluate(() => document.getElementById('hw3').click());
  await sleep(500);
  check('"Methodology & Limits" opens How this was made', await page.evaluate(() => !document.getElementById('how').hidden));
  await page.keyboard.press('Escape');
  await sleep(600);
  await page.evaluate(() => document.getElementById('irsaRequestBtn').click());
  await sleep(600);
  await page.keyboard.press('Escape');
  await sleep(700);
  check('Esc closes the IRSA dialog', await page.evaluate(() => document.getElementById('irsaModal').hidden));

  // deep links and the explorer's modes
  await page.evaluate(() => { location.hash = 'target=planetx&mode=D'; });
  await sleep(1200);
  const d = await page.evaluate(() => ({ mode, id: FIELD[si].id }));
  check('#target=planetx&mode=D opens the Planet X difference', d.mode === 'D' && d.id === 'planetx', d);
  await page.evaluate(() => closeChange());
  await sleep(700);
  await page.evaluate(() => { setSeries(0); location.hash = 'target=barnard&mode=C'; });
  await sleep(1200);
  const c = await page.evaluate(() => ({ mode, csT: document.getElementById('csT').textContent, cap: document.getElementById('cap2').textContent }));
  check('#target=barnard&mode=C shows the 6-band SED spectrum', c.mode === 'C' && /MJy\/sr/.test(c.cap), c.csT);
  await page.evaluate(() => { setSeries(0); document.getElementById('mC').click(); });
  await sleep(300);
  const b = await page.evaluate(() => ({ n: document.querySelectorAll('#cch circle').length, cap: document.getElementById('cap2').textContent }));
  check("Barnard's Star keeps its 6-band SED", b.n === 6 && /Barnard/.test(b.cap), b.n);

  // "Locate in 360° Sky" flies to the selected target
  await page.evaluate(() => { setSeries(0); document.getElementById('mM').click(); document.getElementById('fly2').click(); });
  await sleep(motion === 'calm' ? 600 : 2600);
  const card = await page.evaluate(() => ({ shown: !document.getElementById('card').hidden, title: document.querySelector('#card h2').textContent }));
  check('"Locate in 360° Sky" shows the selected target', card.shown && /Barnard/.test(card.title), card);

  check('no page errors / GSAP warnings', errors.length === 0, errors.slice(0, 5));
  await browser.close();
  return report();
}

const failed = await withServer(async (base) => {
  let n = 0;
  for (const motion of MODES) n += await run(base, motion);
  return n;
});
process.exit(failed ? 1 : 0);
