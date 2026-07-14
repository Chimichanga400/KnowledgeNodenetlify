// ── DOM HUD: panels, modals, log ─────────────────────────────────
import {
  state, aliveCrew, aboardCrew, atStation, shieldMax, currentSystem,
  currentPlanet, fuelCost, currentDay, onLog,
  shipClass, stationCap, crewCapacity, roomsOf,
  hasTech, avgMorale, canTradeHere, roomCost, outpostCost,
} from './state.js';
import { combat } from './combat.js';
import {
  SYSTEMS_DEF, STATIONS, ROLE_ICON, PLANET_TYPES, fmt,
  OUTPOST_HAB_MIN, COLONY_COST, COLONY_HAB_MIN, COLONY_CREW_MIN,
  SHIP_CLASSES, ROOM_TYPES, TECHS, TRAITS, PRICE_BASE, colonyStage,
} from './data.js';
import * as sfx from './sfx.js';

const $ = (id) => document.getElementById(id);
let A = null;       // actions from main.js
let sel = null;     // shared selection context from main.js

export function initUI(actions, selection) {
  A = actions;
  sel = selection;
  $('btn-galaxy').onclick = () => { A.openGalaxy(); closeDrawers(); };
  $('btn-ship').onclick = () => { A.openInterior(); closeDrawers(); };
  $('btn-crew').onclick = () => openCrewModal();
  $('btn-research').onclick = () => openResearchModal();
  $('btn-codex').onclick = () => openCodexModal();
  $('btn-help').onclick = () => openHelp(false);
  $('btn-save').onclick = () => A.save();
  // Mobile drawers
  $('tab-left').onclick = () => toggleDrawer('left-panel');
  $('tab-right').onclick = () => toggleDrawer('right-panel');
  // Tapping/dragging the 3D scene tucks the drawers away
  document.getElementById('scene').addEventListener('pointerdown', closeDrawers);
  onLog(renderLog);
}

// ── Mobile drawers ──
export const isMobile = () => window.matchMedia('(max-width: 700px)').matches;
function toggleDrawer(id) {
  const el = $(id);
  const other = $(id === 'left-panel' ? 'right-panel' : 'left-panel');
  other.classList.remove('open');
  el.classList.toggle('open');
}
export function openDrawer(side) {
  if (!isMobile()) return;
  $(side === 'left' ? 'left-panel' : 'right-panel').classList.add('open');
  $(side === 'left' ? 'right-panel' : 'left-panel').classList.remove('open');
}
export function closeDrawers() {
  if (!isMobile()) return;
  $('left-panel').classList.remove('open');
  $('right-panel').classList.remove('open');
}

// ── Top bar ──
export function renderTop() {
  $('r-fuel').textContent = fmt(state.resources.fuel);
  $('r-alloys').textContent = fmt(state.resources.alloys);
  $('r-food').textContent = fmt(state.resources.food);
  $('r-credits').textContent = fmt(state.credits);
  $('r-science').textContent = fmt(state.science);
  $('r-crew').textContent = aliveCrew().length;
  $('r-day').textContent = currentDay();
  $('bar-hull').style.width = (state.hull / state.hullMax * 100) + '%';
  $('bar-shield').style.width = (state.shield / shieldMax() * 100) + '%';
}

