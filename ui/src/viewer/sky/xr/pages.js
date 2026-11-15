import { $ } from '../../dom';
import { LANDMARKS, CONSTELLATIONS, FIELD, COLORS, ABOUT } from '../../../data';
import { radecToGal, findClosestTarget } from '../coords';
import { getShareUrl } from '../../panels/share';
import * as V from '../../voice/session';
import { explorePanelBody, spherexDataPanel } from './content';
import scientific from '../../../data/scientific_resources.json';
import benchmarkCards from '../../../data/benchmark-cards.json';

// The pages of the VR menu: every tool of the web page, as holographic panels.
//   Explore ▸ landmarks, constellations, guided tour, story        Science ▸ Planet X, time-domain, gallery, spectroscopy
//   Star map, Search RA/Dec, Tools & layers (grid, compare, constellation lines, auto-orbit), Data, Share, Voice chat, About
// Buttons carry string ids; handle(id) routes them. The pages only describe content: index.js owns the panels,
// the travel animation and the hands, and passes them in through `ctx`.

const hasSpeech = () => 'speechSynthesis' in window;
const BACK = { type: 'button', id: 'back', label: '← Back', variant: 'secondary' };
const HOME = { type: 'button', id: 'go:home', label: 'Main menu', variant: 'secondary' };
const wrap = (n, len) => ((n % len) + len) % len;
const hms = (deg) => {
  const h = deg / 15;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ss = Math.round(((h - hh) * 60 - mm) * 60);
  return `${hh}h ${String(mm).padStart(2, '0')}m ${String(ss % 60).padStart(2, '0')}s`;
};

const TOUR = [
  { t: 'Welcome', p: "Welcome. You are standing at the center of the whole sky, as seen by NASA's SPHEREx mission, which maps the sky in infrared light. Let's visit a few places." },
  ...LANDMARKS.map((h) => ({ t: h[3], p: h[5], l: h[1], b: h[2] })),
  { t: 'See it change', p: "Real SPHEREx images of Barnard's Star across several survey passes: the background stars stay fixed while Barnard's Star drifts. Open Science > Time-Domain to see them." },
  { t: 'That is the tour', p: 'That is the tour. Look around on your own, or open the menu to inspect brown dwarfs, variable stars and the Planet X search field.' },
];

