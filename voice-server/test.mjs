// Real HTTP requests and signed tokens; the LiveKit control plane is replaced offline.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { TokenVerifier } from 'livekit-server-sdk';
import { createApp, MAX_SPEAKERS } from './server.js';
import { readConfig } from './config.js';

const config = readConfig({ LIVEKIT_URL: 'wss://example.livekit.cloud', LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'devsecretdevsecretdevsecretdevsecret', PUBLIC_URL: 'https://sky.example.com' });
const verifier = new TokenVerifier(config.key, config.secret);

async function fixture(t, overrides = {}) {
  const data = new Map();
  const calls = [];
  let failure = '';
  let time = Date.now();
  const check = method => { if (failure === method) throw new Error('private upstream details'); };
  const livekit = {
    async createRoom(options) { check('create'); calls.push(options); if (!data.has(options.name)) data.set(options.name, []); },
    async listParticipants(id) { check('list'); return structuredClone(data.get(id) || []); },
    async updateParticipant(id, identity, metadata, permission) {
      check('update');
      await new Promise(resolve => setTimeout(resolve, 10));
      const person = data.get(id).find(p => p.identity === identity);
      person.permission = permission;
    },
    async removeParticipant(id, identity) { check('remove'); data.set(id, data.get(id).filter(p => p.identity !== identity)); },
    async deleteRoom(id) { check('delete'); data.delete(id); },
  };
  const app = createApp({ config, livekit, now: () => time, ...overrides });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (path, body, options = {}) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), ...options });
    return { status: response.status, headers: response.headers, json: await response.json() };
  };
  const create = async (body = { name: 'Orion night' }) => {
    const made = await request('/api/rooms', body);
    assert.equal(made.status, 201);
    const { roomId, hostKey } = made.json;
    return { ...made.json, call: (action, body) => request('/api/rooms/' + roomId + '/' + action, body),
      moderate: (action, body) => request('/api/rooms/' + roomId + '/' + action, { hostKey, ...body }) };
  };
  return { app, base, request, create, data, calls, fail: method => { failure = method; }, advance: ms => { time += ms; } };
}

test('configuration is validated and the public website is allowed', () => {
  assert.ok(config.origins.includes('https://sky.example.com'));
  assert.throws(() => readConfig({ VOICE_PORT: 'NaN' }), /VOICE_PORT/);
  assert.throws(() => readConfig({ LIVEKIT_URL: 'https://example.com' }), /LIVEKIT_URL/);
  assert.throws(() => readConfig({ PUBLIC_URL: 'file:///tmp' }), /PUBLIC_URL/);
  assert.throws(() => readConfig({ VOICE_TRUST_PROXY: '-1' }), /VOICE_TRUST_PROXY/);
});

test('unconfigured server stays available and refuses room creation', async t => {
  const f = await fixture(t, { config: { ...config, key: '', secret: '' } });
  assert.equal((await f.request('/api/rooms/health')).json.livekit, false);
  assert.equal((await f.request('/api/rooms', { name: 'Orion' })).status, 503);
});

test('creates the provider room with the requested capacity and keeps secrets private', async t => {
  const f = await fixture(t);
  const room = await f.create({ name: '<Orion>', maxParticipants: 7 });
  assert.match(room.roomId, /^[a-f0-9]{8}$/);
  assert.equal(room.hostKey.length, 48);
  assert.equal(room.inviteUrl, 'https://sky.example.com/#room=' + room.roomId);
  assert.deepEqual(f.calls[0], { name: room.roomId, maxParticipants: 7, emptyTimeout: 300 });
  const info = await f.request('/api/rooms/' + room.roomId);
  assert.equal(info.json.name, 'Orion');
  assert.equal(info.json.maxParticipants, 7);
  assert.equal(info.json.hostKey, undefined);
  assert.equal(info.headers.get('cache-control'), 'no-store');
});

test('validates names, capacities and lifetime', async t => {
  const f = await fixture(t);
  for (const body of [{ name: '' }, { name: 'x'.repeat(31) }, { name: {} }, { name: 'Orion', maxParticipants: '10' },
    { name: 'Orion', maxParticipants: 101 }, { name: 'Orion', maxParticipants: 1 },
    { name: 'Orion', ttlHours: -1 }, { name: 'Orion', ttlHours: '12' }]) {
    assert.equal((await f.request('/api/rooms', body)).status, 400);
  }
});

test('issues signed host/listener tokens restricted to microphone and ten minutes', async t => {
  const f = await fixture(t);
  const room = await f.create();
  const listener = await room.call('token', { name: 'Ana' });
  const host = await room.call('token', { name: 'Vega', hostKey: room.hostKey });
  const again = await room.call('token', { name: 'Vega', hostKey: room.hostKey });
  assert.equal(host.json.identity, again.json.identity);
  assert.equal(listener.json.name, 'Orion night');
  assert.equal(listener.json.inviteUrl, room.inviteUrl);
  for (const [response, publish] of [[listener, false], [host, true]]) {
    assert.equal(response.status, 200);
    const claims = await verifier.verify(response.json.token);
    assert.equal(claims.video.room, room.roomId);
    assert.equal(claims.video.roomJoin, true);
    assert.equal(claims.video.canPublish, publish);
    assert.equal(claims.video.canSubscribe, true);
    assert.equal(claims.video.canPublishData, true);
    assert.equal(claims.video.canUpdateMetadata, false);
    assert.deepEqual(claims.video.canPublishSources, ['microphone']);
    assert.ok(claims.exp - claims.nbf <= 600);
    assert.equal(JSON.parse(claims.metadata).role, response.json.role);
  }
  assert.equal((await room.call('token', { name: 'Eve', hostKey: 'wrong' })).status, 403);
  assert.equal((await room.call('token', { name: '' })).status, 400);
  assert.equal((await f.request('/api/rooms/missing/token', { name: 'Ana' })).status, 404);
});