// ── Left panel ──
export function renderLeft() {
  const sysEl = $('systems');
  sysEl.innerHTML = Object.entries(SYSTEMS_DEF).map(([key, def]) => {
    const hp = Math.round(state.systems[key].hp);
    const cls = hp < 30 ? 'crit' : hp < 65 ? 'low' : '';
    const crew = atStation('repair:' + key).length;
    return `<div class="sysrow">
      <div class="sysname"><b>${def.icon} ${def.label}</b>
        <span>${crew ? `<span class="crewtag">🔧×${crew}</span> ` : ''}<span class="pct">${hp}%</span></span></div>
      <div class="bar"><div class="fill sys ${cls}" style="width:${hp}%"></div></div>
    </div>`;
  }).join('');

  const stEl = $('stations');
  const mor = avgMorale();
  const morIcon = mor >= 70 ? '😊' : mor >= 45 ? '😐' : '😠';
  stEl.innerHTML = Object.entries(STATIONS)
    .filter(([k]) => !k.startsWith('repair:'))
    .map(([key, def]) => {
      const crew = atStation(key);
      return `<div class="stationrow"><span>${def.label}</span>
        <span class="names">${crew.map((c) => c.name.split(' ')[0]).join(', ')}</span>
        <span class="cnt">${crew.length}</span></div>`;
    }).join('')
    + `<div class="stationrow" title="Average crew morale — low morale slows every station"><span>Morale</span><span class="cnt">${morIcon} ${mor}%</span></div>`;

  // Objectives (quests from the living galaxy)
  $('quests-h').classList.toggle('hidden', !state.quests.length);
  $('quests').innerHTML = state.quests.map((q) => {
    const sys = state.galaxy.systems[q.systemId];
    const icon = { rescue: '🆘', deliver: '📦', hunt: '☠' }[q.type];
    const here = q.systemId === state.loc.systemId;
    return `<div class="missionrow quest">${icon} ${q.text}
      <div class="sub">${here ? '📍 you are here' : '→ ' + sys.name} · <span class="timer">${Math.max(0, q.expiresDay - currentDay())}d</span>
      ${q.type === 'deliver' ? ` · needs ${q.amount} 🌾` : ''}</div></div>`;
  }).join('');

  // Missions
  $('missions-h').classList.toggle('hidden', !state.missions.length);
  $('missions').innerHTML = state.missions.map((m) => {
    const p = state.galaxy.systems[m.systemId].planets[m.planetIndex];
    const left = Math.max(0, m.endsAt - state.time);
    return `<div class="missionrow">🧭 ${p.name}
      <span class="timer">${Math.ceil(left)}s</span>
      <div class="sub">${m.crewIds.length} crew on the ground</div></div>`;
  }).join('');

  // Outposts
  $('outposts-h').classList.toggle('hidden', !state.outposts.length);
  $('outposts').innerHTML = state.outposts.map((o) => {
    const p = state.galaxy.systems[o.systemId].planets[o.planetIndex];
    const y = o.lastYield;
    const stage = colonyStage(o.population ?? 0);
    return `<div class="outpostrow">🏕 ${p.name} <span class="sub">· ${stage.label}</span>
      <div class="sub">pop. ${Math.round((o.population ?? 0) * 100)}${y ? ` · +${y.food}🌾 +${y.alloys}🔩 +${y.fuel}⛽ /day` : ''}</div></div>`;
  }).join('');
}

// ── Right context panel ──
export function renderContext() {
  const el = $('right-panel');
  if (state.view === 'combat') { el.innerHTML = combatPanel(); wireCombat(el); return; }
  if (state.view === 'galaxy') { el.innerHTML = galaxyPanel(); wireGalaxy(el); return; }
  if (state.view === 'interior') { el.innerHTML = interiorPanel(); wireInterior(el); return; }
  el.innerHTML = systemPanel();
  wireSystem(el);
}

// ── Interior deck panel ──
function findRoom(id) {
  if (id === 'bridge') return { id, type: 'bridge' };
  if (id === 'engine') return { id, type: 'engine' };
  return state.ship.rooms.find((r) => r.id === id) || null;
}

function interiorPanel() {
  const cls = shipClass();
  let html = `<h2>${cls.name.toUpperCase()}</h2>
    <div class="subtitle">${cls.kind} · deck plan</div>
    <div class="kv"><span class="k">Rooms built</span><span class="v">${state.ship.rooms.length} / ${cls.cols * cls.rows}</span></div>
    <div class="kv"><span class="k">Crew capacity</span><span class="v">${aliveCrew().filter((c) => c.status !== 'outpost').length} / ${crewCapacity()}</span></div>`;

  const room = sel.room != null ? findRoom(sel.room) : null;
  if (room) {
    const def = ROOM_TYPES[room.type];
    html += `<h3 style="margin-top:14px">${def.icon} ${def.label.toUpperCase()}</h3>`;
    if (def.desc) html += `<div class="hint" style="margin-top:4px">${def.desc}</div>`;
    if (def.station) {
      const crew = atStation(def.station);
      const cap = stationCap(def.station);
      html += `<div class="kv"><span class="k">Station</span><span class="v">${STATIONS[def.station].label}</span></div>
        <div class="kv"><span class="k">Manned</span><span class="v ${crew.length ? 'good' : 'warn'}">${crew.length}${cap < 99 ? ' / ' + cap : ''}</span></div>`;
      html += crew.map((c) => `<div class="kv"><span class="k">${ROLE_ICON[c.role]} ${c.name}</span><span class="v">${Math.round(c.hp)}%</span></div>`).join('');
    }
    html += `<div class="actions"><button data-act="crew">👥 Assign crew</button></div>`;
  } else if (sel.slot != null) {
    html += `<h3 style="margin-top:14px">🔨 BUILD ROOM</h3>
      <div class="hint" style="margin-top:4px">Choose what to construct in this empty compartment. You have <b>${fmt(state.resources.alloys)}</b> alloys.</div>
      <div class="actions">` +
      Object.entries(ROOM_TYPES).filter(([, d]) => !d.fixed).map(([type, d]) => `
        <button data-build="${type}" ${state.resources.alloys < roomCost(type) ? 'disabled' : ''}>${d.icon} ${d.label} — ${roomCost(type)} 🔩
        <small>${d.desc || ''}</small></button>`).join('') +
      `</div>`;
  } else {
    html += `<div class="hint">Click a room to inspect its crew, or an empty <b>+ build</b> slot to construct a new room.
      Crew figures walk to whichever station you assign them.<br><br>
      Rooms unlock stations: each Gun Turret fits 2 gunners, each Medbay 2 medics, and so on.
      Passive rooms (quarters, engineering, capacitors, cargo) grant their bonus just by existing.</div>`;
  }
  html += `<div class="actions"><button data-act="back">🪐 Return to bridge view</button></div>`;
  return html;
}

