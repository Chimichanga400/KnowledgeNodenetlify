// ── Background simulation: runs once per second ─────────────────
import {
  state, log, aliveCrew, aboardCrew, repairRate, medbayRate, hydroRate,
  shieldMax, roomsOf, yieldMult, crewCapacity,
} from './state.js';
import { DAY_SECONDS, FOOD_PER_CREW_DAY, randInt, makeRng, pick, clamp } from './data.js';

let lastDay = 1;
let starving = false;

export function resetSim() {
  lastDay = 1 + Math.floor(state.time / DAY_SECONDS);
  starving = false;
}

// Returns a list of finished missions for the game layer to resolve.
export function tick(inCombat) {
  state.time += 1;
  const day = 1 + Math.floor(state.time / DAY_SECONDS);
  const rng = makeRng((state.seed ^ Math.floor(state.time)) >>> 0);

  // ── Repairs ──
  for (const key of ['engines', 'weapons', 'shields', 'life']) {
    const rate = repairRate(key);
    if (rate > 0 && state.systems[key].hp < 100) {
      const cost = 0.05 * rate; // alloys trickle
      if (state.resources.alloys >= cost) {
        state.resources.alloys -= cost;
        state.systems[key].hp = clamp(state.systems[key].hp + rate, 0, 100);
      }
    }
  }
  // Hull patching: engineers in any repair bay slowly patch hull when their system is full
  const idleEng = ['engines', 'weapons', 'shields', 'life']
    .filter((k) => state.systems[k].hp >= 100)
    .reduce((sum, k) => sum + repairRate(k), 0);
  if (idleEng > 0 && state.hull < state.hullMax && state.resources.alloys >= 0.1) {
    state.resources.alloys -= 0.1;
    state.hull = clamp(state.hull + idleEng * 0.4, 0, state.hullMax);
  }
  // Shield trickle outside combat
  if (!inCombat) state.shield = Math.min(shieldMax(), state.shield + 2);

  // ── Medbay ──
  const heal = medbayRate();
  if (heal > 0) {
    const hurt = aboardCrew().filter((c) => c.hp < 100 && c.station !== 'medbay');
    hurt.slice(0, 3).forEach((c) => { c.hp = clamp(c.hp + heal, 0, 100); });
  }
  // Natural slow recovery (crew quarters speed it up for off-duty crew)
  if (state.time % 5 === 0) {
    const quartersBonus = roomsOf('quarters').length * 0.6;
    aboardCrew().forEach((c) => {
      if (c.hp < 100) c.hp = clamp(c.hp + 0.5 + (c.station === 'idle' ? quartersBonus : 0), 0, 100);
    });
  }

  // ── Life support ──
  const life = state.systems.life.hp;
  if (life < 40 && state.time % 3 === 0) {
    aboardCrew().forEach((c) => { c.hp = clamp(c.hp - (40 - life) * 0.05, 0, 100); });
    if (state.time % 15 === 0) log('Life support failing — the crew is suffocating!', 'bad');
  }

  // ── Hydroponics ──
  state.resources.food += hydroRate() / DAY_SECONDS * 1.6;

  // ── Daily upkeep ──
  if (day !== lastDay) {
    lastDay = day;
    const eaters = aliveCrew().filter((c) => c.status === 'aboard' || c.status === 'mission').length;
    const need = eaters * FOOD_PER_CREW_DAY;
    if (state.resources.food >= need) {
      state.resources.food -= need;
      if (starving) { starving = false; log('Food reserves restored. The crew eats again.', 'good'); }
    } else {
      state.resources.food = 0;
      if (!starving) { starving = true; log('⚠ Food stores empty — the crew is starving!', 'bad'); }
      aboardCrew().forEach((c) => {
        c.hp = clamp(c.hp - randInt(rng, 6, 14), 0, 100);
        if (c.hp === 0) { c.status = 'dead'; log(`☠ ${c.name} died of starvation.`, 'bad'); }
      });
    }
    // Outpost production
    state.outposts.forEach((o) => {
      const sys = state.galaxy.systems[o.systemId];
      const p = sys.planets[o.planetIndex];
      const staff = state.crew.filter((c) => o.crewIds.includes(c.id) && c.status === 'outpost');
      const mult = 0.5 + staff.reduce((s, c) => s + c.skill * (c.role === 'Botanist' || c.role === 'Engineer' ? 0.35 : 0.18), 0);
      const food = Math.round((2 + p.resources.food * 0.06) * mult);
      const alloys = Math.round((1 + p.resources.alloys * 0.05) * mult);
      const fuel = Math.round(p.resources.fuel * 0.04 * mult);
      state.resources.food += food;
      state.resources.alloys += alloys;
      state.resources.fuel += fuel;
      o.lastYield = { food, alloys, fuel };
    });
    if (state.outposts.length && day % 3 === 0) {
      log(`Outposts delivered supplies (day ${day}).`, 'good');
    }
  }

  // ── Missions ──
  const finished = state.missions.filter((m) => state.time >= m.endsAt);
  state.missions = state.missions.filter((m) => state.time < m.endsAt);
  return finished;
}

