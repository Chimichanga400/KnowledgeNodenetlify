// ── DOM HUD: panels, modals, log ─────────────────────────────────
import {
  state, aliveCrew, aboardCrew, atStation, shieldMax, currentSystem,
  currentPlanet, fuelCost, currentDay, onLog,
} from './state.js';
import { combat } from './combat.js';
import {
  SYSTEMS_DEF, STATIONS, ROLE_ICON, PLANET_TYPES, fmt,
  OUTPOST_COST, OUTPOST_HAB_MIN, COLONY_COST, COLONY_HAB_MIN, COLONY_CREW_MIN,
  DAY_SECONDS,
} from './data.js';

const $ = (id) => document.getElementById(id);
let A = null;       // actions from main.js
let sel = null;     // shared selection context from main.js

export function initUI(actions, selection) {
  A = actions;
  sel = selection;
  $('btn-galaxy').onclick = () => A.openGalaxy();
  $('btn-crew').onclick = () => openCrewModal();
  $('btn-help').onclick = () => openHelp(false);
  $('btn-save').onclick = () => A.save();
  onLog(renderLog);
}

// ── Top bar ──
export function renderTop() {
  $('r-fuel').textContent = fmt(state.resources.fuel);
  $('r-alloys').textContent = fmt(state.resources.alloys);
  $('r-food').textContent = fmt(state.resources.food);
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
  stEl.innerHTML = Object.entries(STATIONS)
    .filter(([k]) => !k.startsWith('repair:'))
    .map(([key, def]) => {
      const crew = atStation(key);
      return `<div class="stationrow"><span>${def.label}</span>
        <span class="names">${crew.map((c) => c.name.split(' ')[0]).join(', ')}</span>
        <span class="cnt">${crew.length}</span></div>`;
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
    return `<div class="outpostrow">🏕 ${p.name}
      <div class="sub">${o.crewIds.length} settlers${y ? ` · +${y.food}🌾 +${y.alloys}🔩 +${y.fuel}⛽ /day` : ''}</div></div>`;
  }).join('');
}

