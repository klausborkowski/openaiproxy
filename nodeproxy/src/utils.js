import crypto from 'node:crypto';
import { URL } from 'node:url';

export function getEnv(name, fallback = undefined) {
  const v = process.env[name];
  return (v === undefined || v === '') ? fallback : v;
}

export function parseBoolean(s, fallback = false) {
  if (s === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(s).toLowerCase());
}

export function hashBody(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

export function isLikelyStream(bodyObj) {
  try {
    if (bodyObj && typeof bodyObj === 'object') {
      if (bodyObj.stream === true) return true;
    }
  } catch (_e) {}
  return false;
}

export function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function pickClientId(req) {
  const auth = req.headers['authorization'] || '';
  if (auth) {
    const hash = crypto.createHash('sha256').update(auth).digest('hex');
    return `key:${hash.slice(0, 16)}`;
  }
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

export function buildUpstreamUrl(base, path, reqUrl) {
  const u = new URL(reqUrl, `http://internal`);
  return new URL(path + u.search, base).toString();
}