function wireInterior(el) {
  el.querySelectorAll('[data-build]').forEach((b) => {
    b.onclick = () => A.buildRoom(sel.slot, b.dataset.build);
  });
  el.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.act === 'crew') openCrewModal();
      if (b.dataset.act === 'back') A.openSystem();
    };
  });
}

function galaxyPanel() {
  const cur = currentSystem();
  let html = `<h2>GALAXY MAP</h2><div class="subtitle">Currently in: ${cur.name}</div>`;
  const s = sel.star != null ? state.galaxy.systems[sel.star] : null;
  if (!s) {
    return html + `<div class="hint">Click a star to inspect it.<br><br>
      Red halos mark dangerous regions — expect ambushes, but the richest and most habitable worlds
      lie in deep space.<br><br>Drag to rotate · scroll to zoom.</div>`;
  }
  const cost = fuelCost(s);
  const danger = ['Calm', 'Low', 'Hostile', 'Deadly'][s.danger];
  html += `<h2>${s.name}</h2>
    <div class="subtitle">${s.visited ? 'Charted system' : 'Uncharted system'}</div>
    <div class="kv"><span class="k">Planets</span><span class="v">${s.visited ? s.planets.length : '?'}</span></div>
    <div class="kv"><span class="k">Threat level</span><span class="v ${s.danger >= 2 ? 'bad' : s.danger >= 1 ? 'warn' : 'good'}">${danger}</span></div>
    <div class="kv"><span class="k">Jump cost</span><span class="v ${state.resources.fuel < cost ? 'bad' : ''}">${cost} fuel</span></div>`;
  if (s.id === state.loc.systemId) {
    html += `<div class="actions"><button data-act="enter">Enter system view</button></div>`;
  } else {
    const engines = state.systems.engines.hp;
    const blocked = state.resources.fuel < cost ? 'Not enough fuel' : engines < 25 ? 'Engines too damaged (<25%)' : null;
    html += `<div class="actions">
      <button data-act="travel" ${blocked ? 'disabled' : ''}>🚀 Jump to ${s.name}
      <small>${blocked || `Costs ${cost} fuel · ambush risk ${['low', 'moderate', 'high', 'extreme'][s.danger]}`}</small></button>
    </div>`;
  }
  return html;
}

function wireGalaxy(el) {
  el.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.act === 'travel') A.travel(sel.star);
      if (b.dataset.act === 'enter') A.openSystem();
    };
  });
}

function habClass(h) { return h >= COLONY_HAB_MIN ? 'good' : h >= OUTPOST_HAB_MIN ? 'warn' : 'bad'; }

function systemPanel() {
  const sys = currentSystem();
  let html = `<h2>${sys.name}</h2><div class="subtitle">${sys.planets.length} planet${sys.planets.length > 1 ? 's' : ''} · threat: ${['calm', 'low', 'hostile', 'deadly'][sys.danger]}</div>`;
  html += `<div class="planetlist">` + sys.planets.map((p, i) => {
    const col = '#' + PLANET_TYPES[p.type].color.toString(16).padStart(6, '0');
    return `<div class="planetrow ${i === state.loc.planetIndex ? 'sel' : ''}" data-planet="${i}">
      <span class="dot" style="background:${col}; box-shadow:0 0 8px ${col}"></span>
      <span class="pname">${p.name}${p.outpost ? ' 🏕' : ''}${p.deepDone ? ' 📖' : ''}</span>
      <span class="ptype">${(p.scanStage ?? 0) >= 1 ? PLANET_TYPES[p.type].label : 'Unknown'}</span></div>`;
  }).join('') + `</div>`;

  const p = currentPlanet();
  if (p) html += planetDetail(p);
  html += `<div class="actions">`;
  if (canTradeHere()) html += `<button data-act="trade">💠 Trade at local market</button>`;
  html += `<button data-act="map">🌌 Open galaxy map</button></div>`;
  return html;
}

