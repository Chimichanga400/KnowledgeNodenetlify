'use strict';

/* ================= constants & state ================= */

const STORAGE_KEY = 'stretch-rand-v2';
const PROXY_PATH = '/.netlify/functions/claude-proxy';
const MODEL = 'claude-opus-4-8'; // server admin config may override

const STORES = ['Shoprite', 'Checkers', 'Pick n Pay', 'Boxer', 'Spar', 'USave', 'Makro', 'Woolworths', "Food Lover's"];
const STAPLES = ['Maize meal', 'Rice', 'Brown bread', 'Eggs', 'Sunflower oil', 'Sugar', 'Dry beans', 'Tinned fish', 'Cabbage', 'Onions', 'Potatoes', 'Milk'];
const CAT_ORDER = ['starch', 'protein', 'veg', 'dairy', 'other'];
const CAT_LABEL = { starch: 'Starch', protein: 'Protein', veg: 'Veg', dairy: 'Dairy', other: 'Other' };

const uid = () => Math.random().toString(36).slice(2, 10);

let state = {
  settings: { budget: '', days: '7', adults: '2', kids: '0' },
  pantry: [],   // {id, name, qty}
  prices: [],   // {id, item, price, store, date} — learned from in-store price corrections
  deals: [],    // {id, item, key, qty, price, unitPrice, unitLabel, store}
  plan: null,   // {list:[{id,i,q,p,estimated,cat,store,checked}], pantryUsed, warnings, days, budget, madeAt}
  tweak: '',
  lastStore: '',
  appToken: '',
  serverBase: '',
  apiKey: '',
  userId: '',
};

// transient (not saved)
let dealsDraft = null; // {store, items:[{id,name,key,qty,price,unitPrice,unitLabel,include}]}
let activeTab = 'plan';
let editing = null;    // {type:'price', id} | {type:'meal', idx, slot}

/* ================= persistence ================= */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      state = Object.assign(state, d);
      state.settings = Object.assign({ budget: '', days: '7', adults: '2', kids: '0' }, d.settings);
    }
  } catch (e) { /* corrupted or unavailable — start fresh */ }
  if (!state.userId) state.userId = 'web-' + uid() + uid();
}

let saveTimer = null;
function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* full/private mode */ }
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 300);
}
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

/* ================= helpers ================= */

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const fmtR = (n) => 'R' + (Math.round(Number(n) * 100) / 100).toFixed(2);
const fmtR1 = (n) => 'R' + (Math.round(Number(n) * 100) / 100).toFixed(n < 10 ? 2 : 2);

function showErr(id, msg) {
  const el = $(id);
  if (!el) return;
  if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
  else { el.textContent = ''; el.classList.add('hidden'); }
}

