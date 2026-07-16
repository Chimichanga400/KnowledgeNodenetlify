// ── Ark Horizon: bootstrap & game orchestration ──────────────────
import * as scene from './scene.js';
import * as ui from './ui.js';
import * as sim from './sim.js';
import * as sfx from './sfx.js';
import { startCombat, updateCombat, setTarget, attemptFlee, combat } from './combat.js';
import {
  state, newGame, loadGame, saveGame, clearSave, log,
  currentSystem, currentPlanet, fuelCost, aliveCrew, aboardCrew,
  pilotBonus, shieldMax, atStation, stationCap,
  hasTech, addScience, addCodex, roomCost, outpostCost, canTradeHere,
  labRate, moraleShift, diffMods,
} from './state.js';
import {
  clamp, makeRng, randInt, COLONY_COST, COLONY_HAB_MIN,
  COLONY_CREW_MIN, OUTPOST_HAB_MIN, PLANET_TYPES, ROOM_TYPES, SHIP_CLASSES,
  TECHS, PRICE_BASE,
} from './data.js';
import { initGalaxySim, questsOnArrival, completeQuest } from './galaxysim.js';

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
  if (!target || starId === state.loc.systemId || scene.isWarping()) return;
  if (state.missions.length) { ui.banner('CREW STILL ON THE GROUND', true); return; }
  const cost = fuelCost(target);
  if (state.resources.fuel < cost || state.systems.engines.hp < 25) return;

  state.resources.fuel -= cost;
  if (hasTech('ramjet')) state.resources.fuel += 3;
  // Warp strain: crew on active stations tire with every jump.
  aboardCrew().forEach((c) => { if (c.station !== 'idle') moraleShift(c, -3); });
  state.stats.jumps++;
  const origin = state.loc.systemId;
  state.loc.systemId = starId;
  state.loc.planetIndex = 0;
  const firstVisit = !target.visited;
  target.visited = true;
  log(`Jumped to ${target.name} (−${cost} fuel).`, 'info');
  ui.banner('JUMPING…', true, 1200);
  sfx.warp();

  // Ambush roll (a spurned pirate toll guarantees one; difficulty scales it)
  const rng = makeRng((state.seed ^ state.stats.jumps * 104729) >>> 0);
  let p = (0.18 + target.danger * 0.22 - pilotBonus() * 0.015) * diffMods().ambushMult;
  if (target.cleared) p *= 0.35;
  if (firstVisit) p += 0.08;
  const forced = state.forceAmbush;
  state.forceAmbush = false;
  const ambush = forced || (rng() < clamp(p, 0.05, 0.9) && target.danger > 0);

  // Hyperspace cinematic: the system swap happens at the tunnel's midpoint.
  scene.warpJump(() => {
    if (ambush) {
      ui.banner(forced ? '⚠ THE CORSAIRS COLLECT THEIR TOLL' : '⚠ AMBUSH — HOSTILES ON INTERCEPT', false, 3000);
      startCombat(Math.max(1, target.danger), (result) => onCombatEnd(result, origin), () => {
        ui.renderContext(); ui.renderTop();
      });
      ui.renderAll();
      ui.openDrawer('right');
      return;
    }
    arriveInSystem();
    maybeAutosave(true);
  });
}

// Post-jump arrival: resolve rescue/delivery objectives, then bounty hunts.
function arriveInSystem() {
  const hunt = questsOnArrival();
  if (hunt) {
    ui.banner('⚠ BOUNTY TARGETS ON SCOPE', false, 2600);
    const sys = currentSystem();
    startCombat(Math.max(1, sys.danger), (result) => {
      if (result === 'victory') {
        completeQuest(hunt);
        sys.danger = Math.max(0, sys.danger - 1);
      }
      onCombatEnd(result, state.loc.systemId);
    }, () => { ui.renderContext(); ui.renderTop(); });
    ui.renderAll();
    ui.openDrawer('right');
    return;
  }
  openSystem();
  ui.renderAll();
}

function onCombatEnd(result, originId) {
  ui.hideBanner();
  if (result === 'defeat') { gameOver('The ark Horizon broke apart under enemy fire, her lights fading into the void.'); return; }
  if (result === 'victory') {
    currentSystem().cleared = true;
    ui.banner('THREAT ELIMINATED', true, 2200);
    arriveInSystem();   // rescue/delivery objectives here still count
    maybeAutosave(true);
    return;
  }
  if (result === 'fled') {
    // Retreat back the way we came.
    state.loc.systemId = originId;
    state.loc.planetIndex = 0;
    log(`We fell back to ${currentSystem().name}.`, 'warn');
  }
  openSystem();
  ui.renderAll();
  maybeAutosave(true);
}

