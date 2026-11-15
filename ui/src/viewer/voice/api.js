// Calls to the voice server (voice-server/server.js). Same origin by default (Vite proxies /api/rooms in dev);
// in production set window.SPX_VOICE_API = 'https://voice.example.com' before the bundle loads.

const base = () => (window.SPX_VOICE_API || window.SPX_API_URL || '').replace(/\/+$/, '');

async function call(path, body, method = 'POST') {
  let res;
  try {
    res = await fetch(base() + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the voice server. Is it running?');
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new Error((data && data.error) || `The voice server answered ${res.status}.`);
  return data;
}

export const createRoom = (name, maxParticipants = 100) => call('/api/rooms', { name, maxParticipants });
export const getToken = (roomId, name, hostKey) => call(`/api/rooms/${encodeURIComponent(roomId)}/token`, { name, hostKey: hostKey || undefined });
export const setSpeaker = (roomId, hostKey, identity, allow) => call(`/api/rooms/${encodeURIComponent(roomId)}/speakers`, { hostKey, identity, allow });
export const kick = (roomId, hostKey, identity) => call(`/api/rooms/${encodeURIComponent(roomId)}/kick`, { hostKey, identity });
