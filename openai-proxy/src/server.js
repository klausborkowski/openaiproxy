import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';
import morgan from 'morgan';

import { TTLCache } from './cache.js';
import { RateLimiter } from './rateLimiter.js';
import { logger } from './logger.js';
import {
  getEnv, parseBoolean, hashBody, isLikelyStream,
  safeJsonParse, pickClientId, buildUpstreamUrl
} from './utils.js';

dotenv.config();

// ---- Config
const PORT = Number(getEnv('PORT', 8080));
const HOST = getEnv('HOST', '0.0.0.0');

const UPSTREAM_BASE_URL = getEnv('UPSTREAM_BASE_URL', 'https://api.openai.com');
const UPSTREAM_API_KEY = getEnv('UPSTREAM_API_KEY', '');
const UPSTREAM_AUTH_HEADER_NAME = getEnv('UPSTREAM_AUTH_HEADER_NAME', 'Authorization');
const UPSTREAM_TIMEOUT_MS = Number(getEnv('UPSTREAM_TIMEOUT_MS', 60000));

const RATE_LIMIT_TOKENS = Number(getEnv('RATE_LIMIT_TOKENS', 60));
const RATE_LIMIT_REFILL_PER_SEC = Number(getEnv('RATE_LIMIT_REFILL_PER_SEC', 1));

const CACHE_TTL_MS = Number(getEnv('CACHE_TTL_MS', 60000));
const CACHE_MAX_ENTRIES = Number(getEnv('CACHE_MAX_ENTRIES', 500));
const CACHE_ONLY_SUCCESS = parseBoolean(getEnv('CACHE_ONLY_SUCCESS', 'true'));

const ADMIN_TOKEN = getEnv('ADMIN_TOKEN', 'changeme');

// Observability counters
const counters = {
  total_requests: 0,
  cache_hits: 0,
  cache_misses: 0,
  cache_bypass: 0,
  cache_stores: 0,
  rate_limited: 0,
  upstream_errors: 0,
  in_flight: 0
};

// Shared components
const cache = new TTLCache({ ttlMs: CACHE_TTL_MS, maxEntries: CACHE_MAX_ENTRIES });
const limiter = new RateLimiter({ maxTokens: RATE_LIMIT_TOKENS, refillPerSec: RATE_LIMIT_REFILL_PER_SEC });

const morganLogger = morgan(':method :url :status :res[content-length] - :response-time ms', {
  skip: () => process.env.NODE_ENV === 'test'
});


