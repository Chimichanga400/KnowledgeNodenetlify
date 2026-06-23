/**
 * Netlify Function — Claude API Proxy (hardened)
 * Uses Node.js built-in https — no dependencies.
 *
 * Security controls:
 *  - Origin policy: same-site and the Capacitor webview origins are allowed by
 *    default; other browser origins are rejected (blocks other sites from
 *    spending the owner's key). Add more via ALLOWED_ORIGINS (comma-separated).
 *  - Optional shared secret: if PROXY_APP_TOKEN is set, requests must send a
 *    matching x-app-token header.
 *  - Optional model allow-list via ALLOWED_MODELS (comma-separated).
 *  - max_tokens clamped, request body size capped.
 *  - Generic error messages (no internal detail leaked).
 *
 * NOTE: CORS does not stop non-browser callers. The token + model allow-list +
 * platform rate limiting are what constrain scripted abuse. Enable a rate limit
 * in Netlify and set PROXY_APP_TOKEN for the strongest posture.
 */
const https = require('https');
const {
  createMemoryStore, createEntitlementVerifier, quotaAllow, revenueCatFetch,
  anthropicToOpenAI, openAIToAnthropic, forwardJSON,
} = require('./_proxylib.js');
const { createConfigStore } = require('./_configstore.js');

const _configStore = createConfigStore();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const MAX_BODY_BYTES = 25 * 1024 * 1024; // generous — base64 images travel in the body
const MAX_TOKENS_CEIL = 32768;
const DEFAULT_ALLOWED_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost'];

// ── Managed-AI cost control (paywall enforcement) ──────────────────────────
const RC_SECRET        = process.env.REVENUECAT_SECRET_KEY || '';
const RC_ENTITLEMENT   = process.env.REVENUECAT_ENTITLEMENT_ID || 'premium';
const DAILY_USER_MAX   = parseInt(process.env.DAILY_USER_MAX   || '200',  10);
const DAILY_GLOBAL_MAX = parseInt(process.env.DAILY_GLOBAL_MAX || '5000', 10);
const FAIL_OPEN        = process.env.ENTITLEMENT_FAIL_OPEN === '1';

const _store = createMemoryStore(); // swap for Upstash/Netlify KV in production
const _isEntitled = createEntitlementVerifier({
  secretKey: RC_SECRET, entitlementId: RC_ENTITLEMENT,
  fetchImpl: RC_SECRET ? revenueCatFetch(RC_SECRET) : null, failOpen: FAIL_OPEN,
});
if (!RC_SECRET) {
  console.warn('[claude-proxy] REVENUECAT_SECRET_KEY not set — entitlement checks DISABLED (dev mode). Set it before any public release.');
}

// Best-effort per-IP rate limit (per warm instance). Not a cross-instance
// guarantee — enable Netlify rate limiting / a KV store for production scale.
const RATE_LIMIT_MAX    = parseInt(process.env.RATE_LIMIT_MAX || '60', 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const _hits = new Map(); // ip -> [timestamps]

function rateLimited(ip) {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW);
  arr.push(now);
  _hits.set(ip, arr);
  if (_hits.size > 5000) {
    for (const [k, v] of _hits) {
      if (!v.length || now - v[v.length - 1] > RATE_LIMIT_WINDOW) _hits.delete(k);
    }
  }
  return arr.length > RATE_LIMIT_MAX;
}

function clientIp(headers) {
  return ((headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '').split(',')[0].trim()) || 'unknown';
}

if (!process.env.PROXY_APP_TOKEN) {
  console.warn('[claude-proxy] PROXY_APP_TOKEN is not set — anyone who finds this URL can spend the API key. Set it for any public deployment.');
}

function originAllowed(origin, host) {
  if (!origin) return true; // native (CapacitorHttp) sends no browser Origin
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (DEFAULT_ALLOWED_ORIGINS.includes(origin) || extra.includes(origin)) return true;
  try { return new URL(origin).host === host; } catch (e) { return false; }
}

