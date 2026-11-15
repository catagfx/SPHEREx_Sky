import { $ } from '../dom';
import { prefersReducedMotion } from '../../core/env';
import { showToast } from '../ui/toast';
import * as S from './session';
import { isFollowing, watchFollow, resumeFollowing } from './skycast';

// The seminar panel: lobby (join / host), then the room (stage, people, chat, hands, controls).
// It is built once; session.js says when to redraw. All text goes in with textContent (names and chat come from
// other people), never innerHTML.

const ICONS = {
  mic: '<path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>',
  micOff: '<path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M19 11a7 7 0 0 1-1.1 3.8M5 11a7 7 0 0 0 11 5.7M12 18v3"/>',
  hand: '<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 15.5a1.5 1.5 0 0 1 2.4-1.7L8 16"/>',
  leave: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  min: '<path d="M5 12h14"/>',
  max: '<path d="M4 14l8-8 8 8"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  sky: '<circle cx="12" cy="12" r="9"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M3 12h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  kick: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 8l5 5M22 8l-5 5"/>',
  head: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  headOff: '<path d="M3 3l18 18M3 18v-6a9 9 0 0 1 14.5-7.1M21 12v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  vol: '<path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};
const svg = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/** Tiny element builder. Strings are text, never HTML. */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'icon') el.innerHTML = svg(v, props.size || 18); // fixed strings from ICONS only
    else if (k === 'size') continue;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== undefined && kid !== null && kid !== false) el.append(kid);
  return el;
}

