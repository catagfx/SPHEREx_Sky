// VR (WebXR) in an emulated headset (iwer, Meta's WebXR runtime in JS): enter VR, use the panels and the star map
// with a controller trigger and with a hand pinch, travel, exit; also on a headset without a floor-level space.
// usage: node tests/vr.mjs
import path from 'node:path';
import { ROOT, launch, withServer, sleep, checks, newContext } from './helpers.mjs';

const IWER = path.join(ROOT, 'node_modules', 'iwer', 'build', 'iwer.min.js');

async function run(base, { label, noFloor }) {
  const { check, report } = checks(`vr ${base} [${label}]`);
  const browser = await launch();
  const ctx = await newContext(browser, 'full', { viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript({ path: IWER });
  await ctx.addInitScript((noFloor) => {
    const cfg = { ...IWER.metaQuest3 };
    if (noFloor) cfg.supportedFeatures = cfg.supportedFeatures.filter((f) => f !== 'local-floor' && f !== 'bounded-floor');
    window.__xrDevice = new IWER.XRDevice(cfg);
    window.__xrDevice.installRuntime({ forceInstall: true }); // over Chrome's own (deviceless) navigator.xr
  }, !!noFloor);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push('alert: ' + d.message()); d.dismiss(); });

  await page.goto(base + '/?intro=0', { waitUntil: 'load' });
  const btn = await page.waitForSelector('#vrQuick:not([hidden])', { timeout: 10000 }).then(() => true, () => false);
  check('the VR button appears when the browser supports WebXR', btn);
  await page.click('#vrQuick');
  const started = await page.waitForFunction(() => !!(window.__xrDevice.activeSession && window.spxXR), null, { timeout: 8000 }).then(() => true, () => false);
  check('Enter VR starts an immersive session', started);
  await sleep(800);

  // point an input (controller or hand) of the emulated headset at a point of the scene. The scene is in the
  // session's reference space; the emulator's poses are in its own space: equal for 'local-floor', while 'local'
  // starts at the head (the emulator's initial head position).
  const head = await page.evaluate(() => window.__xrDevice.position.y);
  const aim = (input, target) => page.evaluate(({ input, target, dy }) => {
    const d = window.__xrDevice;
    const src = input === 'hand' ? d.hands.right : d.controllers.right;
    const from = new THREE.Vector3(0.2, target[1] - 0.15, target[2] + 0.9);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(...target).sub(from).normalize());
    src.position.set(from.x, from.y + dy, from.z);
    src.quaternion.set(q.x, q.y, q.z, q.w);
  }, { input, target, dy: noFloor ? head : 0 });
  const press = async (input) => {
    await page.evaluate((input) => {
      const d = window.__xrDevice;
      if (input === 'hand') d.hands.right.updatePinchValue(1); else d.controllers.right.updateButtonValue('trigger', 1);
    }, input);
    await sleep(250);
    await page.evaluate((input) => {
      const d = window.__xrDevice;
      if (input === 'hand') d.hands.right.updatePinchValue(0); else d.controllers.right.updateButtonValue('trigger', 0);
    }, input);
    await sleep(350);
  };
  const xr = () => page.evaluate(() => ({ mode: spxXR.mode, title: spxXR.title, fading: spxXR.fading, tilt: spxXR.worldTilt }));
  const button = (id) => page.evaluate((id) => spxXR.buttonWorld(id), id);

  const home = await button('go:starmap');
  check(noFloor ? 'no floor space: the panel is at eye level' : 'the menu panel floats at eye height', home && Math.abs(home[1] - (noFloor ? 0 : 1.6)) < 0.7, home);

  // controller trigger
  await aim('controller', home);
  await press('controller');
  check('controller trigger: "Open Star Map" opens the star map', (await xr()).mode === 'starmap', await xr());
  const star = await page.evaluate(() => spxXR.starWorld(0));
  if (star) { await aim('controller', star); await press('controller'); }
  const card = await xr();
  check('controller trigger: a star opens its card', !['Star Map', 'SPHEREx VR'].includes(card.title), card.title);
  const tilt0 = card.tilt.join();
  const travel = await button('travel:');
  if (travel) await aim('controller', travel);
  await press('controller');
  await sleep(1500);
  const after = await xr();
  check('"Travel Here" turns the sky and fades back in', after.tilt.join() !== tilt0 && after.fading === 0, after);

  // hand tracking pinch
  await page.evaluate(() => { window.__xrDevice.primaryInputMode = 'hand'; });
  await sleep(400);
  const back = await button('back:starmap');
  if (back) { await aim('hand', back); await press('hand'); }
  check('hand pinch: "Back to Star Map" works', (await xr()).title === 'Star Map', await xr());

  // exit
  await page.evaluate(() => window.__xrDevice.activeSession.end());
  await sleep(800);
  const out = await page.evaluate(() => ({ label: document.querySelector('#vrQuick span')?.textContent, tilt: spxXR.worldTilt.join() }));
  check('exiting VR restores the page sky', out.label === 'Enter VR' && out.tilt === '0,0,0,1', out);

  check('no page errors / alerts', errors.length === 0, errors.slice(0, 5));
  await browser.close();
  return report();
}

const failed = await withServer(async (base) => {
  let n = 0;
  n += await run(base, { label: 'Quest 3' });
  n += await run(base, { label: 'no floor space', noFloor: true });
  return n;
});
process.exit(failed ? 1 : 0);
