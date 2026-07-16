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
  lab:       { label: 'Laboratory',      bonusRole: 'Scientist' },
};

export const SYSTEMS_DEF = {
  engines: { label: 'Engines',      icon: '🚀' },
  weapons: { label: 'Weapons',      icon: '🎯' },
  shields: { label: 'Shields',      icon: '🛡️' },
  life:    { label: 'Life Support', icon: '💨' },
};

// ── Crew traits: each gives one honest mechanical hook ──
export const TRAITS = {
  fearless:   { label: 'Fearless',      icon: '🦁', desc: 'Half as likely to be hurt in combat' },
  lucky:      { label: 'Lucky',         icon: '🍀', desc: 'Better outcomes from events & expeditions' },
  fastLearner:{ label: 'Fast Learner',  icon: '📚', desc: 'Gains experience twice as fast' },
  greedy:     { label: 'Greedy',        icon: '🪙', desc: '+15% personal expedition yield' },
  coward:     { label: 'Coward',        icon: '😨', desc: 'Loses twice as much morale from setbacks' },
  ironWill:   { label: 'Iron Will',     icon: '🗿', desc: 'Morale never drops below 30' },
  survivalist:{ label: 'Survivalist',   icon: '🏕️', desc: 'Half injury chance on expeditions' },
  tinkerer:   { label: 'Tinkerer',      icon: '⚙️', desc: '+25% effectiveness in repair bays' },
};

// ── Research tree: 4 branches, linear prerequisites ──
export const TECHS = {
  deepSensors:    { branch: 'Exploration',  name: 'Deep-Range Sensors',   cost: 15, icon: '📡', desc: 'Orbital scans also reveal probe-level data' },
  freeProbes:     { branch: 'Exploration',  name: 'Probe Miniaturization', cost: 25, icon: '🛰️', desc: 'Probes cost no alloys', requires: 'deepSensors' },
  xenoArch:       { branch: 'Exploration',  name: 'Xeno-Archaeology',     cost: 40, icon: '🏺', desc: 'Deep explorations yield +50% science', requires: 'freeProbes' },
  warpOpt:        { branch: 'Exploration',  name: 'Warp Optimization',    cost: 55, icon: '🌀', desc: 'Jump fuel cost −25%', requires: 'xenoArch' },
  repairDrones:   { branch: 'Engineering',  name: 'Repair Drones',        cost: 15, icon: '🤖', desc: 'Repair speed +30%' },
  reinforcedHull: { branch: 'Engineering',  name: 'Reinforced Hull',      cost: 25, icon: '🧱', desc: '+25 max hull, applied immediately', requires: 'repairDrones' },
  shieldHarmonics:{ branch: 'Engineering',  name: 'Shield Harmonics',     cost: 40, icon: '🛡️', desc: '+15 max shields', requires: 'reinforcedHull' },
  autoForges:     { branch: 'Engineering',  name: 'Auto-Forges',          cost: 55, icon: '🏭', desc: 'Rooms & outposts cost −30% alloys', requires: 'shieldHarmonics' },
  focusedLances:  { branch: 'Weapons',      name: 'Focused Lances',       cost: 15, icon: '🔆', desc: 'Weapon damage +15%' },
  pointDefense:   { branch: 'Weapons',      name: 'Point-Defense Grid',   cost: 25, icon: '🕸️', desc: 'Enemy shots deal −15% damage', requires: 'focusedLances' },
  targetingAI:    { branch: 'Weapons',      name: 'Targeting AI',         cost: 40, icon: '🎯', desc: 'Weapon damage +20%', requires: 'pointDefense' },
  novaBattery:    { branch: 'Weapons',      name: 'Nova Battery',         cost: 55, icon: '💥', desc: 'Weapon damage +25%', requires: 'targetingAI' },
  hydroDomes:     { branch: 'Colonization', name: 'Hydroponic Domes',     cost: 15, icon: '🌾', desc: 'Colony food output +50%' },
  colonyCharters: { branch: 'Colonization', name: 'Colony Charters',      cost: 25, icon: '📜', desc: 'Colonies grow twice as fast', requires: 'hydroDomes' },
  medNanites:     { branch: 'Colonization', name: 'Medical Nanites',      cost: 40, icon: '💉', desc: 'Medbay +50%, expedition injuries halved', requires: 'colonyCharters' },
  terraforming:   { branch: 'Colonization', name: 'Terraforming',         cost: 60, icon: '🌍', desc: 'Unlock: raise a planet’s habitability by +25 (once per planet, 100 alloys)', requires: 'medNanites' },
  ramjet:         { branch: 'Logistics',    name: 'Bussard Ramjet',       cost: 30, icon: '🌬️', desc: '+3 fuel scooped on every jump' },
  nutrientSynth:  { branch: 'Logistics',    name: 'Nutrient Synthesizers', cost: 40, icon: '🥫', desc: 'Crew food consumption −20%', requires: 'ramjet' },
  naniteWeave:    { branch: 'Logistics',    name: 'Nanite Hull-Weave',    cost: 55, icon: '🕷️', desc: 'Auto-repairs 2 hull per day for 1 alloy', requires: 'nutrientSynth' },
};