// ── Staged planet exploration: orbital scan → probe → landing → deep site ──
function scan() {
  const p = currentPlanet();
  if (!p || p.scanStage >= 1) return;
  p.scanStage = hasTech('deepSensors') ? 2 : 1;
  addScience(2 + Math.floor(labRate() * 0.3), `orbital survey of ${p.name}`);
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
    addCodex('🌍', `Golden World: ${p.name}`, `A ${PLANET_TYPES[p.type].label.toLowerCase()} with ${hab}% habitability — a world our people could truly live on.`);
  } else {
    log(`📡 Scan complete: ${p.name} — ${PLANET_TYPES[p.type].label}, ${hab}% habitability.`, 'info');
  }
  ui.renderAll();
}

function probe() {
  const p = currentPlanet();
  if (!p || p.scanStage < 1 || p.scanStage >= 2) return;
  const cost = hasTech('freeProbes') ? 0 : 5;
  if (state.resources.alloys < cost) return;
  state.resources.alloys -= cost;
  p.scanStage = 2;
  addScience(3, `probe telemetry from ${p.name}`);
  log(`🛰 Probe down on ${p.name}: ${p.life.toLowerCase()}, radiation ${['minimal', 'low', 'high', 'lethal'][p.radiation]}, ${p.water}% surface water.`, 'info');
  if (p.life === 'Complex fauna') addCodex('🦎', `Fauna of ${p.name}`, 'Probe cameras captured multicellular life moving on the surface — proof the galaxy is not empty.');
  ui.renderAll();
}

// Drone extraction: the safe, low-yield alternative to an away team.
function drone() {
  const p = currentPlanet();
  if (!p || p.scanStage < 2) return;
  if (state.resources.fuel < 2 || state.resources.alloys < 1) return;
  const total = p.resources.alloys + p.resources.fuel + p.resources.food;
  if (total <= 0) { ui.banner('SITE DEPLETED', true, 1500); return; }
  state.resources.fuel -= 2;
  state.resources.alloys -= 1;
  const rng = makeRng((state.seed ^ Math.floor(state.time) * 977) >>> 0);
  const gain = {};
  const parts = [];
  for (const res of ['alloys', 'fuel', 'food']) {
    gain[res] = Math.round(p.resources[res] * (0.05 + rng() * 0.04));
    p.resources[res] = Math.max(0, p.resources[res] - gain[res]);
    state.resources[res] += gain[res];
    if (gain[res]) parts.push(`${gain[res]} ${res}`);
  }
  log(`🛸 Drone run on ${p.name}: ${parts.length ? '+' + parts.join(', +') : 'came back empty'}. No crew risked.`, parts.length ? 'good' : 'info');
  ui.renderAll();
}

// Bonus pay: buy back a tired crew member's goodwill.
function bonusPay(crewId) {
  const c = state.crew.find((x) => x.id === crewId);
  if (!c || c.status === 'dead' || state.credits < 10) return;
  state.credits -= 10;
  moraleShift(c, 15);
  log(`💠 Bonus pay for ${c.name} (+15 morale).`, 'info');
  ui.renderTop(); ui.renderLeft();
  ui.openCrewModal();
}

function deepExplore(crewIds) {
  const p = currentPlanet();
  if (!p || p.deepDone || p.scanStage < 3 || !(p.ruins || p.signal || p.wonder)) return;
  const team = state.crew.filter((c) => crewIds.includes(c.id) && c.status === 'aboard');
  if (team.length < 2) return;
  team.forEach((c) => { c.status = 'mission'; c.station = 'idle'; });
  state.missions.push({
    id: state.nextId++,
    kind: 'deep',
    systemId: state.loc.systemId,
    planetIndex: state.loc.planetIndex,
    crewIds: team.map((c) => c.id),
    endsAt: state.time + 26,
  });
  log(`Deep exploration team descending toward the ${p.wonder ? 'structure' : p.ruins ? 'ruins' : 'signal source'} on ${p.name}.`, 'warn');
  scene.shuttleFx(state.loc.planetIndex, false);
  ui.banner('🛫 SHUTTLE AWAY', true, 1800);
  ui.renderAll();
}