function parseJSONLoose(text) {
  let clean = String(text).trim()
    .replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const first = clean.search(/[{[]/);
  if (first > 0) clean = clean.slice(first);
  try { return JSON.parse(clean); } catch (e) { /* try trimming a cut-off tail */ }
  for (const closer of ['}', ']']) {
    const last = clean.lastIndexOf(closer);
    if (last > 0) {
      try { return JSON.parse(clean.slice(0, last + 1)); } catch (e2) { /* keep trying */ }
    }
  }
  throw new Error('unparseable');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function downscaleImage(file, maxEdge = 1568) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
        fileToBase64(file).then((data) => resolve({ data, mediaType: file.type || 'image/jpeg' }), reject);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      resolve({ data: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

// Generic product key for cross-store matching, when the AI didn't supply one.
function deriveKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+(\.\d+)?\s?(kg|g|ml|l|litre|liter|pack|pk|x|ea|s)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ').slice(0, 3).join(' ');
}

// Comparable price per standard unit (per kg / per L / each), when size is known.
function unitPriceOf(price, sizeValue, sizeUnit) {
  const p = Number(price), sv = Number(sizeValue);
  if (!p || !sv || sv <= 0 || !sizeUnit) return null;
  const su = String(sizeUnit).toLowerCase();
  if (su === 'kg') return { v: p / sv, label: '/kg' };
  if (su === 'g') return { v: p / (sv / 1000), label: '/kg' };
  if (su === 'l' || su === 'litre' || su === 'liter') return { v: p / sv, label: '/L' };
  if (su === 'ml') return { v: p / (sv / 1000), label: '/L' };
  if (su === 'ea' || su === 'each' || su === 'unit') return { v: p / sv, label: ' each' };
  return null;
}

/* ================= working overlay ================= */

function showOverlay(msg) {
  $('#overlay-msg').textContent = msg || 'Working…';
  $('#overlay').classList.remove('hidden');
}
function hideOverlay() { $('#overlay').classList.add('hidden'); }

/* ================= AI calls ================= */

function proxyUrl() {
  let base = (state.serverBase || '').trim().replace(/\/+$/, '');
  if (base && !/^https?:\/\//i.test(base)) base = 'https://' + base;
  if (base) return base + PROXY_PATH;
  if (!/^https?:$/.test(location.protocol)) {
    throw new Error('AI needs a connection. On the Plan tab, open Connection settings and paste your Anthropic API key (works anywhere) — or enter your site address (e.g. https://your-site.netlify.app).');
  }
  return PROXY_PATH;
}

async function callClaude({ system, userContent, maxTokens = 3000 }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error("You're offline. Connect to the internet to read deals or build a plan — everything else keeps working.");
  }
  const url = state.apiKey ? 'https://api.anthropic.com/v1/messages' : proxyUrl();
  const headers = { 'Content-Type': 'application/json' };
  if (state.apiKey) {
    headers['x-api-key'] = state.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else {
    headers['x-app-user-id'] = state.userId;
    if (state.appToken) headers['x-app-token'] = state.appToken;
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userContent }] }),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      const hosted = /^https?:$/.test(location.protocol);
      if (state.apiKey) throw new Error("Couldn't reach the AI service. Check your internet connection and try again.");
      throw new Error(hosted && !state.serverBase
        ? "Couldn't reach the AI server. Check your internet connection and try again."
        : "Couldn't reach the AI server. Check your internet, the Server address under Connection settings, and that your App token is filled in.");
    }
    throw e;
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON error body */ }

  if (!res.ok) {
    const serverMsg = data && data.error && data.error.message;
    if (res.status === 401) throw new Error(state.apiKey
      ? 'That API key was rejected — check it under Connection settings on the Plan tab.'
      : (serverMsg === 'Unauthorized'
        ? 'This server needs an app token — add it under Connection settings on the Plan tab.'
        : 'Not authorised. Check the app token under Connection settings.'));
    if (res.status === 402) throw new Error('The AI service on this server requires a subscription.');
    if (res.status === 429) throw new Error('Too many requests — wait a minute and try again.');
    throw new Error(serverMsg || ('Request failed (' + res.status + '). Are you online?'));
  }
  return (data.content || []).map((b) => b.text || '').join('');
}

/* ================= derived values ================= */

function household() {
  const budget = parseFloat(state.settings.budget) || 0;
  const days = parseInt(state.settings.days, 10) || 0;
  const adults = parseInt(state.settings.adults, 10) || 0;
  const kids = parseInt(state.settings.kids, 10) || 0;
  const heads = adults + kids;
  const perPersonWeek = heads > 0 && days > 0 ? budget / heads / (days / 7) : 0;
  return { budget, days, adults, kids, heads, perPersonWeek, complete: budget > 0 && days > 0 && heads > 0 };
}

function planTotal() {
  if (!state.plan) return 0;
  return state.plan.list.reduce((s, it) => s + (Number(it.p) || 0), 0);
}
function basketTotal() {
  if (!state.plan) return 0;
  return state.plan.list.reduce((s, it) => s + (it.checked ? Number(it.p) || 0 : 0), 0);
}

// Distinct stores present across saved deals.
function dealStores() {
  return [...new Set(state.deals.map((d) => d.store).filter(Boolean))];
}

// Group deals by generic key; return comparison rows for keys sold at 2+ stores.
function computeComparison() {
  const groups = {};
  for (const d of state.deals) {
    const key = d.key || deriveKey(d.item);
    if (!key) continue;
    (groups[key] = groups[key] || []).push(d);
  }
  const rows = [];
  for (const key of Object.keys(groups)) {
    // best offer per store (cheapest by unit price if known, else raw price)
    const perStore = {};
    for (const d of groups[key]) {
      const store = d.store || 'Unknown';
      const cur = perStore[store];
      const cmp = (d.unitPrice != null) ? d.unitPrice : d.price;
      if (!cur || cmp < cur.cmp) perStore[store] = { store, price: d.price, qty: d.qty, unitPrice: d.unitPrice, unitLabel: d.unitLabel, name: d.item, cmp };
    }
    const offers = Object.values(perStore);
    if (offers.length < 2) continue;
    const allUnit = offers.every((o) => o.unitPrice != null);
    offers.sort((a, b) => (allUnit ? a.unitPrice - b.unitPrice : a.price - b.price));
    const best = offers[0], worst = offers[offers.length - 1];
    const label = groups[key].map((d) => d.item).sort((a, b) => a.length - b.length)[0] || key;
    let saving;
    if (allUnit && worst.unitPrice > 0) {
      saving = Math.round((1 - best.unitPrice / worst.unitPrice) * 100) + '% cheaper' + (best.unitLabel || '');
    } else {
      saving = 'Save ' + fmtR(worst.price - best.price);
    }
    rows.push({ key, label, offers, best, allUnit, saving });
  }
  rows.sort((a, b) => a.label.localeCompare(b.label));
  return rows;
}

