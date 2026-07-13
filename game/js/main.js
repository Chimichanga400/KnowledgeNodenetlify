// ── Ark Horizon: bootstrap & game orchestration ──────────────────
import * as scene from './scene.js';
import * as ui from './ui.js';
import * as sim from './sim.js';
import { startCombat, updateCombat, setTarget, attemptFlee, combat } from './combat.js';
import {
  state, newGame, loadGame, saveGame, clearSave, log,
  currentSystem, currentPlanet, fuelCost, aliveCrew, aboardCrew,
  pilotBonus, shieldMax, atStation, stationCap,
} from './state.js';
import {
  clamp, makeRng, randInt, OUTPOST_COST, COLONY_COST, COLONY_HAB_MIN,
  COLONY_CREW_MIN, OUTPOST_HAB_MIN, PLANET_TYPES, ROOM_TYPES, SHIP_CLASSES,
} from './data.js';

const sel = { star: null, room: null, slot: null };   // selections shared with ui.js

// ── View switching ──
function openGalaxy() {
  if (!state || combat.active) return;
  state.view = 'galaxy';
  sel.star = state.loc.systemId;
  sel.room = sel.slot = null;
  scene.showGalaxy(state.galaxy.systems, state.loc.systemId);
  ui.renderContext();
}

function openSystem() {
  if (!state || combat.active) return;
  state.view = 'system';
  sel.room = sel.slot = null;
  scene.showSystem(currentSystem(), state.loc.planetIndex ?? 0);
  ui.renderContext();
}

function openInterior() {
  if (!state) return;
  if (combat.active) { ui.banner('NOT WHILE UNDER FIRE', true, 1500); return; }
  state.view = 'interior';
  sel.room = sel.slot = null;
  scene.showInterior();
  ui.renderContext();
}

function selectPlanet(i) {
  state.loc.planetIndex = i;
  scene.focusPlanet(i);
  ui.renderContext();
}

// ── Actions ──
function travel(starId) {
  const target = state.galaxy.systems[starId];
  if (!target || starId === state.loc.systemId) return;
  if (state.missions.length) { ui.banner('CREW STILL ON THE GROUND', true); return; }
  const cost = fuelCost(target);
  if (state.resources.fuel < cost || state.systems.engines.hp < 25) return;

  state.resources.fuel -= cost;
  state.stats.jumps++;
  const origin = state.loc.systemId;
  state.loc.systemId = starId;
  state.loc.planetIndex = 0;
  const firstVisit = !target.visited;
  target.visited = true;
  log(`Jumped to ${target.name} (−${cost} fuel).`, 'info');
  ui.banner('JUMPING…', true, 1200);

  // Ambush roll
  const rng = makeRng((state.seed ^ state.stats.jumps * 104729) >>> 0);
  let p = 0.18 + target.danger * 0.22 - pilotBonus() * 0.015;
  if (target.cleared) p *= 0.35;
  if (firstVisit) p += 0.08;
  if (rng() < clamp(p, 0.05, 0.9) && target.danger > 0) {
    ui.banner('⚠ AMBUSH — HOSTILES ON INTERCEPT', false, 3000);
    startCombat(target.danger, (result) => onCombatEnd(result, origin), () => {
      ui.renderContext(); ui.renderTop();
    });
    ui.renderAll();
    ui.openDrawer('right');
    return;
  }
  openSystem();
  ui.renderAll();
  maybeAutosave(true);
}

function onCombatEnd(result, originId) {
  ui.hideBanner();
  if (result === 'defeat') { gameOver('The ark Horizon broke apart under enemy fire, her lights fading into the void.'); return; }
  if (result === 'victory') {
    currentSystem().cleared = true;
    ui.banner('THREAT ELIMINATED', true, 2200);
  } else if (result === 'fled') {
    // Retreat back the way we came.
    state.loc.systemId = originId;
    state.loc.planetIndex = 0;
    log(`We fell back to ${currentSystem().name}.`, 'warn');
  }
  openSystem();
  ui.renderAll();
  maybeAutosave(true);
}