// Resolve an away-mission that just finished. Returns a summary string.
export function resolveMission(m) {
  const rng = makeRng((state.seed ^ m.id * 2654435761) >>> 0);
  const sys = state.galaxy.systems[m.systemId];
  const p = sys.planets[m.planetIndex];
  const team = state.crew.filter((c) => m.crewIds.includes(c.id) && c.status === 'mission');
  const skill = team.reduce((s, c) => s + c.skill * (c.role === 'Scientist' || c.role === 'Soldier' ? 1.5 : 1), 0);

  const mult = yieldMult();
  const gain = {
    alloys: Math.round(p.resources.alloys * (0.12 + rng() * 0.1) * (1 + skill * 0.06) * mult),
    fuel: Math.round(p.resources.fuel * (0.12 + rng() * 0.1) * (1 + skill * 0.06) * mult),
    food: Math.round(p.resources.food * (0.12 + rng() * 0.1) * (1 + skill * 0.06) * mult),
  };
  // Deplete the site a little
  p.resources.alloys = Math.max(0, p.resources.alloys - Math.ceil(gain.alloys / 2));
  p.resources.fuel = Math.max(0, p.resources.fuel - Math.ceil(gain.fuel / 2));
  p.resources.food = Math.max(0, p.resources.food - Math.ceil(gain.food / 2));
  state.resources.alloys += gain.alloys;
  state.resources.fuel += gain.fuel;
  state.resources.food += gain.food;
  p.expeditions++;
  state.stats.expeditions++;

  // Hazard rolls
  let injuries = 0, deaths = 0;
  team.forEach((c) => {
    const risk = p.hazard * 0.13 - skill * 0.004;
    if (rng() < risk) {
      const dmg = randInt(rng, 25, 70);
      c.hp = clamp(c.hp - dmg, 0, 100);
      if (c.hp === 0) { c.status = 'dead'; deaths++; }
      else injuries++;
    }
  });
  team.forEach((c) => { if (c.status === 'mission') { c.status = 'aboard'; c.station = 'idle'; } });

  // Occasional stranded survivor joins the crew (if there's a bunk free)
  let recruit = null;
  const shipPop = aliveCrew().filter((c) => c.status !== 'outpost').length;
  if (rng() < 0.14 && p.habitability > 20 && shipPop < crewCapacity()) {
    const used = new Set(state.crew.map((c) => c.name));
    recruit = {
      id: state.nextId++,
      name: pick(rng, ['Rix', 'Tallo', 'Vess', 'Anahi', 'Odai', 'Kiva']) + ' ' + pick(rng, ['Var', 'Denn', 'Solaris', 'Quen', 'Marek']),
      role: pick(rng, ['Soldier', 'Scientist', 'Engineer', 'Botanist']),
      skill: randInt(rng, 2, 4),
      hp: randInt(rng, 60, 100),
      status: 'aboard',
      station: 'idle',
    };
    while (used.has(recruit.name)) recruit.name += ' Jr.';
    state.crew.push(recruit);
  }

  const parts = [];
  if (gain.alloys) parts.push(`${gain.alloys} alloys`);
  if (gain.fuel) parts.push(`${gain.fuel} fuel`);
  if (gain.food) parts.push(`${gain.food} food`);
  let msg = `Expedition to ${p.name} returned` + (parts.length ? ` with ${parts.join(', ')}.` : ' empty-handed.');
  if (injuries) msg += ` ${injuries} crew injured.`;
  if (deaths) msg += ` ${deaths} crew KIA.`;
  if (recruit) msg += ` Survivor ${recruit.name} (${recruit.role}) joined the crew!`;
  log(msg, deaths ? 'bad' : injuries ? 'warn' : 'good');
  return msg;
}