const hue = (s) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
function avatar(person, big) {
  const a = h('span', { class: 'vc-av' + (big ? ' big' : '') }, (person.name || '?').trim().charAt(0).toUpperCase() || '?');
  a.style.setProperty('--h', hue(person.identity || person.name));
  return a;
}
const eq = () => h('span', { class: 'vc-eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
const deafIcon = (size = 15, className = 'vc-muted-ico') => h('span', {
  class: className + ' vc-deaf-ico', icon: 'headOff', size, role: 'img', 'aria-label': 'Deafened', title: 'Deafened',
});

let root = null;
let ui = {};
let minimized = false;
let tab = 'people';
let unread = 0;
let lobbyMode = 'join';
const prefs = { mic: true, audio: true }; // chosen in the lobby, like Discord: with the microphone, with the audio, or neither
try { Object.assign(prefs, JSON.parse(localStorage.getItem('spx.voice.prefs') || '{}')); } catch { /* ignore */ }

const rows = new Map();   // identity -> row element
const drawnChat = new Set();

// ------------------------------------------------------------------------------------------------ building

function buildLobby() {
  const nameInput = h('input', { class: 'vc-input', id: 'vcName', placeholder: 'Your name', maxlength: '30', autocomplete: 'nickname' });
  try { nameInput.value = localStorage.getItem('spx.voice.name') || ''; } catch { /* ignore */ }
  const codeInput = h('input', { class: 'vc-input', id: 'vcCode', placeholder: 'Room code (e.g. a3f09c1e)', maxlength: '40', autocomplete: 'off', spellcheck: 'false' });
  const titleInput = h('input', { class: 'vc-input', id: 'vcTitle', placeholder: 'Room name (max 30)', maxlength: '30', autocomplete: 'off' });
  const go = h('button', { class: 'vc-btn primary wide', type: 'submit' }, 'Join voice chat');
  const err = h('p', { class: 'vc-error', role: 'alert', hidden: true });

  const tabs = h('div', { class: 'vc-seg', role: 'tablist' },
    h('button', { type: 'button', role: 'tab', 'data-m': 'join', onclick: () => setLobbyMode('join') }, 'Join'),
    h('button', { type: 'button', role: 'tab', 'data-m': 'host', onclick: () => setLobbyMode('host') }, 'Host'));

  ui.prefs = h('div', { class: 'vc-prefs' }, prefToggle('mic'), prefToggle('audio'));

  ui.lobbyInputSelect = h('select', { class: 'vc-select', id: 'vcLobbyInputSelect', onchange: (e) => S.switchAudioInput(e.target.value) });
  ui.lobbyOutputSelect = h('select', { class: 'vc-select', id: 'vcLobbyOutputSelect', onchange: (e) => S.switchAudioOutput(e.target.value) });
  const lobbyDevices = h('details', { class: 'vc-lobby-details' },
    h('summary', { class: 'vc-lobby-summary' }, h('span', { icon: 'settings', size: 14 }), 'Audio Devices (Mic & Speaker)'),
    h('div', { class: 'vc-device-group' },
      h('label', { class: 'vc-device-label' }, h('span', { icon: 'mic', size: 13 }), 'Microphone (Input)'),
      ui.lobbyInputSelect
    ),
    h('div', { class: 'vc-device-group' },
      h('label', { class: 'vc-device-label' }, h('span', { icon: 'head', size: 13 }), 'Speaker / Output'),
      ui.lobbyOutputSelect,
      h('button', { class: 'vc-test-btn', type: 'button', onclick: () => S.playTestTone() }, h('span', { icon: 'vol', size: 13 }), 'Test speaker')
    )
  );

  const form = h('form', { class: 'vc-form', onsubmit: (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return showLobbyError('Please enter your name.'); }
    try { localStorage.setItem('spx.voice.name', name); } catch { /* ignore */ }
    if (lobbyMode === 'host') {
      const title = titleInput.value.trim();
      if (!title) { titleInput.focus(); return showLobbyError('Give the room a name.'); }
      S.createAndJoin(title, name, prefs);
    } else {
      const code = codeInput.value.trim().replace(/^.*room=/, '');
      if (!code) { codeInput.focus(); return showLobbyError('Enter the room code, or open the invite link.'); }
      S.join(code, name, prefs);
    }
  } },
  h('label', { class: 'vc-field', for: 'vcName' }, h('span', {}, 'Your name'), nameInput),
  h('label', { class: 'vc-field join-only', for: 'vcCode' }, h('span', {}, 'Room code'), codeInput),
  h('label', { class: 'vc-field host-only', for: 'vcTitle' }, h('span', {}, 'Room name'), titleInput),
  ui.prefs, lobbyDevices, go, err);

  ui.lobby = h('div', { class: 'vc-lobby' },
    tabs, form);
  ui.name = nameInput; ui.code = codeInput; ui.title = titleInput; ui.go = go; ui.lobbyErr = err; ui.segs = tabs;
}

/** Lobby switch for the microphone / the audio. */
function prefToggle(kind) {
  const b = h('button', { class: 'vc-pref', type: 'button', 'data-k': kind, onclick: () => {
    prefs[kind] = !prefs[kind];
    if (kind === 'audio' && !prefs.audio) prefs.mic = false; // no audio also means no microphone
    if (kind === 'mic' && prefs.mic) prefs.audio = true;
    try { localStorage.setItem('spx.voice.prefs', JSON.stringify(prefs)); } catch { /* ignore */ }
    drawPrefs();
  } });
  b.setAttribute('aria-label', kind === 'mic' ? 'Microphone' : 'Audio');
  return b;
}

function drawPrefs() {
  ui.prefs.querySelectorAll('.vc-pref').forEach((b) => {
    const k = b.dataset.k;
    const on = prefs[k];
    b.setAttribute('aria-pressed', String(on));
    b.replaceChildren(h('span', { icon: k === 'mic' ? (on ? 'mic' : 'micOff') : (on ? 'head' : 'headOff'), size: 22 }), h('span', {}, k === 'mic' ? 'Microphone' : 'Audio'));
  });
}

function setLobbyMode(m) {
  lobbyMode = m;
  ui.lobby.dataset.mode = m;
  ui.segs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.m === m));
  ui.go.textContent = m === 'host' ? 'Create and start' : 'Join voice chat';
  showLobbyError('');
  drawPrefs();
}

function showLobbyError(text) {
  ui.lobbyErr.textContent = text;
  ui.lobbyErr.hidden = !text;
}

