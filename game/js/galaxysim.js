// ── Living galaxy simulation ─────────────────────────────────────
//
// Runs once per game day (from sim.js). The galaxy evolves whether or not
// the player acts: pirates raid systems, colonies grow into towns and open
// markets, prices drift with supply shocks, distress calls appear and
// expire, and events chain into consequences (a raid disrupts shipping,
// which starves a colony, which posts an emergency mission).
//
// Story events (openEventModal via the handler main.js registers) present
// FTL-style choices whose effects feed back into the same simulation.
import {
  state, log, aliveCrew, aboardCrew, crewCapacity, currentDay,
  makeCrewMember, moraleAll, addScience, addCodex, hasTech, awardXp,
} from './state.js';
import { makeRng, pick, randInt, clamp, colonyStage } from './data.js';

let onStoryEvent = null;   // set by main.js → opens the choice modal
export function initGalaxySim(handler) { onStoryEvent = handler; }

const visitedSystems = () => state.galaxy.systems.filter((s) => s.visited);
const randomSystem = (rng, excludeHome = true) => {
  const pool = state.galaxy.systems.filter((s) => (!excludeHome || s.id !== 0));
  return pick(rng, pool);
};
// Any lucky crew aboard nudges random outcomes in the player's favour.
export const luckBonus = () => (aboardCrew().some((c) => c.traits?.includes('lucky')) ? 0.15 : 0);

// ── Quests ──
export function addQuest(q) {
  q.id = state.nextId++;
  state.quests.push(q);
  log(`📌 New objective: ${q.text} (${q.expiresDay - currentDay()} days)`, 'warn');
}

export function completeQuest(q, silent = false) {
  state.quests = state.quests.filter((x) => x.id !== q.id);
  const r = q.reward || {};
  if (r.credits) state.credits += r.credits;
  if (r.science) state.science += r.science;
  if (r.alloys) state.resources.alloys += r.alloys;
  moraleAll(4);
  aboardCrew().forEach((c) => awardXp(c, 8));
  if (!silent) {
    const parts = [];
    if (r.credits) parts.push(`${r.credits} credits`);
    if (r.science) parts.push(`${r.science} science`);
    if (r.alloys) parts.push(`${r.alloys} alloys`);
    log(`✅ Objective complete: ${q.text}${parts.length ? ` — earned ${parts.join(', ')}` : ''}.`, 'good');
  }
}

// Called by main.js when the ship arrives in a system.
// Returns a hunt quest if pirates must be fought here, else null.
export function questsOnArrival() {
  const here = state.loc.systemId;
  let hunt = null;
  for (const q of [...state.quests]) {
    if (q.systemId !== here) continue;
    if (q.type === 'rescue') completeQuest(q);
    else if (q.type === 'deliver') {
      if (state.resources.food >= q.amount) {
        state.resources.food -= q.amount;
        completeQuest(q);
      } else {
        log(`They need ${q.amount} food — we don't have enough aboard.`, 'warn');
      }
    } else if (q.type === 'hunt' && !hunt) hunt = q;
  }
  return hunt;
}