/* ================= plan generation ================= */

function setBuildBusy(busy, text) {
  document.querySelectorAll('[data-action="build"]').forEach((b) => {
    b.disabled = busy;
    if (busy) b.textContent = text;
  });
  if (!busy) {
    const main = $('#btn-build');
    if (main) main.textContent = state.plan ? 'Rebuild my plan' : 'Build my plan';
  }
}

async function generatePlan() {
  const h = household();
  showErr('#err-build', '');
  if (!h.complete) {
    showErr('#err-build', 'Fill in your budget, days and household size first.');
    switchTab('plan');
    return;
  }
  const tweak = (state.tweak || '').trim();

  const latest = {};
  [...state.prices].reverse().forEach((p) => { latest[p.item.toLowerCase()] = p; });
  const priceList = Object.values(latest).map((p) => `${p.item}: R${p.price} (${p.store})`).join('; ') || 'none known';

  // multi-store deal prices, grouped so the model can pick the cheapest store per item
  const byKey = {};
  for (const d of state.deals) {
    const key = d.key || deriveKey(d.item) || d.item;
    (byKey[key] = byKey[key] || []).push(`${d.store || '?'} R${d.price}${d.unitPrice != null ? ` (${fmtR(d.unitPrice)}${d.unitLabel})` : (d.qty ? ` (${d.qty})` : '')}`);
  }
  const dealList = Object.keys(byKey).map((k) => `${k}: ${byKey[k].join(' vs ')}`).join('; ') || 'none';
  const pantryList = state.pantry.map((p) => `${p.name} (${p.qty || 'qty unknown'})`).join('; ') || 'empty';
  const tweakLine = tweak ? ` Special request from the household (must be respected): ${tweak}.` : '';

  try {
    setBuildBusy(true, 'Building your shopping list…');
    showOverlay('Building your shopping list…');

    const listSystem = 'You are an expert budget grocery planner for South African households, working with realistic current prices at Shoprite, Checkers, Pick n Pay, Boxer, Spar and USave. Rules: '
      + '1) The total cost of the list must stay under the budget with roughly a 5% safety margin. '
      + '2) If spend is under R100 per person per week, plan survival mode: lean on maize meal, rice, dry beans, eggs, tinned fish, cabbage, onions, potatoes and oil; no luxuries, snacks or convenience items. '
      + '3) Use pantry items on hand before buying anything — never buy what the household already has enough of. '
      + '4) SAVE THE MOST MONEY: the deals below list each item and the stores that stock it with prices. For every item, choose the CHEAPEST store that has it and set "store" to that store name and "p" to that price. Only when an item is not in the deals, use a conservative realistic estimate, set "estimated" true and leave "store" empty. '
      + '5) Size packs so bulk items get fully used across the days; include cooking basics (oil, salt, stock) only if not in the pantry. '
      + '6) If children are present include milk, eggs or soft starches for them. '
      + 'Output ONLY compact JSON, no markdown, exact schema: {"list":[{"i":"item name","q":"pack size","p":price_number,"estimated":true_or_false,"cat":"starch"|"protein"|"veg"|"dairy"|"other","store":"cheapest store name or empty"}],"pantry_used":["item"],"warnings":["short warning"]}';

    const listUser = `Budget: R${h.budget}. Days to cover: ${h.days}. Adults: ${h.adults}. Children: ${h.kids}. Pantry on hand: ${pantryList}. Known prices: ${priceList}. Deals by store (choose the cheapest per item): ${dealList}.${tweakLine}`;

    const listData = parseJSONLoose(await callClaude({ system: listSystem, userContent: listUser, maxTokens: 3000 }));
    const list = (listData.list || []).map((it) => ({
      id: uid(),
      i: String(it.i || '').slice(0, 80),
      q: String(it.q || '').slice(0, 40),
      p: Number(it.p) || 0,
      estimated: !!it.estimated,
      cat: CAT_ORDER.includes(it.cat) ? it.cat : 'other',
      store: String(it.store || '').slice(0, 40),
      checked: false,
    })).filter((it) => it.i);
    if (!list.length) throw new Error('empty list');

    setBuildBusy(true, 'Planning your meals…');
    showOverlay('Planning your meals…');

    const shopSummary = list.map((it) => `${it.i} ${it.q}`).join('; ');
    const daysSystem = `You are the same South African budget meal planner. Using ONLY the shopping list and pantry given, build a ${h.days}-day meal calendar for ${h.adults} adult(s) and ${h.kids} child(ren). Rotate bulk items across consecutive days so nothing is wasted; mention rotation in "note" only when it matters. Each meal max 6 words. `
      + (h.kids > 0 ? 'Every day must include one soft, protein- or calcium-rich item for the children in "kid". ' : '')
      + 'Output ONLY compact JSON, no markdown, exact schema: {"days":[{"d":day_number,"b":"breakfast","l":"lunch","dn":"dinner","kid":"","note":""}]}';
    const daysUser = `Shopping list: ${shopSummary}. Pantry: ${pantryList}.${tweakLine}`;

    const daysData = parseJSONLoose(await callClaude({ system: daysSystem, userContent: daysUser, maxTokens: 2500 }));

    state.plan = {
      list,
      pantryUsed: (listData.pantry_used || []).map(String),
      warnings: (listData.warnings || []).map(String),
      days: (daysData.days || []),
      budget: h.budget,
      madeAt: new Date().toISOString().slice(0, 10),
    };
    state.tweak = '';
    save();
    render();
    switchTab('plan');
  } catch (e) {
    showErr('#err-build', e && e.message && !/unparseable|empty list/.test(e.message)
      ? e.message
      : "Couldn't build the plan — the answer got cut off. Try again, or trim the pantry list a little.");
  } finally {
    hideOverlay();
    setBuildBusy(false);
    render();
  }
}

