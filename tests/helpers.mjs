// Shared test helpers: the base URL, a headless browser, and a backend to test against.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

/**
 * Headless browser. Uses the installed Google Chrome (real GPU path, like the users) unless PW_CHANNEL says
 * otherwise; falls back to Playwright's own Chromium (`npx playwright install chromium`).
 * Never headed: a visible window would receive the real mouse / trackpad and fake scroll gestures.
 */
export async function launch() {
  const channel = process.env.PW_CHANNEL ?? 'chrome';
  try {
    return await chromium.launch({ channel: channel || undefined, headless: true });
  } catch (err) {
    if (!channel) throw err;
    console.warn(`(browser channel "${channel}" not available, using Playwright's Chromium)`);
    return chromium.launch({ headless: true });
  }
}

async function serverUp(base) {
  try {
    const r = await fetch(base + '/api/smtp-config');
    return r.ok;
  } catch {
    return false;
  }
}

/** Run fn(baseUrl) against BASE_URL, or against a temporary `python server.py` when nothing answers there. */
export async function withServer(fn) {
  if (await serverUp(BASE)) return fn(BASE);
  const port = 8099;
  const python = process.platform === 'win32' ? 'python' : 'python3';
  console.log(`(no server at ${BASE}: starting python server.py ${port})`);
  const proc = spawn(python, ['server.py', String(port)], { cwd: ROOT, stdio: 'ignore' });
  const base = `http://localhost:${port}`;
  try {
    for (let i = 0; i < 60 && !(await serverUp(base)); i++) await new Promise((r) => setTimeout(r, 250));
    return await fn(base);
  } finally {
    proc.kill();
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Motion modes every browser test runs in (MOTION=full,calm):
 *   full = the default. The OS is emulated asking for reduced motion (Windows "Animation effects" off), and the
 *          page must still animate fully: only the visitor's own choice turns calm mode on.
 *   calm = Tools > "Reduce motion" (localStorage spx_motion=reduced, as ui/src/core/env.ts stores it).
 */
export const MODES = (process.env.MOTION || 'full,calm').split(',');

/** A browser context in motion mode `mode` (see MODES); `options` = Playwright newContext options. */
export async function newContext(browser, mode, options = {}) {
  if (mode !== 'full' && mode !== 'calm') throw new Error(`unknown motion mode "${mode}" (full | calm)`);
  const ctx = await browser.newContext({ ...options, reducedMotion: 'reduce' });
  if (mode === 'calm') await ctx.addInitScript(() => { try { localStorage.setItem('spx_motion', 'reduced'); } catch (e) {} });
  return ctx;
}

/** Tiny check collector: check(name, ok, info) ... report() returns the number of failures. */
export function checks(title) {
  const results = [];
  return {
    check(name, ok, info) {
      results.push(!!ok);
      console.log((ok ? '  PASS ' : '  FAIL ') + name + (ok || info === undefined ? '' : '  ' + JSON.stringify(info)));
    },
    report() {
      const failed = results.filter((r) => !r).length;
      console.log(`${title}: ${results.length - failed}/${results.length} passed`);
      return failed;
    },
  };
}
