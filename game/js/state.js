// ── Game state: creation, galaxy generation, derived stats, save/load ──
import {
  makeRng, pick, randInt, starName, crewName, planetName,
  ROLES, PLANET_TYPES, DAY_SECONDS, clamp, SHIP_CLASSES,
  TRAITS, TECHS, ROOM_TYPES, OUTPOST_COST, ATMOSPHERES, WEATHERS, LIFEFORMS,
  DIFFICULTIES,
} from './data.js';

export const SAVE_KEY = 'arkhorizon-save-v3';

export let state = null;

const listeners = [];
export function onLog(fn) { listeners.push(fn); }
export function log(msg, cls = 'info') {
  state.log.push({ day: currentDay(), msg, cls });
  if (state.log.length > 120) state.log.shift();
  listeners.forEach((fn) => fn(msg, cls));
}

export const currentDay = () => 1 + Math.floor(state.time / DAY_SECONDS);

// ── Galaxy generation ────────────────────────────────────────────
function genPlanet(rng, star, idx, danger) {
  // Distant, dangerous systems are more likely to hold highly habitable worlds.
  const roll = rng() + danger * 0.09;
  let type;
  if (roll < 0.28) type = 'barren';
  else if (roll < 0.42) type = 'ice';
  else if (roll < 0.54) type = 'toxic';
  else if (roll < 0.68) type = 'desert';
  else if (roll < 0.82) type = 'gas';
  else if (roll < 0.93) type = 'ocean';
  else type = 'terran';

  const def = PLANET_TYPES[type];
  const hab = type === 'gas' ? 0 : Math.round(def.habMax * (0.35 + rng() * 0.65));
  // Surface attributes revealed progressively: orbital scan → probe → landing.
  const tempBase = { barren: -40, ice: -110, toxic: 60, desert: 45, gas: -150, ocean: 8, terran: 12 }[type];
  return {
    name: planetName(star, idx),
    type,
    size: 0.7 + rng() * 1.4,
    habitability: hab,
    hazard: clamp(randInt(rng, 0, 2) + (type === 'toxic' ? 1 : 0), 0, 3),
    resources: {
      alloys: def.res.alloys * randInt(rng, 6, 14),
      fuel: def.res.fuel * randInt(rng, 6, 14),
      food: def.res.food * randInt(rng, 6, 14),
    },
    gravity: +(0.25 + rng() * 1.9).toFixed(2),
    tempC: Math.round(tempBase + (rng() - 0.5) * 30),
    atmosphere: type === 'gas' ? ATMOSPHERES[5] : type === 'toxic' ? ATMOSPHERES[2]
      : hab > 60 ? ATMOSPHERES[4] : pick(rng, ATMOSPHERES.slice(0, 4)),
    water: type === 'ocean' ? randInt(rng, 70, 96) : type === 'ice' ? randInt(rng, 30, 60)
      : type === 'terran' ? randInt(rng, 30, 70) : randInt(rng, 0, 12),
    radiation: clamp(randInt(rng, 0, 3) - (hab > 50 ? 1 : 0), 0, 3),
    weather: pick(rng, WEATHERS),
    life: hab >= 70 ? LIFEFORMS[3] : hab >= 45 ? LIFEFORMS[2] : hab >= 20 ? LIFEFORMS[1] : LIFEFORMS[0],
    ruins: rng() < 0.14,
    signal: rng() < 0.1,
    wonder: null,               // set for a few special planets at galaxy gen
    scanStage: 0,               // 0 unknown · 1 orbital scan · 2 probe · 3 landed
    deepDone: false,
    expeditions: 0,
    outpost: false,
    terraformed: false,
    seed: Math.floor(rng() * 1e9),
  };
}

