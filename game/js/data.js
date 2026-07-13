// ── Static data, constants & helpers ─────────────────────────────

export const DAY_SECONDS = 30;            // one mission day = 30 real seconds
export const FOOD_PER_CREW_DAY = 1;
export const COLONY_HAB_MIN = 85;         // habitability needed to win
export const OUTPOST_HAB_MIN = 40;
export const OUTPOST_COST = 60;           // alloys
export const COLONY_COST = 120;           // alloys
export const COLONY_CREW_MIN = 6;

export const ROLES = ['Pilot', 'Engineer', 'Soldier', 'Scientist', 'Botanist', 'Medic'];
export const ROLE_ICON = {
  Pilot: '🧭', Engineer: '🔧', Soldier: '🎯', Scientist: '🔬', Botanist: '🌱', Medic: '⚕️',
};

// Ship stations a crew member can be assigned to. `bonusRole` works better there.
export const STATIONS = {
  idle:      { label: 'Off duty',        bonusRole: null },
  helm:      { label: 'Helm',            bonusRole: 'Pilot' },
  gunnery:   { label: 'Gunnery',         bonusRole: 'Soldier' },
  'repair:engines': { label: 'Repair · Engines',      bonusRole: 'Engineer' },
  'repair:weapons': { label: 'Repair · Weapons',      bonusRole: 'Engineer' },
  'repair:shields': { label: 'Repair · Shields',      bonusRole: 'Engineer' },
  'repair:life':    { label: 'Repair · Life Support', bonusRole: 'Engineer' },
  medbay:    { label: 'Medbay',          bonusRole: 'Medic' },
  hydro:     { label: 'Hydroponics',     bonusRole: 'Botanist' },
};

export const SYSTEMS_DEF = {
  engines: { label: 'Engines',      icon: '🚀' },
  weapons: { label: 'Weapons',      icon: '🎯' },
  shields: { label: 'Shields',      icon: '🛡️' },
  life:    { label: 'Life Support', icon: '💨' },
};

export const PLANET_TYPES = {
  barren:  { label: 'Barren Rock',  color: 0x8a7f70, habMax: 20, res: { alloys: 3, fuel: 0, food: 0 } },
  ice:     { label: 'Ice World',    color: 0xbfe3ef, habMax: 45, res: { alloys: 1, fuel: 1, food: 1 } },
  toxic:   { label: 'Toxic World',  color: 0x9acc45, habMax: 15, res: { alloys: 2, fuel: 2, food: 0 } },
  desert:  { label: 'Desert World', color: 0xd9a45a, habMax: 60, res: { alloys: 2, fuel: 0, food: 1 } },
  gas:     { label: 'Gas Giant',    color: 0xc98de0, habMax: 0,  res: { alloys: 0, fuel: 4, food: 0 } },
  ocean:   { label: 'Ocean World',  color: 0x3b7fd4, habMax: 80, res: { alloys: 0, fuel: 0, food: 3 } },
  terran:  { label: 'Terran World', color: 0x4caf6d, habMax: 100, res: { alloys: 1, fuel: 0, food: 3 } },
};

// ── Seeded RNG (mulberry32) ──
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

// ── Name generation ──
const STAR_A = ['Kel', 'Vor', 'Ash', 'Nex', 'Tau', 'Ory', 'Zeph', 'Cal', 'Dra', 'Eri', 'Hel', 'Ith', 'Lyr', 'Mor', 'Pra', 'Sol', 'Umb', 'Ver'];
const STAR_B = ['an', 'or', 'eth', 'ia', 'us', 'ar', 'en', 'ax', 'il', 'on', 'ys', 'ea'];
const STAR_C = ['Prime', 'Minor', 'Major', 'Reach', 'Verge', 'Deep', 'Gate', 'Drift'];
export function starName(rng) {
  let n = pick(rng, STAR_A) + pick(rng, STAR_B);
  if (rng() < 0.35) n += ' ' + pick(rng, STAR_C);
  return n;
}

const FIRST = ['Sara', 'Liam', 'Vetra', 'Cora', 'Drack', 'Peebee', 'Jaal', 'Suvi', 'Kallo', 'Gil', 'Lexi', 'Harry', 'Nora', 'Tann', 'Addison', 'Kesh', 'Vorn', 'Sloane', 'Reyes', 'Keema', 'Evfra', 'Moshae', 'Avela', 'Bain', 'Zia', 'Ryota', 'Ines', 'Ansel', 'Talin', 'Mira'];
const LAST = ['Ryder', 'Kosta', 'Nyx', 'Harper', 'Voss', 'Kandros', 'Anwar', 'Jath', 'Brodie', "T'Perro", 'Carlyle', 'Tiran', 'Nakmor', 'Kelly', 'Vidal', 'Dohrgun', 'de Aldani', 'Massani', 'Sjefa', 'Rensk', 'Okonkwo', 'Ilyin', 'Duarte', 'Sova'];
export function crewName(rng, used) {
  for (let i = 0; i < 50; i++) {
    const n = pick(rng, FIRST) + ' ' + pick(rng, LAST);
    if (!used.has(n)) { used.add(n); return n; }
  }
  return 'Crew-' + Math.floor(rng() * 999);
}

const GREEK = ['b', 'c', 'd', 'e', 'f', 'g'];
export const planetName = (star, idx) => `${star} ${GREEK[idx] || 'x'}`;

export const ALIEN_NAMES = ['Kett Raider', 'Kett Stinger', 'Scourge Wraith', 'Void Corsair', 'Kett Marauder', 'Hive Drone'];

export const fmt = (n) => Math.floor(n).toLocaleString();
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