// Progressive reveal: each exploration stage exposes another layer of data.
function planetDetail(p) {
  const stage = p.scanStage ?? 0;
  let html = `<h3 style="margin-top:14px">${p.name.toUpperCase()}
    <span style="float:right;color:var(--text-dim);font-size:10px">${['UNCHARTED', 'SCANNED', 'PROBED', 'SURVEYED'][Math.min(stage, 3)]}</span></h3>`;

  if (stage === 0) {
    return html + `<div class="hint">An uncharted world. Run an orbital scan to classify it.</div>
      <div class="actions"><button data-act="scan">📡 Orbital scan<small>Instant · +2 science · scientists improve resource detection</small></button></div>`;
  }

  const hab = p.habitability;
  html += `
    <div class="kv"><span class="k">Class</span><span class="v">${PLANET_TYPES[p.type].label}</span></div>
    <div class="kv"><span class="k">Habitability</span><span class="v ${habClass(hab)}">${hab}%${p.terraformed ? ' 🌱' : ''}</span></div>
    <div class="kv"><span class="k">Gravity</span><span class="v">${p.gravity} g</span></div>
    <div class="kv"><span class="k">Mean temp</span><span class="v">${p.tempC}°C</span></div>
    <div class="kv"><span class="k">Atmosphere</span><span class="v">${p.atmosphere}</span></div>`;

  if (stage >= 2) {
    html += `
      <div class="kv"><span class="k">Surface water</span><span class="v">${p.water}%</span></div>
      <div class="kv"><span class="k">Radiation</span><span class="v ${p.radiation >= 2 ? 'bad' : p.radiation ? 'warn' : 'good'}">${['Minimal', 'Low', 'High', 'Lethal'][p.radiation]}</span></div>
      <div class="kv"><span class="k">Weather</span><span class="v">${p.weather}</span></div>
      <div class="kv"><span class="k">Lifeforms</span><span class="v ${p.life !== 'None detected' ? 'good' : ''}">${p.life}</span></div>
      <div class="kv"><span class="k">Hazard</span><span class="v ${p.hazard >= 2 ? 'bad' : p.hazard ? 'warn' : 'good'}">${['None', 'Low', 'High', 'Severe'][p.hazard]}</span></div>
      <div class="kv"><span class="k">Alloy deposits</span><span class="v">${p.resources.alloys}</span></div>
      <div class="kv"><span class="k">Fuel sources</span><span class="v">${p.resources.fuel}</span></div>
      <div class="kv"><span class="k">Biomass (food)</span><span class="v">${p.resources.food}</span></div>`;
  }
  if (stage >= 3 && (p.ruins || p.signal || p.wonder)) {
    html += `<div class="kv"><span class="k">Site detected</span><span class="v warn">${p.wonder ? '🛸 Massive structure' : p.ruins ? '🏺 Ancient ruins' : '📡 Signal source'}${p.deepDone ? ' (explored)' : ''}</span></div>`;
  }

  html += `<div class="actions">`;
  const idle = aboardCrew().filter((c) => c.hp > 30);
  if (stage === 1) {
    const cost = hasTech('freeProbes') ? 0 : 5;
    html += `<button data-act="probe" ${state.resources.alloys < cost ? 'disabled' : ''}>🛰 Deploy probe
      <small>${cost ? cost + ' alloys' : 'Free'} · +3 science · reveals surface conditions</small></button>`;
  }
  if (stage >= 2) {
    html += `<button data-act="exped" ${idle.length < 2 ? 'disabled' : ''}>🧭 Send expedition
      <small>${idle.length < 2 ? 'Need 2 healthy crew aboard' : 'Gather resources · ' + Math.round(20 + p.hazard * 8) + 's · hazard risk'}</small></button>`;
  }
  if (stage >= 3 && (p.ruins || p.signal || p.wonder) && !p.deepDone) {
    html += `<button data-act="deep" class="warn" ${idle.length < 2 ? 'disabled' : ''}>🏺 Deep exploration
      <small>Enter the site · dangerous · science, credits & codex discoveries</small></button>`;
  }
  if (p.type === 'gas') {
    html += `<button data-act="skim" ${p.resources.fuel <= 0 ? 'disabled' : ''}>⛽ Skim atmosphere
      <small>${p.resources.fuel <= 0 ? 'Reserves exhausted' : 'Harvest hydrogen fuel from the upper clouds'}</small></button>`;
  }
  if (stage >= 2 && !p.outpost && hab >= OUTPOST_HAB_MIN) {
    const ok = state.resources.alloys >= outpostCost() && aboardCrew().length > 2;
    html += `<button data-act="outpost" class="warn" ${ok ? '' : 'disabled'}>🏕 Establish colony
      <small>${outpostCost()} alloys + 2 settlers · grows into a city over time</small></button>`;
  }
  if (hasTech('terraforming') && stage >= 2 && !p.terraformed && p.type !== 'gas' && hab < 100) {
    html += `<button data-act="terraform" class="warn" ${state.resources.alloys < 100 ? 'disabled' : ''}>🌱 Terraform
      <small>100 alloys · +25 habitability, once per world</small></button>`;
  }
  if (hab >= COLONY_HAB_MIN && stage >= 1) {
    const ok = state.resources.alloys >= COLONY_COST && aliveCrew().length >= COLONY_CREW_MIN;
    html += `<button data-act="colonize" class="warn" ${ok ? '' : 'disabled'}>🌍 FOUND HOMEWORLD — WIN
      <small>A golden world! Needs ${COLONY_COST} alloys and ${COLONY_CREW_MIN}+ crew alive</small></button>`;
  }
  return html + `</div>`;
}

