// ── Game state: creation, galaxy generation, derived stats, save/load ──
import {
  makeRng, pick, randInt, starName, crewName, planetName,
  ROLES, PLANET_TYPES, DAY_SECONDS, clamp,
} from './data.js';

export const SAVE_KEY = 'arkhorizon-save-v1';

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
    scanned: false,
    expeditions: 0,
    outpost: false,
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
    p.scanned = false;
  }
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

function genCrew(rng) {
  const used = new Set();
  const roster = [];
  // Guaranteed coverage of every role, plus two extra hands.
  const roles = [...ROLES, 'Engineer', 'Soldier'];
  roles.forEach((role, i) => {
    roster.push({
      id: i + 1,
      name: crewName(rng, used),
      role,
      skill: randInt(rng, 2, 4),
      hp: 100,
      status: 'aboard',     // aboard | mission | outpost | dead
      station: 'idle',
    });
  });
  return roster;
}

// ── New game / save / load ───────────────────────────────────────
export function newGame(seed = Math.floor(Math.random() * 1e9)) {
  const rng = makeRng(seed);
  state = {
    seed,
    time: 0,
    view: 'system',
    resources: { fuel: 90, alloys: 70, food: 110 },
    hull: 100, hullMax: 100,
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
    if (!s || !s.galaxy || s.flags.won || s.flags.lost) return null;
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
  // Each crewman contributes skill, doubled when their role matches the station.
  return atStation(stationKey).reduce(
    (sum, c) => sum + c.skill * (c.role === bonusRole ? 2 : 1) * (c.hp > 40 ? 1 : 0.5), 0);
}

export const shieldMax = () => Math.round(30 + state.systems.shields.hp * 0.5);
export const shieldRegen = () => (state.systems.shields.hp / 100) * 1.2; // per second, combat
export const weaponDamage = () => {
  const gunnery = stationPower('gunnery', 'Soldier');
  return (6 + gunnery * 1.6) * (0.25 + 0.75 * state.systems.weapons.hp / 100);
};
export const pilotBonus = () => stationPower('helm', 'Pilot'); // 0..~16
export const repairRate = (sysKey) => stationPower('repair:' + sysKey, 'Engineer') * 1.1; // hp/s
export const medbayRate = () => stationPower('medbay', 'Medic') * 1.4;
export const hydroRate = () => stationPower('hydro', 'Botanist') * 0.35; // food/day-ish

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
export const fuelCost = (sys) => Math.max(4, Math.round(distanceTo(sys) * 0.32));