/* ================= deals upload (per store) ================= */

function currentStore() {
  const sel = $('#in-store');
  if (sel && sel.value === '__other') {
    return ($('#in-store-custom').value || '').trim() || 'Other';
  }
  return sel ? sel.value : (state.lastStore || STORES[0]);
}

async function handleDealsFile(file) {
  if (!file) return;
  const btn = $('#btn-deals');
  const store = currentStore();
  state.lastStore = store; save();
  showErr('#err-deals', '');
  dealsDraft = null;
  renderDealsDraft();
  const isPdf = (file.type || '').includes('pdf') || /\.pdf$/i.test(file.name || '');
  if (isPdf) {
    // Direct API-key uploads go straight to Anthropic (~32MB request limit, so
    // ~22MB of raw PDF once base64-encoded). The shared server route is capped
    // by the host at ~6MB. A photo of the specials page always fits either way.
    const maxPdf = state.apiKey ? 22 * 1024 * 1024 : 4 * 1024 * 1024;
    if (file.size > maxPdf) {
      showErr('#err-deals', state.apiKey
        ? '📸 That catalogue is large (over ~22MB). Snap a photo of just the specials page instead — it works just as well and is much smaller — or upload a shorter PDF.'
        : '📸 That catalogue is too big for the shared server (max ~4MB). Snap a photo of the specials page instead (works great), or add your own API key under Connection settings to upload big PDFs.');
      return;
    }
  }
  try {
    btn.disabled = true;
    btn.textContent = 'Reading deals…';
    showOverlay('Reading the ' + store + ' deals…');
    let contentBlock;
    if (isPdf) {
      contentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await fileToBase64(file) } };
    } else {
      const { data, mediaType } = await downscaleImage(file);
      contentBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
    }
    const text = await callClaude({
      system: 'You read South African grocery specials (catalogue PDFs, leaflet photos, shelf labels). Extract only grocery/pantry items with clearly visible prices. For EACH item output: "name" (as printed), "key" (a short generic product name usable to match the same product across different stores, e.g. "maize meal", "eggs", "sunflower oil", "brown bread", "chicken portions"), "qty" (pack size as printed, e.g. "5kg", "18s", "2L"), "price" (number, rand), "size_value" (numeric size, e.g. 5 for 5kg, 2 for 2L, 18 for 18 eggs) and "size_unit" (one of kg, g, l, ml, ea). Skip non-food and vague entries. Keep at most the 30 items most useful for a tight food budget. Output ONLY compact JSON, no markdown, exact schema: {"items":[{"name":"","key":"","qty":"","price":0,"size_value":0,"size_unit":""}]}.',
      userContent: [contentBlock, { type: 'text', text: 'Extract the grocery deals with prices.' }],
      maxTokens: 3500,
    });
    const parsed = parseJSONLoose(text);
    const items = (parsed.items || []).map((it) => {
      const price = Number(it.price) || 0;
      const up = unitPriceOf(price, it.size_value, it.size_unit);
      return {
        id: uid(),
        name: String(it.name || '').slice(0, 80),
        key: (String(it.key || '') || deriveKey(it.name)).toLowerCase().slice(0, 40),
        qty: String(it.qty || '').slice(0, 40),
        price,
        unitPrice: up ? Math.round(up.v * 100) / 100 : null,
        unitLabel: up ? up.label : '',
        include: true,
      };
    }).filter((it) => it.name && it.price > 0);
    if (!items.length) {
      showErr('#err-deals', 'No deals with prices found in there. Try a clearer photo or a different page.');
    } else {
      dealsDraft = { store, items };
    }
  } catch (e) {
    showErr('#err-deals', e.message || "Couldn't read that file. Try a clearer photo or a different PDF.");
  } finally {
    hideOverlay();
    btn.disabled = false;
    btn.textContent = '⬆️ Upload for this store';
    renderDealsDraft();
  }
}