// ── Right context panel ──
export function renderContext() {
  const el = $('right-panel');
  if (state.view === 'combat') { el.innerHTML = combatPanel(); wireCombat(el); return; }
  if (state.view === 'galaxy') { el.innerHTML = galaxyPanel(); wireGalaxy(el); return; }
  el.innerHTML = systemPanel();
  wireSystem(el);
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
      <span class="pname">${p.name}${p.outpost ? ' 🏕' : ''}</span>
      <span class="ptype">${p.scanned ? PLANET_TYPES[p.type].label : 'Unknown'}</span></div>`;
  }).join('') + `</div>`;

  const p = currentPlanet();
  if (p) {
    html += `<h3 style="margin-top:14px">${p.name.toUpperCase()}</h3>`;
    if (!p.scanned) {
      html += `<div class="hint">Surface unscanned. Run a sensor sweep to reveal habitability and resources.</div>
        <div class="actions"><button data-act="scan">📡 Scan planet<small>Instant · scientists improve resource detection</small></button></div>`;
    } else {
      const hab = p.habitability;
      html += `
        <div class="kv"><span class="k">Class</span><span class="v">${PLANET_TYPES[p.type].label}</span></div>
        <div class="kv"><span class="k">Habitability</span><span class="v ${habClass(hab)}">${hab}%</span></div>
        <div class="kv"><span class="k">Hazard</span><span class="v ${p.hazard >= 2 ? 'bad' : p.hazard ? 'warn' : 'good'}">${['None', 'Low', 'High', 'Severe'][p.hazard]}</span></div>
        <div class="kv"><span class="k">Alloy deposits</span><span class="v">${p.resources.alloys}</span></div>
        <div class="kv"><span class="k">Fuel sources</span><span class="v">${p.resources.fuel}</span></div>
        <div class="kv"><span class="k">Biomass (food)</span><span class="v">${p.resources.food}</span></div>`;
      html += `<div class="actions">`;
      const idle = aboardCrew().filter((c) => c.hp > 30);
      html += `<button data-act="exped" ${idle.length < 2 ? 'disabled' : ''}>🧭 Send expedition
        <small>${idle.length < 2 ? 'Need 2 healthy crew aboard' : 'Gather resources · ' + Math.round(20 + p.hazard * 8) + 's · hazard risk'}</small></button>`;
      if (p.type === 'gas') {
        html += `<button data-act="skim" ${p.resources.fuel <= 0 ? 'disabled' : ''}>⛽ Skim atmosphere
          <small>${p.resources.fuel <= 0 ? 'Reserves exhausted' : 'Harvest hydrogen fuel from the upper clouds'}</small></button>`;
      }
      if (!p.outpost && hab >= OUTPOST_HAB_MIN) {
        const ok = state.resources.alloys >= OUTPOST_COST && aboardCrew().length > 2;
        html += `<button data-act="outpost" class="warn" ${ok ? '' : 'disabled'}>🏕 Establish outpost
          <small>${OUTPOST_COST} alloys + 2 settlers · produces supplies daily</small></button>`;
      }
      if (hab >= COLONY_HAB_MIN) {
        const ok = state.resources.alloys >= COLONY_COST && aliveCrew().length >= COLONY_CREW_MIN;
        html += `<button data-act="colonize" class="warn" ${ok ? '' : 'disabled'}>🌍 FOUND COLONY — WIN
          <small>A golden world! Needs ${COLONY_COST} alloys and ${COLONY_CREW_MIN}+ crew alive</small></button>`;
      }
      html += `</div>`;
    }
  }
  html += `<div class="actions"><button data-act="map">🌌 Open galaxy map</button></div>`;
  return html;
}

function wireSystem(el) {
  el.querySelectorAll('[data-planet]').forEach((row) => {
    row.onclick = () => A.selectPlanet(+row.dataset.planet);
  });
  el.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'scan') A.scan();
      if (act === 'exped') openExpeditionModal();
      if (act === 'skim') A.skim();
      if (act === 'outpost') openOutpostModal();
      if (act === 'colonize') A.colonize();
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
  root.innerHTML = '';
}

export function openCrewModal() {
  const rows = state.crew.filter((c) => c.status !== 'dead').map((c) => {
    const away = c.status !== 'aboard';
    const opts = Object.entries(STATIONS).map(([k, def]) =>
      `<option value="${k}" ${c.station === k ? 'selected' : ''}>${def.label}${def.bonusRole === c.role ? ' ★' : ''}</option>`).join('');
    return `<tr class="${away ? 'away' : ''}">
      <td>${ROLE_ICON[c.role] || '•'} ${c.name}</td>
      <td><span class="rolechip">${c.role} ${'▮'.repeat(c.skill)}</span></td>
      <td><div class="bar"><div class="fill hp" style="width:${c.hp}%"></div></div> ${Math.round(c.hp)}%</td>
      <td>${away ? (c.status === 'mission' ? 'On mission' : 'At outpost') : `<select data-crew="${c.id}">${opts}</select>`}</td>
    </tr>`;
  }).join('');
  const m = modal(`<h2>👥 CREW ROSTER</h2>
    <p>Assign crew to stations. A ★ marks the station matching their specialty — they are twice as effective there. Badly hurt crew (&lt;40%) work at half speed; send them to rest or the medbay.</p>
    <table class="crewtab"><tr><th>NAME</th><th>ROLE</th><th>HEALTH</th><th>STATION</th></tr>${rows}</table>
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

export function openExpeditionModal() {
  const p = currentPlanet();
  const candidates = aboardCrew().filter((c) => c.hp > 30);
  const m = modal(`<h2>🧭 EXPEDITION — ${p.name}</h2>
    <p>Choose a ground team (2–4). Scientists and soldiers boost yields; higher hazard means injuries are likely.
    Duration ≈ ${Math.round(20 + p.hazard * 8)}s. Crew on the ground can't crew ship stations.</p>
    ${crewPicker(candidates, 2)}
    <div class="modal-actions"><button data-close>Cancel</button><button data-go class="warn">Launch shuttle</button></div>`);
  m.querySelector('[data-close]').onclick = closeModal;
  m.querySelector('[data-go]').onclick = () => {
    const ids = [...m.querySelectorAll('input:checked')].map((i) => +i.value).slice(0, 4);
    if (ids.length < 2) { banner('SELECT AT LEAST 2 CREW', true, 1600); return; }
    closeModal();
    A.expedition(ids);
  };
}

export function openOutpostModal() {
  const p = currentPlanet();
  const candidates = aboardCrew().filter((c) => c.hp > 30);
  const m = modal(`<h2>🏕 ESTABLISH OUTPOST — ${p.name}</h2>
    <p>Costs <b>${OUTPOST_COST} alloys</b>. Choose 2–3 settlers to staff it permanently — they leave the ship and
    produce food, alloys and fuel every day. Botanists and engineers make the best settlers.</p>
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
    <p><b>🏕 Expand:</b> planets with habitability ≥ ${OUTPOST_HAB_MIN}% can host outposts (${OUTPOST_COST} alloys)
    that deliver daily supplies. The golden world needs ${COLONY_COST} alloys and ${COLONY_CREW_MIN}+ living crew to colonize.</p>
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