exports.handler = async (event) => {
  const headers = event.headers || {};
  const origin  = headers.origin || headers.Origin || '';
  const host    = headers.host || headers.Host || '';
  const allowed = originAllowed(origin, host);

  const corsHeaders = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, x-app-token, x-app-user-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  // Only echo the origin back when it's allowed (so other sites can't read responses).
  if (origin && allowed) corsHeaders['Access-Control-Allow-Origin'] = origin;

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Method Not Allowed' } }) };

  // Reject cross-origin browser requests outright (don't spend the key for them).
  if (origin && !allowed) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Origin not allowed' } }) };
  }

  // Optional shared secret.
  const requiredToken = process.env.PROXY_APP_TOKEN;
  if (requiredToken && (headers['x-app-token'] || headers['X-App-Token']) !== requiredToken) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Unauthorized' } }) };
  }

  if (rateLimited(clientIp(headers))) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Rate limit exceeded. Try again shortly.' } }) };
  }

  // ── Paywall enforcement: live subscription required, within daily caps ──
  const userId = String(headers['x-app-user-id'] || headers['X-App-User-Id'] || '').trim();
  if (!userId) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Missing subscriber id' } }) };
  }
  const ent = await _isEntitled(userId);
  if (!ent.ok) {
    return { statusCode: 402, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Subscription required' } }) };
  }
  const quota = await quotaAllow(_store, { userId, userMax: DAILY_USER_MAX, globalMax: DAILY_GLOBAL_MAX });
  if (!quota.ok) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: { message: quota.scope === 'global'
      ? 'Service is at capacity for today — please try again tomorrow.'
      : 'Daily usage limit reached for your plan. It resets at 00:00 UTC.' } }) };
  }

  const raw = event.body || '{}';
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return { statusCode: 413, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Request too large' } }) };
  }

  let bodyObj;
  try { bodyObj = JSON.parse(raw); }
  catch (e) { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Bad request body' } }) }; }

  if (typeof bodyObj.max_tokens === 'number') {
    bodyObj.max_tokens = Math.max(1, Math.min(bodyObj.max_tokens, MAX_TOKENS_CEIL));
  }

  // Admin-selected upstream (provider + model) replaces the requested model.
  const aiCfg = await _configStore.get();
  const allowedModels = (process.env.ALLOWED_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowedModels.length && !allowedModels.includes(aiCfg.model)) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Configured model not allowed' } }) };
  }

  try {
    if (aiCfg.provider === 'openrouter') {
      if (!OPENROUTER_API_KEY) {
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: { message: 'OpenRouter key not configured on server' } }) };
      }
      const oai = anthropicToOpenAI(bodyObj, aiCfg.model);
      const r = await forwardJSON({
        hostname: 'openrouter.ai', path: '/api/v1/chat/completions',
        headers: { 'Authorization': 'Bearer ' + OPENROUTER_API_KEY, 'HTTP-Referer': 'https://knowledgenode.app', 'X-Title': 'KnowledgeNode' },
      }, JSON.stringify(oai));
      if (r.status >= 400) return { statusCode: r.status, headers: corsHeaders, body: r.body };
      let parsedResp = {}; try { parsedResp = JSON.parse(r.body || '{}'); } catch (e) {}
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(openAIToAnthropic(parsedResp)) };
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: { message: 'API key not set. Add ANTHROPIC_API_KEY.' } }) };
    }
    bodyObj.model = aiCfg.model || bodyObj.model; // admin override
    const r = await forwardJSON({
      hostname: 'api.anthropic.com', path: '/v1/messages',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    }, JSON.stringify(bodyObj));
    return { statusCode: r.status, headers: corsHeaders, body: r.body };
  } catch (err) {
    console.error('[claude-proxy] upstream error:', err && err.message);
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: { message: 'Upstream request failed' } }) };
  }
};
