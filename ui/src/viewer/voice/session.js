import { Room, RoomEvent, Track } from 'livekit-client';
import * as api from './api';
import { startCasting, stopCasting, sendSkyTo, receiveSky, startFollowing, stopFollowing, getSkyState } from './skycast';

// One voice voice chat: connection, people, hands, chat. The panel (panel.js) only reads `state` and calls these
// functions; it is told to redraw through subscribe().
//
// Messages on the data channel are JSON with a type `t`:
//   sky       presenter -> all   {l, b, zoom, const, seq}
//   hand      listener -> all    {up}
//   audioState anyone -> all     {deaf}      (the sender's own playback state)
//   chat      anyone -> all      {text}      (300 characters at most)
//   stateReq  late joiner -> all (audio state from everyone, sky state from the host)

export const MAX_CHAT = 300;
const CHAT_HISTORY = 200;
const hostKeyStore = (roomId) => 'spx.voice.host.' + roomId;

export const state = {
  phase: 'lobby',        // lobby | connecting | in
  roomId: '', roomName: '', inviteUrl: '',
  role: 'listener',      // host | listener
  identity: '',
  conn: 'ok',            // ok | reconnecting
  micOn: false,
  wantMic: true,         // chosen before joining: start the microphone as soon as it is allowed
  deaf: false,           // audio off (Discord's "deafen"): nothing is played
  canSpeak: false,       // the server allows this person to publish audio
  audioBlocked: false,   // the browser needs a click before it plays sound
  people: [],            // [{identity, name, role, isLocal, speaker, speaking, muted, deaf, hand, handAt}]
  chat: [],              // [{id, name, text, own, host, ts}]
  error: '',
  notice: '',
  inputDevices: [],      // [{ deviceId, label }]
  outputDevices: [],     // [{ deviceId, label }]
  selectedInputId: '',
  selectedOutputId: '',
};

try {
  state.selectedInputId = localStorage.getItem('spx.voice.inputDevice') || '';
  state.selectedOutputId = localStorage.getItem('spx.voice.outputDevice') || '';
} catch {}

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
let pending = false;
function emit() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; subs.forEach((fn) => fn(state)); });
}

let room = null;
let hostKey = '';
const hands = new Map(); // identity -> time raised
const deafened = new Set(); // remote participant identities with audio turned off
const audioEls = new Map(); // track sid -> <audio>
let audioBox = null;
let lastChatAt = 0;
let chatId = 0;

const roleOf = (p) => { try { return JSON.parse(p.metadata || '{}').role === 'host' ? 'host' : 'listener'; } catch { return 'listener'; } };
const canPublish = (p) => Boolean(p.permissions && p.permissions.canPublish);

function sendData(obj, { reliable = true, to } = {}) {
  if (!room || room.state !== 'connected') return;
  const data = new TextEncoder().encode(JSON.stringify(obj));
  room.localParticipant.publishData(data, { reliable, destinationIdentities: to }).catch(() => {});
}

const sendAudioState = (identity) => sendData({ t: 'audioState', deaf: state.deaf }, { to: identity ? [identity] : undefined });

function refreshPeople() {
  if (!room) return;
  const all = [room.localParticipant, ...room.remoteParticipants.values()];
  state.people = all.map((p) => {
    const role = p.isLocal ? state.role : roleOf(p);
    const mic = p.getTrackPublication(Track.Source.Microphone);
    const deaf = p.isLocal ? state.deaf : deafened.has(p.identity);
    return {
      identity: p.identity,
      name: p.name || 'Guest',
      role,
      isLocal: p.isLocal,
      speaker: role === 'host' || canPublish(p),
      speaking: Boolean(p.isSpeaking),
      muted: deaf || !mic || mic.isMuted,
      deaf,
      hand: hands.has(p.identity),
      handAt: hands.get(p.identity) || 0,
    };
  });
  state.canSpeak = canPublish(room.localParticipant);
  state.micOn = room.localParticipant.isMicrophoneEnabled && !state.deaf;
  emit();
}

