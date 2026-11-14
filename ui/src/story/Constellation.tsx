import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';
import { prefersReducedMotion } from '../core/env';

// The sky of the story hero (styles: css/hero.css, .hero-sky / .hero-constellation; it floats as one piece there).
// The constellations grow OUT OF the title and the subtitle:
//   title ends      -> star chains -> the framed facts above (102 Bands, 6-Month Cycle)
//   subtitle ends   -> star chains -> the framed facts below (Time Domain, Dual Layers)
//   subtitle bottom -> one short chain per button, each with its own shape (asymmetric)
//   every fact      -> a small tail of stars running on toward its corner
// Each chain bends outward (away from the text); if a segment would still cross the title, subtitle, buttons or
// another fact, the bend grows until it clears (or the chain is left out). Decorative: not real sky positions.
// Geometry comes from the real layout (offsetLeft/Top, so entrance transforms do not skew it), re-measured on resize.

export const SKY_MQ = '(min-width: 901px) and (min-height: 560px)';

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Bend = [u: number, v: number, mag: number];        // u: 0..1 along the chain, v: outward offset (fraction of length)
// `weight` scales both star radius and line stroke-width for that chain -> each constellation gets its own
// visual mass, so they feel like different sky patterns rather than mirror copies.
interface FactChain { fact: Corner; from: 'titleL' | 'titleR' | 'leadL' | 'leadR'; weight: number; bends: Bend[]; tail: Array<[dx: number, dy: number, mag: number]>; branch?: [star: number, dx: number, dy: number, mag: number] }
interface ButtonChain { at: number; to: number; land: number; weight: number; bends: Bend[]; branch?: [star: number, dx: number, dy: number, mag: number] }
// small free-standing asterisms sprinkled as design elements (don't connect to any text)
// shape coords are in % of stage height relative to the anchor; closed = polygon (last -> first line too)
interface DecorChain { anchor: [fx: number, fy: number]; weight: number; shape: Array<[dx: number, dy: number, mag: number]>; closed?: boolean }