function wireSystem(el) {
  el.querySelectorAll('[data-planet]').forEach((row) => {
    row.onclick = () => A.selectPlanet(+row.dataset.planet);
  });
  el.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'scan') A.scan();
      if (act === 'probe') A.probe();
      if (act === 'exped') openExpeditionModal('expedition');
      if (act === 'deep') openExpeditionModal('deep');
      if (act === 'skim') A.skim();
      if (act === 'outpost') openOutpostModal();
      if (act === 'terraform') A.terraform();
      if (act === 'colonize') A.colonize();
      if (act === 'trade') openTradeModal();
      if (act === 'map') A.openGalaxy();
    };
  });
}

function combatPanel() {
  let html = `<div class="wavetag">⚔ WAVE ${combat.wave} / ${combat.totalWaves}</div>
    <h2>UNDER ATTACK</h2><div class="subtitle">Click an enemy to focus fire</div>`;
  html += combat.enemies.map((e) => `
    <div class="enemyrow ${combat.targetId === e.id ? 'sel' : ''}" data-enemy="${e.id}">
      <span class="ename">☠ ${e.name}</span>
      <div class="bar"><div class="fill" style="width:${Math.max(0, e.hp / e.hpMax * 100)}%"></div></div>
    </div>`).join('');
  const gunners = atStation('gunnery').length;
  const eng = state.systems.engines.hp;
  html += `<div class="hint">
    Gunners: <b>${gunners}</b> · Weapons ${Math.round(state.systems.weapons.hp)}% · Engines ${Math.round(eng)}%<br>
    Open <b>Crew</b> to reassign people mid-fight: gunners fire faster, engineers repair damaged systems, pilots dodge.</div>`;
  html += `<div class="actions">
    <button data-act="crew">👥 Battle stations (crew)</button>
    <button data-act="flee" class="danger" ${eng < 30 || combat.fleeing ? 'disabled' : ''}>🏃 Emergency jump
    <small>${eng < 30 ? 'Engines below 30% — repair first!' : 'Chance to escape based on engines & pilot'}</small></button>
  </div>`;
  return html;
}

function wireCombat(el) {
  el.querySelectorAll('[data-enemy]').forEach((row) => {
    row.onclick = () => A.target(+row.dataset.enemy);
  });
  el.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.act === 'flee') A.flee();
      if (b.dataset.act === 'crew') openCrewModal();
    };
  });
}