function scan() {
  const p = currentPlanet();
  if (!p || p.scanned) return;
  p.scanned = true;
  const sci = aboardCrew().filter((c) => c.role === 'Scientist' && c.hp > 30).length;
  if (sci) {
    // Scientists squeeze extra value out of survey data.
    p.resources.alloys = Math.round(p.resources.alloys * (1 + sci * 0.1));
    p.resources.food = Math.round(p.resources.food * (1 + sci * 0.1));
  }
  const hab = p.habitability;
  if (hab >= COLONY_HAB_MIN) {
    log(`📡 Scan complete: ${p.name} is a GOLDEN WORLD (${hab}% habitability)! This could be home.`, 'good');
    ui.banner('🌍 GOLDEN WORLD DETECTED', true, 3500);
  } else {
    log(`📡 Scan complete: ${p.name} — ${PLANET_TYPES[p.type].label}, ${hab}% habitability.`, 'info');
  }
  ui.renderAll();
}

function expedition(crewIds) {
  const p = currentPlanet();
  if (!p) return;
  const team = state.crew.filter((c) => crewIds.includes(c.id) && c.status === 'aboard');
  if (team.length < 2) return;
  team.forEach((c) => { c.status = 'mission'; c.station = 'idle'; });
  state.missions.push({
    id: state.nextId++,
    systemId: state.loc.systemId,
    planetIndex: state.loc.planetIndex,
    crewIds: team.map((c) => c.id),
    endsAt: state.time + Math.round(20 + p.hazard * 8),
  });
  log(`Shuttle away — ${team.length} crew descending to ${p.name}.`, 'info');
  ui.renderAll();
}

function skim() {
  const p = currentPlanet();
  if (!p || p.type !== 'gas' || p.resources.fuel <= 0) return;
  const rng = makeRng((state.seed ^ Math.floor(state.time) * 31) >>> 0);
  const take = Math.min(p.resources.fuel, randInt(rng, 10, 18) + pilotBonus());
  p.resources.fuel -= Math.round(take * 0.8);
  state.resources.fuel += take;
  log(`Skimmed ${take} fuel from ${p.name}'s upper atmosphere.`, 'good');
  ui.renderAll();
}

function buildOutpost(crewIds) {
  const p = currentPlanet();
  if (!p || p.outpost || p.habitability < OUTPOST_HAB_MIN || state.resources.alloys < OUTPOST_COST) return;
  const settlers = state.crew.filter((c) => crewIds.includes(c.id) && c.status === 'aboard');
  if (settlers.length < 2) return;
  state.resources.alloys -= OUTPOST_COST;
  settlers.forEach((c) => { c.status = 'outpost'; c.station = 'idle'; });
  p.outpost = true;
  state.outposts.push({
    id: state.nextId++,
    systemId: state.loc.systemId,
    planetIndex: state.loc.planetIndex,
    crewIds: settlers.map((c) => c.id),
    lastYield: null,
  });
  log(`🏕 Outpost founded on ${p.name}. ${settlers.length} settlers begin construction.`, 'good');
  openSystem(); // refresh beacon
  ui.renderAll();
}

function colonize() {
  const p = currentPlanet();
  if (!p || p.habitability < COLONY_HAB_MIN) return;
  if (state.resources.alloys < COLONY_COST || aliveCrew().length < COLONY_CREW_MIN) return;
  state.resources.alloys -= COLONY_COST;
  state.flags.won = true;
  clearSave();
  log(`🌍 Colony ship launched. ${p.name} is our new home.`, 'good');
  ui.openVictory(p.name);
}

function assign(crewId, station) {
  const c = state.crew.find((x) => x.id === crewId);
  if (!c || c.status !== 'aboard' || c.station === station) return;
  const cap = stationCap(station);
  if (cap === 0) { ui.banner('BUILD THAT ROOM FIRST', true, 1600); return; }
  if (atStation(station).length >= cap) { ui.banner('STATION FULL', true, 1400); return; }
  c.station = station;
  log(`${c.name} → ${station === 'idle' ? 'off duty' : station.replace('repair:', 'repair bay: ')}.`, 'info');
  ui.renderTop(); ui.renderLeft();
  if (combat.active || state.view === 'interior') ui.renderContext();
}

function buildRoom(slot, type) {
  const def = ROOM_TYPES[type];
  if (!def || def.fixed || slot == null) return;
  if (state.resources.alloys < def.cost) return;
  if (state.ship.rooms.some((r) => r.slot === slot)) return;
  state.resources.alloys -= def.cost;
  const room = { id: state.ship.nextRoomId++, type, slot };
  state.ship.rooms.push(room);
  log(`${def.icon} ${def.label} constructed (−${def.cost} alloys).`, 'good');
  sel.slot = null;
  sel.room = room.id;
  scene.showInterior();
  ui.renderAll();
}