function genGalaxy(rng) {
  const systems = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    // Spiral-ish spread: start system near origin, others fan outward.
    const t = i / N * Math.PI * 3.2 + rng() * 0.9;
    const r = i === 0 ? 0 : 14 + i * 6.5 + rng() * 8;
    const name = i === 0 ? 'Heleus Anchor' : starName(rng);
    const danger = i === 0 ? 0 : clamp(Math.round(r / 30), 0, 3);
    const sys = {
      id: i,
      name,
      x: Math.cos(t) * r,
      y: (rng() - 0.5) * 10,
      z: Math.sin(t) * r,
      danger,
      starColor: pick(rng, [0xffd27a, 0xffb36b, 0xaad4ff, 0xfff3c9, 0xff9a8a]),
      visited: i === 0,
      cleared: false,
      planets: [],
    };
    const nPlanets = randInt(rng, 1, 4);
    for (let p = 0; p < nPlanets; p++) sys.planets.push(genPlanet(rng, name, p, danger));
    systems.push(sys);
  }
  // Guarantee 2 golden worlds in the outer half of the galaxy.
  const countGolden = () =>
    systems.reduce((n, s) => n + s.planets.filter((p) => p.habitability >= 85).length, 0);
  const outer = systems.slice(Math.floor(N / 2));
  for (let tries = 0; countGolden() < 2 && tries < 30; tries++) {
    const s = pick(rng, outer);
    const p = pick(rng, s.planets);
    if (p.habitability >= 85) continue;
    p.type = pick(rng, ['terran', 'ocean']);
    p.habitability = randInt(rng, 86, 97);
    p.hazard = randInt(rng, 0, 1);
    p.resources.food = randInt(rng, 20, 40);
    p.scanStage = 0;
  }
  // Place two galactic wonders on distant planets — major codex discoveries.
  const wonders = ['Derelict Generation Ship', 'Ancient Megastructure Fragment'];
  const candidates = systems.slice(4).flatMap((s) => s.planets).filter((p) => !p.wonder);
  wonders.forEach((w) => {
    if (!candidates.length) return;
    const p = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
    p.wonder = w;
    p.signal = true;
  });
  // Start system: benign, with a gas giant so the player learns fuel skimming.
  const home = systems[0];
  home.planets.forEach((p) => { p.hazard = Math.min(p.hazard, 1); });
  if (!home.planets.some((p) => p.type === 'gas')) {
    home.planets.push(genPlanet(rng, home.name, home.planets.length, 0));
    const g = home.planets[home.planets.length - 1];
    g.type = 'gas'; g.habitability = 0; g.resources.fuel = 80;
    g.name = planetName(home.name, home.planets.length - 1);
  }
  return systems;
}

