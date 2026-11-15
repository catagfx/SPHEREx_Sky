// Opt-in integration test against a running Vite app and a configured LiveKit project.
// Three isolated browser profiles exercise the real data channel and visible participant status.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { readConfig } from '../voice-server/config.js';

const require = createRequire(new URL('../voice-server/package.json', import.meta.url));
const { RoomServiceClient } = require('livekit-server-sdk');
const config = readConfig();
if (!config.url || !config.key || !config.secret) throw new Error('Configure voice-server/.env before running this integration test.');
const client = new RoomServiceClient(config.url.replace(/^ws/, 'http'), config.key, config.secret);
const base = (process.env.BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chromium', headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
let roomId;
const row = (page, name) => page.locator('.vc-pane[data-t="people"] .vc-row').filter({ hasText: name });
const status = async (page, name, deaf) => {
  await row(page, name).waitFor({ state: 'visible' });
  await row(page, name).locator('.vc-deaf-ico').waitFor({ state: deaf ? 'visible' : 'hidden', timeout: 15000 });
};
async function open(name, audio = true) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(({ name, audio }) => {
    localStorage.setItem('spx.voice.name', name);
    localStorage.setItem('spx.voice.prefs', JSON.stringify({ mic: true, audio }));
  }, { name, audio });
  const page = await context.newPage();
  await page.goto(base + '/?intro=0');
  await page.locator('#voiceBtn').click();
  return page;
}
async function join(page) {
  await page.locator('#vcCode').fill(roomId);
  await page.getByRole('button', { name: 'Join voice chat', exact: true }).click();
  await page.locator('.vc-room-title').waitFor({ state: 'visible', timeout: 30000 });
}
try {
  const host = await open('Presence host');
  await host.locator('#voicePanel').getByRole('tab', { name: 'Host', exact: true }).click();
  await host.locator('#vcTitle').fill('Voice presence test');
  const made = host.waitForResponse(r => r.url().endsWith('/api/rooms') && r.request().method() === 'POST');
  await host.getByRole('button', { name: 'Create and start', exact: true }).click();
  const response = await made;
  assert.equal(response.status(), 201, 'Voice API must create the test room');
  roomId = (await response.json()).roomId;
  await host.locator('.vc-room-title').waitFor({ state: 'visible', timeout: 30000 });

  const listener = await open('Presence listener');
  await join(listener);
  await status(host, 'Presence listener', false);
  await listener.getByRole('button', { name: 'Turn audio off', exact: true }).click();
  await status(listener, 'Presence listener', true);
  await status(host, 'Presence listener', true);
  console.log('PASS deafen is visible locally and to another participant, including for a listener');

  const late = await open('Late listener', false);
  await join(late);
  await status(late, 'Presence listener', true);
  await status(host, 'Late listener', true);
  await status(listener, 'Late listener', true);
  console.log('PASS late joiners receive existing status and publish their lobby audio preference');

  await listener.getByRole('button', { name: 'Turn audio on', exact: true }).click();
  await status(host, 'Presence listener', false);
  await status(late, 'Presence listener', false);
  console.log('PASS turning audio back on removes the headphones indicator for everyone');

  // Publish a real synthetic microphone track so deafen also verifies mute/restore behavior.
  await host.getByRole('button', { name: 'Mute', exact: true }).waitFor({ state: 'visible' });
  await host.getByRole('button', { name: 'Turn audio off', exact: true }).click();
  await status(listener, 'Presence host', true);
  await row(listener, 'Presence host').locator('.vc-muted-ico:not(.vc-deaf-ico)').waitFor({ state: 'visible' });
  await host.getByRole('button', { name: 'Turn audio on', exact: true }).click();
  await status(listener, 'Presence host', false);
  await row(listener, 'Presence host').locator('.vc-muted-ico:not(.vc-deaf-ico)').waitFor({ state: 'hidden' });
  console.log('PASS host deafen mutes the microphone and restores it when audio returns');

  await host.getByRole('button', { name: 'Mute', exact: true }).click();
  await row(listener, 'Presence host').locator('.vc-muted-ico:not(.vc-deaf-ico)').waitFor({ state: 'visible' });
  await status(listener, 'Presence host', false);
  console.log('PASS microphone mute remains distinct from deafen');

  await listener.getByRole('button', { name: 'Turn audio off', exact: true }).click();
  await status(host, 'Presence listener', true);
  await listener.getByRole('button', { name: 'Leave', exact: true }).click();
  await row(host, 'Presence listener').waitFor({ state: 'hidden' });
  await listener.locator('.vc-pref[data-k="audio"]').click(); // choose audio off in the lobby
  await join(listener);
  await status(host, 'Presence listener', true);
  console.log('PASS leaving clears the old participant and rejoining announces the current audio state');
} finally {
  await browser.close();
  if (roomId) await client.deleteRoom(roomId);
}