function confirmDeals() {
  if (!dealsDraft) return;
  const store = dealsDraft.store;
  dealsDraft.items.filter((i) => i.include && i.name.trim()).forEach((i) => {
    state.deals.unshift({
      id: uid(),
      item: i.name + (i.qty ? ` (${i.qty})` : ''),
      key: i.key,
      qty: i.qty,
      price: i.price,
      unitPrice: i.unitPrice,
      unitLabel: i.unitLabel,
      store,
    });
  });
  dealsDraft = null;
  save();
  render();
  switchTab('deals');
}

/* ================= rendering ================= */

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach((s) => s.classList.add('hidden'));
  $('#tab-' + tab).classList.remove('hidden');
  document.querySelectorAll('.bottom-nav button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  window.scrollTo(0, 0);
}

function render() {
  renderGauge();
  renderChips();
  renderList('#list-pantry', state.pantry, (p) =>
    `<span class="grow">${esc(p.name)} <span class="dim">${esc(p.qty || '')}</span></span>`,
    'Empty — tap the buttons above or type what you have.');
  renderCompare();
  renderDealsList();
  renderPlanResult();
  const main = $('#btn-build');
  if (main && !main.disabled) main.textContent = state.plan ? 'Rebuild my plan' : 'Build my plan';
}

function renderGauge() {
  const h = household();
  const g = $('#gauge');
  if (!(h.perPersonWeek > 0)) { g.classList.add('hidden'); return; }
  const tight = h.perPersonWeek < 100;
  g.classList.remove('hidden');
  g.classList.toggle('tight', tight);
  g.classList.toggle('ok', !tight);
  g.innerHTML = `<span class="big">${fmtR(h.perPersonWeek)}</span> per person, per week.<br>` +
    (tight
      ? '<span class="mode">Tight budget — the plan will stick to filling staples.</span>'
      : '<span class="mode">Workable — there\'s room for some variety.</span>');
}

function renderChips() {
  const have = new Set(state.pantry.map((p) => p.name.toLowerCase()));
  $('#staple-chips').innerHTML = STAPLES.map((s) =>
    `<button type="button" class="chip ${have.has(s.toLowerCase()) ? 'added' : ''}" data-action="add-staple" data-name="${esc(s)}">${have.has(s.toLowerCase()) ? '✓ ' : '＋ '}${esc(s)}</button>`
  ).join('');
}

function renderList(sel, items, rowHtml, emptyText) {
  const el = $(sel);
  if (!items.length) { el.innerHTML = `<p class="hint">${esc(emptyText)}</p>`; return; }
  const kind = sel.replace('#list-', '');
  el.innerHTML = items.map((it) =>
    `<div class="item-row">${rowHtml(it)}<button class="x" data-action="remove" data-kind="${kind}" data-id="${it.id}" aria-label="Remove">✕</button></div>`
  ).join('');
}

