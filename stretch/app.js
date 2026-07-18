'use strict';

/* ================= constants & state ================= */

const STORAGE_KEY = 'stretch-rand-v2';
const PROXY_PATH = '/.netlify/functions/claude-proxy';
const MODEL = 'claude-opus-4-8'; // server admin config may override

const STORES = ['Shoprite', 'Checkers', 'Pick n Pay', 'Boxer', 'Spar', 'Makro'];
const STAPLES = ['Maize meal', 'Rice', 'Brown bread', 'Eggs', 'Sunflower oil', 'Sugar', 'Dry beans', 'Tinned fish', 'Cabbage', 'Onions', 'Potatoes', 'Milk'];
const CAT_ORDER = ['starch', 'protein', 'veg', 'dairy', 'other'];
const CAT_LABEL = { starch: 'Starch', protein: 'Protein', veg: 'Veg', dairy: 'Dairy', other: 'Other' };

const uid = () => Math.random().toString(36).slice(2, 10);

let state = {
  settings: { budget: '', days: '7', adults: '2', kids: '0' },
  pantry: [],   // {id, name, qty}
  prices: [],   // {id, item, price, store, date, source}
  deals: [],    // {id, item, price, store}
  plan: null,   // {list:[{id,i,q,p,estimated,cat,store,checked}], pantryUsed, warnings, days, budget, madeAt}
  appToken: '',
  serverBase: '',
  userId: '',
};

// transient (not saved)
let receiptDraft = null; // {store, date, items:[{id,name,qty,price,include}]}
let dealsDraft = null;   // [{id,name,qty,price,store,include}]
let activeTab = 'home';

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
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* full/private mode */ }
  }, 300);
}

/* ================= helpers ================= */

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const fmtR = (n) => 'R' + (Math.round(Number(n) * 100) / 100).toFixed(2);

function showErr(id, msg) {
  const el = $(id);
  if (!el) return;
  if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
  else { el.textContent = ''; el.classList.add('hidden'); }
}

