import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve against this module, regardless of the working directory.
dotenv({ path: fileURLToPath(new URL('.env', import.meta.url)) });

export function readConfig(env = process.env) {
  const url = (env.LIVEKIT_URL || '').trim();
  if (url && !/^wss?:\/\/[^\s]+$/.test(url)) throw new Error('LIVEKIT_URL must start with ws:// or wss://.');
  const port = Number(env.VOICE_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('VOICE_PORT must be 1 to 65535.');
  const publicUrl = (env.PUBLIC_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const site = new URL(publicUrl);
  if (!['http:', 'https:'].includes(site.protocol)) throw new Error('PUBLIC_URL must be an HTTP(S) URL.');
  const proxyHops = Number(env.VOICE_TRUST_PROXY || 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0) throw new Error('VOICE_TRUST_PROXY must be a nonnegative integer.');
  return {
    port, url, publicUrl, proxyHops,
    key: env.LIVEKIT_API_KEY || '', secret: env.LIVEKIT_API_SECRET || '',
    origins: [...new Set([site.origin, ...(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)])],
  };
}