// ── Daily tick ──
export function galaxyDayTick(day) {
  const rng = makeRng((state.seed ^ (day * 48271)) >>> 0);

  // 1. Market drift: prices relax toward 1.0 with a little noise.
  for (const k of ['fuel', 'alloys', 'food']) {
    state.market[k] = clamp(state.market[k] + (1 - state.market[k]) * 0.08 + (rng() - 0.5) * 0.05, 0.5, 2.6);
  }

  // 2. Colonies grow — and mature into trading markets.
  state.outposts.forEach((o) => {
    const before = colonyStage(o.population ?? 0);
    o.population = (o.population ?? 0) + (0.4 + 0.15 * o.crewIds.length) * (hasTech('colonyCharters') ? 2 : 1);
    const after = colonyStage(o.population);
    if (after.label !== before.label) {
      const p = state.galaxy.systems[o.systemId].planets[o.planetIndex];
      log(`🏙 ${p.name} has grown into a ${after.label} (pop. ${Math.round(o.population * 100)}).`, 'good');
      if (after.label === 'Settlement') log(`${p.name} has opened a trade market — dock there to buy and sell.`, 'good');
    }
    // Colonies post their own missions.
    if (rng() < 0.1 && !state.quests.some((q) => q.origin === o.id)) {
      const p = state.galaxy.systems[o.systemId].planets[o.planetIndex];
      if (rng() < 0.6) {
        addQuest({
          type: 'deliver', origin: o.id, systemId: o.systemId, amount: randInt(rng, 12, 25),
          text: `${p.name} colony requests a food shipment`, expiresDay: day + 7,
          reward: { credits: randInt(rng, 25, 45) },
        });
      } else {
        state.galaxy.systems[o.systemId].cleared = false;
        addQuest({
          type: 'hunt', origin: o.id, systemId: o.systemId,
          text: `Raiders are harassing the ${p.name} colony — drive them off`, expiresDay: day + 8,
          reward: { credits: randInt(rng, 35, 60), science: 3 },
        });
      }
    }
  });

  // 3. Expire stale quests.
  for (const q of [...state.quests]) {
    if (day >= q.expiresDay) {
      state.quests = state.quests.filter((x) => x.id !== q.id);
      log(`⌛ Objective expired: ${q.text}.`, 'bad');
      moraleAll(-4);
    }
  }

  // 4. Consequence chains from earlier shocks.
  if (state.chain) {
    const c = state.chain;
    if (c.type === 'raid' && day >= c.day + 1) {
      state.market.fuel = clamp(state.market.fuel + 0.25, 0.5, 2.6);
      log('Shipping lanes are disrupted after the raid — fuel prices are climbing.', 'warn');
      state.chain = { type: 'shipping', day };
    } else if (c.type === 'shipping' && day >= c.day + 2) {
      state.chain = null;
      if (state.outposts.length && rng() < 0.7) {
        const o = pick(rng, state.outposts);
        const p = state.galaxy.systems[o.systemId].planets[o.planetIndex];
        addQuest({
          type: 'deliver', systemId: o.systemId, amount: randInt(rng, 15, 28),
          text: `Supply convoys never arrived — ${p.name} colony is going hungry`, expiresDay: day + 6,
          reward: { credits: randInt(rng, 40, 65) },
        });
      } else {
        state.market.food = clamp(state.market.food + 0.3, 0.5, 2.6);
        log('Food grows scarce across the sector.', 'warn');
      }
    }
  }

  // 5. One galaxy event per day, sometimes.
  const roll = rng();
  if (roll < 0.14) {
    // Pirate raid: a system becomes more dangerous, alloy prices spike.
    const sys = randomSystem(rng);
    sys.danger = clamp(sys.danger + 1, 0, 3);
    sys.cleared = false;
    state.market.alloys = clamp(state.market.alloys + 0.2, 0.5, 2.6);
    log(`☠ Pirates have raided ${sys.name} — the region grows more dangerous and alloy prices spike.`, 'bad');
    state.chain = { type: 'raid', day };
    if (rng() < 0.5) {
      addQuest({
        type: 'hunt', systemId: sys.id, text: `Bounty posted: clear the raiders in ${sys.name}`,
        expiresDay: day + 9, reward: { credits: randInt(rng, 40, 70) },
      });
    }
  } else if (roll < 0.25) {
    // Distress signal.
    const sys = randomSystem(rng);
    addQuest({
      type: 'rescue', systemId: sys.id, text: `Distress signal from ${sys.name} — reach it in time`,
      expiresDay: day + 5, reward: { credits: randInt(rng, 20, 40), science: randInt(rng, 2, 5) },
    });
  } else if (roll < 0.33) {
    // Scientific breakthrough elsewhere in the sector.
    addScience(randInt(rng, 3, 7), 'sector research network shared a breakthrough');
    if (rng() < 0.5) state.market.alloys = clamp(state.market.alloys - 0.2, 0.5, 2.6);
  } else if (roll < 0.4) {
    // Abandoned station discovered.
    const sys = randomSystem(rng);
    addQuest({
      type: 'rescue', systemId: sys.id, text: `Abandoned station detected near ${sys.name} — salvage it`,
      expiresDay: day + 8, reward: { alloys: randInt(rng, 15, 30), credits: randInt(rng, 10, 25) },
    });
  } else if (roll < 0.46) {
    // Food shortage sweeping the sector.
    state.market.food = clamp(state.market.food + 0.35, 0.5, 2.6);
    log('Blight reports from the outer colonies — food prices are rising sector-wide.', 'warn');
  }

  // 6. Occasionally, a story event with a real choice.
  if (onStoryEvent && rng() < 0.22 && day > 1) {
    const ev = rollStoryEvent(rng);
    if (ev) onStoryEvent(ev);
  }
}