function onData(payload, participant) {
  let msg;
  try { msg = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
  if (!msg || typeof msg.t !== 'string' || !participant) return;
  const fromHost = roleOf(participant) === 'host';

  if (msg.t === 'sky') {
    if (fromHost && state.role !== 'host') receiveSky(msg); // only the presenter moves everyone's sky
  } else if (msg.t === 'hand') {
    if (msg.up === true) hands.set(participant.identity, hands.get(participant.identity) || Date.now());
    else hands.delete(participant.identity);
    refreshPeople();
  } else if (msg.t === 'audioState' && typeof msg.deaf === 'boolean') {
    if (msg.deaf) deafened.add(participant.identity);
    else deafened.delete(participant.identity);
    refreshPeople();
  } else if (msg.t === 'chat') {
    const text = String(msg.text ?? '').slice(0, MAX_CHAT).trim();
    if (!text) return;
    pushChat({ name: participant.name || 'Guest', text, own: false, host: fromHost });
  } else if (msg.t === 'stateReq') {
    sendAudioState(participant.identity);
    if (state.role === 'host') sendSkyTo(sendData, participant.identity);
  }
}

function pushChat({ name, text, own, host }) {
  state.chat.push({ id: ++chatId, name, text, own, host, ts: Date.now() });
  if (state.chat.length > CHAT_HISTORY) state.chat.splice(0, state.chat.length - CHAT_HISTORY);
  emit();
}

function attachAudio(track, pub) {
  if (track.kind !== Track.Kind.Audio) return;
  if (!audioBox) {
    audioBox = document.createElement('div');
    audioBox.hidden = true;
    document.body.appendChild(audioBox);
  }
  const el = track.attach();
  el.muted = state.deaf;
  if (state.selectedOutputId && typeof el.setSinkId === 'function') {
    el.setSinkId(state.selectedOutputId).catch(() => {});
  }
  audioBox.appendChild(el);
  audioEls.set(pub.trackSid, el);
}

function detachAudio(track, pub) {
  track.detach().forEach((el) => el.remove());
  audioEls.delete(pub.trackSid);
}

function wire(r) {
  r.on(RoomEvent.ParticipantConnected, (p) => {
    refreshPeople();
    sendAudioState(p.identity);
    if (state.role === 'host' && roleOf(p) !== 'host') sendSkyTo(sendData, p.identity);
  });
  r.on(RoomEvent.ParticipantDisconnected, (p) => { hands.delete(p.identity); deafened.delete(p.identity); refreshPeople(); });
  r.on(RoomEvent.ActiveSpeakersChanged, refreshPeople);
  r.on(RoomEvent.ParticipantMetadataChanged, refreshPeople);
  r.on(RoomEvent.ParticipantNameChanged, refreshPeople);
  r.on(RoomEvent.TrackMuted, refreshPeople);
  r.on(RoomEvent.TrackUnmuted, refreshPeople);
  r.on(RoomEvent.LocalTrackPublished, refreshPeople);
  r.on(RoomEvent.LocalTrackUnpublished, refreshPeople);
  r.on(RoomEvent.TrackSubscribed, (track, pub) => { attachAudio(track, pub); refreshPeople(); });
  r.on(RoomEvent.TrackUnsubscribed, (track, pub) => { detachAudio(track, pub); refreshPeople(); });
  r.on(RoomEvent.DataReceived, onData);
  r.on(RoomEvent.ParticipantPermissionsChanged, (prev, p) => {
    if (p.isLocal) {
      const now = canPublish(p);
      const before = Boolean(prev && prev.canPublish);
      if (now && !before) {
        hands.delete(p.identity);
        sendData({ t: 'hand', up: false });
        state.notice = 'You have the floor.';
        if (state.wantMic && !state.deaf) startMic();
      } else if (!now && before) {
        state.notice = 'Your microphone was turned off by the host.';
      }
    }
    refreshPeople();
  });
  r.on(RoomEvent.Reconnecting, () => { state.conn = 'reconnecting'; emit(); });
  r.on(RoomEvent.Reconnected, () => {
    state.conn = 'ok';
    refreshPeople();
    sendAudioState();
    sendData({ t: 'stateReq' });
  });
  r.on(RoomEvent.AudioPlaybackStatusChanged, () => { state.audioBlocked = !r.canPlaybackAudio; emit(); });
  r.on(RoomEvent.MediaDevicesError, () => { state.error = 'The microphone is not available. Check your browser permission.'; emit(); });
  r.on(RoomEvent.Disconnected, (reason) => {
    if (state.phase !== 'in') return;
    // 1 = client initiated is leave(); anything else was the server (kicked, room closed, network gone for good)
    const kicked = reason !== undefined && reason !== 1;
    teardown();
    state.error = kicked ? 'You left the voice chat (removed by the host, or the connection was lost).' : '';
    emit();
  });
}

function teardown() {
  stopCasting();
  stopFollowing();
  audioEls.forEach((el) => el.remove());
  audioEls.clear();
  hands.clear();
  deafened.clear();
  room = null;
  hostKey = '';
  micBeforeDeaf = false;
  Object.assign(state, {
    phase: 'lobby', roomId: '', roomName: '', inviteUrl: '', role: 'listener', identity: '', conn: 'ok',
    micOn: false, canSpeak: false, audioBlocked: false, people: [], chat: [], notice: '',
  });
}

// ---------------------------------------------------------------------------------------------- public API

function applyPrefs(prefs) {
  state.deaf = prefs.audio === false;
  state.wantMic = prefs.mic !== false && !state.deaf;
}

export const savedHostKey = (roomId) => { try { return localStorage.getItem(hostKeyStore(roomId)) || ''; } catch { return ''; } };

/** Host: make a room, then enter it. */
export async function createAndJoin(title, name, prefs = {}) {
  applyPrefs(prefs);
  state.error = '';
  state.phase = 'connecting';
  emit();
  try {
    const made = await api.createRoom(title);
    try { localStorage.setItem(hostKeyStore(made.roomId), made.hostKey); } catch { /* private mode */ }
    state.inviteUrl = made.inviteUrl;
    await enter(made.roomId, name, made.hostKey, made.name);
  } catch (err) {
    state.phase = 'lobby';
    state.error = err.message || String(err);
    emit();
  }
}

/** Join an existing room (as host again when this browser created it). */
export async function join(roomId, name, prefs = {}) {
  applyPrefs(prefs);
  state.error = '';
  state.phase = 'connecting';
  emit();
  try {
    await enter(roomId.trim(), name, savedHostKey(roomId.trim()), '');
  } catch (err) {
    state.phase = 'lobby';
    state.error = err.message || String(err);
    emit();
  }
}

async function enter(roomId, name, key, roomName) {
  const t = await api.getToken(roomId, name, key);
  hostKey = t.role === 'host' ? key : '';
  const r = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  room = r;
  wire(r);
  Object.assign(state, { role: t.role, identity: t.identity, roomId, roomName: roomName || t.name || roomId,
    inviteUrl: t.inviteUrl || '', conn: 'ok' });
  try {
    await r.connect(t.url, t.token);
  } catch (err) {
    room = null;
    throw new Error('Could not connect to the voice service. ' + (err && err.message ? err.message : ''));
  }
  if (state.selectedInputId && typeof r.switchActiveDevice === 'function') {
    try { await r.switchActiveDevice('audioinput', state.selectedInputId); } catch {}
  }
  if (state.selectedOutputId && typeof r.switchActiveDevice === 'function') {
    try { await r.switchActiveDevice('audiooutput', state.selectedOutputId); } catch {}
  }
  try { await r.startAudio(); } catch { /* needs a click: AudioPlaybackStatusChanged shows the button */ }
  state.audioBlocked = !r.canPlaybackAudio;
  state.phase = 'in';
  sendAudioState();
  sendData({ t: 'stateReq' });
  if (!state.inviteUrl) state.inviteUrl = `${location.origin}${location.pathname}#room=${roomId}`;
  if (t.role === 'host') {
    startCasting(sendData);
    if (state.wantMic && !state.deaf) startMic();
  } else {
    startFollowing();
  }
  loadAudioDevices();
  // Retry the snapshot request for peers still completing their own connection.
  setTimeout(() => { if (room === r) sendData({ t: 'stateReq' }); }, 1500);
  refreshPeople();
}

export async function leave() {
  const r = room;
  state.phase = 'lobby'; // so Disconnected is not reported as being removed
  teardown();
  if (r) await r.disconnect().catch(() => {});
  emit();
}

/** Switch the microphone; shows a clear message when the browser or the device refuses. */
async function micSet(on) {
  if (!room) return;
  try {
    await room.localParticipant.setMicrophoneEnabled(on);
    loadAudioDevices();
  } catch (err) {
    const isHttp = typeof window !== 'undefined' && !window.isSecureContext && location.protocol !== 'https:';
    const denied = err && (err.name === 'NotAllowedError' || /permission|denied/i.test(err.message || ''));
    if (isHttp) {
      state.error = 'Microphone requires HTTPS. Please access the website via HTTPS (https://...).';
    } else if (denied) {
      state.error = 'The browser blocked the microphone. Allow it in the address bar / permissions, then try again.';
    } else {
      state.error = 'The microphone could not be started. Check your audio device selection or permissions.';
    }
  }
  refreshPeople();
}

export async function loadAudioDevices() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.inputDevices = devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label }));
    state.outputDevices = devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label }));
    emit();
  } catch (err) {
    console.warn('Could not enumerate audio devices:', err);
  }
}