test('provider and HTTP both enforce capacity; reconnecting host keeps identity', async t => {
  const f = await fixture(t);
  const room = await f.create({ name: 'Orion', maxParticipants: 2 });
  const host = (await room.call('token', { name: 'Host', hostKey: room.hostKey })).json;
  f.data.set(room.roomId, [{ identity: host.identity }, { identity: 'u-1' }]);
  assert.equal((await room.call('token', { name: 'Visitor' })).status, 409);
  assert.equal((await room.call('token', { name: 'Host', hostKey: room.hostKey })).status, 200);
  f.data.set(room.roomId, [{ identity: 'u-1' }, { identity: 'u-2' }]);
  assert.equal((await room.call('token', { name: 'Host', hostKey: room.hostKey })).status, 409);
});

test('only the host promotes, demotes and removes participants', async t => {
  const f = await fixture(t);
  const room = await f.create();
  const host = (await room.call('token', { name: 'Host', hostKey: room.hostKey })).json;
  f.data.set(room.roomId, [{ identity: host.identity, permission: { canPublish: true } }, { identity: 'ana' }]);
  assert.equal((await room.call('speakers', { identity: 'ana', allow: true })).status, 403);
  assert.equal((await room.call('kick', { identity: 'ana', hostKey: 'wrong' })).status, 403);
  assert.equal((await room.moderate('speakers', { identity: 'ana', allow: 'true' })).status, 400);
  assert.equal((await room.moderate('speakers', { identity: 'ana', allow: true })).status, 200);
  assert.equal(f.data.get(room.roomId)[1].permission.canPublish, true);
  assert.deepEqual(f.data.get(room.roomId)[1].permission.canPublishSources, [2]);
  assert.equal((await room.moderate('speakers', { identity: 'ana', allow: false })).status, 200);
  assert.equal(f.data.get(room.roomId)[1].permission.canPublish, false);
  assert.equal((await room.moderate('kick', { identity: host.identity })).status, 400);
  assert.equal((await room.moderate('speakers', { identity: host.identity, allow: false })).status, 400);
  assert.equal((await room.moderate('kick', { identity: 'gone' })).status, 404);
  assert.equal((await room.moderate('kick', { identity: 'ana' })).status, 200);
  assert.equal(f.data.get(room.roomId).length, 1);
});

test('concurrent promotions cannot exceed the speaker limit', async t => {
  const f = await fixture(t);
  const room = await f.create();
  f.data.set(room.roomId, Array.from({ length: MAX_SPEAKERS + 1 }, (_, i) =>
    ({ identity: 'u-' + i, permission: { canPublish: i < MAX_SPEAKERS - 1 } })));
  const responses = await Promise.all([MAX_SPEAKERS - 1, MAX_SPEAKERS].map(i =>
    room.moderate('speakers', { identity: 'u-' + i, allow: true })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(f.data.get(room.roomId).filter(p => p.permission.canPublish).length, MAX_SPEAKERS);
});

test('upstream failures return 502, do not issue tokens and do not leak details', async t => {
  const f = await fixture(t);
  f.fail('create');
  assert.equal((await f.request('/api/rooms', { name: 'Broken' })).status, 502);
  assert.equal((await f.request('/api/health')).json.rooms, 0);
  f.fail('');
  const room = await f.create();
  f.fail('list');
  for (const response of [await f.request('/api/rooms/' + room.roomId), await room.call('token', { name: 'Ana' })]) {
    assert.equal(response.status, 502);
    assert.equal(response.json.token, undefined);
    assert.ok(!response.json.error.includes('private'));
  }
});

test('expired rooms refuse joins and moderation; cleanup retries provider failures', async t => {
  const f = await fixture(t);
  const room = await f.create({ name: 'Orion', ttlHours: 1 });
  f.advance(3_600_000);
  assert.equal((await room.call('token', { name: 'Ana' })).status, 410);
  assert.equal((await room.moderate('kick', { identity: 'ana' })).status, 410);
  f.fail('delete');
  await f.app.locals.sweep();
  assert.equal((await f.request('/api/health')).json.rooms, 1);
  f.fail('');
  await f.app.locals.sweep();
  assert.equal((await f.request('/api/health')).json.rooms, 0);
  assert.equal(f.data.has(room.roomId), false);
});

test('rejects disallowed origins before mutation and accepts configured site and VR preflight', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/rooms', { name: 'Blocked' }, { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } });
  assert.equal(response.status, 403);
  assert.equal((await f.request('/api/health')).json.rooms, 0);
  const allowed = await f.request('/api/health', undefined, { headers: { Origin: 'https://sky.example.com' } });
  assert.equal(allowed.status, 200);
  const preflight = await fetch(f.base + '/api/rooms', { method: 'OPTIONS', headers: {
    Origin: 'https://sky.example.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type',
  } });
  assert.equal(preflight.status, 204);
  assert.ok(preflight.headers.get('access-control-allow-methods').includes('POST'));
});

test('malformed and oversized JSON return JSON errors; rate limiting works', async t => {
  const f = await fixture(t);
  for (const body of ['{', JSON.stringify({ name: 'x'.repeat(5000) })]) {
    const response = await f.request('/api/rooms', {}, { body });
    assert.equal(response.status, 400);
    assert.equal(typeof response.json.error, 'string');
  }
  for (let i = 0; i < 120; i++) await f.request('/api/health');
  const response = await f.request('/api/health');
  assert.equal(response.status, 429);
  assert.ok(response.headers.get('retry-after'));
});