// ── Story events (FTL-style choices) ─────────────────────────────
function rollStoryEvent(rng) {
  const luck = luckBonus();
  const pool = [];

  pool.push({
    title: 'Drifting Cargo Pod',
    text: 'Sensors flag a sealed cargo pod tumbling through the void. Its transponder is dead, but the casing looks intact.',
    choices: [
      {
        label: 'Bring it aboard and crack it open',
        hint: 'Could be salvage. Could be a trap.',
        apply: () => {
          if (rng() < 0.62 + luck) {
            const a = randInt(rng, 10, 22), f = randInt(rng, 5, 15);
            state.resources.alloys += a; state.resources.food += f;
            log(`The pod held supplies: +${a} alloys, +${f} food.`, 'good');
          } else {
            state.hull = Math.max(1, state.hull - 8);
            log('Booby-trapped! The blast scorches the cargo bay (−8 hull).', 'bad');
          }
        },
      },
      {
        label: 'Sell its location to a salvage guild',
        hint: '+15 credits, no risk',
        apply: () => { state.credits += 15; log('The guild transfers 15 credits for the coordinates.', 'good'); },
      },
      { label: 'Ignore it', hint: 'Keep moving', apply: () => log('The pod tumbles on into the dark.', 'info') },
    ],
  });

  pool.push({
    title: 'Stowaway Discovered',
    text: 'A gaunt figure is found hiding behind the water reclaimers — a refugee who slipped aboard at the last stop.',
    choices: [
      {
        label: 'Welcome them to the crew',
        hint: aliveCrew().filter((c) => c.status !== 'outpost').length < crewCapacity() ? '+1 crew, −10 food' : 'No bunks free!',
        apply: () => {
          if (aliveCrew().filter((c) => c.status !== 'outpost').length >= crewCapacity()) {
            log('There are no bunks free — they get rations and a corner of the cargo bay.', 'warn');
            state.resources.food = Math.max(0, state.resources.food - 10);
            return;
          }
          const used = new Set(state.crew.map((c) => c.name));
          const nc = makeCrewMember(makeRng(state.seed ^ state.nextId), used, pick(rng, ['Engineer', 'Botanist', 'Scientist']), state.nextId++);
          state.crew.push(nc);
          state.resources.food = Math.max(0, state.resources.food - 10);
          moraleAll(3);
          log(`${nc.name} (${nc.role}) joins the crew, grateful for a second chance.`, 'good');
        },
      },
      {
        label: 'Put them off at the next colony',
        hint: '+10 credits from their savings, small morale cost',
        apply: () => { state.credits += 10; moraleAll(-3); log('The stowaway is set down at the next port, pressing their savings into your hand.', 'info'); },
      },
    ],
  });

  pool.push({
    title: 'Pirate Toll Beacon',
    text: 'A crackling broadcast: "This lane belongs to the Void Corsairs. Pay passage, or we\'ll take it from your wreck."',
    choices: [
      {
        label: 'Pay the toll',
        hint: '−20 credits',
        apply: () => {
          state.credits = Math.max(0, state.credits - 20);
          log('You pay the corsairs. The beacon falls silent.', 'info');
        },
      },
      {
        label: 'Refuse and run dark',
        hint: 'They WILL come for you on the next jump',
        apply: () => { state.forceAmbush = true; moraleAll(2); log('The crew grins. Let them come.', 'warn'); },
      },
      hasTech('targetingAI') ? {
        label: 'Transmit your targeting solution as a reply',
        hint: 'Targeting AI: intimidate them for free',
        apply: () => { moraleAll(4); log('A long silence… then the beacon self-destructs. Word will spread.', 'good'); },
      } : null,
    ].filter(Boolean),
  });

  pool.push({
    title: 'Impossible Signal',
    text: 'The lab reports a signal that arrives before it is sent — a clean violation of causality, repeating every 47 seconds.',
    choices: [
      {
        label: 'Divert power and study it',
        hint: '−5 fuel, good science',
        apply: () => {
          state.resources.fuel = Math.max(0, state.resources.fuel - 5);
          addScience(randInt(rng, 6, 10), 'causality-violating signal analysis');
          if (rng() < 0.15 + luck) {
            state.credits += 30;
            addCodex('🌀', 'The Echo Signal', 'A repeating transmission that precedes its own origin. Your recordings sold to three different research guilds.');
          }
        },
      },
      { label: 'Log it and move on', hint: '+2 science', apply: () => addScience(2, 'anomaly logged') },
    ],
  });

  pool.push({
    title: 'Comet Skimming Run',
    text: 'A volatile-rich comet crosses your path, venting a glittering tail. The helm reckons a close pass could scoop propellant.',
    choices: [
      {
        label: 'Thread the tail',
        hint: '+18 fuel, risk of engine scarring',
        apply: () => {
          state.resources.fuel += 18;
          if (rng() < 0.28 - luck) {
            state.systems.engines.hp = Math.max(0, state.systems.engines.hp - 16);
            log('Scooped 18 fuel — but ice shrapnel chewed the engine cowling (−16 engines).', 'warn');
          } else log('A flawless pass: +18 fuel and one hell of a view.', 'good');
        },
      },
      { label: 'Give it a wide berth', hint: 'No risk', apply: () => log('The comet blazes past in silence.', 'info') },
    ],
  });

  if (avgBelow(50)) {
    pool.push({
      title: 'Grumbling Below Decks',
      text: 'Morale is fraying. Someone has scrawled HOW MUCH LONGER? on the mess hall bulkhead.',
      choices: [
        {
          label: 'Break out the good rations',
          hint: '−15 food, morale up',
          apply: () => { state.resources.food = Math.max(0, state.resources.food - 15); moraleAll(10); log('A proper meal works wonders. Spirits lift.', 'good'); },
        },
        {
          label: 'Address the crew honestly',
          hint: 'A pilot\'s steady voice helps',
          apply: () => { moraleAll(5); log('You speak plainly about the road ahead. It helps, a little.', 'info'); },
        },
      ],
    });
  }

  // Requirement-gated dilemmas: preparation opens better options.
  pool.push({
    title: 'Class-X Solar Flare',
    text: 'An unexpected stellar eruption is heading directly for the ship. The shields can absorb it — if the generators can take the strain.',
    choices: [
      {
        label: 'Route emergency power to shields',
        hint: '−10 fuel, no damage',
        requirement: () => state.resources.fuel >= 10,
        reqHint: 'Needs 10 fuel in reserve',
        apply: () => {
          state.resources.fuel -= 10;
          log('The shields flare white and hold. Fuel reserves take the hit instead of the hull.', 'good');
        },
      },
      {
        label: 'Brace for impact',
        hint: 'Risk serious hull damage',
        apply: () => {
          const dmg = randInt(rng, 10, 24);
          state.hull = Math.max(1, state.hull - dmg);
          state.systems[pick(rng, ['shields', 'life'])].hp = Math.max(0,
            state.systems.shields.hp - randInt(rng, 5, 15));
          log(`The flare tears across the hull plating — ${dmg} hull damage and scorched systems.`, 'bad');
        },
      },
      {
        label: 'Fly a sensor probe into the flare',
        hint: '+12 science, minor hull scarring',
        requirement: () => aboardCrew().some((c) => c.role === 'Scientist' && c.hp > 30),
        reqHint: 'Needs a healthy Scientist aboard',
        apply: () => {
          addScience(12, 'in-situ stellar flare telemetry');
          state.hull = Math.max(1, state.hull - 8);
          moraleAll(3);
          log('Riding the shockwave, your scientist maps the eruption from inside. Textbooks will cite this day.', 'good');
        },
      },
    ],
  });

  pool.push({
    title: 'Derelict Cryo-Pod',
    text: 'A tumbling escape pod, decades old. One cryo-bed still shows faint life signs — barely.',
    choices: [
      {
        label: 'Attempt revival',
        hint: 'A medic could save them — new crew if it works',
        requirement: () => aboardCrew().some((c) => c.role === 'Medic' && c.hp > 30),
        reqHint: 'Needs a healthy Medic aboard',
        apply: () => {
          if (aliveCrew().filter((c) => c.status !== 'outpost').length >= crewCapacity()) {
            state.credits += 20;
            log('Revived — but with no bunks free, they ask to be dropped at the next port, leaving a reward.', 'info');
            return;
          }
          const used = new Set(state.crew.map((c) => c.name));
          const nc = makeCrewMember(makeRng(state.seed ^ state.nextId), used,
            pick(rng, ['Pilot', 'Soldier', 'Scientist', 'Medic']), state.nextId++);
          nc.morale = 55;
          state.crew.push(nc);
          moraleAll(5);
          log(`${nc.name} (${nc.role}) wakes from a ${randInt(rng, 20, 60)}-year sleep and joins the crew.`, 'good');
        },
      },
      {
        label: 'Salvage the pod\'s systems',
        hint: '+12 alloys — the sleeper won\'t survive extraction',
        apply: () => {
          state.resources.alloys += 12;
          moraleAll(-5);
          log('The pod is stripped for parts. Nobody meets each other\'s eyes in the cargo bay.', 'bad');
        },
      },
      { label: 'Leave it sealed', hint: 'Let them sleep', apply: () => log('The pod drifts on, its passenger still dreaming.', 'info') },
    ],
  });

  pool.push({
    title: 'Unstable Ice Asteroid',
    text: 'A fractured asteroid of water ice and frozen volatiles, groaning with internal pressure. A skilled hand could crack it safely.',
    choices: [
      {
        label: 'Controlled demolition mining',
        hint: '+15 fuel, +10 food (ice & organics)',
        requirement: () => aboardCrew().some((c) => c.role === 'Engineer' && c.hp > 30),
        reqHint: 'Needs a healthy Engineer aboard',
        apply: () => {
          state.resources.fuel += 15;
          state.resources.food += 10;
          log('Textbook demolition — the asteroid splits along clean fracture lines. Tanks and pantry both topped up.', 'good');
        },
      },
      {
        label: 'Crack it with the main guns',
        hint: 'Crude: some yield, chance of shrapnel',
        apply: () => {
          state.resources.fuel += 7;
          if (rng() < 0.4 - luck) {
            state.hull = Math.max(1, state.hull - 7);
            log('The asteroid shatters violently — ice shrapnel rakes the hull (−7).', 'warn');
          } else log('The asteroid bursts. Skimmers recover a modest 7 fuel.', 'info');
        },
      },
      { label: 'Not worth the risk', hint: 'Pass by', apply: () => log('The groaning berg tumbles past.', 'info') },
    ],
  });

  pool.push({
    title: 'Refugee Convoy',
    text: 'Three battered shuttles hail you, low on air and hope, fleeing a raided colony.',
    choices: [
      {
        label: 'Share supplies',
        hint: '−12 food, morale up',
        apply: () => { state.resources.food = Math.max(0, state.resources.food - 12); moraleAll(6); log('You give what you can spare. The convoy limps on, broadcasting thanks.', 'good'); },
      },
      {
        label: 'Trade them fuel for salvage',
        hint: '−6 fuel, +14 alloys',
        apply: () => { state.resources.fuel = Math.max(0, state.resources.fuel - 6); state.resources.alloys += 14; log('A fair trade, all things considered.', 'info'); },
      },
      { label: 'Turn them away', hint: 'Morale cost', apply: () => { moraleAll(-6); log('The shuttles fall away behind you. Nobody speaks for a while.', 'bad'); } },
    ],
  });

  return pick(rng, pool);
}

function avgBelow(n) {
  const a = aliveCrew();
  return a.length && a.reduce((s, c) => s + (c.morale ?? 70), 0) / a.length < n;
}