const app = http.createServer(async (req, res) => {
  const start = Date.now();
  counters.total_requests++;
  counters.in_flight++;

  // Attach morgan logging (wrap once per request)
  await new Promise(resolve => morganLogger(req, res, resolve));

  const done = (status, body, headers = {}) => {
    res.statusCode = status;
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
      res.end(body);
    } else {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    }
    counters.in_flight--;
    const dur = Date.now() - start;
    logger.info('request.done', { path: req.url, method: req.method, status, duration_ms: dur });
  };

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === '/healthz') {
      return done(200, { status: 'ok', uptime_s: process.uptime() });
    }

    if (path === '/metrics') {
      const lines = [
        `total_requests ${counters.total_requests}`,
        `cache_hits ${counters.cache_hits}`,
        `cache_misses ${counters.cache_misses}`,
        `cache_bypass ${counters.cache_bypass}`,
        `cache_stores ${counters.cache_stores}`,
        `rate_limited ${counters.rate_limited}`,
        `upstream_errors ${counters.upstream_errors}`,
        `in_flight ${counters.in_flight}`,
        `cache_size ${cache.snapshot().size}`,
        `cache_hits_internal ${cache.snapshot().hits}`,
        `cache_misses_internal ${cache.snapshot().misses}`,
        `cache_stores_internal ${cache.snapshot().stores}`,
        `cache_evictions ${cache.snapshot().evictions}`,
        `rate_buckets ${limiter.snapshot().buckets}`,
        `rate_limited_internal ${limiter.snapshot().limited}`
      ];
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      return done(200, lines.join('\n') + '\n');
    }

    if (path === '/admin/cache/purge' && req.method === 'POST') {
      const token = req.headers['x-admin-token'];
      if (!token || token !== ADMIN_TOKEN) {
        return done(401, { error: 'unauthorized' });
      }
      const adminBody = await readBody(req);
      const adminObj = safeJsonParse(adminBody) || {};
      const key = adminObj.key;
      if (key === '*') {
        cache.clear();
        return done(200, { ok: true, cleared: true });
      }
      if (typeof key === 'string') {
        const deleted = cache.del(key);
        return done(200, { ok: true, deleted });
      }
      return done(400, { error: 'bad_request', hint: 'Provide {"key":"*"} or a specific cache key' });
    }

    // Only proxy /v1/* endpoints
    if (!path.startsWith('/v1/')) {
      return done(404, { error: 'not_found', hint: 'Use /v1/* endpoints or /healthz, /metrics' });
    }

    // Rate limit per client
    const clientId = pickClientId(req);
    const rl = limiter.tryRemoveToken(clientId);
    res.setHeader('x-rate-remaining', String(rl.remaining));
    if (!rl.ok) {
      counters.rate_limited++;
      res.setHeader('retry-after', '1');
      return done(429, { error: 'rate_limited', message: 'Too Many Requests' });
    }

    const rawBody = await readBody(req);
    const contentType = req.headers['content-type'] || '';
    const isJson = contentType.includes('application/json');
    const parsed = isJson ? safeJsonParse(rawBody) : null;

    const cacheInvalidate = parseBoolean(req.headers['x-cache-invalidate']);
    const bypass = cacheInvalidate || (parsed && isLikelyStream(parsed));


    const authHeader = req.headers['authorization'] || '';
    const authHash = authHeader ? `auth:${hashString(authHeader)}` : (UPSTREAM_API_KEY ? `auth:${hashString(UPSTREAM_API_KEY)}` : 'auth:none');
    const bodyKey = req.method === 'GET' ? '' : `:${hashBody(rawBody || '')}`;
    const cacheKey = `${req.method}:${path}${url.search}:${authHash}${bodyKey}`;

    if (bypass) {
      counters.cache_bypass++;
      res.setHeader('x-cache', cacheInvalidate ? 'bypass-invalidate' : 'bypass');
    } else {
      const hit = cache.get(cacheKey);
      if (hit) {
        counters.cache_hits++;
        res.setHeader('x-cache', 'hit');
        for (const [k, v] of Object.entries(hit.headers)) res.setHeader(k, v);
        res.statusCode = hit.status;
        counters.in_flight--;
        logger.debug('cache.hit', { key: cacheKey });
        return res.end(hit.body);
      }
      counters.cache_misses++;
      res.setHeader('x-cache', 'miss');
    }

    const upstreamUrl = buildUpstreamUrl(UPSTREAM_BASE_URL, path, req.url);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (!v) continue;
      const lk = k.toLowerCase();
      if (['connection', 'content-length', 'host'].includes(lk)) continue;
      if (lk === 'authorization') continue;
      headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    }

    if (UPSTREAM_API_KEY && UPSTREAM_API_KEY.trim() !== '') {
      headers.set(UPSTREAM_AUTH_HEADER_NAME, `Bearer ${UPSTREAM_API_KEY.trim()}`);
    } else if (authHeader) {
      headers.set(UPSTREAM_AUTH_HEADER_NAME, authHeader);
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(new Error('upstream_timeout')), UPSTREAM_TIMEOUT_MS);

    let upstreamResp;
    try {
      upstreamResp = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : rawBody,
        signal: controller.signal
      });
    } catch (e) {
      counters.upstream_errors++;
      clearTimeout(t);
      logger.error('upstream.fetch.error', { error: String(e), path });
      return done(502, { error: 'bad_gateway', message: 'Upstream fetch failed' });
    } finally {
      clearTimeout(t);
    }

    const respBuffer = Buffer.from(await upstreamResp.arrayBuffer());
    const respHeaders = {};
    upstreamResp.headers.forEach((v, k) => {
      if (['transfer-encoding', 'connection'].includes(k.toLowerCase())) return;
      respHeaders[k] = v;
    });
    respHeaders['x-cache'] = res.getHeader('x-cache') || 'miss';

    const isOk = upstreamResp.status >= 200 && upstreamResp.status < 300;
    const shouldCache = !bypass && (!CACHE_ONLY_SUCCESS || isOk) && req.method === 'POST';
    if (shouldCache) {
      cache.set(cacheKey, {
        status: upstreamResp.status,
        headers: respHeaders,
        body: respBuffer
      });
      counters.cache_stores++;
      logger.debug('cache.store', { key: cacheKey });
    }

    res.statusCode = upstreamResp.status;
    for (const [k, v] of Object.entries(respHeaders)) res.setHeader(k, v);
    res.end(respBuffer);

  } catch (e) {
    counters.in_flight--;
    counters.upstream_errors++;
    logger.error('server.error', { error: String(e) });
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
});

function hashString(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

app.listen(PORT, HOST, () => {
  logger.info('server.start', {
    host: HOST,
    port: PORT,
    upstream: UPSTREAM_BASE_URL,
    rate_limit: { tokens: RATE_LIMIT_TOKENS, refill_per_sec: RATE_LIMIT_REFILL_PER_SEC },
    cache: { ttl_ms: CACHE_TTL_MS, max_entries: CACHE_MAX_ENTRIES }
  });
});