function buildRoom() {
  ui.roomTitle = h('h2', { class: 'vc-room-title' });
  ui.count = h('span', { class: 'vc-count' });
  ui.stageName = h('strong', { class: 'vc-stage-name' });
  ui.stageAv = h('div', { class: 'vc-stage-av' });
  ui.speakers = h('div', { class: 'vc-speakers' });
  ui.banner = h('div', { class: 'vc-banner', role: 'status', hidden: true });
  ui.follow = h('button', { class: 'vc-follow', type: 'button', hidden: true, onclick: () => { resumeFollowing(); renderFollow(); } },
    h('span', { icon: 'sky', size: 15 }), h('span', { class: 'vc-follow-text' }));

  const stage = h('div', { class: 'vc-stage' },
    ui.stageAv,
    h('div', { class: 'vc-stage-text' }, h('span', { class: 'vc-eyebrow' }, 'Presenter'), ui.stageName),
    eq());
  ui.stage = stage;

  ui.tabPeople = h('button', { class: 'vc-tab', type: 'button', role: 'tab', 'data-t': 'people', onclick: () => setTab('people') }, 'People ', h('b', { class: 'vc-n' }));
  ui.tabChat = h('button', { class: 'vc-tab', type: 'button', role: 'tab', 'data-t': 'chat', onclick: () => setTab('chat') }, 'Chat ', h('b', { class: 'vc-n vc-unread', hidden: true }));
  ui.tabHands = h('button', { class: 'vc-tab', type: 'button', role: 'tab', 'data-t': 'hands', onclick: () => setTab('hands') }, 'Hands ', h('b', { class: 'vc-n' }));
  ui.tabDevices = h('button', { class: 'vc-tab', type: 'button', role: 'tab', 'data-t': 'devices', onclick: () => setTab('devices') }, 'Devices');

  ui.peopleList = h('ul', { class: 'vc-list', 'aria-label': 'People in the room' });
  ui.handsList = h('ul', { class: 'vc-list', 'aria-label': 'Raised hands' });
  ui.chatLog = h('ol', { class: 'vc-chatlog', 'aria-live': 'polite' });
  ui.chatInput = h('input', { class: 'vc-input', placeholder: 'Message (300 characters)', maxlength: '300', autocomplete: 'off', 'aria-label': 'Chat message' });
  const chatForm = h('form', { class: 'vc-chatform', onsubmit: (e) => { e.preventDefault(); if (S.sendChat(ui.chatInput.value)) ui.chatInput.value = ''; } },
    ui.chatInput, h('button', { class: 'vc-icon-btn send', type: 'submit', 'aria-label': 'Send', icon: 'send', size: 17 }));

  ui.roomInputSelect = h('select', { class: 'vc-select', id: 'vcRoomInputSelect', onchange: (e) => S.switchAudioInput(e.target.value) });
  ui.roomOutputSelect = h('select', { class: 'vc-select', id: 'vcRoomOutputSelect', onchange: (e) => S.switchAudioOutput(e.target.value) });
  ui.paneDevices = h('div', { class: 'vc-pane devices', 'data-t': 'devices' },
    h('div', { class: 'vc-device-group' },
      h('label', { class: 'vc-device-label', for: 'vcRoomInputSelect' }, h('span', { icon: 'mic', size: 13 }), 'Microphone (Input)'),
      ui.roomInputSelect
    ),
    h('div', { class: 'vc-device-group' },
      h('label', { class: 'vc-device-label', for: 'vcRoomOutputSelect' }, h('span', { icon: 'head', size: 13 }), 'Speakers / Headphones (Output)'),
      ui.roomOutputSelect,
      h('button', { class: 'vc-test-btn', type: 'button', onclick: () => S.playTestTone() }, h('span', { icon: 'vol', size: 13 }), 'Test sound')
    ),
    h('p', { class: 'vc-device-note' }, 'Note: In VR headsets or mobile browsers, sound routes through the headset.')
  );

  ui.panePeople = h('div', { class: 'vc-pane', 'data-t': 'people' }, ui.peopleList);
  ui.paneChat = h('div', { class: 'vc-pane chat', 'data-t': 'chat' }, ui.chatLog, chatForm);
  ui.paneHands = h('div', { class: 'vc-pane', 'data-t': 'hands' }, ui.handsList);

  ui.mic = h('button', { class: 'vc-ctl', type: 'button', onclick: () => S.toggleMic() });
  ui.deaf = h('button', { class: 'vc-ctl', type: 'button', onclick: () => S.toggleDeaf() });
  ui.hand = h('button', { class: 'vc-ctl', type: 'button', onclick: () => S.raiseHand(!isHandUp()) });
  ui.audio = h('button', { class: 'vc-btn warn wide', type: 'button', hidden: true, onclick: () => S.enableAudio() }, 'Tap to enable sound');
  ui.leave = h('button', { class: 'vc-ctl leave', type: 'button', onclick: () => S.leave() });

  ui.invite = h('button', { class: 'vc-icon-btn', type: 'button', title: 'Copy invite link', 'aria-label': 'Copy invite link', icon: 'copy', size: 16, onclick: copyInvite });

  ui.room = h('div', { class: 'vc-room' },
    h('div', { class: 'vc-room-head' },
      h('span', { class: 'vc-live' }, h('i'), 'LIVE'),
      h('div', { class: 'vc-room-id' }, ui.roomTitle, ui.count),
      ui.invite),
    ui.banner, ui.audio,
    stage, ui.speakers, ui.follow,
    h('div', { class: 'vc-tabs', role: 'tablist' }, ui.tabPeople, ui.tabChat, ui.tabHands, ui.tabDevices),
    h('div', { class: 'vc-panes' }, ui.panePeople, ui.paneChat, ui.paneHands, ui.paneDevices),
    h('div', { class: 'vc-controls' }, ui.mic, ui.deaf, ui.hand, ui.leave));
}