// tail offsets / branches are in % of the stage height, signs pointing toward the fact's corner
// Tails kept short (fewer, closer points) so chains feel dense rather than long reaching.
// `weight` is intentionally asymmetric: tl bold, tr delicate, bl medium, br small.
const FACT_CHAINS: FactChain[] = [
  { fact: 'tl', from: 'titleL', weight: 1.3, bends: [[0.3, 0.12, 1.3], [0.68, 0.05, 2.2]], tail: [[-3, -1.8, 1.2], [-5.5, 0.8, 1.6]], branch: [1, -1.5, -3.2, 0.9] },
  { fact: 'tr', from: 'titleR', weight: 0.8, bends: [[0.22, 0.06, 1.1], [0.52, 0.17, 1.8], [0.8, 0.05, 1.2]], tail: [[3.5, -1.2, 1.7], [5.5, 2.6, 1.1]], branch: [2, 2, -2.4, 0.8] },
  { fact: 'bl', from: 'leadL', weight: 1.05, bends: [[0.42, 0.24, 2.0]], tail: [[-2.5, 2.4, 1.4], [-5.5, 1.8, 1.8]], branch: [0, -3.4, -1.5, 1] },
  { fact: 'br', from: 'leadR', weight: 0.72, bends: [[0.26, 0.09, 1.1], [0.62, 0.21, 1.6]], tail: [[3.5, 2.2, 1.5], [6, 0.6, 1]], branch: [1, 3, -2.2, 0.9] },
];
// subtitle -> buttons: `at` = where on the subtitle's bottom edge, `to` = button index, `land` = where on its top edge
// Each chain has its own weight too — nothing mirrors.
const BUTTON_CHAINS: ButtonChain[] = [
  { at: 0.12, to: 0, land: 0.3, weight: 0.9, bends: [[0.3, 0.18, 1.1], [0.66, 0.1, 1.4]], branch: [0, -2.2, 1.2, 0.8] },
  { at: 0.4, to: 1, land: 0.62, weight: 1.15, bends: [[0.3, -0.18, 1.1], [0.55, 0.14, 1.3], [0.78, 0.08, 1.1]] },
  { at: 0.64, to: 2, land: 0.38, weight: 0.75, bends: [[0.3, 0.12, 1.4], [0.6, 0.18, 1.6]], branch: [1, 2.6, -1.6, 0.8] },
  { at: 0.9, to: 3, land: 0.72, weight: 1.0, bends: [[0.28, -0.12, 1.1], [0.52, 0.14, 1.3], [0.76, 0.2, 1.1]] },
];
// mini-constellations as pure design elements, scattered in the quiet corners of the sky.
// each has its own weight so no two look alike.
const DECOR_CHAINS: DecorChain[] = [
  // tiny arc, top-left outer edge
  { anchor: [0.05, 0.1], weight: 0.85, shape: [[0, 0, 0.7], [2.4, 1.6, 0.9], [5.2, 0.8, 0.6], [7.5, 2.2, 0.7]] },
  // closed triangle, top-right outer edge
  { anchor: [0.94, 0.08], weight: 1.0, shape: [[0, 0, 0.9], [-2.8, 2.5, 0.65], [-5.2, 0.5, 0.75]], closed: true },
  // short diagonal pair, middle-right
  { anchor: [0.97, 0.44], weight: 0.7, shape: [[0, 0, 0.6], [-2.2, 1.8, 0.85], [-3.5, 4.2, 0.55]] },
  // kite shape, bottom-left
  { anchor: [0.04, 0.78], weight: 1.1, shape: [[0, 0, 0.75], [2.8, -1.5, 1.0], [5.2, 0.4, 0.6], [2.8, 2.4, 0.55]] },
  // small diagonal trio, bottom-right outer edge
  { anchor: [0.96, 0.87], weight: 0.85, shape: [[0, 0, 0.65], [-3.2, -1.5, 0.95], [-6, 0.2, 0.7]] },
  // tiny zigzag ("W"), middle-left (below subtitle area)
  { anchor: [0.03, 0.52], weight: 0.9, shape: [[0, 0, 0.75], [1.8, 2.2, 0.55], [3.8, 0.4, 0.7], [5.8, 2.4, 0.5]] },
  // single short pair near top-centre edge
  { anchor: [0.52, 0.04], weight: 0.6, shape: [[0, 0, 0.55], [1.8, 1.4, 0.75]] },
  // short ladder, bottom-centre
  { anchor: [0.48, 0.95], weight: 0.95, shape: [[0, 0, 0.85], [2.2, -1.2, 0.65], [4.4, 0.6, 0.7]] },
];
// loose field stars (no lines), irregular on purpose — denser scatter for a richer sky feel
const FIELD: Array<[fx: number, fy: number, mag: number]> = [
  // original asymmetric anchors
  [0.21, 0.36, 0.8], [0.27, 0.62, 0.6], [0.07, 0.86, 0.9], [0.41, 0.15, 0.7], [0.58, 0.19, 0.6], [0.72, 0.26, 0.8],
  [0.93, 0.21, 0.7], [0.9, 0.82, 0.9], [0.52, 0.93, 0.6], [0.34, 0.9, 0.7], [0.975, 0.38, 0.6], [0.015, 0.36, 0.7],
  [0.12, 0.5, 0.6], [0.83, 0.55, 0.7], [0.62, 0.81, 0.6], [0.46, 0.84, 0.8],
  // extra density — small magnitudes to stay subtle
  [0.04, 0.14, 0.5], [0.09, 0.28, 0.5], [0.17, 0.09, 0.6], [0.29, 0.22, 0.5], [0.38, 0.32, 0.6],
  [0.49, 0.26, 0.5], [0.65, 0.09, 0.6], [0.78, 0.14, 0.5], [0.88, 0.09, 0.5], [0.96, 0.52, 0.5],
  [0.94, 0.68, 0.6], [0.78, 0.72, 0.5], [0.72, 0.88, 0.6], [0.56, 0.72, 0.5], [0.42, 0.97, 0.5],
  [0.24, 0.78, 0.5], [0.16, 0.66, 0.6], [0.04, 0.6, 0.5], [0.08, 0.72, 0.6], [0.02, 0.46, 0.5],
  [0.22, 0.14, 0.6], [0.36, 0.06, 0.5], [0.5, 0.08, 0.6], [0.64, 0.95, 0.6], [0.82, 0.92, 0.5],
  [0.14, 0.44, 0.5], [0.3, 0.46, 0.5], [0.68, 0.46, 0.5], [0.78, 0.38, 0.6], [0.88, 0.44, 0.5],
];

interface Box { l: number; t: number; r: number; b: number }
interface P { x: number; y: number; m: number }
interface L { a: P; b: P; w: number }      // w = chain weight -> stroke-width multiplier
interface Geo { w: number; h: number; lines: L[]; stars: P[]; field: P[]; ticks: P[]; skipped: string[] }