function setBusy(btn, busy, busyText, idleText) {
  btn.disabled = busy;
  btn.textContent = busy ? busyText : idleText;
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

// Phone photos are huge; shrink before uploading to keep requests fast and cheap.
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

/* ================= AI calls (via Netlify proxy) ================= */

function proxyUrl() {
  let base = (state.serverBase || '').trim().replace(/\/+$/, '');
  if (base && !/^https?:\/\//i.test(base)) base = 'https://' + base;
  if (base) return base + PROXY_PATH;
  if (!/^https?:$/.test(location.protocol)) {
    throw new Error('This copy of the app was opened straight from a file, so it has no server. On the Home tab, open Connection settings and enter your site address (e.g. https://your-site.netlify.app) — or just use the app from that site directly.');
  }
  return PROXY_PATH;
}

async function callClaude({ system, userContent, maxTokens = 3000 }) {
  const headers = {
    'Content-Type': 'application/json',
    'x-app-user-id': state.userId,
  };
  if (state.appToken) headers['x-app-token'] = state.appToken;

  let res;
  try {
    res = await fetch(proxyUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      // network-level failure: offline, wrong server address, or the server refused this page's origin
      const hosted = /^https?:$/.test(location.protocol);
      throw new Error(hosted && !state.serverBase
        ? "Couldn't reach the AI server. Check your internet connection and try again."
        : "Couldn't reach the AI server. Check your internet, the Server address under Connection settings, and that your App token is filled in (a copy of the app running outside the site needs the token to connect).");
    }
    throw e;
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON error body */ }

  if (!res.ok) {
    const serverMsg = data && data.error && data.error.message;
    if (res.status === 401) throw new Error(serverMsg === 'Unauthorized'
      ? 'This server needs an app token — add it under Connection settings on the Home tab.'
      : 'Not authorised. Check the app token under Connection settings.');
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

/* ================= plan generation ================= */

async function generatePlan() {
  const h = household();
  const btn = $('#btn-build');
  showErr('#err-build', '');
  if (!h.complete) {
    showErr('#err-build', 'Fill in your budget, days and household size first.');
    switchTab('home');
    return;
  }
  const tweak = $('#in-tweak').value.trim();

  // latest price per item name
  const latest = {};
  [...state.prices].reverse().forEach((p) => { latest[p.item.toLowerCase()] = p; });
  const priceList = Object.values(latest).map((p) => `${p.item}: R${p.price} (${p.store})`).join('; ') || 'none known';
  const dealList = state.deals.map((d) => `${d.item}: R${d.price} (${d.store})`).join('; ') || 'none';
  const pantryList = state.pantry.map((p) => `${p.name} (${p.qty || 'qty unknown'})`).join('; ') || 'empty';
  const tweakLine = tweak ? ` Special request from the household (must be respected): ${tweak}.` : '';

  try {
    setBusy(btn, true, 'Building your shopping list…', '');

    const listSystem = 'You are an expert budget grocery planner for South African households, working with realistic current prices at Shoprite, Checkers, Pick n Pay, Boxer and Spar. Rules: '
      + '1) The total cost of the list must stay under the budget with roughly a 5% safety margin. '
      + '2) If spend is under R100 per person per week, plan survival mode: lean on maize meal, rice, dry beans, eggs, tinned fish, cabbage, onions, potatoes and oil; no luxuries, snacks or convenience items. '
      + '3) Use pantry items on hand before buying anything — never buy what the household already has enough of. '
      + '4) Save money: when a listed deal is the cheapest way to get an item, buy it at that deal price and store. Use known prices where given. For anything else use a conservative realistic estimate and set "estimated" true. '
      + '5) Size packs so bulk items get fully used across the days; include cooking basics (oil, salt, stock) only if not in the pantry. '
      + '6) If children are present include milk, eggs or soft starches for them. '
      + 'Output ONLY compact JSON, no markdown, exact schema: {"list":[{"i":"item name","q":"pack size","p":price_number,"estimated":true_or_false,"cat":"starch"|"protein"|"veg"|"dairy"|"other","store":"store name or empty"}],"pantry_used":["item"],"warnings":["short warning"]}';

    const listUser = `Budget: R${h.budget}. Days to cover: ${h.days}. Adults: ${h.adults}. Children: ${h.kids}. Pantry on hand: ${pantryList}. Known prices: ${priceList}. This week's deals: ${dealList}.${tweakLine}`;

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

    setBusy(btn, true, 'Planning your meals…', '');

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
    save();
    render();
    switchTab('shop');
  } catch (e) {
    showErr('#err-build', e && e.message && !/unparseable|empty list/.test(e.message)
      ? e.message
      : "Couldn't build the plan — the answer got cut off. Try again, or trim the pantry list a little.");
  } finally {
    setBusy(btn, false, '', state.plan ? 'Update my plan' : 'Build my plan');
  }
}

/* ================= receipt scan ================= */

async function handleReceiptFile(file) {
  if (!file) return;
  const btn = $('#btn-receipt');
  showErr('#err-receipt', '');
  receiptDraft = null;
  renderReceiptDraft();
  try {
    setBusy(btn, true, 'Reading receipt…', '');
    const { data, mediaType } = await downscaleImage(file);
    const text = await callClaude({
      system: 'You read South African grocery till slips. Extract every purchased line item with the amount paid in rand. Skip totals, VAT lines, card details and loyalty points. Output ONLY compact JSON, no markdown, exact schema: {"store":"","date":"YYYY-MM-DD","items":[{"name":"","qty":"","price":0}]}. Use empty strings when unclear.',
      userContent: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
        { type: 'text', text: 'Extract the items from this receipt photo.' },
      ],
      maxTokens: 2500,
    });
    const parsed = parseJSONLoose(text);
    receiptDraft = {
      store: String(parsed.store || ''),
      date: String(parsed.date || '') || new Date().toISOString().slice(0, 10),
      items: (parsed.items || []).map((it) => ({
        id: uid(),
        name: String(it.name || '').slice(0, 80),
        qty: String(it.qty || '').slice(0, 40),
        price: Number(it.price) || 0,
        include: true,
      })).filter((it) => it.name),
    };
    if (!receiptDraft.items.length) {
      receiptDraft = null;
      showErr('#err-receipt', "Couldn't find any items on that slip. Try a flatter, better-lit photo.");
    }
  } catch (e) {
    showErr('#err-receipt', e.message || "Couldn't read that receipt. Try a clearer photo.");
  } finally {
    setBusy(btn, false, '', '📷 Scan receipt');
    renderReceiptDraft();
  }
}

function confirmReceipt() {
  if (!receiptDraft) return;
  const included = receiptDraft.items.filter((i) => i.include && i.name.trim());
  const today = receiptDraft.date;
  included.forEach((i) => {
    state.prices.unshift({ id: uid(), item: i.name, price: i.price, store: receiptDraft.store || 'Receipt', date: today, source: 'receipt' });
    state.pantry.unshift({ id: uid(), name: i.name, qty: i.qty || '1' });
  });
  receiptDraft = null;
  save();
  render();
}

/* ================= deals scan ================= */

const DEALS_SCHEMA = 'Output ONLY compact JSON, no markdown, exact schema: {"items":[{"name":"","qty":"","price":0,"store":""}]}. Use empty strings when unclear.';

async function handlePdfFile(file) {
  if (!file) return;
  const btn = $('#btn-pdf');
  showErr('#err-deals', '');
  if (file.size > 15 * 1024 * 1024) {
    showErr('#err-deals', 'That PDF is too big (over 15MB). Try a shorter excerpt.');
    return;
  }
  dealsDraft = null;
  renderDealsDraft();
  try {
    setBusy(btn, true, 'Reading catalogue…', '');
    const base64 = await fileToBase64(file);
    const text = await callClaude({
      system: 'You read South African grocery catalogue and specials PDFs. Extract only grocery/pantry items with clear prices — staples, proteins, vegetables, dairy, tinned goods, bread, cooking basics. Skip non-food, homeware, electronics and vague entries. Note pack size in qty when visible. Keep at most the 25 items most useful for a tight food budget. ' + DEALS_SCHEMA,
      userContent: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Extract the grocery deals from this catalogue.' },
      ],
      maxTokens: 3000,
    });
    setDealsDraftFrom(parseJSONLoose(text));
  } catch (e) {
    showErr('#err-deals', e.message || "Couldn't read that PDF — it may be image-only or protected. Try pasting the text instead.");
  } finally {
    setBusy(btn, false, '', '📄 Catalogue PDF');
    renderDealsDraft();
  }
}

async function parseDealsText() {
  const textIn = $('#in-dealtext').value.trim();
  if (!textIn) return;
  const btn = $('#btn-parse-deals');
  showErr('#err-deals', '');
  dealsDraft = null;
  renderDealsDraft();
  try {
    setBusy(btn, true, 'Reading…', '');
    const text = await callClaude({
      system: 'Extract South African grocery items with prices from the pasted text — it may be a specials list, a table or casual notes with noise mixed in. Only include real grocery/pantry items. ' + DEALS_SCHEMA,
      userContent: textIn.slice(0, 20000),
      maxTokens: 3000,
    });
    setDealsDraftFrom(parseJSONLoose(text));
  } catch (e) {
    showErr('#err-deals', e.message || "Couldn't read that — try simplifying the text.");
  } finally {
    setBusy(btn, false, '', 'Read pasted deals');
    renderDealsDraft();
  }
}

function setDealsDraftFrom(parsed) {
  dealsDraft = (parsed.items || []).map((it) => ({
    id: uid(),
    name: String(it.name || '').slice(0, 80),
    qty: String(it.qty || '').slice(0, 40),
    price: Number(it.price) || 0,
    store: String(it.store || '').slice(0, 40),
    include: true,
  })).filter((it) => it.name);
  if (!dealsDraft.length) {
    dealsDraft = null;
    showErr('#err-deals', 'Nothing recognisable in there — deal prices need to be visible.');
  }
}

function confirmDeals() {
  if (!dealsDraft) return;
  dealsDraft.filter((i) => i.include && i.name.trim()).forEach((i) => {
    state.deals.unshift({
      id: uid(),
      item: i.name + (i.qty ? ` (${i.qty})` : ''),
      price: i.price,
      store: i.store || 'Special',
    });
  });
  dealsDraft = null;
  $('#in-dealtext').value = '';
  save();
  render();
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
  renderHomeSummary();
  renderChips();
  renderList('#list-pantry', state.pantry, (p) =>
    `<span class="grow">${esc(p.name)} <span class="dim">${esc(p.qty || '')}</span></span>`,
    'Empty — add what you already have at home.');
  renderList('#list-deals', state.deals, (d) =>
    `<span class="grow">${esc(d.item)} <span class="dim">· ${esc(d.store)}</span></span><span class="money">${fmtR(d.price)}</span>`,
    'No specials saved yet.');
  renderList('#list-prices', state.prices.slice(0, 10), (p) =>
    `<span class="grow">${esc(p.item)} <span class="dim">· ${esc(p.store)}</span></span><span class="money">${fmtR(p.price)}</span>`,
    'None yet — scan a receipt or add prices you know.');
  renderPlanTab();
  renderShopTab();
  $('#btn-build').textContent = state.plan ? 'Update my plan' : 'Build my plan';
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

function renderHomeSummary() {
  const el = $('#home-summary');
  if (!state.plan) { el.innerHTML = ''; return; }
  const total = planTotal();
  const left = state.plan.budget - total;
  el.innerHTML = `
    <div class="card balance" data-action="goto-shop" style="cursor:pointer">
      <div class="label">Left over if you buy the whole list</div>
      <div class="amount ${left < 0 ? 'neg' : ''}">${fmtR(left)}</div>
      <div class="sub">List: ${fmtR(total)} of ${fmtR(state.plan.budget)} · made ${esc(state.plan.madeAt)} · tap to open</div>
    </div>`;
}

function renderChips() {
  const have = new Set(state.pantry.map((p) => p.name.toLowerCase()));
  $('#staple-chips').innerHTML = STAPLES.map((s) =>
    `<button type="button" class="chip ${have.has(s.toLowerCase()) ? 'added' : ''}" data-action="add-staple" data-name="${esc(s)}">${have.has(s.toLowerCase()) ? '✓ ' : '＋ '}${esc(s)}</button>`
  ).join('');
}

function renderList(sel, items, rowHtml, emptyText) {
  const el = $(sel);
  if (!items.length) {
    el.innerHTML = `<p class="hint">${esc(emptyText)}</p>`;
    return;
  }
  const kind = sel.replace('#list-', '');
  el.innerHTML = items.map((it) =>
    `<div class="item-row">${rowHtml(it)}<button class="x" data-action="remove" data-kind="${kind}" data-id="${it.id}" aria-label="Remove">✕</button></div>`
  ).join('');
}

function renderReceiptDraft() {
  const el = $('#draft-receipt');
  if (!receiptDraft) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="draft">
      <div class="draft-head">${esc(receiptDraft.store || 'Store unknown')} · ${esc(receiptDraft.date)} — untick anything that's wrong</div>
      <div class="scroll">${receiptDraft.items.map((it) => `
        <label class="check">
          <input type="checkbox" data-action="toggle-draft" data-kind="receipt" data-id="${it.id}" ${it.include ? 'checked' : ''}>
          <span class="grow">${esc(it.name)}</span>
          <span class="money">${fmtR(it.price)}</span>
        </label>`).join('')}
      </div>
      <div class="row">
        <button class="btn small" data-action="confirm-receipt">Add to pantry &amp; prices</button>
        <button class="btn small danger-ghost" data-action="discard-receipt">Discard</button>
      </div>
    </div>`;
}

function renderDealsDraft() {
  const el = $('#draft-deals');
  if (!dealsDraft) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="draft">
      <div class="draft-head">Found ${dealsDraft.length} deal${dealsDraft.length === 1 ? '' : 's'} — untick anything that's wrong</div>
      <div class="scroll">${dealsDraft.map((it) => `
        <label class="check">
          <input type="checkbox" data-action="toggle-draft" data-kind="deals" data-id="${it.id}" ${it.include ? 'checked' : ''}>
          <span class="grow">${esc(it.name)}${it.qty ? ` <span class="dim">(${esc(it.qty)})</span>` : ''} <span class="dim">${esc(it.store)}</span></span>
          <span class="money">${fmtR(it.price)}</span>
        </label>`).join('')}
      </div>
      <div class="row">
        <button class="btn small" data-action="confirm-deals">Save these deals</button>
        <button class="btn small danger-ghost" data-action="discard-deals">Discard</button>
      </div>
    </div>`;
}

function renderPlanTab() {
  const el = $('#plan-content');
  if (!state.plan) {
    el.innerHTML = `<div class="empty-state">No meal plan yet.<br>Set your budget on Home, then build a plan.<br>
      <button class="btn" data-action="goto-home">Go to Home</button></div>`;
    return;
  }
  const p = state.plan;
  let html = '';
  if (p.warnings.length) {
    html += `<div class="card warnings">${p.warnings.map((w) => `<p>${esc(w)}</p>`).join('')}</div>`;
  }
  if (p.pantryUsed.length) {
    html += `<div class="card"><h2>From your pantry</h2><p class="hint" style="margin:0">${esc(p.pantryUsed.join(', '))}</p></div>`;
  }
  html += p.days.map((d) => `
    <div class="day-card">
      <span class="day-num">${esc(d.d)}</span><strong>Day ${esc(d.d)}</strong>
      <div class="meals">
        <div><span class="m">Breakfast · </span>${esc(d.b || '—')}</div>
        <div><span class="m">Lunch · </span>${esc(d.l || '—')}</div>
        <div><span class="m">Dinner · </span>${esc(d.dn || '—')}</div>
        ${d.kid ? `<div class="kid">🥛 ${esc(d.kid)}</div>` : ''}
        ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
      </div>
    </div>`).join('');
  html += `<button class="btn-big ghost btn" data-action="goto-home-rebuild">↻ Adjust &amp; rebuild plan</button>`;
  el.innerHTML = html;
}

function renderShopTab() {
  const el = $('#shop-content');
  if (!state.plan) {
    el.innerHTML = `<div class="empty-state">Your shopping list appears here<br>once you've built a plan.<br>
      <button class="btn" data-action="goto-home">Go to Home</button></div>`;
    return;
  }
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
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">Shopping list</h2>
        <button class="btn small ghost" data-action="copy-list">Copy</button>
      </div>
      <p class="hint">Tap an item when it's in your basket. Tap a price to correct it — totals update.</p>`;

  for (const cat of CAT_ORDER) {
    const items = p.list.filter((it) => it.cat === cat);
    if (!items.length) continue;
    html += `<div class="cat-head">${CAT_LABEL[cat]}</div>`;
    html += items.map((it) => `
      <div class="shop-row ${it.checked ? 'checked' : ''}" data-action="toggle-item" data-id="${it.id}">
        <span class="tick">${it.checked ? '✓' : ''}</span>
        <span class="grow">${esc(it.i)} <span class="qty">${esc(it.q)}</span>${it.store ? ` <span class="qty">· ${esc(it.store)}</span>` : ''}</span>
        <span class="money" data-action="edit-price" data-id="${it.id}">${fmtR(it.p)}${it.estimated ? '<span class="est">*</span>' : ''}</span>
      </div>`).join('');
  }

  html += `
      <p class="hint" style="margin-top:10px">* estimated price — tap to enter the shelf price.</p>
      <div class="row" style="margin-top:8px">
        <button class="btn small ghost" data-action="add-shop-item">＋ Add item</button>
        <button class="btn small danger-ghost" data-action="reset-checks">Untick all</button>
      </div>
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
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(out).then(done, done);
  } else {
    done();
  }
}

/* ================= events ================= */

function onAction(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;

  switch (action) {
    case 'build': generatePlan(); break;

    case 'goto-home': switchTab('home'); break;
    case 'goto-shop': switchTab('shop'); break;
    case 'goto-home-rebuild': switchTab('home'); $('#in-tweak').focus(); break;

    case 'pick-receipt': $('#file-receipt').click(); break;
    case 'pick-pdf': $('#file-pdf').click(); break;
    case 'toggle-deal-paste': $('#deal-paste').classList.toggle('hidden'); break;
    case 'parse-deals': parseDealsText(); break;

    case 'confirm-receipt': confirmReceipt(); break;
    case 'discard-receipt': receiptDraft = null; renderReceiptDraft(); break;
    case 'confirm-deals': confirmDeals(); break;
    case 'discard-deals': dealsDraft = null; renderDealsDraft(); break;

    case 'toggle-draft': {
      const set = el.dataset.kind === 'receipt' ? (receiptDraft && receiptDraft.items) : dealsDraft;
      const it = set && set.find((x) => x.id === id);
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
      const key = { pantry: 'pantry', deals: 'deals', prices: 'prices' }[el.dataset.kind];
      if (key) {
        state[key] = state[key].filter((x) => x.id !== id);
        save(); render();
      }
      break;
    }

    case 'edit-price': {
      e.stopPropagation();
      const it = state.plan && state.plan.list.find((x) => x.id === id);
      if (!it) break;
      const v = prompt(`Shelf price for ${it.i} (${it.q})`, it.p ? String(it.p) : '');
      if (v === null) break;
      const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
      if (!isNaN(n) && n >= 0) {
        it.p = n;
        it.estimated = false;
        state.prices.unshift({ id: uid(), item: it.i, price: n, store: it.store || 'In store', date: new Date().toISOString().slice(0, 10), source: 'manual' });
        save(); render();
      }
      break;
    }

    case 'toggle-item': {
      const it = state.plan && state.plan.list.find((x) => x.id === id);
      if (it) { it.checked = !it.checked; save(); render(); }
      break;
    }

    case 'add-shop-item': {
      const name = prompt('Item name');
      if (!name || !name.trim()) break;
      const priceStr = prompt(`Price for ${name.trim()} (R)`, '');
      const n = parseFloat(String(priceStr || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
      state.plan.list.push({ id: uid(), i: name.trim().slice(0, 80), q: '', p: n, estimated: false, cat: 'other', store: '', checked: false });
      save(); render();
      break;
    }

    case 'reset-checks': {
      state.plan.list.forEach((it) => { it.checked = false; });
      save(); render();
      break;
    }
  }
}

function bindEvents() {
  document.addEventListener('click', onAction);
  // checkbox toggles fire 'change', not click-with-checked-state
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-action="toggle-draft"]')) onAction(e);
  });

  document.querySelectorAll('.bottom-nav button').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  document.querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener('input', () => {
      state.settings[input.dataset.setting] = input.value;
      save();
      renderGauge();
      renderHomeSummary();
    });
  });

  $('#in-token').addEventListener('input', (e) => { state.appToken = e.target.value.trim(); save(); });
  $('#in-server').addEventListener('input', (e) => { state.serverBase = e.target.value.trim(); save(); });

  $('#file-receipt').addEventListener('change', (e) => { handleReceiptFile(e.target.files[0]); e.target.value = ''; });
  $('#file-pdf').addEventListener('change', (e) => { handlePdfFile(e.target.files[0]); e.target.value = ''; });

  $('#form-pantry').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#in-pantry-name').value.trim();
    if (!name) return;
    state.pantry.unshift({ id: uid(), name, qty: $('#in-pantry-qty').value.trim() });
    $('#in-pantry-name').value = ''; $('#in-pantry-qty').value = '';
    save(); render();
  });

  $('#form-deal').addEventListener('submit', (e) => {
    e.preventDefault();
    const item = $('#in-deal-item').value.trim();
    const price = parseFloat($('#in-deal-price').value);
    if (!item || isNaN(price)) return;
    state.deals.unshift({ id: uid(), item, price, store: $('#in-deal-store').value });
    $('#in-deal-item').value = ''; $('#in-deal-price').value = '';
    save(); render();
  });

  $('#form-price').addEventListener('submit', (e) => {
    e.preventDefault();
    const item = $('#in-price-item').value.trim();
    const price = parseFloat($('#in-price-price').value);
    if (!item || isNaN(price)) return;
    state.prices.unshift({ id: uid(), item, price, store: $('#in-price-store').value, date: new Date().toISOString().slice(0, 10), source: 'manual' });
    $('#in-price-item').value = ''; $('#in-price-price').value = '';
    save(); render();
  });
}

/* ================= init ================= */

function init() {
  load();
  save(); // persist generated userId

  // store dropdowns
  const opts = STORES.map((s) => `<option>${esc(s)}</option>`).join('');
  $('#in-deal-store').innerHTML = opts;
  $('#in-price-store').innerHTML = opts;

  // restore settings into inputs
  document.querySelectorAll('[data-setting]').forEach((input) => {
    input.value = state.settings[input.dataset.setting] || '';
  });
  $('#in-token').value = state.appToken || '';
  $('#in-server').value = state.serverBase || '';

  bindEvents();
  render();
  switchTab('home');
}

init();