function terraform() {
  const p = currentPlanet();
  if (!hasTech('terraforming') || !p || p.terraformed || p.type === 'gas' || state.resources.alloys < 100) return;
  state.resources.alloys -= 100;
  p.terraformed = true;
  p.habitability = clamp(p.habitability + 25, 0, 100);
  log(`🌍 Terraforming engines seeded on ${p.name} — habitability rises to ${p.habitability}%.`, 'good');
  if (p.habitability >= COLONY_HAB_MIN) {
    addCodex('🌱', `World Reborn: ${p.name}`, 'A hostile rock remade into a living world by our own hands. The colonists will never know how the rains began.');
    ui.banner('🌍 TERRAFORMING SUCCESSFUL — GOLDEN WORLD CREATED', true, 3500);
  }
  ui.renderAll();
}

function research(techId) {
  const t = TECHS[techId];
  if (!t || hasTech(techId) || state.science < t.cost) return;
  if (t.requires && !hasTech(t.requires)) return;
  state.science -= t.cost;
  state.tech.researched.push(techId);
  if (techId === 'reinforcedHull') { state.hullMax += 25; state.hull += 25; }
  log(`🔬 Research complete: ${t.name} — ${t.desc}.`, 'good');
  ui.renderAll();
}

// Trade ±qty of a resource at the local market (positive = buy).
function trade(res, qty) {
  if (!canTradeHere() || !PRICE_BASE[res]) return;
  const price = state.market[res] * PRICE_BASE[res];
  if (qty > 0) {
    const cost = Math.ceil(price * 1.15 * qty);
    if (state.credits < cost) return;
    state.credits -= cost;
    state.resources[res] += qty;
  } else {
    const amount = Math.min(-qty, Math.floor(state.resources[res]));
    if (amount <= 0) return;
    state.resources[res] -= amount;
    state.credits += Math.floor(price * 0.85 * amount);
  }
  ui.renderAll();
  ui.refreshTradeModal();
}

function expedition(crewIds) {
  const p = currentPlanet();
  if (!p || p.scanStage < 2) return;
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
  scene.shuttleFx(state.loc.planetIndex, false);
  ui.banner('🛫 SHUTTLE AWAY', true, 1800);
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
  if (!p || p.outpost || p.habitability < OUTPOST_HAB_MIN || state.resources.alloys < outpostCost()) return;
  const settlers = state.crew.filter((c) => crewIds.includes(c.id) && c.status === 'aboard');
  if (settlers.length < 2) return;
  state.resources.alloys -= outpostCost();
  settlers.forEach((c) => { c.status = 'outpost'; c.station = 'idle'; });
  p.outpost = true;
  state.outposts.push({
    id: state.nextId++,
    systemId: state.loc.systemId,
    planetIndex: state.loc.planetIndex,
    crewIds: settlers.map((c) => c.id),
    population: 2,
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
  const cost = roomCost(type);
  if (state.resources.alloys < cost) return;
  if (state.ship.rooms.some((r) => r.slot === slot)) return;
  state.resources.alloys -= cost;
  const room = { id: state.ship.nextRoomId++, type, slot };
  state.ship.rooms.push(room);
  log(`${def.icon} ${def.label} constructed (−${cost} alloys).`, 'good');
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

function chooseShip(classId, difficulty) {
  newGame(Math.floor(Math.random() * 1e9), classId, difficulty);
  startVoyage(false);
}

function toggleMute() {
  const muted = sfx.toggleMuted();
  ui.banner(muted ? '🔇 SOUND OFF' : '🔊 SOUND ON', true, 1200);
  return muted;
}

function restart() {
  ui.closeModal();
  clearSave();
  boot(true);
}

// ── Actions table handed to the UI ──
const actions = {
  openGalaxy, openSystem, openInterior, selectPlanet, travel, scan, probe,
  expedition, deepExplore, drone, terraform, research, trade, skim, bonusPay,
  buildOutpost, colonize, assign, save, buildRoom, previewShip, chooseShip,
  target: setTarget, flee: attemptFlee, newGame: restart, toggleMute,
};

// Story events from the living galaxy open a choice modal (never mid-battle,
// and never on top of another modal).
initGalaxySim((ev) => {
  if (combat.active || !document.getElementById('modal-root').classList.contains('hidden')) return;
  ui.openEventModal(ev);
});

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
    finished.forEach((m) => {
      const msg = sim.resolveMission(m);
      // Fly the shuttle home and pop the results so the payoff is felt.
      if (state.view === 'system' && m.systemId === state.loc.systemId) {
        scene.shuttleFx(m.planetIndex, true);
      }
      if (combat.active) ui.banner('TEAM RETURNED — SEE LOG', true, 2400);
      else ui.openMissionResult(m.kind, msg);
    });
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