function buildMini() {
  ui.miniText = h('span', { class: 'vc-mini-text' });
  ui.miniMic = h('button', { class: 'vc-icon-btn', type: 'button', 'aria-label': 'Microphone', onclick: () => S.toggleMic() });
  ui.mini = h('div', { class: 'vc-mini' }, h('span', { class: 'vc-live' }, h('i'), 'LIVE'), ui.miniText, ui.miniMic,
    h('button', { class: 'vc-icon-btn', type: 'button', 'aria-label': 'Expand', icon: 'max', size: 16, onclick: () => setMinimized(false) }));
}

function build() {
  buildLobby();
  buildRoom();
  buildMini();
  ui.loading = h('div', { class: 'vc-loading' }, h('span', { class: 'vc-spinner' }), h('p', {}, 'Connecting…'));
  ui.msg = h('p', { class: 'vc-toastline', role: 'status', hidden: true });

  ui.closeBtn = h('button', { class: 'vc-icon-btn', type: 'button', 'aria-label': 'Close panel', icon: 'x', size: 16, onclick: closePanel });
  ui.minBtn = h('button', { class: 'vc-icon-btn', type: 'button', 'aria-label': 'Minimise', icon: 'min', size: 16, onclick: () => setMinimized(true) });
  const bar = h('div', { class: 'vc-bar' }, h('span', { class: 'vc-bar-gap' }), h('span', { class: 'vc-bar-title' }, 'Voice chat'), h('span', { class: 'vc-bar-btns' }, ui.minBtn, ui.closeBtn));

  root = h('aside', { id: 'voicePanel', class: 'vc', hidden: true, 'aria-label': 'Voice chat' }, bar, ui.msg, ui.lobby, ui.loading, ui.room, ui.mini);
  document.body.append(root);
  setLobbyMode('join');
}

// ------------------------------------------------------------------------------------------------ actions

const isHandUp = () => S.state.people.some((p) => p.isLocal && p.hand);

function copyInvite() {
  const url = S.state.inviteUrl;
  const done = () => showToast('Invite link copied');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(() => prompt('Copy the invite link:', url));
  else prompt('Copy the invite link:', url);
}

