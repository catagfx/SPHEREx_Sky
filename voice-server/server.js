// Voice API for the existing LiveKit frontend. Secrets and moderation stay on the server.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { readConfig } from './config.js';

export const MAX_SPEAKERS = 5;
export const MAX_PARTICIPANTS = 100;
const MAX_ROOMS = 500;
const cleanName = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, '').trim() : '';
const validName = name => name.length >= 1 && name.length <= 30;
const fail = (res, status, error) => res.status(status).json({ error });
const sameKey = (a, b) => {
  if (typeof a !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const log = message => console.log('[voice] ' + message);

export function createApp({ config = readConfig(), livekit, now = Date.now } = {}) {
  const ready = Boolean(config.url && config.key && config.secret);
  const lk = livekit ?? (ready ? new RoomServiceClient(config.url.replace(/^ws/, 'http'), config.key, config.secret) : null);
  const rooms = new Map();
  const locks = new Map();
  const app = express();
  app.set('trust proxy', config.proxyHops);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('Origin');
    const isLocalOrLan = origin && /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);
    if (origin && !isLocalOrLan && !config.origins.includes(origin) && !config.origins.includes('*')) {
      return fail(res, 403, 'This website is not allowed to use the voice server.');
    }
    next();
  });
  app.use(cors());
  app.use(express.json({ limit: '4kb' }));
  const limit = (windowMs, max) => rateLimit({ windowMs, limit: max, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many requests, try again in a moment.' } });
  app.use('/api/', limit(60_000, 120));
  const needLivekit = (req, res, next) => ready ? next() : fail(res, 503, 'Voice is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in voice-server/.env.');
  const loadRoom = (req, res, next) => {
    const room = rooms.get(req.params.roomId);
    if (!room) return fail(res, 404, 'Room not found.');
    if (now() >= room.expiresAt) return fail(res, 410, 'This room has ended.');
    req.room = room;
    next();
  };
  const hostOnly = (req, res, next) => sameKey(req.body?.hostKey, req.room.hostKey) ? next() : fail(res, 403, 'Only the host can do this.');
  const route = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  // Serialize moderation so concurrent promotions cannot exceed MAX_SPEAKERS.
  const locked = fn => route(async (req, res) => {
    const id = req.params.roomId;
    const previous = locks.get(id) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    locks.set(id, current);
    await previous;
    try {
      if (now() >= req.room.expiresAt) return fail(res, 410, 'This room has ended.');
      await fn(req, res);
    } finally {
      release();
      if (locks.get(id) === current) locks.delete(id);
    }
  });
  // Recreate automatically deleted empty rooms with the same capacity on a later join.
  const ensureRoom = (id, room) => lk.createRoom({ name: id, maxParticipants: room.maxParticipants, emptyTimeout: 300 });
  const participantsOf = async id => {
    try { return await lk.listParticipants(id); }
    catch (err) { if (err.code === 'not_found' || err.status === 404) return []; throw err; }
  };
  const permissions = allow => ({ canSubscribe: true, canPublish: allow, canPublishData: true,
    canPublishSources: [TrackSource.MICROPHONE], canUpdateMetadata: false });

  app.get(['/api/health', '/api/rooms/health'], (req, res) => res.json({ ok: true, livekit: ready, rooms: rooms.size }));
  app.post('/api/rooms', limit(3_600_000, 30), needLivekit, route(async (req, res) => {
    const name = cleanName(req.body?.name);
    if (!validName(name)) return fail(res, 400, 'The room name must be 1 to 30 characters.');
    const max = req.body?.maxParticipants ?? MAX_PARTICIPANTS;
    const hours = req.body?.ttlHours ?? 12;
    if (!Number.isInteger(max) || max < 2 || max > MAX_PARTICIPANTS) return fail(res, 400, 'maxParticipants must be an integer from 2 to 100.');
    if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 1 || hours > 48) return fail(res, 400, 'ttlHours must be between 1 and 48.');
    if (rooms.size >= MAX_ROOMS) return fail(res, 503, 'The server has too many open rooms. Try again later.');
    let roomId;
    do { roomId = crypto.randomBytes(4).toString('hex'); } while (rooms.has(roomId));
    const room = { name, hostKey: crypto.randomBytes(24).toString('hex'), maxParticipants: max,
      hostIdentity: 'host-' + crypto.randomBytes(8).toString('hex'), expiresAt: now() + hours * 3_600_000 };
    rooms.set(roomId, room);
    try { await ensureRoom(roomId, room); }
    catch (err) { rooms.delete(roomId); throw err; }
    log('room created ' + roomId);
    res.status(201).json({ roomId, hostKey: room.hostKey, inviteUrl: config.publicUrl + '/#room=' + roomId, name, maxParticipants: max });
  }));
  app.get('/api/rooms/:roomId', loadRoom, needLivekit, route(async (req, res) => {
    const people = await participantsOf(req.params.roomId);
    res.json({ roomId: req.params.roomId, name: req.room.name, participants: people.length,
      maxParticipants: req.room.maxParticipants, expiresAt: req.room.expiresAt });
  }));
  app.post('/api/rooms/:roomId/token', limit(60_000, 40), loadRoom, needLivekit, route(async (req, res) => {
    const name = cleanName(req.body?.name);
    if (!validName(name)) return fail(res, 400, 'Your name must be 1 to 30 characters.');
    const key = req.body?.hostKey;
    const hasKey = key !== undefined && key !== null && key !== '';
    if (hasKey && !sameKey(key, req.room.hostKey)) return fail(res, 403, 'The host key is not valid for this room.');
    const role = hasKey ? 'host' : 'listener';
    await ensureRoom(req.params.roomId, req.room);
    const people = await participantsOf(req.params.roomId);
    const identity = hasKey ? req.room.hostIdentity : 'u-' + crypto.randomBytes(10).toString('hex');
    if (people.filter(p => p.identity !== identity).length >= req.room.maxParticipants) return fail(res, 409, 'This room is full.');
    const ttl = Math.min(600, Math.floor((req.room.expiresAt - now()) / 1000));
    if (ttl <= 0) return fail(res, 410, 'This room has ended.');
    const token = new AccessToken(config.key, config.secret, { identity, name, ttl, metadata: JSON.stringify({ role }) });
    token.addGrant({ roomJoin: true, room: req.params.roomId, ...permissions(hasKey) });
    res.json({ token: await token.toJwt(), url: config.url, role, identity, name: req.room.name,
      inviteUrl: config.publicUrl + '/#room=' + req.params.roomId });
  }));
  const targetOf = async (req, res) => {
    const identity = req.body?.identity;
    if (typeof identity !== 'string' || !identity || identity.length > 64) { fail(res, 400, 'Missing participant.'); return null; }
    const people = await lk.listParticipants(req.params.roomId);
    const target = people.find(p => p.identity === identity);
    if (!target) { fail(res, 404, 'That participant is no longer in the room.'); return null; }
    if (identity === req.room.hostIdentity) { fail(res, 400, 'The host cannot be moderated.'); return null; }
    return { target, people };
  };
  app.post('/api/rooms/:roomId/speakers', limit(60_000, 60), loadRoom, hostOnly, needLivekit, locked(async (req, res) => {
    if (typeof req.body?.allow !== 'boolean') return fail(res, 400, 'allow must be a boolean.');
    const result = await targetOf(req, res);
    if (!result) return;
    const { target, people } = result;
    const speakers = people.filter(p => p.identity !== req.room.hostIdentity && p.identity !== target.identity && p.permission?.canPublish).length;
    if (req.body.allow && speakers >= MAX_SPEAKERS) return fail(res, 409, 'At most ' + MAX_SPEAKERS + ' people can speak at once.');
    await lk.updateParticipant(req.params.roomId, target.identity, undefined, permissions(req.body.allow));
    res.json({ ok: true });
  }));
  app.post('/api/rooms/:roomId/kick', limit(60_000, 60), loadRoom, hostOnly, needLivekit, locked(async (req, res) => {
    const result = await targetOf(req, res);
    if (!result) return;
    await lk.removeParticipant(req.params.roomId, result.target.identity);
    res.json({ ok: true });
  }));
  app.use('/api', (req, res) => fail(res, 404, 'Not found.'));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return fail(res, 400, 'Invalid request.');
    // SDK errors may contain credentials or participant data.
    log('voice service request failed');
    fail(res, 502, 'The voice service did not answer. Check the server configuration and try again.');
  });
  app.locals.sweep = async () => {
    for (const [id, room] of rooms) {
      if (now() < room.expiresAt || locks.has(id)) continue;
      try { await lk?.deleteRoom(id); rooms.delete(id); log('room closed ' + id); }
      catch (err) {
        if (err.code === 'not_found' || err.status === 404) rooms.delete(id);
        else log('room cleanup will retry ' + id);
      }
    }
  };
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const config = readConfig();
  if (!config.url || !config.key || !config.secret) console.warn('[voice] Set LIVEKIT_* in voice-server/.env to enable voice.');
  const app = createApp({ config });
  let sweeping = false;
  const timer = setInterval(async () => {
    if (sweeping) return;
    sweeping = true;
    try { await app.locals.sweep(); } finally { sweeping = false; }
  }, 60_000);
  timer.unref();
  const server = app.listen(config.port, () => log('listening on :' + config.port));
  const stop = () => { clearInterval(timer); server.close(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