const hit = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const pad = (r: Box, p: number): Box => ({ l: r.l - p, t: r.t - p, r: r.r + p, b: r.b + p });
const ptBox = (p: { x: number; y: number }, r: number): Box => ({ l: p.x - r, t: p.y - r, r: p.x + r, b: p.y + r });

// does segment p-q cross box b? (Liang-Barsky clip)
function segHits(p: { x: number; y: number }, q: { x: number; y: number }, b: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  for (const [pp, qq] of [[-dx, p.x - b.l], [dx, b.r - p.x], [-dy, p.y - b.t], [dy, b.b - p.y]] as const) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 < t1;
}

// Layout box of an element relative to an ancestor, from offsetLeft/Top: unlike getBoundingClientRect it ignores
// transforms, so elements still in their entrance animation (moved / scaled) are measured where they will rest.
function layoutBox(el: HTMLElement, root: HTMLElement): Box | null {
  if (!el.offsetWidth && !el.offsetHeight) return null;
  let x = 0, y = 0;
  for (let n: HTMLElement | null = el; n && n !== root; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft; y += n.offsetTop;
    if (!n.offsetParent) return null;
  }
  return { l: x, t: y, r: x + el.offsetWidth, b: y + el.offsetHeight };
}

function measure(stage: HTMLElement, content: HTMLElement): Geo | null {
  if (!matchMedia(SKY_MQ).matches) return null;
  const section = stage.offsetParent as HTMLElement | null;   // .hero-sky fills the section (inset: 0)
  if (!section) return null;
  const W = stage.offsetWidth, H = stage.offsetHeight, u = H / 100;
  const box = (el: Element | null) => {
    const b = el instanceof HTMLElement ? layoutBox(el, section) : null;
    return b ? { l: b.l - stage.offsetLeft, t: b.t - stage.offsetTop, r: b.r - stage.offsetLeft, b: b.b - stage.offsetTop } : null;
  };
  const title = box(content.querySelector('h1'));
  const lead = box(content.querySelector('.lead'));
  const btns = Array.from(content.querySelectorAll('.hero-btn')).map(box).filter(Boolean) as Box[];
  const foot = Array.from(content.querySelectorAll('.hero-foot > *')).map(box).filter(Boolean) as Box[];
  if (!title || !lead || btns.length < 4) return null;
  const facts = new Map<string, Box>();
  for (const el of Array.from(stage.querySelectorAll<HTMLElement>('.hero-fact'))) {
    const b = box(el);
    if (b) facts.set(el.dataset.host ?? '', b);
  }
  const text = [title, lead, ...btns, ...foot];
  const cue = box(section.querySelector('.scroll-cue'));
  const cr = document.getElementById('credit')?.getBoundingClientRect();      // fixed: viewport = stage coords at hero
  const credit = cr && cr.width ? { l: cr.left - section.getBoundingClientRect().left, t: cr.top, r: cr.right - section.getBoundingClientRect().left, b: cr.bottom } : null;
  const chrome = [{ l: 0, t: 0, r: W, b: 112 }, ...(cue ? [pad(cue, 18)] : []), ...(credit ? [pad(credit, 12)] : [])];
  const inside = (p: { x: number; y: number }) => p.x > 8 && p.x < W - 8 && p.y > 8 && p.y < H - 8;

  const lines: Geo['lines'] = [], stars: P[] = [], ticks: P[] = [], skipped: string[] = [];
  const cx = W / 2, cy = (title.t + lead.b) / 2;

  // one chain A -> bends -> B, bulging away from the centre; grows the bulge until no segment crosses `blockers`
  const chain = (A: P, B: P, bends: Bend[], blockers: Box[], outward = true): P[] | null => {
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (outward && nx * ((A.x + B.x) / 2 - cx) + ny * ((A.y + B.y) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    for (let grow = 1; grow <= 3.4; grow *= 1.5) {
      const mids = bends.map(([t, v, m]) => ({ x: A.x + dx * t + nx * v * len * grow, y: A.y + dy * t + ny * v * len * grow, m }));
      const pts = [A, ...mids, B];
      const clear = mids.every((p) => inside(p) && !blockers.some((b) => hit(ptBox(p, 4), b)) && !chrome.some((c) => hit(ptBox(p, 4), c)))
        && pts.slice(1).every((q, i) => !blockers.some((b) => segHits(pts[i], q, b)));
      if (clear) return pts;
    }
    return null;
  };
  // point on box b nearest to p, pushed `gap` px out toward p
  const edge = (b: Box, p: { x: number; y: number }, gap: number): P => {
    const x = Math.min(Math.max(p.x, b.l), b.r), y = Math.min(Math.max(p.y, b.t), b.b);
    const d = Math.hypot(p.x - x, p.y - y) || 1;
    return { x: x + ((p.x - x) / d) * gap, y: y + ((p.y - y) / d) * gap, m: 0.8 };
  };

  const anchors = {
    titleL: { x: title.l - 16, y: (title.t + title.b) / 2, m: 2 },
    titleR: { x: title.r + 16, y: (title.t + title.b) / 2, m: 2 },
    leadL: { x: lead.l - 14, y: lead.t + (lead.b - lead.t) * 0.68, m: 1.6 },
    leadR: { x: lead.r + 14, y: lead.t + (lead.b - lead.t) * 0.36, m: 1.6 },
  };

  // per-chain weight is applied by cloning each point with m * w -> the shared anchor keeps its own size
  // elsewhere, each chain renders its own copies at its own visual weight.
  const scale = (p: P, w: number): P => ({ ...p, m: p.m * w });

  for (const fc of FACT_CHAINS) {
    const fb = facts.get(fc.fact);
    if (!fb) continue;
    const w = fc.weight;
    const A = anchors[fc.from];
    const B = edge(fb, A, 7);
    const blockers = [...text.map((b) => pad(b, 6)), ...[...facts].filter(([k]) => k !== fc.fact).map(([, b]) => pad(b, 8))];
    const pts = chain(A, B, fc.bends, blockers);
    if (!pts) { skipped.push(fc.fact); continue; }
    for (let i = 1; i < pts.length; i++) lines.push({ a: pts[i - 1], b: pts[i], w });
    stars.push(scale(A, w), ...pts.slice(1, -1).map((p) => scale(p, w)));
    ticks.push(B);
    if (fc.branch) {
      const s = pts[1 + fc.branch[0]];
      const q = { x: s.x + fc.branch[1] * u, y: s.y + fc.branch[2] * u, m: fc.branch[3] };
      if (s && inside(q) && !blockers.some((b) => hit(ptBox(q, 4), b) || segHits(s, q, b)) && !chrome.some((c) => hit(ptBox(q, 4), c))) { lines.push({ a: s, b: q, w }); stars.push(scale(q, w)); }
    }
    // tail: from the fact's corner-side corner onward toward the screen corner
    const sx = fc.fact.endsWith('l') ? fb.l : fb.r, sy = fc.fact.startsWith('t') ? fb.t : fb.b;
    let prev: P = { x: sx + (fc.fact.endsWith('l') ? -6 : 6), y: sy + (fc.fact.startsWith('t') ? -6 : 6), m: 0.8 };
    ticks.push(prev);
    for (const [tx, ty, m] of fc.tail) {
      const q = { x: prev.x + tx * u, y: prev.y + ty * u, m };
      const ok = inside(q) && !chrome.some((c) => hit(ptBox(q, 4), c)) && ![...text, ...facts.values()].some((b) => hit(ptBox(q, 6), b) || segHits(prev, q, pad(b, 2)));
      if (!ok) break;
      lines.push({ a: prev, b: q, w }); stars.push(scale(q, w)); prev = q;
    }
  }

  btns.forEach((bb, i) => {
    const bc = BUTTON_CHAINS.find((c) => c.to === i);
    if (!bc) return;
    const w = bc.weight;
    const A: P = { x: lead.l + (lead.r - lead.l) * bc.at, y: lead.b + 10, m: 1.2 };
    const B: P = { x: bb.l + (bb.r - bb.l) * bc.land, y: bb.t - 9, m: 0.8 };
    const others = btns.filter((_, j) => j !== i).map((b) => pad(b, 4));
    const pts = chain(A, B, bc.bends, [pad(lead, 2), ...others], false);
    if (!pts) { skipped.push('btn' + i); return; }
    for (let k = 1; k < pts.length; k++) lines.push({ a: pts[k - 1], b: pts[k], w });
    stars.push(scale(A, w), ...pts.slice(1, -1).map((p) => scale(p, w)));
    ticks.push(B);
    if (bc.branch) {
      const s = pts[1 + bc.branch[0]];
      const q = { x: s.x + bc.branch[1] * u, y: s.y + bc.branch[2] * u, m: bc.branch[3] };
      if (!text.some((b) => hit(ptBox(q, 4), b) || segHits(s, q, pad(b, 2)))) { lines.push({ a: s, b: q, w }); stars.push(scale(q, w)); }
    }
  });

  // decorative mini-constellations: scattered around the edges as design elements, no text connection.
  // each shape is a sequence of relative offsets from an anchor; added only if fully inside and clear of
  // the title / subtitle / buttons / facts / sky chrome.
  const decorBlockers = [...text.map((b) => pad(b, 14)), ...[...facts.values()].map((b) => pad(b, 10))];
  for (const dc of DECOR_CHAINS) {
    const ax = dc.anchor[0] * W, ay = dc.anchor[1] * H;
    const pts: P[] = dc.shape.map(([dx, dy, m]) => ({ x: ax + dx * u, y: ay + dy * u, m }));
    const allClear = pts.every((p) => inside(p) && !decorBlockers.some((b) => hit(ptBox(p, 4), b)) && !chrome.some((c) => hit(ptBox(p, 4), c)));
    if (!allClear) continue;
    const segSeq: Array<[P, P]> = pts.slice(1).map((q, i) => [pts[i], q] as [P, P]);
    if (dc.closed && pts.length > 2) segSeq.push([pts[pts.length - 1], pts[0]]);
    const segsClear = segSeq.every(([p, q]) => !decorBlockers.some((b) => segHits(p, q, b)) && !chrome.some((c) => segHits(p, q, c)));
    if (!segsClear) continue;
    for (const [p, q] of segSeq) lines.push({ a: p, b: q, w: dc.weight });
    stars.push(...pts.map((p) => scale(p, dc.weight)));
  }

  const avoidField = [...text.map((b) => pad(b, 20)), ...[...facts.values()].map((b) => pad(b, 10)), ...chrome];
  const field = FIELD.map(([fx, fy, m]) => ({ x: fx * W, y: fy * H, m })).filter((p) => !avoidField.some((a) => hit(a, ptBox(p, 3))));
  return { w: W, h: H, lines, stars, field, ticks, skipped };
}

const radius = (m: number) => 1 + m * 1.15;

export default function Constellation({ stage, content, active }: { stage: RefObject<HTMLElement>; content: RefObject<HTMLElement>; active: boolean }) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawn = useRef(false);

  useEffect(() => {
    const st = stage.current, ct = content.current;
    if (!active || !st || !ct) return;
    const update = () => setGeo(measure(st, ct));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(st);
    ro.observe(ct);
    // the fixed sky credit re-wraps when its web font arrives: the sky must avoid its final box
    const credit = document.getElementById('credit');
    if (credit) ro.observe(credit);
    window.addEventListener('resize', update);
    document.fonts?.ready.then(update).catch(() => {});
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [active, stage, content]);

  // first appearance: the chains draw themselves out of the title / subtitle (document order = growth order)
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!geo || !svg || drawn.current) return;
    drawn.current = true;
    if (prefersReducedMotion) {
      gsap.fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power1.out' });
      return;
    }
    gsap.fromTo(svg.querySelectorAll('.cl-lines line'), { strokeDasharray: 1, strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 0.55, ease: 'power1.inOut', stagger: 0.045 });
    gsap.fromTo(svg.querySelectorAll('.cl-stars circle, .cl-ticks circle'), { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2.2)', stagger: 0.035, delay: 0.15 });
    gsap.fromTo(svg.querySelectorAll('.cl-field circle'), { opacity: 0 }, { opacity: 1, duration: 1.2, stagger: { each: 0.05, from: 'random' }, delay: 0.6 });
  }, [geo]);

  if (!geo) return null;
  return (
    <svg ref={svgRef} className="hero-constellation" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`}
      aria-hidden="true" data-skipped={geo.skipped.join(' ')}>
      <g className="cl-lines">
        {geo.lines.map((l, i) => <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} pathLength={1} style={{ strokeWidth: 1.1 * l.w }} />)}
      </g>
      <g className="cl-field">
        {geo.field.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={radius(s.m) * 0.7} style={{ animationDelay: `${-((i * 53) % 29) * 0.17}s` }} />
        ))}
      </g>
      <g className="cl-ticks">
        {geo.ticks.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={1.8} />)}
      </g>
      <g className="cl-stars">
        {geo.stars.map((s, i) => (
          <circle key={i} className={s.m >= 2 ? 'cl-bright' : undefined} cx={s.x} cy={s.y} r={radius(s.m)}
            style={{ animationDelay: `${((i * 37) % 23) * 0.17}s` }} />
        ))}
      </g>
    </svg>
  );
}