export function rollTraits(rng) {
  const keys = Object.keys(TRAITS);
  const n = rng() < 0.4 ? 2 : 1;
  const out = [];
  while (out.length < n) {
    const t = pick(rng, keys);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export function makeCrewMember(rng, used, role, id) {
  return {
    id,
    name: crewName(rng, used),
    role,
    skill: randInt(rng, 2, 4),
    hp: 100,
    age: randInt(rng, 22, 58),
    traits: rollTraits(rng),
    xp: 0,
    morale: randInt(rng, 62, 80),
    status: 'aboard',     // aboard | mission | outpost | dead
    station: 'idle',
  };
}

function genCrew(rng) {
  const used = new Set();
  // Guaranteed coverage of every role, plus two extra hands.
  const roles = [...ROLES, 'Engineer', 'Soldier'];
  return roles.map((role, i) => makeCrewMember(rng, used, role, i + 1));
}

// ── New game / save / load ───────────────────────────────────────
export function newGame(seed = Math.floor(Math.random() * 1e9), classId = 'horizon', difficulty = 'captain') {
  const rng = makeRng(seed);
  const cls = SHIP_CLASSES[classId] || SHIP_CLASSES.horizon;
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.captain;
  state = {
    seed,
    time: 0,
    difficulty: DIFFICULTIES[difficulty] ? difficulty : 'captain',
    view: 'system',
    ship: {
      classId,
      rooms: cls.startRooms.map((type, i) => ({ id: i + 1, type, slot: i })),
      nextRoomId: cls.startRooms.length + 1,
    },
    resources: Object.fromEntries(Object.entries(cls.start).map(([k, v]) => [k, Math.round(v * diff.resMult)])),
    credits: Math.round(40 * diff.resMult),
    science: 0,
    tech: { researched: [] },
    market: { fuel: 1, alloys: 1, food: 1 },   // price multipliers, drift daily
    quests: [],
    codex: [],
    chain: null,        // pending consequence of a recent galaxy event
    hull: cls.hull, hullMax: cls.hull,
    shield: 0,
    systems: { engines: { hp: 100 }, weapons: { hp: 100 }, shields: { hp: 100 }, life: { hp: 100 } },
    crew: genCrew(rng),
    galaxy: { systems: genGalaxy(rng) },
    loc: { systemId: 0, planetIndex: 0 },
    missions: [],
    outposts: [],
    nextId: 100,
    stats: { kills: 0, jumps: 0, expeditions: 0 },
    flags: { won: false, lost: false, introSeen: false },
    log: [],
  };
  state.shield = shieldMax();
  return state;
}

export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.galaxy || !s.ship || !s.tech || s.flags.won || s.flags.lost) return null;
    state = s;
    return state;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

// ── Derived stats ────────────────────────────────────────────────
export const aliveCrew = () => state.crew.filter((c) => c.status !== 'dead');
export const aboardCrew = () => state.crew.filter((c) => c.status === 'aboard');
export const atStation = (st) => aboardCrew().filter((c) => c.station === st);

function stationPower(stationKey, bonusRole) {
  // Skill (doubled on specialty), scaled by health, morale and traits.
  return atStation(stationKey).reduce((sum, c) => {
    let v = c.skill * (c.role === bonusRole ? 2 : 1) * (c.hp > 40 ? 1 : 0.5);
    v *= 0.75 + (c.morale ?? 70) / 400;                     // 0.75×–1.0×
    if (c.traits?.includes('tinkerer') && stationKey.startsWith('repair:')) v *= 1.25;
    return sum + v;
  }, 0);
}

// ── Tech, XP & morale helpers ──
export const hasTech = (id) => state.tech.researched.includes(id);
export const diffMods = () => DIFFICULTIES[state.difficulty] || DIFFICULTIES.captain;

export function awardXp(c, amount) {
  if (!c || c.status === 'dead') return;
  c.xp = (c.xp || 0) + amount * (c.traits?.includes('fastLearner') ? 2 : 1);
  const need = c.skill * 40;
  if (c.xp >= need && c.skill < 5) {
    c.xp -= need;
    c.skill++;
    log(`🎖 ${c.name} has grown to skill ${c.skill}.`, 'good');
  }
}

// Shift one crew member's morale (traits modulate the impact).
export function moraleShift(c, delta) {
  if (!c || c.status === 'dead') return;
  if (delta < 0 && c.traits?.includes('coward')) delta *= 2;
  c.morale = clamp((c.morale ?? 70) + delta, c.traits?.includes('ironWill') ? 30 : 0, 100);
}
export function moraleAll(delta) { aliveCrew().forEach((c) => moraleShift(c, delta)); }
export const avgMorale = () => {
  const a = aliveCrew();
  return a.length ? Math.round(a.reduce((s, c) => s + (c.morale ?? 70), 0) / a.length) : 0;
};

export const roomCost = (type) => Math.round(ROOM_TYPES[type].cost * (hasTech('autoForges') ? 0.7 : 1));
export const outpostCost = () => Math.round(OUTPOST_COST * (hasTech('autoForges') ? 0.7 : 1));

// ── Ship class & rooms ──
export const shipClass = () => SHIP_CLASSES[state.ship.classId] || SHIP_CLASSES.horizon;
export const roomsOf = (type) => state.ship.rooms.filter((r) => r.type === type);
// Maximum crew a station can hold, gated by built rooms.
export function stationCap(st) {
  if (st === 'idle' || st.startsWith('repair:')) return 99;
  if (st === 'helm') return 2;
  const roomType = { gunnery: 'gunnery', medbay: 'medbay', hydro: 'hydro', lab: 'lab' }[st];
  return roomType ? roomsOf(roomType).length * 2 : 0;
}
export const crewCapacity = () => shipClass().crewCap + roomsOf('quarters').length * 2;
export const yieldMult = () => 1 + shipClass().yieldBonus + roomsOf('cargo').length * 0.1;

export const shieldMax = () =>
  Math.max(10, Math.round(30 + state.systems.shields.hp * 0.5 + shipClass().shieldBonus
    + roomsOf('shieldcap').length * 12 + (hasTech('shieldHarmonics') ? 15 : 0)));
export const shieldRegen = () => (state.systems.shields.hp / 100) * 1.2; // per second, combat
export const weaponDamage = () => {
  const gunnery = stationPower('gunnery', 'Soldier');
  let mult = shipClass().weaponMult;
  if (hasTech('focusedLances')) mult *= 1.15;
  if (hasTech('targetingAI')) mult *= 1.2;
  if (hasTech('novaBattery')) mult *= 1.25;
  return (6 + gunnery * 1.6) * (0.25 + 0.75 * state.systems.weapons.hp / 100) * mult;
};
export const enemyDamageMult = () => (hasTech('pointDefense') ? 0.85 : 1);
export const pilotBonus = () => stationPower('helm', 'Pilot'); // 0..~16
export const repairRate = (sysKey) =>
  stationPower('repair:' + sysKey, 'Engineer') * 1.1 * (1 + roomsOf('engineering').length * 0.25)
  * (hasTech('repairDrones') ? 1.3 : 1); // hp/s
export const medbayRate = () => stationPower('medbay', 'Medic') * 1.4 * (hasTech('medNanites') ? 1.5 : 1);
export const hydroRate = () => stationPower('hydro', 'Botanist') * 0.35; // food/day-ish
export const labRate = () => stationPower('lab', 'Scientist');           // science generation & scan bonus

export const currentSystem = () => state.galaxy.systems[state.loc.systemId];
export const currentPlanet = () => {
  const s = currentSystem();
  return state.loc.planetIndex != null ? s.planets[state.loc.planetIndex] : null;
};

export function damageSystem(key, amount) {
  const s = state.systems[key];
  s.hp = clamp(s.hp - amount, 0, 100);
}
export function damageHull(amount) {
  state.hull = clamp(state.hull - amount, 0, state.hullMax);
}
export const distanceTo = (sys) => {
  const cur = currentSystem();
  return Math.hypot(sys.x - cur.x, sys.y - cur.y, sys.z - cur.z);
};
// A pilot at the helm trims jump fuel by up to 15%.
export const fuelCost = (sys) =>
  Math.max(4, Math.round(distanceTo(sys) * 0.32 * shipClass().fuelMult
    * (hasTech('warpOpt') ? 0.75 : 1)
    * (1 - Math.min(0.15, pilotBonus() * 0.012))));

// ── Codex & science ──
export function addCodex(icon, title, text) {
  if (state.codex.some((e) => e.title === title)) return false;
  state.codex.push({ day: currentDay(), icon, title, text });
  log(`📖 Codex updated: ${title}`, 'good');
  return true;
}
export function addScience(n, why) {
  state.science += n;
  if (why) log(`🔬 +${n} science — ${why}.`, 'info');
}
// Trading is possible at the home anchor, or wherever a colony has grown into a market.
export const canTradeHere = () => {
  const sys = currentSystem();
  if (sys.id === 0) return true;
  return state.outposts.some((o) => o.systemId === sys.id && (o.population ?? 0) >= 14);
};
