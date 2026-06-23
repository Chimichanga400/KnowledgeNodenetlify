/**
 * admin-config.js (Netlify) — admin control plane for AI routing.
 * See api/admin-config.js for full docs. Auth via x-admin-token == ADMIN_TOKEN;
 * disabled (503) if ADMIN_TOKEN is unset.
 */
const { createConfigStore } = require('./_configstore.js');
const { anthropicToOpenAI, forwardJSON } = require('./_proxylib.js');

const _configStore = createConfigStore();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const PRESETS = [
  { provider: 'anthropic',  model: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6',  cost: '$$$  — best writing/reasoning' },
  { provider: 'anthropic',  model: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5',   cost: '$$   — fast, ~4–5× cheaper than Sonnet' },
  { provider: 'openrouter', model: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku (via OR)', cost: '$$' },
  { provider: 'openrouter', model: 'google/gemini-2.5-flash',    label: 'Gemini 2.5 Flash',   cost: '$    — ~10× cheaper than Sonnet' },
  { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', cost: '¢    — cheapest' },
  { provider: 'openrouter', model: 'openai/gpt-4o-mini',         label: 'GPT-4o mini',        cost: '$    — ~15–20× cheaper than Sonnet' },
  { provider: 'openrouter', model: 'openai/gpt-4o',              label: 'GPT-4o',             cost: '$$$' },
  { provider: 'openrouter', model: 'google/gemini-2.5-pro',      label: 'Gemini 2.5 Pro',     cost: '$$$' },
];

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

async function pingUpstream(provider, model) {
  const t = Date.now();
  if (provider === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY || '';
    if (!key) return { ok: false, error: 'OPENROUTER_API_KEY not set' };
    const r = await forwardJSON({ hostname: 'openrouter.ai', path: '/api/v1/chat/completions',
      headers: { 'Authorization': 'Bearer ' + key } },
      JSON.stringify(anthropicToOpenAI({ messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }, model)));
    return { ok: r.status < 400, status: r.status, ms: Date.now() - t, body: r.status >= 400 ? r.body.slice(0, 300) : undefined };
  }
  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) return { ok: false, error: 'ANTHROPIC_API_KEY not set' };
  const r = await forwardJSON({ hostname: 'api.anthropic.com', path: '/v1/messages',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } },
    JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }));
  return { ok: r.status < 400, status: r.status, ms: Date.now() - t, body: r.status >= 400 ? r.body.slice(0, 300) : undefined };
}

exports.handler = async (event) => {
  if (!ADMIN_TOKEN) return { statusCode: 503, headers: H, body: JSON.stringify({ error: { message: 'Admin disabled — set ADMIN_TOKEN' } }) };
  const headers = event.headers || {};
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: Object.assign({}, H, { 'Access-Control-Allow-Headers': 'Content-Type, x-admin-token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }), body: '' };
  }
  if ((headers['x-admin-token'] || headers['X-Admin-Token'] || '') !== ADMIN_TOKEN) {
    return { statusCode: 401, headers: H, body: JSON.stringify({ error: { message: 'Unauthorized' } }) };
  }
  try {
    if (event.httpMethod === 'GET') {
      const config = await _configStore.get();
      return { statusCode: 200, headers: H, body: JSON.stringify({ config, presets: PRESETS, kvEnabled: _configStore.enabled }) };
    }
    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (e) {}
      if (body.action === 'test') {
        return { statusCode: 200, headers: H, body: JSON.stringify(await pingUpstream(body.provider, body.model)) };
      }
      const config = await _configStore.set({ provider: body.provider, model: body.model });
      return { statusCode: 200, headers: H, body: JSON.stringify({ config, saved: true }) };
    }
    return { statusCode: 405, headers: H, body: JSON.stringify({ error: { message: 'Method not allowed' } }) };
  } catch (e) {
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: { message: (e && e.message) || 'Request failed' } }) };
  }
};