export async function switchAudioInput(deviceId) {
  state.selectedInputId = deviceId;
  try { localStorage.setItem('spx.voice.inputDevice', deviceId); } catch {}
  if (room && typeof room.switchActiveDevice === 'function') {
    try {
      await room.switchActiveDevice('audioinput', deviceId);
    } catch (err) {
      console.warn('Failed to switch audio input device:', err);
    }
  }
  emit();
}

export async function switchAudioOutput(deviceId) {
  state.selectedOutputId = deviceId;
  try { localStorage.setItem('spx.voice.outputDevice', deviceId); } catch {}
  if (room && typeof room.switchActiveDevice === 'function') {
    try {
      await room.switchActiveDevice('audiooutput', deviceId);
    } catch (err) {
      console.warn('Failed to switch audio output device:', err);
    }
  }
  audioEls.forEach((el) => {
    if (typeof el.setSinkId === 'function') {
      el.setSinkId(deviceId).catch(() => {});
    }
  });
  emit();
}

export function playTestTone() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.warn('Audio test error:', err);
  }
}

if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    loadAudioDevices();
  });
}
loadAudioDevices();

const startMic = () => { state.error = ''; return micSet(true); };

export async function toggleMic() {
  if (!room || !state.canSpeak) return;
  state.error = '';
  const on = !room.localParticipant.isMicrophoneEnabled;
  state.wantMic = on;
  if (on && state.deaf) setDeaf(false); // unmuting while the audio is off turns it back on, like Discord
  await micSet(on);
}

