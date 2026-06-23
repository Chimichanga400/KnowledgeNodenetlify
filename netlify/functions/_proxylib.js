/**
 * _proxylib.js — shared cost-control + entitlement logic for the Claude proxy.
 *
 * Managed-AI model: the owner's ANTHROPIC_API_KEY is spent only for users who
 * (a) present a valid RevenueCat app-user-id with an ACTIVE entitlement, and
 * (b) are within both a per-user daily cap and a global daily circuit-breaker.
 *
 * Everything here is dependency-injected (fetch + store + clock) so it can be
 * unit-tested without network or a real KV store. The handlers wire the real
 * implementations from env.
 *
 * ⚠ PRODUCTION NOTE: the default in-memory store is best-effort PER WARM
 * serverless instance — it is NOT shared across instances and resets on cold
 * start, so the daily caps are approximate. For a hard guarantee, wire a real
 * KV store (Upstash Redis / Vercel KV) via createStore() below. Your ultimate,
 * un-bypassable ceiling is still the spend limit you set in the Anthropic
 * dashboard — set that too.
 */
'use strict';
const https = require('https');

function todayUTC(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Best-effort in-memory counter store. Keys are namespaced by UTC day so old
 *  days fall out naturally; we also prune if the map grows large. */
function createMemoryStore() {
  const m = new Map(); // 'day:key' -> count
  return {
    async incr(key, day) {
      const k = day + ':' + key;
      const next = (m.get(k) || 0) + 1;
      m.set(k, next);
      if (m.size > 50000) {
        for (const kk of m.keys()) if (!kk.startsWith(day + ':')) m.delete(kk);
      }
      return next;
    },
  };
}

/** Verify a RevenueCat app-user-id has an ACTIVE entitlement, with a short
 *  in-memory cache so we don't call RevenueCat on every request.
 *  fetchImpl(userId) must resolve to the parsed RevenueCat subscriber JSON. */
function createEntitlementVerifier(opts) {
  const {
    secretKey, entitlementId, fetchImpl,
    cacheMs = 5 * 60 * 1000, failOpen = false, now = Date.now,
  } = opts;
  const cache = new Map(); // userId -> { ok, exp }
  return async function isEntitled(userId) {
    // Dev convenience: with no secret configured, skip the check (handler warns).
    if (!secretKey) return { ok: true, reason: 'dev-no-secret' };
    const t = now();
    const c = cache.get(userId);
    if (c && c.exp > t) return { ok: c.ok, reason: 'cache' };
    let ok = false, reason = 'checked';
    try {
      const data = await fetchImpl(userId);
      const ent = data && data.subscriber && data.subscriber.entitlements
        && data.subscriber.entitlements[entitlementId];
      if (ent) {
        const exp = ent.expires_date ? Date.parse(ent.expires_date) : Infinity; // null = lifetime
        ok = exp > t;
      }
    } catch (e) {
      // On a RevenueCat outage, fail CLOSED by default (protect spend); the
      // operator can set ENTITLEMENT_FAIL_OPEN=1 to favour availability instead.
      reason = 'error';
      ok = !!failOpen;
    }
    cache.set(userId, { ok, exp: t + cacheMs });
    return { ok, reason };
  };
}

/** Increment the global + per-user daily counters and report whether the
 *  request is within both caps. Global is checked first so a single user can
 *  never push the whole service past the circuit-breaker. */
async function quotaAllow(store, opts) {
  const { userId, userMax, globalMax, now = Date.now() } = opts;
  const day = todayUTC(now);
  if (globalMax) {
    const g = await store.incr('__global__', day);
    if (g > globalMax) return { ok: false, scope: 'global' };
  }
  if (userMax) {
    const u = await store.incr('user:' + userId, day);
    if (u > userMax) return { ok: false, scope: 'user' };
  }
  return { ok: true };
}

/** Real RevenueCat REST lookup (v1). Uses the SECRET key — server-side only. */
function revenueCatFetch(secretKey) {
  return (userId) => new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.revenuecat.com',
      path: '/v1/subscribers/' + encodeURIComponent(userId),
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + secretKey, 'Content-Type': 'application/json' },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error('RevenueCat ' + res.statusCode));
        try { resolve(JSON.parse(d || '{}')); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   PROVIDER TRANSLATION
   The app always sends an Anthropic-native payload. To route to OpenRouter
   (which is OpenAI-format) we translate the request and translate the response
   back to Anthropic shape, so the client parser never changes.
   ────────────────────────────────────────────────────────────────────────── */

/** Anthropic /v1/messages payload  →  OpenAI/OpenRouter chat payload. */
function anthropicToOpenAI(payload, model) {
  const msgs = [];
  if (payload.system) {
    const sys = Array.isArray(payload.system)
      ? payload.system.map(s => (s && s.text) || '').join('\n')
      : String(payload.system);
    if (sys) msgs.push({ role: 'system', content: sys });
  }
  for (const m of payload.messages || []) {
    if (typeof m.content === 'string') { msgs.push({ role: m.role, content: m.content }); continue; }
    const parts = [];
    for (const c of (m.content || [])) {
      if (c.type === 'text') parts.push({ type: 'text', text: c.text });
      else if (c.type === 'image' && c.source) parts.push({ type: 'image_url', image_url: { url: 'data:' + c.source.media_type + ';base64,' + c.source.data } });
      else if (c.type === 'image_url') parts.push(c);
    }
    msgs.push({ role: m.role, content: parts });
  }
  return { model, messages: msgs, max_tokens: payload.max_tokens };
}

/** OpenAI/OpenRouter chat response  →  Anthropic-shaped response the client expects. */
function openAIToAnthropic(resp) {
  const text = resp && resp.choices && resp.choices[0] && resp.choices[0].message
    ? (resp.choices[0].message.content || '') : '';
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn', model: resp && resp.model };
}

/** Forward a JSON body over HTTPS and resolve { status, body }. No dependencies. */
function forwardJSON({ hostname, path, headers }, payloadStr) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, port: 443, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payloadStr) }, headers),
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(payloadStr);
    req.end();
  });
}

module.exports = {
  todayUTC, createMemoryStore, createEntitlementVerifier, quotaAllow, revenueCatFetch,
  anthropicToOpenAI, openAIToAnthropic, forwardJSON,
};