export function createPages(ctx) {
  const { sky, panel } = ctx;
  const stack = [];                 // pages visited: [{ page, arg }]
  let cur = { page: 'home', arg: null };
  const tour = { on: false, i: 0, paused: false, tok: 0, timer: null };
  const search = { ra: 269.45, dec: 4.69 };
  const frame = { i: 0, compare: false };   // target viewer: current pass
  let spectroI = 0;
  let constLines = false;
  let compareOn = false;
  let spin = false;
  let syncMsg = '';
  let roomCode = '';
  let voiceUnsub = null;
  const voiceName = 'VR Explorer';

  const targets = FIELD;
  const sliders = {
    stars: { get: () => $('#s1').value / 150, set: (v) => { $('#s1').value = Math.round(v * 150); ctx.applyMix(); } },
    dust: { get: () => $('#s2').value / 150, set: (v) => { $('#s2').value = Math.round(v * 150); ctx.applyMix(); } },
    ui: { get: () => ctx.uiOpacity, set: (v) => ctx.setUiOpacity(v) },
  };

  const show = (title, items, keep) => { panel.setTitle(title); panel.setBody(items, keep); };
  const nav = (page, arg, push = true) => {
    if (push && cur) stack.push(cur);
    cur = { page, arg };
    render(false);
  };

  // ---- shared actions ----
  const travel = (l, b) => ctx.travelTo({ l, b });
  const say = (text) => {
    if (!hasSpeech()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.lang = 'en-US';
    speechSynthesis.speak(u);
  };
  const stopSay = () => { if (hasSpeech()) speechSynthesis.cancel(); };
  const targetGal = (t) => radecToGal(t.ra, t.dec);

  // ---- tour ----
  function tourStep() {
    const s = TOUR[tour.i];
    if (!s) { endTour(); return; }
    const tok = ++tour.tok;
    if (s.l !== undefined) travel(s.l, s.b);
    if (cur.page === 'tour') render(false);
    clearTimeout(tour.timer);
    const next = () => { if (tok === tour.tok && !tour.paused) { tour.i++; tourStep(); } };
    if (hasSpeech()) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(s.p);
      u.rate = 0.95; u.lang = 'en-US';
      const done = () => { if (tok === tour.tok) tour.timer = setTimeout(next, 900); };
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    } else {
      tour.timer = setTimeout(next, Math.max(5000, s.p.split(' ').length * 380));
    }
  }
  function endTour() {
    tour.on = false; tour.tok++;
    clearTimeout(tour.timer);
    stopSay();
    if (cur.page === 'tour') render(false);
  }
  function startTour() {
    tour.on = true; tour.i = 0; tour.paused = false;
    nav('tour', null);
    tourStep();
  }

  // ---- voice ----
  function bindVoice() {
    if (voiceUnsub) return;
    voiceUnsub = V.subscribe(() => { if (cur.page === 'voice') render(true); });
  }

  // ---- compare divider (VR): a plane through the viewer, turned with the buttons ----
  let cmpAngle = 0;
  function applyCompare() {
    const u = sky.uniforms;
    u.cmpOn.value = compareOn ? 1 : 0;
    if (!compareOn) return;
    // plane normal: the viewer's right-hand direction at the time of switching on, rotated by cmpAngle, in the sky's frame
    const THREE_ = ctx.THREE;
    const up = new THREE_.Vector3(0, 1, 0);
    const right = new THREE_.Vector3().crossVectors(ctx.headForward(), up).normalize();   // world frame
    right.applyAxisAngle(up, cmpAngle);
    right.applyQuaternion(sky.world.quaternion.clone().invert());                          // -> the sky's own frame
    u.cmpN.value.copy(right);
  }

  // ---- pages ----
  const pages = {
    home() {
      show('SPHEREx VR', [
        { type: 'paragraph', text: 'Every tool of the web page, in the headset. Point and pinch (or pull the trigger) on a button; drag with the thumbstick or by pinching the panel to scroll.' },
        { type: 'button', id: 'go:explore', label: 'Explore', variant: 'primary' },
        { type: 'button', id: 'go:science', label: 'Science', variant: 'primary' },
        { type: 'button', id: 'go:starmap', label: 'Star Map', variant: 'primary' },
        { type: 'button', id: 'go:search', label: 'Search RA / Dec', variant: 'primary' },
        { type: 'button', id: 'go:tools', label: 'Tools & Layers', variant: 'secondary' },
        { type: 'button', id: 'go:data', label: 'Data & Resources', variant: 'secondary' },
        { type: 'button', id: 'go:voice', label: 'Voice Chat', variant: 'secondary' },
        { type: 'button', id: 'go:share', label: 'Share', variant: 'secondary' },
        { type: 'button', id: 'go:about', label: 'About & Help', variant: 'secondary' },
        { type: 'buttons', buttons: [{ id: 'recenter', label: 'Recenter menu' }, { id: 'hideMenu', label: 'Free look' }, { id: 'exitVR', label: 'Exit VR' }] },
      ]);
    },
    explore() {
      show('Explore', [
        { type: 'button', id: 'go:landmarks', label: `Landmarks (${LANDMARKS.length})`, variant: 'primary' },
        { type: 'button', id: 'go:constellations', label: `Constellations (${CONSTELLATIONS.length})`, variant: 'primary' },
        { type: 'button', id: 'tour:start', label: tour.on ? 'Guided Tour (running)' : 'Guided Tour', variant: 'primary' },
        { type: 'button', id: 'go:story', label: 'Story Tour', variant: 'primary' },
        { type: 'button', id: 'hideMenu', label: 'Free look (hide menu)', variant: 'secondary' },
        { type: 'divider' }, BACK,
      ]);
    },
    landmarks() {
      show('Landmarks', [
        { type: 'paragraph', text: 'Pick a place. Its card opens; Travel Here turns the sky to it.' },
        { type: 'divider' },
        ...explorePanelBody().items.slice(3).map((it) => ({ ...it, id: 'lm:' + it.data.idx })),
        { type: 'divider' }, BACK,
      ]);
    },
    landmark(i) {
      const h = LANDMARKS[i];
      show(h[0], [
        { type: 'heading', text: h[3] || h[0] },
        { type: 'paragraph', text: h[4] },
        { type: 'divider' },
        { type: 'paragraph', text: h[5] || '' },
        { type: 'kv', k: 'Longitude l:', v: h[1] + '°' },
        { type: 'kv', k: 'Latitude b:', v: h[2] + '°' },
        { type: 'divider' },
        { type: 'button', id: 'lmgo:' + i, label: 'Travel Here', variant: 'primary' },
        ...(hasSpeech() ? [{ type: 'buttons', buttons: [{ id: 'say:lm:' + i, label: 'Listen' }, { id: 'say:stop', label: 'Stop audio' }] }] : []),
        BACK,
      ]);
    },
    constellations() {
      show('Constellations', [
        { type: 'paragraph', text: 'Figures of the SPHEREx SKY. Switch their lines on in Tools & Layers or on a card.' },
        { type: 'divider' },
        ...CONSTELLATIONS.map((c, i) => ({ type: 'listItem', id: 'co:' + i, title: c.name, sub: c.category + ', ' + c.code })),
        { type: 'divider' }, BACK,
      ]);
    },
    constellation(i) {
      const c = CONSTELLATIONS[i];
      show(c.name, [
        { type: 'heading', text: c.name + ' (' + c.code + ')' },
        { type: 'paragraph', text: c.info },
        { type: 'divider' },
        { type: 'kv', k: 'RA / Dec:', v: hms(c.ra) + ' / ' + c.dec.toFixed(1) + '°' },
        { type: 'kv', k: 'Galactic:', v: 'l ' + c.l.toFixed(1) + '°  b ' + c.b.toFixed(1) + '°' },
        { type: 'divider' },
        { type: 'button', id: 'cogo:' + i, label: 'Travel Here', variant: 'primary' },
        { type: 'button', id: 'tg:lines', label: 'Constellation lines: ' + (constLines ? 'ON' : 'OFF'), active: constLines },
        ...(hasSpeech() ? [{ type: 'buttons', buttons: [{ id: 'say:co:' + i, label: 'Listen' }, { id: 'say:stop', label: 'Stop audio' }] }] : []),
        BACK,
      ]);
    },
    tour() {
      const s = TOUR[Math.min(tour.i, TOUR.length - 1)];
      show('Guided Tour', [
        { type: 'kv', k: 'Stop:', v: Math.min(tour.i + 1, TOUR.length) + ' of ' + TOUR.length },
        { type: 'heading', text: s.t },
        { type: 'paragraph', text: s.p },
        { type: 'divider' },
        tour.on
          ? { type: 'buttons', buttons: [{ id: 'tour:pause', label: tour.paused ? 'Resume' : 'Pause' }, { id: 'tour:skip', label: 'Skip' }, { id: 'tour:end', label: 'End tour' }] }
          : { type: 'button', id: 'tour:restart', label: 'Start again', variant: 'primary' },
        BACK,
      ]);
    },
    story() {
      show('Story Tour', [
        { type: 'paragraph', text: 'The story of the page, section by section.' },
        { type: 'divider' },
        { type: 'button', id: 'go:storyAbout', label: 'About the project', variant: 'primary' },
        { type: 'button', id: 'go:planetxStory', label: 'Planet X in four passes', variant: 'primary' },
        { type: 'button', id: 'go:benchmarks', label: 'Benchmark targets', variant: 'primary' },
        { type: 'button', id: 'go:spectro', label: '102 infrared colors', variant: 'primary' },
        { type: 'button', id: 'go:citizen', label: 'Citizen science', variant: 'primary' },
        { type: 'divider' }, BACK,
      ]);
    },
    storyAbout() {
      show('About the project', [
        { type: 'heading', text: ABOUT[0] },
        { type: 'paragraph', text: ABOUT[1] },
        ...spherexDataPanel().slice(3, 9),
        { type: 'divider' }, BACK,
      ]);
    },
    planetxStory(i = 0) {
      const passes = [
        ['assets/story_planetx_0.jpg', 'Pass 1: June 2025 (450 AU model)', 0.379, 0.5],
        ['assets/story_planetx_1.jpg', 'Pass 2: December 2025 (π = 458.4″ annual parallax)', 0.619, 0.483],
        ['assets/story_planetx_2.jpg', 'Pass 3: June 2026 (orbit reflex)', 0.395, 0.519],
        ['assets/story_planetx_3.jpg', 'Pass 4: December 2026 (loop closure)', 0.633, 0.504],
      ];
      const k = wrap(i, passes.length);
      cur.arg = k;
      show('Planet X passes', [
        { type: 'image', src: passes[k][0], marker: { x: passes[k][2], y: passes[k][3] }, caption: passes[k][1] },
        { type: 'buttons', buttons: [{ id: 'px:prev', label: '◀ Prev' }, { id: 'px:next', label: 'Next ▶' }] },
        { type: 'paragraph', text: 'A hypothetical planet 450 AU away would shift by 458.4 arcseconds between survey passes six months apart (annual parallax). The ring marks where it would sit in each pass.' },
        BACK,
      ], true);
    },
    benchmarks() {
      show('Benchmark targets', [
        { type: 'paragraph', text: 'The NASA benchmark targets the page follows. Pick one to see its passes.' },
        { type: 'divider' },
        ...benchmarkCards.map((b) => ({ type: 'listItem', id: 'tg:' + Math.max(0, targets.findIndex((t) => t.id === b.id)), title: b.name, sub: b.type })),
        { type: 'divider' }, BACK,
      ]);
    },
    citizen() {
      show('Citizen science', [
        { type: 'paragraph', text: 'Anyone can spot a mover: compare two passes, look for a dot that jumped while the stars stayed still, then flag the candidate.' },
        { type: 'paragraph', text: 'In VR you can browse every pass (Science > Time-Domain), compare two passes side by side and search coordinates. Flagging a candidate and ingesting JSON need a keyboard: do those from the web page.' },
        { type: 'divider' },
        { type: 'button', id: 'go:science', label: 'Open Science', variant: 'primary' }, BACK,
      ]);
    },
    science() {
      show('Science', [
        { type: 'button', id: 'tgp:planetx', label: 'Planet X', variant: 'primary' },
        { type: 'button', id: 'go:targets', label: 'Time-Domain (watch it move)', variant: 'primary' },
        { type: 'button', id: 'go:spectro', label: 'Spectroscopy (102 colors)', variant: 'primary' },
        { type: 'button', id: 'go:targets', label: 'Gallery', variant: 'primary' },
        { type: 'divider' }, BACK,
      ]);
    },
    targets() {
      show('Gallery', [
        { type: 'paragraph', text: 'Targets SPHEREx observed across several passes. Pick one.' },
        { type: 'divider' },
        ...targets.map((t, i) => ({ type: 'listItem', id: 'tg:' + i, title: t.name || t.label, sub: t.kind || '' })),
        { type: 'divider' }, BACK,
      ]);
    },
    target(i) {
      const t = targets[i];
      const n = t.frames.length;
      frame.i = wrap(frame.i, n);
      const f = t.frames[frame.i];
      const items = [
        { type: 'kv', k: 'Pass:', v: (frame.i + 1) + ' of ' + n + (f.d ? ', ' + f.d : '') },
        { type: 'image', src: f.u, marker: f.x !== undefined ? { x: f.x, y: f.y } : null, h: frame.compare ? 250 : undefined, caption: frame.compare ? 'Pass ' + (frame.i + 1) : f.b },
      ];
      if (frame.compare) {
        const f0 = t.frames[0];
        items.push({ type: 'image', src: f0.u, marker: f0.x !== undefined ? { x: f0.x, y: f0.y } : null, h: 250, caption: 'Pass 1 (reference)' });
      }
      items.push(
        { type: 'buttons', buttons: [{ id: 'tgf:prev', label: '◀ Prev' }, { id: 'tgf:next', label: 'Next ▶' }, { id: 'tgf:cmp', label: 'Compare', active: frame.compare }] },
        { type: 'divider' },
        { type: 'heading', text: t.name || t.label },
        { type: 'paragraph', text: t.blurb || '' },
        { type: 'paragraph', text: t.caption || '' },
        { type: 'kv', k: 'RA / Dec:', v: t.ra !== undefined ? hms(t.ra) + ' / ' + t.dec.toFixed(2) + '°' : '-' },
        { type: 'kv', k: 'Span:', v: t.span || '-' },
      );
      if (t.ra !== undefined) items.push({ type: 'button', id: 'tgo:' + i, label: 'Travel to this target', variant: 'primary' });
      items.push(BACK);
      show(t.name || t.label, items, true);
    },
    spectro() {
      const n = COLORS.length;
      spectroI = wrap(spectroI, n);
      const c = COLORS[spectroI];
      show('Spectroscopy', [
        { type: 'kv', k: 'Band:', v: (spectroI + 1) + ' of ' + n + ', ' + c.wl + ' µm, ' + (c.det || '') },
        { type: 'image', src: c.u, marker: { x: c.x, y: c.y }, caption: c.b },
        { type: 'buttons', buttons: [{ id: 'sp:prev', label: '◀ Shorter λ' }, { id: 'sp:next', label: 'Longer λ ▶' }] },
        { type: 'kv', k: 'Flux:', v: c.f + ' MJy/sr' },
        { type: 'paragraph', text: 'SPHEREx sees 102 infrared colors from 0.75 to 5.0 µm. The same star changes with wavelength: this is its spectral energy distribution.' },
        BACK,
      ], true);
    },
    starmap() {
      show('Star Map', [
        { type: 'heading', text: 'Select a destination' },
        { type: 'paragraph', text: 'Glowing stars around you are the landmarks of the sky. Point at one and pinch to open its card.' },
        { type: 'button', id: 'tg:lines', label: 'Constellation lines: ' + (constLines ? 'ON' : 'OFF'), active: constLines },
        { type: 'divider' }, BACK,
      ]);
    },
    search() {
      const g = radecToGal(search.ra, search.dec);
      const near = FIELD[findClosestTarget(search.ra, search.dec)];
      show('Search RA / Dec', [
        { type: 'kv', k: 'RA:', v: search.ra.toFixed(2) + '°  (' + hms(search.ra) + ')' },
        { type: 'buttons', buttons: [{ id: 'ra:-10', label: '-10°' }, { id: 'ra:-1', label: '-1°' }, { id: 'ra:1', label: '+1°' }, { id: 'ra:10', label: '+10°' }] },
        { type: 'kv', k: 'Dec:', v: (search.dec >= 0 ? '+' : '') + search.dec.toFixed(2) + '°' },
        { type: 'buttons', buttons: [{ id: 'dec:-10', label: '-10°' }, { id: 'dec:-1', label: '-1°' }, { id: 'dec:1', label: '+1°' }, { id: 'dec:10', label: '+10°' }] },
        { type: 'kv', k: 'Galactic:', v: 'l ' + g.l.toFixed(1) + '°  b ' + g.b.toFixed(1) + '°' },
        { type: 'button', id: 'searchgo', label: 'Go to these coordinates', variant: 'primary' },
        { type: 'divider' },
        { type: 'heading', text: 'Nearest target' },
        { type: 'paragraph', text: near ? (near.name || near.label) + ' (' + (near.kind || '') + ')' : '-' },
        { type: 'button', id: 'searchnear', label: 'Use its coordinates', variant: 'secondary' },
        { type: 'divider' }, BACK,
      ], true);
    },
    tools() {
      show('Tools & Layers', [
        { type: 'button', id: 'tg:lines', label: 'Constellation lines: ' + (constLines ? 'ON' : 'OFF'), active: constLines },
        { type: 'button', id: 'tg:grid', label: 'Coordinate grid: ' + (sky.grid.visible ? 'ON' : 'OFF'), active: sky.grid.visible },
        { type: 'button', id: 'tg:spin', label: 'Auto-orbit: ' + (spin ? 'ON' : 'OFF'), active: spin },
        { type: 'button', id: 'tg:cmp', label: 'Compare divider: ' + (compareOn ? 'ON' : 'OFF'), active: compareOn },
        ...(compareOn ? [{ type: 'buttons', buttons: [{ id: 'cmp:-', label: '◀ Turn divider' }, { id: 'cmp:+', label: 'Turn divider ▶' }] },
          { type: 'note', text: 'Stars and galaxies on the left of the divider, dust and gas on the right.' }] : []),
        { type: 'divider' },
        { type: 'heading', text: 'Layers' },
        { type: 'button', id: 'tg:l1', label: 'Stars and galaxies: ' + ($('#l1').checked ? 'ON' : 'OFF'), active: $('#l1').checked },
        { type: 'slider', id: 'stars', label: 'Stars and galaxies brightness' },
        { type: 'button', id: 'tg:l2', label: 'Dust and gas: ' + ($('#l2').checked ? 'ON' : 'OFF'), active: $('#l2').checked },
        { type: 'slider', id: 'dust', label: 'Dust and gas brightness' },
        { type: 'slider', id: 'ui', label: 'Menu transparency' },
        { type: 'button', id: 'resetSettings', label: 'Reset to defaults', variant: 'secondary' },
        { type: 'divider' }, BACK,
      ], true);
      Object.keys(sliders).forEach((k) => panel.setSlider(k, { value: sliders[k].get() }));
    },
    data() {
      show('Data & Resources', [
        { type: 'button', id: 'go:resources', label: 'Scientific resources (' + scientific.length + ')', variant: 'primary' },
        { type: 'button', id: 'go:release', label: 'Data releases & FITS archive', variant: 'primary' },
        { type: 'button', id: 'go:irsa', label: 'IRSA cutouts', variant: 'primary' },
        { type: 'divider' },
        ...spherexDataPanel(),
        { type: 'divider' }, BACK,
      ]);
    },
    resources() {
      show('Scientific resources', [
        ...scientific.map((r, i) => ({ type: 'listItem', id: 'rs:' + i, title: r.title, sub: r.description })),
        { type: 'divider' }, BACK,
      ]);
    },
    resource(i) {
      const r = scientific[i];
      show('Resource', [
        { type: 'heading', text: r.title },
        { type: 'paragraph', text: r.description },
        { type: 'paragraph', text: r.details || '' },
        ...(r.url || r.link ? [{ type: 'note', text: 'Link: ' + (r.url || r.link) }] : []),
        BACK,
      ]);
    },
    release() {
      show('Data releases', [
        { type: 'kv', k: 'Release:', v: 'SPHEREx Level 2 Quick Release' },
        { type: 'kv', k: 'DOI:', v: '10.26131/IRSA629' },
        { type: 'kv', k: 'Targets:', v: FIELD.length + ' fields' },
        { type: 'paragraph', text: 'Re-index the local FITS archive (data/movers_cutouts) to refresh the spectrophotometry of every target.' },
        { type: 'button', id: 'syncfits', label: 'Sync FITS archive', variant: 'primary' },
        ...(syncMsg ? [{ type: 'note', text: syncMsg }] : []),
        { type: 'note', text: 'Loading a custom candidate from pasted JSON needs a keyboard: use the web page for that.' },
        BACK,
      ], true);
    },
    irsa() {
      const t = targets[Math.max(0, Math.min(targets.length - 1, frame.t || 0))];
      show('IRSA cutouts', [
        { type: 'paragraph', text: 'NASA IRSA cutouts are requested by coordinates and delivered by email. Pick a target to see the request values.' },
        { type: 'kv', k: 'Target:', v: t.name || t.label },
        { type: 'kv', k: 'RA:', v: t.ra !== undefined ? t.ra + '°' : '-' },
        { type: 'kv', k: 'Dec:', v: t.dec !== undefined ? t.dec + '°' : '-' },
        { type: 'buttons', buttons: [{ id: 'irsa:prev', label: '◀ Target' }, { id: 'irsa:next', label: 'Target ▶' }] },
        { type: 'note', text: 'Typing the email address needs a keyboard: send the request from the web page (Data > IRSA Cutout) with these values.' },
        BACK,
      ], true);
    },
    share() {
      const url = getShareUrl();
      show('Share', [
        { type: 'paragraph', text: 'Link to this view of the sky:' },
        { type: 'note', text: url },
        { type: 'button', id: 'copylink', label: 'Copy link', variant: 'primary' },
        { type: 'note', text: 'Embed code: <iframe src="' + url.split('#')[0] + '?embed=1"></iframe>' },
        BACK,
      ]);
    },
    voice() {
      bindVoice();
      const s = V.state;
      const items = [];
      if (s.phase === 'in') {
        items.push(
          { type: 'kv', k: 'Room:', v: s.roomName || s.roomId },
          { type: 'kv', k: 'Code:', v: s.roomId },
          { type: 'kv', k: 'You:', v: s.role === 'host' ? 'Presenter' : 'Listener' },
          { type: 'kv', k: 'Mic:', v: s.canSpeak ? (s.micOn ? 'on' : 'muted') : 'listen only' },
          { type: 'divider' },
          { type: 'heading', text: 'People (' + s.people.length + ')' },
          ...s.people.map((p) => ({ type: 'kv', k: (p.speaking ? '● ' : '') + p.name + (p.isLocal ? ' (you)' : ''), v: p.role === 'host' ? 'presenter' : p.hand ? 'hand up' : '' })),
          { type: 'divider' },
          { type: 'buttons', buttons: [
            ...(s.canSpeak ? [{ id: 'v:mic', label: s.micOn ? 'Mute' : 'Unmute', active: s.micOn }] : [{ id: 'v:hand', label: s.people.find((p) => p.isLocal)?.hand ? 'Lower hand' : 'Raise hand' }]),
            { id: 'v:deaf', label: s.deaf ? 'Hear' : 'Deafen', active: s.deaf },
            { id: 'v:leave', label: 'Leave' },
          ] },
        );
        if (s.audioBlocked) items.push({ type: 'button', id: 'v:audio', label: 'Enable sound', variant: 'primary' });
      } else if (s.phase === 'connecting') {
        items.push({ type: 'paragraph', text: 'Connecting…' });
      } else {
        const hashCode = new URLSearchParams(location.hash.slice(1)).get('room');
        items.push(
          { type: 'paragraph', text: 'Live seminars: a presenter and listeners talk in a room. Create one, or join with its code.' },
          { type: 'button', id: 'v:create', label: 'Create a room (I present)', variant: 'primary' },
          ...(hashCode ? [{ type: 'button', id: 'v:joinhash', label: 'Join invite ' + hashCode.slice(0, 12), variant: 'primary' }] : []),
          { type: 'divider' },
          { type: 'kv', k: 'Room code:', v: roomCode || '(enter below)' },
        );
        const keys = '0123456789abcdef'.split('');
        for (let r = 0; r < 4; r++) items.push({ type: 'buttons', buttons: keys.slice(r * 4, r * 4 + 4).map((k) => ({ id: 'v:k:' + k, label: k })) });
        items.push(
          { type: 'buttons', buttons: [{ id: 'v:k:back', label: '⌫' }, { id: 'v:k:clear', label: 'Clear' }, { id: 'v:join', label: 'Join', variant: 'primary' }] },
        );
      }
      if (s.error) items.push({ type: 'note', text: s.error });
      if (s.notice) items.push({ type: 'note', text: s.notice });
      items.push({ type: 'divider' }, BACK);
      show('Voice Chat', items, true);
    },
    about() {
      show('About & Help', [
        { type: 'heading', text: ABOUT[0] },
        { type: 'paragraph', text: ABOUT[1] },
        { type: 'divider' },
        { type: 'heading', text: 'Controls' },
        { type: 'paragraph', text: 'Controllers: point and pull the trigger. Hands: point and pinch thumb and index finger. Scroll a panel with the thumbstick, or pinch the empty panel and drag.' },
        { type: 'paragraph', text: 'Grip / squeeze (or "Free look") hides the menu; the small Menu button brings it back. Recenter puts it in front of you again.' },
        { type: 'divider' },
        { type: 'heading', text: 'Data' },
        { type: 'paragraph', text: 'Imagery is derived from NASA / JPL-Caltech and NASA / IPAC IRSA Level 2 Quick Release products (DOI: 10.26131/IRSA629).' },
        BACK,
      ]);
    },
  };

  function render(keep) {
    const fn = pages[cur.page];
    if (!fn) { cur = { page: 'home', arg: null }; pages.home(); return; }
    if (cur.page !== 'voice' && voiceUnsub) { voiceUnsub(); voiceUnsub = null; }
    fn(cur.arg);
    if (keep === false) panel.setScroll(0);
    ctx.onPage(cur.page);
  }

  function setSearchTarget(i) {
    const t = targets[i];
    if (t && t.ra !== undefined) { search.ra = t.ra; search.dec = t.dec; }
  }

  function applyLinesVisible() {
    const root = ctx.constellationRoot();
    if (root) root.visible = constLines;
  }

  async function syncFits() {
    syncMsg = 'Scanning the local FITS archive…';
    render(true);
    try {
      const r = await fetch('/api/sync-data-archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json();
      syncMsg = d && d.ok ? 'Synced ' + (d.total_fits_indexed || d.total_fits_files || 36) + ' FITS cutouts.' : 'Sync error: ' + ((d && d.error) || 'unknown');
    } catch (err) {
      syncMsg = 'Sync failed: ' + err.message;
    }
    if (cur.page === 'release') render(true);
  }

  function handle(id) {
    if (id === 'back') { const p = stack.pop(); cur = p || { page: 'home', arg: null }; render(false); return; }
    if (id.startsWith('go:')) {
      const page = id.slice(3);
      if (page === 'home') { stack.length = 0; cur = { page: 'home', arg: null }; render(false); return; }
      if (page === 'planetxStory') { nav('planetxStory', 0); return; }
      if (page === 'starmap') { nav('starmap'); return; }
      if (page === 'targets') frame.compare = false;
      nav(page, null); return;
    }
    if (id === 'exitVR') { ctx.exitVR(); return; }
    if (id === 'recenter') { ctx.recenter(); return; }
    if (id === 'hideMenu') { ctx.hideMenu(); return; }
    if (id.startsWith('lm:')) { nav('landmark', +id.slice(3)); return; }
    if (id.startsWith('lmgo:')) { const h = LANDMARKS[+id.slice(5)]; travel(h[1], h[2]); return; }
    if (id.startsWith('co:')) { nav('constellation', +id.slice(3)); return; }
    if (id.startsWith('cogo:')) { const c = CONSTELLATIONS[+id.slice(5)]; travel(c.l, c.b); return; }
    if (id.startsWith('say:')) {
      const [, kind, i] = id.split(':');
      if (kind === 'stop') stopSay();
      else if (kind === 'lm') say(LANDMARKS[+i][5] || LANDMARKS[+i][4]);
      else if (kind === 'co') say(CONSTELLATIONS[+i].info);
      return;
    }
    if (id === 'tour:start') { if (tour.on) nav('tour'); else startTour(); return; }
    if (id === 'tour:restart') { startTour(); return; }
    if (id === 'tour:end') { endTour(); return; }
    if (id === 'tour:pause') {
      tour.paused = !tour.paused;
      if (tour.paused) { tour.tok++; clearTimeout(tour.timer); stopSay(); } else tourStep();
      render(true); return;
    }
    if (id === 'tour:skip') { tour.i++; tour.paused = false; tourStep(); return; }
    if (id === 'px:prev' || id === 'px:next') { pages.planetxStory((cur.arg || 0) + (id === 'px:next' ? 1 : -1)); return; }
    if (id.startsWith('tgp:')) { const i = targets.findIndex((t) => t.id === id.slice(4)); frame.i = 0; frame.compare = false; nav('target', Math.max(0, i)); return; }
    if (id.startsWith('tg:') && /^\d+$/.test(id.slice(3))) { frame.i = 0; frame.compare = false; nav('target', +id.slice(3)); return; }
    if (id === 'tgf:prev' || id === 'tgf:next') { frame.i += id === 'tgf:next' ? 1 : -1; render(true); return; }
    if (id === 'tgf:cmp') { frame.compare = !frame.compare; render(true); return; }
    if (id.startsWith('tgo:')) { const g = targetGal(targets[+id.slice(4)]); travel(g.l, g.b); return; }
    if (id === 'sp:prev' || id === 'sp:next') { spectroI += id === 'sp:next' ? 1 : -1; render(true); return; }
    if (id.startsWith('ra:')) { search.ra = wrap(search.ra + +id.slice(3), 360); render(true); return; }
    if (id.startsWith('dec:')) { search.dec = Math.max(-90, Math.min(90, search.dec + +id.slice(4))); render(true); return; }
    if (id === 'searchgo') { const g = radecToGal(search.ra, search.dec); travel(g.l, g.b); return; }
    if (id === 'searchnear') { setSearchTarget(findClosestTarget(search.ra, search.dec)); render(true); return; }
    if (id === 'tg:lines') { constLines = !constLines; applyLinesVisible(); render(true); return; }
    if (id === 'tg:grid') { sky.grid.visible = !sky.grid.visible; $('#grid').setAttribute('aria-pressed', sky.grid.visible); render(true); return; }
    if (id === 'tg:spin') { spin = !spin; ctx.setSpin(spin); render(true); return; }
    if (id === 'tg:cmp') { compareOn = !compareOn; cmpAngle = 0; applyCompare(); render(true); return; }
    if (id === 'cmp:-' || id === 'cmp:+') { cmpAngle += (id === 'cmp:+' ? 1 : -1) * (Math.PI / 12); applyCompare(); return; }
    if (id === 'tg:l1' || id === 'tg:l2') {
      const el = $(id === 'tg:l1' ? '#l1' : '#l2'); el.checked = !el.checked; ctx.applyMix(); render(true); return;
    }
    if (id === 'resetSettings') {
      $('#l1').checked = $('#l2').checked = true; $('#s1').value = 40; $('#s2').value = 120;
      ctx.applyMix(); ctx.setUiOpacity(0.86); compareOn = false; applyCompare(); render(true); return;
    }
    if (id.startsWith('rs:')) { nav('resource', +id.slice(3)); return; }
    if (id === 'syncfits') { syncFits(); return; }
    if (id === 'irsa:prev' || id === 'irsa:next') { frame.t = wrap((frame.t || 0) + (id === 'irsa:next' ? 1 : -1), targets.length); render(true); return; }
    if (id === 'copylink') {
      const url = getShareUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).catch(() => {});
      return;
    }
    if (id.startsWith('v:')) {
      const a = id.slice(2);
      if (a === 'create') V.createAndJoin('VR seminar', voiceName, { mic: true });
      else if (a === 'join') { if (roomCode) V.join(roomCode, voiceName, { mic: true }); }
      else if (a === 'joinhash') V.join(new URLSearchParams(location.hash.slice(1)).get('room') || '', voiceName, { mic: true });
      else if (a === 'leave') V.leave();
      else if (a === 'mic') V.toggleMic();
      else if (a === 'deaf') V.toggleDeaf();
      else if (a === 'hand') V.raiseHand(!V.state.people.find((p) => p.isLocal)?.hand);
      else if (a === 'audio') V.enableAudio();
      else if (a.startsWith('k:')) {
        const k = a.slice(2);
        if (k === 'back') roomCode = roomCode.slice(0, -1);
        else if (k === 'clear') roomCode = '';
        else if (roomCode.length < 12) roomCode += k;
        render(true);
      }
      return;
    }
  }

  return {
    handle,
    onSlider(id, v) { if (sliders[id]) sliders[id].set(v); },
    open(page, arg) { stack.length = 0; cur = { page, arg: arg ?? null }; render(false); },
    refresh(keep) { render(keep); },
    get page() { return cur.page; },
    get tourOn() { return tour.on; },
    reset() {   // the VR session ended: stop narration, tour and the VR-only compare plane
      endTour(); stopSay();
      compareOn = false; sky.uniforms.cmpOn.value = 0; spin = false;
      if (constLines) { constLines = false; applyLinesVisible(); }
    },
    syncSkyToggles() { /* grid / lines state are read live when a page renders */ },
  };
}
