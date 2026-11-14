// The end-to-end suite (tests/e2e-suite.js, 132 checks of every challenge requirement), in full and calm motion.
// usage: node tests/e2e.mjs            (BASE_URL=http://localhost:5173 for the Vite dev server)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launch, withServer, MODES, newContext } from './helpers.mjs';

async function runSuite(base, motion) {
  // the suite is a plain `async page => {}` function written against http://localhost:8080
  const src = fs.readFileSync(path.join(ROOT, 'tests', 'e2e-suite.js'), 'utf8').split('http://localhost:8080').join(base);
  const suite = (0, eval)('(' + src.trim().replace(/;\s*$/, '') + ')');
  const browser = await launch();
  const ctx = await newContext(browser, motion, { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const res = await suite(page);
  await browser.close();
  console.log(`e2e ${base} [${motion}]: ${res.passed}/${res.totalTests} passed (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  for (const f of res.failures) console.log(`  FAIL [${f.category}] ${f.testName}: ${String(f.details).slice(0, 300)}`);
  return res.failed;
}

const failed = await withServer(async (base) => {
  let n = 0;
  for (const motion of MODES) n += await runSuite(base, motion);
  return n;
});
process.exit(failed ? 1 : 0);
