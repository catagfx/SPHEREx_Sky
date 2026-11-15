// The panel's content: ONE source of truth = scientific_resources.json at the project root (BE 1 / BE 2).
//   - with the Python backend (python server.py, npm run dev): GET /api/scientific-resources
//     (backend/scientific_resources.py: the same file, validated) - edits show without a rebuild
//   - without it (static hosting, offline, the Vite dev server alone): the same file, bundled by Vite
// Both the backend's schema {id, title, description, details: "text", source, url} and the sphere.md §5 schema
// {id, title, category, provider, summary, details: [], url} are accepted and turned into the card model
// {id, title, category, provider, summary, details: [], url}.
import bundled from '../../../scientific_resources.json';

export const API_URL = '/api/scientific-resources';

const CATEGORIES = ['MISSION', 'ARCHIVE', 'LEARNING', 'DATASET'];
// the backend's records carry no category: known ids first, then words in the record
const CATEGORY_BY_ID = { 'neossat-mission': 'MISSION', 'cadc-archive': 'ARCHIVE', 'cadc-neossat': 'ARCHIVE', 'neossat-tutorial': 'LEARNING', 'neossat-dataset': 'DATASET' };

const text = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * Sentences of a text: cut only after . ! ? that is followed by a space and a capital letter / "(" (so "U.S. team"
 * stays whole). Never drops a character: the pieces joined with spaces give the text back. No regex lookbehind
 * (it is a syntax error in Safari < 16.4 and would break the whole bundle).
 */
export function sentences(t) {
  const s = text(t);
  const out = [];
  const cut = /[.!?]+\s+(?=[A-Z(])/g;
  let start = 0;
  let m;
  while ((m = cut.exec(s))) {
    const end = m.index + m[0].trimEnd().length;
    out.push(s.slice(start, end).trim());
    start = m.index + m[0].length;
  }
  out.push(s.slice(start).trim());
  return out.filter(Boolean);
}

function categoryOf(r) {
  const given = text(r.category).toUpperCase();
  if (CATEGORIES.includes(given)) return given;
  if (CATEGORY_BY_ID[r.id]) return CATEGORY_BY_ID[r.id];
  const words = `${text(r.title)} ${text(r.id)}`.toLowerCase();
  if (/dataset|open data/.test(words)) return 'DATASET';
  if (/tutorial|course|guide|learn/.test(words)) return 'LEARNING';
  if (/archive|data cent(re|er)|cadc/.test(words)) return 'ARCHIVE';
  return 'MISSION';
}

/** One record (either schema) -> the card model; null when it cannot be shown (no id / title / https url). */
export function toCard(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.isValid === false && !r.url) return null; // the backend marked it invalid and dropped its url
  const id = text(r.id);
  const title = text(r.title);
  const url = text(r.url);
  if (!id || !title || !/^https:\/\//.test(url)) return null;
  const desc = sentences(r.summary || r.description);
  const summary = desc[0] || '';
  // "short initial text": the card shows ONE sentence; the rest of the description and the details wait behind
  // "Learn more" (details: an array of facts, or one paragraph split into its sentences)
  const facts = Array.isArray(r.details) ? r.details.map(text) : sentences(r.details);
  const details = [desc.slice(1).join(' '), ...facts].map(text).filter(Boolean);
  return { id, title, category: categoryOf(r), provider: text(r.provider || r.source), summary, details, url };
}

/** A list (or {resources: [...]}, the backend's answer) -> cards, duplicates by id dropped. */
export function toCards(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.resources) ? data.resources : [];
  const seen = new Set();
  return list.map(toCard).filter((c) => c && !seen.has(c.id) && seen.add(c.id));
}

/** The bundled copy (always available, no request). */
export const bundledCards = () => toCards(bundled);

/**
 * The live copy from the backend, or null (no backend, an error, an empty / invalid answer). Never throws, never
 * waits long: the panel already works with the bundled copy meanwhile.
 */
export async function fetchCards({ timeoutMs = 4000, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(API_URL, { headers: { Accept: 'application/json' }, signal: ctrl?.signal });
    if (!res.ok) return null;
    const cards = toCards(await res.json());
    return cards.length ? cards : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