function setTab(t) {
  tab = t;
  if (t === 'chat') { unread = 0; }
  renderTabs();
  if (t === 'chat') ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
}

function setMinimized(on) {
  minimized = on;
  root.classList.toggle('min', on);
  render(S.state);
}

export function openPanel() {
  root.hidden = false;
  root.classList.add('open');
  const btn = $('#voiceBtn');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  if (S.state.phase === 'lobby') (lobbyMode === 'host' ? ui.title : ui.name.value ? ui.code : ui.name).focus({ preventScroll: true });
}

export function closePanel() {
  root.hidden = true;
  const btn = $('#voiceBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

export const togglePanel = () => (root.hidden ? openPanel() : closePanel());

/** Open the join form with a code (invite links: #room=ID). */
export function openJoin(code) {
  setLobbyMode('join');
  ui.code.value = code;
  openPanel();
}

// ------------------------------------------------------------------------------------------------ drawing

function renderTabs() {
  const host = S.state.role === 'host';
  ui.tabHands.hidden = !host;
  if (!host && tab === 'hands') tab = 'people';
  for (const b of [ui.tabPeople, ui.tabChat, ui.tabHands, ui.tabDevices]) {
    if (b) b.setAttribute('aria-selected', String(b.dataset.t === tab));
  }
  for (const p of [ui.panePeople, ui.paneChat, ui.paneHands, ui.paneDevices]) {
    if (p) p.hidden = p.dataset.t !== tab;
  }
  const u = ui.tabChat.querySelector('.vc-unread');
  u.hidden = unread === 0 || tab === 'chat';
  u.textContent = unread > 9 ? '9+' : String(unread);
}

function renderDevices(st) {
  const inputs = st.inputDevices || [];
  const outputs = st.outputDevices || [];
  const selIn = st.selectedInputId;
  const selOut = st.selectedOutputId;

  const populate = (select, list, selectedId, defaultLabel) => {
    if (!select) return;
    const currentVal = select.value || selectedId;
    select.replaceChildren();
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = defaultLabel;
      select.appendChild(opt);
      return;
    }
    list.forEach((dev, idx) => {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      opt.textContent = dev.label || `${defaultLabel} ${idx + 1}`;
      if (dev.deviceId === currentVal || (!currentVal && idx === 0)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  };

  populate(ui.lobbyInputSelect, inputs, selIn, 'Default Microphone');
  populate(ui.roomInputSelect, inputs, selIn, 'Default Microphone');
  populate(ui.lobbyOutputSelect, outputs, selOut, 'Default Output');
  populate(ui.roomOutputSelect, outputs, selOut, 'Default Output');
}

function renderStage(people) {
  const pres = people.find((p) => p.role === 'host');
  ui.stage.classList.toggle('speaking', Boolean(pres && pres.speaking && !pres.muted));
  ui.stage.classList.toggle('empty', !pres);
  ui.stageAv.replaceChildren(pres ? avatar(pres, true) : h('span', { class: 'vc-av big ghost' }, '?'));
  ui.stageName.textContent = pres ? (pres.isLocal ? pres.name + ' (you)' : pres.name) : 'Waiting for the host…';

  const talkers = people.filter((p) => p.role !== 'host' && p.speaker);
  ui.speakers.hidden = talkers.length === 0;
  ui.speakers.replaceChildren(...talkers.map((p) => h('span', { class: 'vc-chip' + (p.speaking && !p.muted ? ' speaking' : '') }, avatar(p), h('span', { class: 'vc-chip-name' }, p.isLocal ? 'You' : p.name), p.muted ? h('span', { icon: 'micOff', size: 13, class: 'vc-chip-mute' }) : eq(), p.deaf ? deafIcon(13, 'vc-chip-mute') : null)));
}

function personRow(p, host) {
  let row = rows.get(p.identity);
  if (!row) {
    row = h('li', { class: 'vc-row' });
    rows.set(p.identity, row);
  }
  row.className = 'vc-row' + (p.speaking && !p.muted ? ' speaking' : '') + (p.hand ? ' hand' : '') + (p.isLocal ? ' me' : '');
  const tag = p.role === 'host' ? h('span', { class: 'vc-tag host' }, 'Host') : p.speaker ? h('span', { class: 'vc-tag speaker' }, 'Speaker') : null;
  const kids = [avatar(p), h('span', { class: 'vc-row-name' }, p.name + (p.isLocal ? ' (you)' : ''), tag), p.hand ? h('span', { class: 'vc-hand-ico', icon: 'hand', size: 16, title: 'Hand raised' }) : null];
  if (p.speaker) kids.push(p.muted ? h('span', { class: 'vc-muted-ico', icon: 'micOff', size: 15 }) : eq());
  if (p.deaf) kids.push(deafIcon());
  if (host && !p.isLocal && p.role !== 'host') {
    kids.push(h('span', { class: 'vc-actions' },
      h('button', { class: 'vc-mini-btn' + (p.speaker ? ' off' : ' on'), type: 'button', title: p.speaker ? 'Take the floor back' : 'Give the floor', onclick: () => S.setSpeaker(p.identity, !p.speaker) }, p.speaker ? 'Mute' : 'Give floor'),
      h('button', { class: 'vc-icon-btn danger', type: 'button', title: 'Remove from room', 'aria-label': 'Remove ' + p.name, icon: 'kick', size: 15, onclick: () => { if (confirm('Remove ' + p.name + ' from the room?')) S.kickPerson(p.identity); } })));
  }
  row.replaceChildren(...kids.filter(Boolean));
  return row;
}

function syncList(list, items) {
  const keep = new Set(items);
  [...list.children].forEach((c) => { if (!keep.has(c)) c.remove(); });
  items.forEach((el, i) => { if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null); });
}

function renderPeople(people) {
  const host = S.state.role === 'host';
  const order = [...people].sort((a, b) => (b.role === 'host') - (a.role === 'host') || b.speaker - a.speaker || b.hand - a.hand || a.name.localeCompare(b.name));
  const live = new Set(people.map((p) => p.identity));
  for (const id of rows.keys()) if (!live.has(id)) rows.delete(id);
  syncList(ui.peopleList, order.map((p) => personRow(p, host)));
  ui.tabPeople.querySelector('.vc-n').textContent = String(people.length);
  ui.count.textContent = people.length + (people.length === 1 ? ' person' : ' people');

  const raised = people.filter((p) => p.hand).sort((a, b) => a.handAt - b.handAt);
  ui.tabHands.querySelector('.vc-n').textContent = String(raised.length);
  ui.tabHands.classList.toggle('alert', raised.length > 0);
  ui.handsList.replaceChildren(...(raised.length ? raised.map((p) => h('li', { class: 'vc-row hand' }, avatar(p), h('span', { class: 'vc-row-name' }, p.name), h('button', { class: 'vc-mini-btn on', type: 'button', onclick: () => S.setSpeaker(p.identity, true) }, 'Give floor'))) : [h('li', { class: 'vc-empty' }, 'No raised hands.')]));
}

function renderChat(chat) {
  for (const m of chat) {
    if (drawnChat.has(m.id)) continue;
    drawnChat.add(m.id);
    const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    ui.chatLog.append(h('li', { class: 'vc-msg' + (m.own ? ' own' : '') }, h('div', { class: 'vc-msg-meta' }, h('b', {}, m.name), m.host ? h('span', { class: 'vc-tag host' }, 'Host') : null, h('time', {}, time)), h('p', {}, m.text)));
    if (!m.own && (tab !== 'chat' || root.classList.contains('min'))) unread++;
  }
  while (ui.chatLog.children.length > 200) ui.chatLog.firstChild.remove();
  if (tab === 'chat') {
    unread = 0;
    ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
  }
}

function renderFollow() {
  const isHost = S.state.role === 'host';
  const live = S.state.phase === 'in';
  const on = isFollowing();
  ui.follow.hidden = !live || isHost || on;
  ui.follow.classList.toggle('on', on);
  ui.follow.disabled = on;
  ui.follow.querySelector('.vc-follow-text').textContent = 'Back to presenter';
}

function ctl(btn, icon, label, state) {
  btn.replaceChildren(h('span', { icon, size: 22 }));
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.classList.toggle('on', state === 'on');
  btn.classList.toggle('off', state === 'off');
}

function renderControls(st) {
  const host = st.role === 'host';
  const me = st.people.find((p) => p.isLocal);
  const speaker = st.canSpeak || host;
  const micLive = st.micOn && !st.deaf;
  ctl(ui.mic, micLive ? 'mic' : 'micOff', micLive ? 'Mute' : speaker ? 'Unmute' : 'The host has to give you the floor', micLive ? 'on' : 'off');
  ui.mic.disabled = !speaker;
  ctl(ui.deaf, st.deaf ? 'headOff' : 'head', st.deaf ? 'Turn audio on' : 'Turn audio off', st.deaf ? 'off' : '');
  ui.hand.hidden = speaker;
  const up = Boolean(me && me.hand);
  ctl(ui.hand, 'hand', up ? 'Lower hand' : 'Raise hand', up ? 'on' : '');
  ctl(ui.leave, 'leave', 'Leave', '');
  ui.audio.hidden = !st.audioBlocked || st.deaf;
}

function renderBanner(st) {
  let text = '';
  let kind = '';
  if (st.conn === 'reconnecting') { text = 'Connection lost, reconnecting…'; kind = 'warn'; }
  else if (st.error) { text = st.error; kind = 'err'; }
  else if (st.notice) { text = st.notice; kind = 'ok'; }
  ui.banner.hidden = !text;
  ui.banner.className = 'vc-banner ' + kind;
  ui.banner.textContent = text;
  if (text && kind !== 'warn') {
    clearTimeout(renderBanner.t);
    renderBanner.t = setTimeout(() => S.clearMessages(), 6000);
  }
}

function renderMini(st) {
  const pres = st.people.find((p) => p.role === 'host');
  const talking = st.people.find((p) => p.speaking && !p.muted);
  ui.miniText.textContent = talking ? talking.name + ' is speaking' : pres ? pres.name : st.roomName;
  const speaker = st.canSpeak || st.role === 'host';
  ui.miniMic.disabled = !speaker;
  ui.miniMic.innerHTML = svg(st.micOn ? 'mic' : 'micOff', 16);
  ui.miniMic.classList.toggle('on', st.micOn);
}

function render(st) {
  const phase = st.phase;
  renderDevices(st);
  ui.lobby.hidden = phase !== 'lobby';
  ui.loading.hidden = phase !== 'connecting';
  const inRoom = phase === 'in';
  ui.room.hidden = !inRoom || minimized;
  ui.mini.hidden = !inRoom || !minimized;
  root.classList.toggle('in-room', inRoom);
  ui.minBtn.hidden = !inRoom;
  ui.msg.hidden = true;

  const btn = $('#voiceBtn');
  if (btn) {
    btn.classList.toggle('live', inRoom);
    const cnt = btn.querySelector('.vc-fab-cnt');
    if (cnt) { cnt.hidden = !inRoom; cnt.textContent = String(st.people.length); }
  }

  if (phase === 'lobby') {
    showLobbyError(st.error);
    ui.go.disabled = false;
    return;
  }
  if (phase === 'connecting') return;

  ui.roomTitle.textContent = st.roomName;
  ui.invite.hidden = !st.inviteUrl;
  renderStage(st.people);
  renderPeople(st.people);
  renderChat(st.chat);
  renderControls(st);
  renderBanner(st);
  renderTabs();
  renderFollow();
  renderMini(st);
}

export function initPanel() {
  build();
  S.subscribe(render);
  watchFollow(renderFollow);
  render(S.state);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden && e.target.closest && e.target.closest('#voicePanel')) closePanel();
  });
}