// ── Event log ──
export function renderLog() {
  const el = $('log');
  el.innerHTML = state.log.slice(-40).map((l) =>
    `<div><span class="t">D${l.day}</span><span class="msg-${l.cls}">${l.msg}</span></div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ── Alert banner ──
let bannerTimer = null;
export function banner(text, info = false, ms = 2600) {
  const el = $('alert-banner');
  el.textContent = text;
  el.className = info ? 'info' : '';
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
export function hideBanner() { $('alert-banner').classList.add('hidden'); }

// ── Modals ──
function modal(html, { closable = true } = {}) {
  const root = $('modal-root');
  root.classList.remove('hidden');
  root.innerHTML = `<div class="modal">${html}</div>`;
  if (closable) {
    root.onclick = (e) => { if (e.target === root) closeModal(); };
  } else root.onclick = null;
  return root.firstElementChild;
}
export function closeModal() {
  const root = $('modal-root');
  root.classList.add('hidden');
  root.classList.remove('transparent');
  $('hud').classList.remove('select-mode');
  root.innerHTML = '';
}

const MORALE_FACE = (m) => (m >= 70 ? '😊' : m >= 45 ? '😐' : '😠');

export function openCrewModal() {
  if (!state) return;
  const rows = state.crew.filter((c) => c.status !== 'dead').map((c) => {
    const away = c.status !== 'aboard';
    const opts = Object.entries(STATIONS).map(([k, def]) => {
      const cap = stationCap(k);
      const here = atStation(k).length;
      const full = c.station !== k && here >= cap;
      const tag = cap === 0 ? ' (no room)' : full ? ' (full)' : '';
      return `<option value="${k}" ${c.station === k ? 'selected' : ''} ${full || cap === 0 ? 'disabled' : ''}>${def.label}${def.bonusRole === c.role ? ' ★' : ''}${tag}</option>`;
    }).join('');
    const initials = c.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
    const traits = (c.traits || []).map((t) => TRAITS[t]
      ? `<span class="traitchip" title="${TRAITS[t].label}: ${TRAITS[t].desc}">${TRAITS[t].icon}</span>` : '').join('');
    const xpNeed = c.skill * 40;
    return `<tr class="${away ? 'away' : ''}">
      <td><span class="portrait role-${c.role}">${initials}</span> ${c.name}<span class="sub-dim">, ${c.age}</span></td>
      <td><span class="rolechip" title="${c.xp || 0}/${xpNeed} XP to next level">${c.role} ${'▮'.repeat(c.skill)}</span></td>
      <td>${traits || '—'}</td>
      <td title="Health ${Math.round(c.hp)}% · Morale ${Math.round(c.morale ?? 70)}%">
        <div class="bar"><div class="fill hp" style="width:${c.hp}%"></div></div> ${MORALE_FACE(c.morale ?? 70)}</td>
      <td>${away ? (c.status === 'mission' ? 'On mission' : 'At colony') : `<select data-crew="${c.id}">${opts}</select>`}</td>
    </tr>`;
  }).join('');
  const m = modal(`<h2>👥 CREW ROSTER</h2>
    <p>A ★ marks the station matching a specialist's trade — they are twice as effective there. Hover a trait icon
    to see what it does. Crew earn experience from expeditions, kills and completed objectives; low morale slows
    everyone down, so keep them fed and victorious.</p>
    <div class="tabwrap"><table class="crewtab"><tr><th>NAME</th><th>ROLE</th><th>TRAITS</th><th>COND.</th><th>STATION</th></tr>${rows}</table></div>
    <div class="modal-actions"><button data-close>Done</button></div>`);
  m.querySelectorAll('select[data-crew]').forEach((s) => {
    s.onchange = () => A.assign(+s.dataset.crew, s.value);
  });
  m.querySelector('[data-close]').onclick = closeModal;
}

function crewPicker(candidates, checkedCount) {
  return `<div class="picker">` + candidates.map((c, i) => `
    <label><input type="checkbox" value="${c.id}" ${i < checkedCount ? 'checked' : ''}>
      ${ROLE_ICON[c.role] || '•'} ${c.name} — ${c.role} ${'▮'.repeat(c.skill)} · ${Math.round(c.hp)}% HP</label>`).join('') + `</div>`;
}

export function openExpeditionModal(kind = 'expedition') {
  const p = currentPlanet();
  const candidates = aboardCrew().filter((c) => c.hp > 30);
  const deep = kind === 'deep';
  const m = modal(`<h2>${deep ? '🏺 DEEP EXPLORATION' : '🧭 EXPEDITION'} — ${p.name}</h2>
    <p>${deep
    ? 'Choose a team (2–4) to enter the site. It is dangerous down there — but ruins hold science, credits and artifacts for the codex. Survivalists shrug off hazards; the lucky find more.'
    : `Choose a ground team (2–4). Scientists and soldiers boost yields; higher hazard means injuries are likely. Duration ≈ ${Math.round(20 + p.hazard * 8)}s. Crew on the ground can't crew ship stations.`}</p>
    ${crewPicker(candidates, 2)}
    <div class="modal-actions"><button data-close>Cancel</button><button data-go class="warn">${deep ? 'Enter the site' : 'Launch shuttle'}</button></div>`);
  m.querySelector('[data-close]').onclick = closeModal;
  m.querySelector('[data-go]').onclick = () => {
    const ids = [...m.querySelectorAll('input:checked')].map((i) => +i.value).slice(0, 4);
    if (ids.length < 2) { banner('SELECT AT LEAST 2 CREW', true, 1600); return; }
    closeModal();
    if (deep) A.deepExplore(ids); else A.expedition(ids);
  };
}

export function openOutpostModal() {
  const p = currentPlanet();
  const candidates = aboardCrew().filter((c) => c.hp > 30);
  const m = modal(`<h2>🏕 ESTABLISH COLONY — ${p.name}</h2>
    <p>Costs <b>${outpostCost()} alloys</b>. Choose 2–3 settlers to staff it permanently — they leave the ship and
    produce food, alloys and fuel every day. Colonies grow over time: settlements open trade markets, towns and
    cities produce far more. Botanists and engineers make the best settlers.</p>
    ${crewPicker(candidates, 2)}
    <div class="modal-actions"><button data-close>Cancel</button><button data-go class="warn">Found outpost</button></div>`);
  m.querySelector('[data-close]').onclick = closeModal;
  m.querySelector('[data-go]').onclick = () => {
    const ids = [...m.querySelectorAll('input:checked')].map((i) => +i.value).slice(0, 3);
    if (ids.length < 2) { banner('SELECT AT LEAST 2 SETTLERS', true, 1600); return; }
    closeModal();
    A.buildOutpost(ids);
  };
}

// ── Ship selection (new game) ──
export function openShipSelect(defaultId = 'horizon') {
  let chosen = defaultId;
  const root = $('modal-root');
  root.classList.remove('hidden');
  root.classList.add('transparent');
  $('hud').classList.add('select-mode');
  root.onclick = null;
  const cards = Object.entries(SHIP_CLASSES).map(([id, c]) => `
    <div class="shipcard ${id === chosen ? 'sel' : ''}" data-ship="${id}">
      <div class="shipname">${c.name}</div>
      <div class="shipkind">${c.kind}</div>
      <div class="shipstats">
        <span>🛡 Hull ${c.hull}</span><span>🎯 Guns ×${c.weaponMult}</span>
        <span>⛽ Jumps ×${c.fuelMult}</span><span>🚪 Slots ${c.cols * c.rows}</span>
        <span>👥 Crew cap ${c.crewCap}</span><span>📦 Yield +${Math.round(c.yieldBonus * 100)}%</span>
      </div>
      <div class="shipdesc">${c.desc}</div>
    </div>`).join('');
  root.innerHTML = `<div class="shipselect">
    <div class="sstitle"><h1>CHOOSE YOUR ARK</h1>
      <p>Every hull flies the same mission — find a golden world — but each plays differently.</p></div>
    <div class="shipcards">${cards}</div>
    <div class="sslaunch"><button class="warn" data-launch>🚀 Launch the ${SHIP_CLASSES[chosen].name}</button></div>
  </div>`;
  const launchBtn = root.querySelector('[data-launch]');
  root.querySelectorAll('[data-ship]').forEach((card) => {
    card.onclick = () => {
      chosen = card.dataset.ship;
      root.querySelectorAll('.shipcard').forEach((c) => c.classList.toggle('sel', c === card));
      launchBtn.textContent = `🚀 Launch the ${SHIP_CLASSES[chosen].name}`;
      A.previewShip(chosen);
    };
  });
  launchBtn.onclick = () => {
    root.classList.remove('transparent');
    closeModal();
    A.chooseShip(chosen);
  };
}

// ── Research tree ──
export function openResearchModal() {
  if (!state) return;
  const branches = {};
  Object.entries(TECHS).forEach(([id, t]) => { (branches[t.branch] ||= []).push([id, t]); });
  const cols = Object.entries(branches).map(([branch, techs]) => `
    <div class="techcol"><h3>${branch.toUpperCase()}</h3>` + techs.map(([id, t]) => {
    const done = hasTech(id);
    const locked = t.requires && !hasTech(t.requires);
    const afford = state.science >= t.cost;
    return `<button class="tech ${done ? 'done' : locked ? 'locked' : ''}" data-tech="${id}"
      ${done || locked || !afford ? 'disabled' : ''}
      title="${locked ? 'Requires: ' + TECHS[t.requires].name : t.desc}">
      ${t.icon} ${t.name} <span class="cost">${done ? '✓' : locked ? '🔒' : t.cost + '🔬'}</span>
      <small>${t.desc}</small></button>`;
  }).join('') + `</div>`).join('');
  const m = modal(`<h2>🔬 RESEARCH — ${fmt(state.science)} science available</h2>
    <p>Science comes from scans, probes, expeditions, deep explorations and discoveries. Each branch unlocks in order.</p>
    <div class="techgrid">${cols}</div>
    <div class="modal-actions"><button data-close>Close</button></div>`);
  m.querySelectorAll('[data-tech]').forEach((b) => {
    b.onclick = () => { A.research(b.dataset.tech); sfx.chime(); openResearchModal(); };
  });
  m.querySelector('[data-close]').onclick = closeModal;
}

// ── Codex of discoveries ──
export function openCodexModal() {
  if (!state) return;
  const entries = [...state.codex].reverse().map((e) => `
    <div class="codexrow"><div class="codexicon">${e.icon}</div>
      <div><b>${e.title}</b> <span class="sub-dim">· day ${e.day}</span>
      <div class="sub">${e.text}</div></div></div>`).join('');
  const m = modal(`<h2>📖 CODEX — ${state.codex.length} entries</h2>
    <p>${state.codex.length ? 'Everything remarkable your voyage has uncovered.'
    : 'Empty, for now. Scan golden worlds, probe living planets and deep-explore ruins, signals and wonders to fill it.'}</p>
    ${entries}
    <div class="modal-actions"><button data-close>Close</button></div>`);
  m.querySelector('[data-close]').onclick = closeModal;
}

// ── Trade market ──
export function openTradeModal() {
  if (!state || !canTradeHere()) return;
  const rows = Object.keys(PRICE_BASE).map((res) => {
    const price = state.market[res] * PRICE_BASE[res];
    const buy = Math.ceil(price * 1.15);
    const sell = Math.floor(price * 0.85);
    const trend = state.market[res] > 1.25 ? '📈' : state.market[res] < 0.8 ? '📉' : '';
    const icon = { fuel: '⛽', alloys: '🔩', food: '🌾' }[res];
    return `<div class="traderow">
      <span class="tname">${icon} ${res} ${trend}</span>
      <span class="tstock">×${fmt(state.resources[res])}</span>
      <button data-trade="${res}" data-qty="-5" ${state.resources[res] < 5 ? 'disabled' : ''}>Sell 5 (+${sell * 5}💠)</button>
      <button data-trade="${res}" data-qty="5" ${state.credits < buy * 5 ? 'disabled' : ''}>Buy 5 (−${buy * 5}💠)</button>
    </div>`;
  }).join('');
  const m = modal(`<h2>💠 LOCAL MARKET — ${fmt(state.credits)} credits</h2>
    <p>Prices move with the living galaxy: raids spike alloys, blights spike food, disruptions spike fuel.
    📈 marks a seller's market, 📉 a buyer's.</p>
    <div id="trade-rows">${rows}</div>
    <div class="modal-actions"><button data-close>Done</button></div>`);
  m.querySelectorAll('[data-trade]').forEach((b) => {
    b.onclick = () => A.trade(b.dataset.trade, +b.dataset.qty);
  });
  m.querySelector('[data-close]').onclick = closeModal;
}
// Re-render trade rows in place after a transaction.
export function refreshTradeModal() {
  if ($('trade-rows')) openTradeModal();
}

// ── Story event with choices ──
export function openEventModal(ev) {
  const m = modal(`<h2>⚡ ${ev.title}</h2>
    <p>${ev.text}</p>
    <div class="actions">` + ev.choices.map((c, i) => `
      <button data-choice="${i}">${c.label}${c.hint ? `<small>${c.hint}</small>` : ''}</button>`).join('') +
    `</div>`, { closable: false });
  m.querySelectorAll('[data-choice]').forEach((b) => {
    b.onclick = () => {
      const choice = ev.choices[+b.dataset.choice];
      closeModal();
      choice.apply();
      renderAll();
    };
  });
}

export function openHelp(isIntro) {
  const m = modal(`<h2>${isIntro ? '🚀 ARK HORIZON' : '❓ HOW TO PLAY'}</h2>
    <p><b>You command the ark ship <i>Horizon</i></b> — the last hope of your people. Somewhere in this
    cluster is a <b>golden world</b> (habitability ≥ ${COLONY_HAB_MIN}%). Find it and found a colony before
    your crew starves or the ship is torn apart.</p>
    <p><b>🌌 Explore:</b> jump between stars on the galaxy map (costs fuel), scan planets, and send
    expeditions down for alloys, fuel and food. Skim gas giants when fuel runs low.</p>
    <p><b>👥 Crew:</b> everyone can be assigned to a station — gunnery, helm, repair bays, medbay,
    hydroponics. Matching specialists (★) are twice as effective. Crew eats 1 food per day.</p>
    <p><b>⚔ Combat:</b> hostile aliens ambush you in deep space. Shields absorb hits until they collapse;
    then the hull and ship systems take damage. Put soldiers on gunnery, engineers on damaged systems,
    a pilot at the helm to dodge — or make an emergency jump if engines still work.</p>
    <p><b>🏕 Expand:</b> planets with habitability ≥ ${OUTPOST_HAB_MIN}% can host colonies (${outpostCost()} alloys)
    that deliver daily supplies and grow into trading cities. The golden world needs ${COLONY_COST} alloys and ${COLONY_CREW_MIN}+ living crew to colonize.</p>
    <p><b>🌌 The galaxy lives:</b> pirates raid, prices move, colonies call for help and strange things drift
    between the stars. Objectives appear in the left panel — chase them for credits and science, spend science
    in 🔬 Research, and log every discovery in the 📖 Codex. Explore planets in stages: scan → probe → land → go deep.</p>
    <p class="hint" style="margin-top:4px">Drag to orbit the camera · scroll to zoom · click stars, planets & enemies to interact.</p>
    <div class="modal-actions"><button data-close class="warn">${isIntro ? 'Take command' : 'Close'}</button></div>`,
  { closable: !isIntro });
  m.querySelector('[data-close]').onclick = closeModal;
}

export function openGameOver(reason) {
  modal(`<h2>💀 THE VOYAGE ENDS</h2>
    <p>${reason}</p>
    <p>Days survived: <b>${currentDay()}</b> · Systems visited: <b>${state.galaxy.systems.filter((s) => s.visited).length}</b> ·
    Hostiles destroyed: <b>${state.stats.kills}</b> · Expeditions: <b>${state.stats.expeditions}</b></p>
    <div class="modal-actions"><button data-new class="danger">Start a new voyage</button></div>`,
  { closable: false }).querySelector('[data-new]').onclick = () => A.newGame();
  document.querySelector('.modal').classList.add('gameover');
}

export function openVictory(planetName) {
  modal(`<h2>🌍 A NEW HOME</h2>
    <p>The shuttles descend through clean air onto <b>${planetName}</b>. After ${currentDay()} days adrift,
    your people set foot on a world they can finally call home. The ark <i>Horizon</i> will watch from
    orbit as the first city rises.</p>
    <p>Hostiles destroyed: <b>${state.stats.kills}</b> · Expeditions: <b>${state.stats.expeditions}</b> ·
    Outposts founded: <b>${state.outposts.length}</b> · Survivors: <b>${aliveCrew().length}</b></p>
    <div class="modal-actions"><button data-new class="warn">Play again</button></div>`,
  { closable: false }).querySelector('[data-new]').onclick = () => A.newGame();
  document.querySelector('.modal').classList.add('victory');
}

export function renderAll() {
  renderTop();
  renderLeft();
  renderContext();
}