// ── Living-economy base prices (credits per unit) ──
export const PRICE_BASE = { fuel: 3, alloys: 4, food: 2 };

// ── Colony growth stages (population thresholds) ──
export const COLONY_STAGES = [
  { pop: 0,  label: 'Landing Site', mult: 0.6 },
  { pop: 6,  label: 'Outpost',      mult: 1.0 },
  { pop: 14, label: 'Settlement',   mult: 1.5 },
  { pop: 28, label: 'Town',         mult: 2.2 },
  { pop: 55, label: 'City',         mult: 3.2 },
];
export const colonyStage = (pop) => {
  let s = COLONY_STAGES[0];
  for (const st of COLONY_STAGES) if (pop >= st.pop) s = st;
  return s;
};

// ── Planet surface attributes (revealed in scan stages) ──
export const ATMOSPHERES = ['None', 'Trace', 'Toxic haze', 'CO₂-heavy', 'Nitrogen-oxygen', 'Dense hydrogen'];
export const WEATHERS = ['Dead calm', 'Dust storms', 'Acid rain', 'Electrical storms', 'Blizzards', 'Hurricane belts', 'Gentle rains'];
export const LIFEFORMS = ['None detected', 'Microbial', 'Hardy flora', 'Complex fauna'];

// ── Rooms (interior deck plan) ──
export const ROOM_TYPES = {
  bridge:      { label: 'Bridge',           icon: '🧭', color: 0x37e5ff, fixed: true, station: 'helm' },
  engine:      { label: 'Engine Room',      icon: '🚀', color: 0xffb84d, fixed: true, station: 'repair:engines' },
  gunnery:     { label: 'Gun Turret',       icon: '🎯', color: 0xff5566, cost: 40, station: 'gunnery', desc: '+2 gunner slots' },
  medbay:      { label: 'Medbay',           icon: '⚕️', color: 0x5dff9d, cost: 30, station: 'medbay', desc: '+2 medic slots' },
  hydro:       { label: 'Hydroponics',      icon: '🌱', color: 0x8dd96b, cost: 30, station: 'hydro', desc: '+2 farming slots' },
  quarters:    { label: 'Crew Quarters',    icon: '🛏️', color: 0xb28dff, cost: 25, desc: '+2 crew capacity · off-duty crew heal faster' },
  engineering: { label: 'Engineering Bay',  icon: '🔧', color: 0xffd86b, cost: 35, desc: '+25% repair speed' },
  shieldcap:   { label: 'Shield Capacitor', icon: '🛡️', color: 0x6bd5ff, cost: 35, desc: '+12 max shields' },
  cargo:       { label: 'Cargo Pod',        icon: '📦', color: 0xc9a25d, cost: 30, desc: '+10% expedition yield' },
  lab:         { label: 'Laboratory',       icon: '🔬', color: 0x9f7dff, cost: 35, station: 'lab', desc: '+2 scientist slots · staffed labs generate science daily and boost scans' },
};

// ── Selectable ship classes ──
// grid: interior room slots (cols × rows). startRooms are placed into the first slots.
export const SHIP_CLASSES = {
  horizon: {
    name: 'ACS Horizon', kind: 'Colony Ark',
    desc: 'The classic ring-habitat ark. Balanced in every respect — a true generation ship.',
    hull: 100, shieldBonus: 0, weaponMult: 1.0, fuelMult: 1.0, yieldBonus: 0, crewCap: 10,
    cols: 4, rows: 2,
    startRooms: ['gunnery', 'medbay', 'hydro'],
    start: { fuel: 90, alloys: 70, food: 110 },
  },
  nighthawk: {
    name: 'ACS Nighthawk', kind: 'Stealth Corvette',
    desc: 'A matte-black strike corvette. Deadly guns, strong shields and cheap jumps — but thin hull and little room to expand.',
    hull: 80, shieldBonus: 15, weaponMult: 1.3, fuelMult: 0.7, yieldBonus: 0, crewCap: 8,
    cols: 2, rows: 2,
    startRooms: ['gunnery', 'gunnery'],
    start: { fuel: 110, alloys: 55, food: 90 },
  },
  atlas: {
    name: 'ACS Atlas', kind: 'Industrial Hauler',
    desc: 'A kilometre of cargo frames and engine pods. Massive hull and rich expedition hauls, but sluggish, thirsty and lightly armed.',
    hull: 135, shieldBonus: -8, weaponMult: 0.8, fuelMult: 1.35, yieldBonus: 0.25, crewCap: 14,
    cols: 6, rows: 2,
    startRooms: ['cargo', 'medbay', 'hydro'],
    start: { fuel: 100, alloys: 100, food: 140 },
  },
  vanguard: {
    name: 'ACS Vanguard', kind: 'Assault Cruiser',
    desc: 'A broad wedge of military plating with twin turret pods. Built to fight its way through hostile space.',
    hull: 110, shieldBonus: 8, weaponMult: 1.1, fuelMult: 1.1, yieldBonus: 0, crewCap: 10,
    cols: 3, rows: 3,
    startRooms: ['gunnery', 'gunnery', 'medbay'],
    start: { fuel: 85, alloys: 75, food: 105 },
  },
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