let micBeforeDeaf = false;

/** Audio off / on. Turning it off also mutes the microphone (and puts it back when the audio returns). */
export function setDeaf(on) {
  if (!room || state.deaf === on) return;
  state.deaf = on;
  audioEls.forEach((el) => { el.muted = on; });
  if (on) {
    micBeforeDeaf = room.localParticipant.isMicrophoneEnabled;
    state.micOn = false; // shown as off right away
    if (micBeforeDeaf) micSet(false);
  } else if (micBeforeDeaf) {
    micBeforeDeaf = false;
    micSet(true);
  }
  sendAudioState();
  refreshPeople();
}
export const toggleDeaf = () => setDeaf(!state.deaf);

export function raiseHand(up) {
  if (!room) return;
  if (up) hands.set(state.identity, Date.now()); else hands.delete(state.identity);
  sendData({ t: 'hand', up });
  refreshPeople();
}

export function sendChat(text) {
  text = String(text).trim().slice(0, MAX_CHAT);
  if (!text || !room) return false;
  if (Date.now() - lastChatAt < 1000) { state.notice = 'One message per second, please.'; emit(); return false; }
  lastChatAt = Date.now();
  sendData({ t: 'chat', text });
  pushChat({ name: 'You', text, own: true, host: state.role === 'host' });
  return true;
}

export async function setSpeaker(identity, allow) {
  state.error = '';
  try {
    await api.setSpeaker(state.roomId, hostKey, identity, allow);
    if (allow) hands.delete(identity);
  } catch (err) {
    state.error = err.message;
  }
  refreshPeople();
}

export async function kickPerson(identity) {
  try {
    await api.kick(state.roomId, hostKey, identity);
  } catch (err) {
    state.error = err.message;
  }
  refreshPeople();
}

export async function enableAudio() {
  if (!room) return;
  await room.startAudio().catch(() => {});
  state.audioBlocked = !room.canPlaybackAudio;
  emit();
}

export const clearMessages = () => { state.error = ''; state.notice = ''; emit(); };
export const presenter = () => state.people.find((p) => p.role === 'host') || null;
export { getSkyState };