function gameOver(reason) {
  if (state.flags.lost) return;
  state.flags.lost = true;
  clearSave();
  ui.openGameOver(reason);
}

function save() {
  if (!state) return;
  if (saveGame()) ui.banner('PROGRESS SAVED', true, 1400);
  else ui.banner('SAVE FAILED', false, 1800);
}

function previewShip(classId) {
  scene.showShowcase(classId);
}

function chooseShip(classId) {
  newGame(Math.floor(Math.random() * 1e9), classId);
  startVoyage(false);
}

function restart() {
  ui.closeModal();
  clearSave();
  boot(true);
}

// ── Actions table handed to the UI ──
const actions = {
  openGalaxy, openSystem, openInterior, selectPlanet, travel, scan, expedition, skim,
  buildOutpost, colonize, assign, save, buildRoom, previewShip, chooseShip,
  target: setTarget, flee: attemptFlee, newGame: restart,
};

// ── Scene click routing ──
scene.setClickHandler((pick) => {
  if (!state) return;
  if (pick.kind === 'star' && state.view === 'galaxy') {
    sel.star = pick.id;
    ui.renderContext();
    ui.openDrawer('right');
  } else if (pick.kind === 'planet' && state.view === 'system') {
    selectPlanet(pick.index);
    ui.openDrawer('right');
  } else if (pick.kind === 'enemy' && combat.active) {
    setTarget(pick.id);
  } else if (state.view === 'interior') {
    if (pick.kind === 'room') { sel.room = pick.id; sel.slot = null; ui.renderContext(); ui.openDrawer('right'); }
    else if (pick.kind === 'slot') { sel.slot = pick.slot; sel.room = null; ui.renderContext(); ui.openDrawer('right'); }
    else if (pick.kind === 'crewfig') ui.openCrewModal();
  }
});

// ── Autosave ──
let lastSave = 0;
function maybeAutosave(force) {
  if (state.flags.won || state.flags.lost || combat.active) return;
  if (force || state.time - lastSave >= 45) {
    lastSave = state.time;
    saveGame();
  }
}

// ── Boot & main loop ──
function boot(fresh) {
  ui.initUI(actions, sel);
  const loaded = !fresh && loadGame();
  if (!loaded) {
    // New voyage: pick a ship first.
    scene.showShowcase('horizon');
    ui.openShipSelect('horizon');
    return;
  }
  startVoyage(true);
}

function startVoyage(loaded) {
  sim.resetSim();
  scene.setShipClass(state.ship.classId);
  const cls = SHIP_CLASSES[state.ship.classId];
  if (loaded) {
    log('Ship systems restored from the last checkpoint. Welcome back, Commander.', 'info');
  } else {
    log(`The ${cls.kind.toLowerCase()} ${cls.name} drifts at the edge of the Heleus Anchor system. Sensors online.`, 'info');
    log('Objective: locate a golden world (habitability ≥ 85%) and found a colony.', 'warn');
  }
  state.view = 'system';
  scene.showSystem(currentSystem(), state.loc.planetIndex ?? 0);
  ui.renderAll();
  ui.renderLog();
  if (!state.flags.introSeen) {
    state.flags.introSeen = true;
    ui.openHelp(true);
  }
}

scene.init(document.getElementById('scene'));
boot(false);

// Debug/testing hook (also handy for cheats — it's a single-player game).
window.__ark = { get state() { return state; }, actions };

let last = performance.now();
let simAcc = 0;
let uiAcc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!state || state.flags.won || state.flags.lost) { scene.update(dt); return; }

  scene.update(dt);
  updateCombat(dt);

  simAcc += dt;
  while (simAcc >= 1) {
    simAcc -= 1;
    const finished = sim.tick(combat.active);
    finished.forEach((m) => sim.resolveMission(m));
    if (finished.length) ui.renderAll();
    if (aliveCrew().length === 0) {
      gameOver('The last of the crew is gone. The Horizon drifts on, silent and empty.');
      return;
    }
    if (state.hull <= 0 && !combat.active) {
      gameOver('Catastrophic hull failure. The ark Horizon is lost with all hands.');
      return;
    }
    maybeAutosave(false);
  }

  uiAcc += dt;
  if (uiAcc >= 0.5) {
    uiAcc = 0;
    ui.renderTop();
    ui.renderLeft();
    if (combat.active) ui.renderContext();
  }
}
requestAnimationFrame(loop);
