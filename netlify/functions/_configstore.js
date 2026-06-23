/**
 * _configstore.js — shared, runtime-switchable AI routing config.
 *
 * The admin dashboard writes { provider, model } here; the proxy reads it on
 * each request (with a short cache) and routes accordingly. Because serverless
 * functions don't share memory, LIVE switching requires a shared KV store —
 * this uses the Upstash Redis REST API (HTTP, serverless-friendly). If KV env
 * vars aren't set, it falls back to env defaults (static — no live switching).
 *
 * Env:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN   (enable live switching)
 *   DEFAULT_UPSTREAM_PROVIDER   ('anthropic' | 'openrouter', default 'anthropic')
 *   DEFAULT_UPSTREAM_MODEL       (e.g. 'claude-sonnet-4-6' or 'openai/gpt-4o-mini')
 */
'use strict';

const KEY = 'kn:ai-config';
const VALID_PROVIDERS = ['anthropic', 'openrouter'];

function envDefaults() {
  const provider = VALID_PROVIDERS.includes(process.env.DEFAULT_UPSTREAM_PROVIDER)
    ? process.env.DEFAULT_UPSTREAM_PROVIDER : 'anthropic';
  const model = process.env.DEFAULT_UPSTREAM_MODEL
    || (provider === 'openrouter' ? 'openai/gpt-4o-mini' : 'claude-sonnet-4-6');
  return { provider, model };
}

/** Validate/normalise an incoming config object (from the admin dashboard). */
function sanitizeConfig(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const provider = VALID_PROVIDERS.includes(obj.provider) ? obj.provider : null;
  const model = typeof obj.model === 'string' ? obj.model.trim() : '';
  if (!provider || !model || model.length > 200) return null;
  return { provider, model };
}

function createConfigStore(opts = {}) {
  const url    = opts.url   || process.env.UPSTASH_REDIS_REST_URL || '';
  const token  = opts.token || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  const fetchImpl = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  const cacheMs   = opts.cacheMs != null ? opts.cacheMs : 30000;
  const now       = opts.now || Date.now;
  const defaults  = opts.defaults || envDefaults();
  const enabled   = !!(url && token && fetchImpl);

  let cache = null, cacheExp = 0;

  async function readKV() {
    const res = await fetchImpl(url + '/get/' + KEY, { headers: { Authorization: 'Bearer ' + token } });
    const j = await res.json().catch(() => ({}));
    if (j && typeof j.result === 'string') { try { return sanitizeConfig(JSON.parse(j.result)); } catch (e) { return null; } }
    return null;
  }

  return {
    enabled,
    async get() {
      const t = now();
      if (cache && cacheExp > t) return cache;
      let cfg = null;
      if (enabled) { try { cfg = await readKV(); } catch (e) {} }
      cfg = cfg || defaults;
      cache = cfg; cacheExp = t + cacheMs;
      return cfg;
    },
    async set(obj) {
      const cfg = sanitizeConfig(obj);
      if (!cfg) throw new Error('Invalid config (need provider in [anthropic, openrouter] + model)');
      if (!enabled) throw new Error('No KV configured — set UPSTASH_REDIS_REST_URL/TOKEN to enable live switching');
      const val = encodeURIComponent(JSON.stringify(cfg));
      const res = await fetchImpl(url + '/set/' + KEY + '/' + val, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('KV write failed ' + res.status);
      cache = cfg; cacheExp = now() + cacheMs;
      return cfg;
    },
    _invalidate() { cache = null; cacheExp = 0; },
  };
}

module.exports = { createConfigStore, sanitizeConfig, envDefaults, VALID_PROVIDERS };