function renderCompare() {
  const card = $('#compare-card');
  const rows = computeComparison();
  if (!rows.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  $('#compare-list').innerHTML = rows.map((r) => `
    <div class="compare">
      <div class="compare-head"><span class="grow">${esc(r.label)}</span><span class="save">${esc(r.saving)}</span></div>
      ${r.offers.map((o, i) => `
        <div class="offer ${i === 0 ? 'best' : ''}">
          <span class="grow">${i === 0 ? '✅ ' : ''}${esc(o.store)}</span>
          ${o.unitPrice != null ? `<span class="dim">${fmtR(o.unitPrice)}${esc(o.unitLabel)}</span>` : ''}
          <span class="money">${fmtR(o.price)}${o.qty ? `<span class="dim"> ${esc(o.qty)}</span>` : ''}</span>
        </div>`).join('')}
    </div>`).join('');
}

function renderDealsList() {
  const card = $('#catalogues-card');
  if (!state.deals.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  const stores = dealStores();
  $('#store-summary').textContent = `${state.deals.length} deal${state.deals.length === 1 ? '' : 's'} across ${stores.length} store${stores.length === 1 ? '' : 's'}.`;

  const byStore = {};
  state.deals.forEach((d) => { (byStore[d.store || 'Unknown'] = byStore[d.store || 'Unknown'] || []).push(d); });
  $('#list-deals').innerHTML = Object.keys(byStore).sort().map((store) => {
    const items = byStore[store];
    return `<div class="store-group">
      <div class="store-head">
        <span>${esc(store)} <span class="dim">· ${items.length}</span></span>
        <button class="btn small danger-ghost" data-action="clear-store" data-store="${esc(store)}">Clear</button>
      </div>
      ${items.map((d) => `<div class="item-row">
        <span class="grow">${esc(d.item)}</span>
        ${d.unitPrice != null ? `<span class="dim">${fmtR(d.unitPrice)}${esc(d.unitLabel)}</span>` : ''}
        <span class="money">${fmtR(d.price)}</span>
        <button class="x" data-action="remove" data-kind="deals" data-id="${d.id}" aria-label="Remove">✕</button>
      </div>`).join('')}
    </div>`;
  }).join('');
}

function renderPlanResult() {
  const el = $('#plan-result');
  if (!state.plan) { el.innerHTML = ''; return; }
  const p = state.plan;
  const total = planTotal();
  const basket = basketTotal();
  const left = p.budget - total;
  const pct = total > 0 ? Math.min(100, (basket / total) * 100) : 0;

  let html = `
    <div class="card balance">
      <div class="label">Left over if you buy everything</div>
      <div class="amount ${left < 0 ? 'neg' : ''}">${fmtR(left)}</div>
      <div class="sub">List ${fmtR(total)} of ${fmtR(p.budget)} budget</div>
      <div class="basket-bar"><div style="width:${pct}%"></div></div>
      <div class="sub">In basket: ${fmtR(basket)}</div>
    </div>`;

  if (p.warnings.length) {
    html += `<div class="card warnings">${p.warnings.map((w) => `<p>${esc(w)}</p>`).join('')}</div>`;
  }

  // per-store shopping run
  const byStore = {};
  p.list.forEach((it) => { const s = it.store || 'Any store'; byStore[s] = (byStore[s] || 0) + (Number(it.p) || 0); });
  const storeKeys = Object.keys(byStore);
  if (storeKeys.length > 1 || (storeKeys.length === 1 && storeKeys[0] !== 'Any store')) {
    html += `<div class="card"><h2>Your shopping run</h2>` +
      storeKeys.sort((a, b) => byStore[b] - byStore[a]).map((s) =>
        `<div class="run-row"><span class="grow">${esc(s)}</span><span class="money">${fmtR(byStore[s])}</span></div>`).join('') +
      `<p class="hint">Each item is priced at its cheapest store from your deals.</p></div>`;
  }

  html += `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">Shopping list</h2>
        <button class="btn small ghost" data-action="copy-list">Copy</button>
      </div>
      <p class="hint">Tap an item when it's in your basket. Tap a price to correct it. ✕ removes an item.</p>`;
  for (const cat of CAT_ORDER) {
    const items = p.list.filter((it) => it.cat === cat);
    if (!items.length) continue;
    html += `<div class="cat-head">${CAT_LABEL[cat]}</div>`;
    html += items.map((it) => {
      const priceCell = (editing && editing.type === 'price' && editing.id === it.id)
        ? `<input class="inline-edit price-edit" type="number" inputmode="decimal" step="0.01" min="0" value="${it.p}" data-commit="price" data-id="${it.id}">`
        : `<span class="money" data-action="edit-price" data-id="${it.id}">${fmtR(it.p)}${it.estimated ? '<span class="est">*</span>' : ''}</span>`;
      return `
      <div class="shop-row ${it.checked ? 'checked' : ''}" data-action="toggle-item" data-id="${it.id}">
        <span class="tick">${it.checked ? '✓' : ''}</span>
        <span class="grow">${esc(it.i)} <span class="qty">${esc(it.q)}</span>${it.store ? ` <span class="qty">· ${esc(it.store)}</span>` : ''}</span>
        ${priceCell}
        <button class="x" data-action="remove-item" data-id="${it.id}" aria-label="Remove">✕</button>
      </div>`;
    }).join('');
  }
  if (p.pantryUsed.length) {
    html += `<p class="hint" style="margin-top:10px">From your pantry: ${esc(p.pantryUsed.join(', '))}</p>`;
  }
  html += `<p class="hint">* estimated price — tap to enter the shelf price.</p></div>`;

  const mealLine = (idx, slot, label, value) => {
    if (editing && editing.type === 'meal' && editing.idx === idx && editing.slot === slot) {
      return `<label class="m-row"><span class="m">${label} · </span><input class="inline-edit meal-edit" type="text" value="${esc(value)}" data-commit="meal" data-idx="${idx}" data-slot="${slot}"></label>`;
    }
    return `<div data-action="edit-meal" data-idx="${idx}" data-slot="${slot}"><span class="m">${label} · </span>${esc(value || '—')}</div>`;
  };
  html += `<div class="card"><h2>Meals — tap any meal to change it</h2>`;
  html += p.days.map((d, idx) => `
    <div class="day-card">
      <span class="day-num">${esc(d.d)}</span><strong>Day ${esc(d.d)}</strong>
      <div class="meals">
        ${mealLine(idx, 'b', 'Breakfast', d.b)}
        ${mealLine(idx, 'l', 'Lunch', d.l)}
        ${mealLine(idx, 'dn', 'Dinner', d.dn)}
        ${d.kid ? mealLine(idx, 'kid', '🥛 Kids', d.kid) : ''}
        ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
      </div>
    </div>`).join('');
  html += `</div>`;

  html += `
    <div class="card">
      <h2>Change something bigger?</h2>
      <textarea id="in-tweak" rows="2" placeholder="e.g. less meat, add samp, keep R100 aside">${esc(state.tweak || '')}</textarea>
      <button class="btn-big" data-action="build">Apply &amp; rebuild plan</button>
    </div>`;

  el.innerHTML = html;
}

/* ================= copy list ================= */

function copyList() {
  const p = state.plan;
  if (!p) return;
  let out = `Shopping list (${fmtR(planTotal())} of ${fmtR(p.budget)})\n`;
  for (const cat of CAT_ORDER) {
    const items = p.list.filter((it) => it.cat === cat);
    if (!items.length) continue;
    out += `\n${CAT_LABEL[cat].toUpperCase()}\n`;
    items.forEach((it) => {
      out += `- ${it.i}${it.q ? ' ' + it.q : ''} — ${fmtR(it.p)}${it.store ? ' (' + it.store + ')' : ''}\n`;
    });
  }
  const done = () => {
    const btn = document.querySelector('[data-action="copy-list"]');
    if (btn) { btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(out).then(done, done);
  else done();
}

/* ================= inline editing ================= */

function focusEditing() {
  const input = document.querySelector('.inline-edit');
  if (input) { input.focus(); if (input.select) input.select(); }
}

function commitEdit(input) {
  if (!editing || !input) return;
  const ed = editing;
  const val = input.value;
  editing = null;
  if (ed.type === 'price') {
    const it = state.plan && state.plan.list.find((x) => x.id === ed.id);
    if (it) {
      const n = parseFloat(String(val).replace(',', '.').replace(/[^\d.]/g, ''));
      if (!isNaN(n) && n >= 0) {
        it.p = n; it.estimated = false;
        state.prices.unshift({ id: uid(), item: it.i, price: n, store: it.store || 'In store', date: new Date().toISOString().slice(0, 10) });
      }
    }
  } else if (ed.type === 'meal') {
    const day = state.plan && state.plan.days[ed.idx];
    if (day) day[ed.slot] = String(val).trim().slice(0, 80);
  }
  save(); render();
}

/* ================= events ================= */

function onAction(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;

  switch (action) {
    case 'build': generatePlan(); break;

    case 'pick-deals': $('#file-deals').click(); break;
    case 'confirm-deals': confirmDeals(); break;
    case 'discard-deals': dealsDraft = null; renderDealsDraft(); break;

    case 'clear-store':
      state.deals = state.deals.filter((d) => (d.store || 'Unknown') !== el.dataset.store);
      save(); render();
      break;
    case 'clear-all-deals':
      state.deals = [];
      save(); render();
      break;

    case 'toggle-draft': {
      const it = dealsDraft && dealsDraft.items.find((x) => x.id === id);
      if (it) it.include = el.checked;
      break;
    }

    case 'add-staple': {
      const name = el.dataset.name;
      const idx = state.pantry.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
      if (idx >= 0) state.pantry.splice(idx, 1);
      else state.pantry.unshift({ id: uid(), name, qty: '' });
      save(); render();
      break;
    }

    case 'remove': {
      const key = { pantry: 'pantry', deals: 'deals' }[el.dataset.kind];
      if (key) { state[key] = state[key].filter((x) => x.id !== id); save(); render(); }
      break;
    }

    case 'toggle-item': {
      const it = state.plan && state.plan.list.find((x) => x.id === id);
      if (it) { it.checked = !it.checked; save(); render(); }
      break;
    }

    case 'edit-price':
      if (state.plan && state.plan.list.some((x) => x.id === id)) { editing = { type: 'price', id }; render(); focusEditing(); }
      break;

    case 'remove-item':
      editing = null;
      state.plan.list = state.plan.list.filter((x) => x.id !== id);
      save(); render();
      break;

    case 'edit-meal': {
      const idx = parseInt(el.dataset.idx, 10);
      const slot = el.dataset.slot;
      if (state.plan && state.plan.days[idx]) { editing = { type: 'meal', idx, slot }; render(); focusEditing(); }
      break;
    }

    case 'copy-list': copyList(); break;
  }
}

function renderDealsDraft() {
  const el = $('#draft-deals');
  if (!dealsDraft) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="draft">
      <div class="draft-head">${esc(dealsDraft.store)}: found ${dealsDraft.items.length} deal${dealsDraft.items.length === 1 ? '' : 's'} — untick anything that's wrong</div>
      <div class="scroll">${dealsDraft.items.map((it) => `
        <label class="check">
          <input type="checkbox" data-action="toggle-draft" data-id="${it.id}" ${it.include ? 'checked' : ''}>
          <span class="grow">${esc(it.name)}${it.qty ? ` <span class="dim">(${esc(it.qty)})</span>` : ''}${it.unitPrice != null ? ` <span class="dim">${fmtR(it.unitPrice)}${esc(it.unitLabel)}</span>` : ''}</span>
          <span class="money">${fmtR(it.price)}</span>
        </label>`).join('')}
      </div>
      <div class="row">
        <button class="btn small" data-action="confirm-deals">Save ${esc(dealsDraft.store)} deals</button>
        <button class="btn small danger-ghost" data-action="discard-deals">Discard</button>
      </div>
    </div>`;
}

function bindEvents() {
  document.addEventListener('click', onAction);
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-action="toggle-draft"]')) onAction(e);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'in-tweak') { state.tweak = e.target.value; save(); }
  });

  document.addEventListener('focusout', (e) => {
    if (e.target.classList && e.target.classList.contains('inline-edit')) commitEdit(e.target);
  });
  document.addEventListener('keydown', (e) => {
    if (!(e.target.classList && e.target.classList.contains('inline-edit'))) return;
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); editing = null; render(); }
  });

  document.querySelectorAll('.bottom-nav button').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  document.querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener('input', () => {
      state.settings[input.dataset.setting] = input.value;
      save();
      renderGauge();
    });
  });

  $('#in-token').addEventListener('input', (e) => { state.appToken = e.target.value.trim(); save(); });
  $('#in-server').addEventListener('input', (e) => { state.serverBase = e.target.value.trim(); save(); });
  $('#in-apikey').addEventListener('input', (e) => { state.apiKey = e.target.value.trim(); save(); });

  $('#in-store').addEventListener('change', (e) => {
    const custom = e.target.value === '__other';
    $('#in-store-custom').classList.toggle('hidden', !custom);
    if (!custom) { state.lastStore = e.target.value; save(); }
  });
  $('#in-store-custom').addEventListener('input', (e) => { state.lastStore = e.target.value.trim(); save(); });

  $('#file-deals').addEventListener('change', (e) => { handleDealsFile(e.target.files[0]); e.target.value = ''; });

  $('#form-pantry').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#in-pantry-name').value.trim();
    if (!name) return;
    const qty = $('#in-pantry-qty').value.trim();
    const existing = state.pantry.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) { if (qty) existing.qty = qty; }
    else state.pantry.unshift({ id: uid(), name, qty });
    $('#in-pantry-name').value = ''; $('#in-pantry-qty').value = '';
    save(); render();
  });
}

/* ================= init ================= */

function init() {
  load();
  save();

  // store dropdown
  const opts = STORES.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('') + '<option value="__other">Other store…</option>';
  const sel = $('#in-store');
  sel.innerHTML = opts;
  if (state.lastStore && STORES.includes(state.lastStore)) sel.value = state.lastStore;

  document.querySelectorAll('[data-setting]').forEach((input) => { input.value = state.settings[input.dataset.setting] || ''; });
  $('#in-token').value = state.appToken || '';
  $('#in-server').value = state.serverBase || '';
  $('#in-apikey').value = state.apiKey || '';

  bindEvents();
  render();
  switchTab('plan');
}

init();
