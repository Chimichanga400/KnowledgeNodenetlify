// ── Combat encounters: waves of alien fighters vs the ark ──────
import * as scene from './scene.js';
import {
  state, log, shieldMax, shieldRegen, weaponDamage, pilotBonus,
  damageSystem, damageHull, aboardCrew, atStation,
  awardXp, moraleAll, moraleShift, enemyDamageMult,
} from './state.js';
import { ALIEN_NAMES, pick, makeRng, randInt, clamp } from './data.js';
import * as sfx from './sfx.js';

export const combat = {
  active: false,
  wave: 0,
  totalWaves: 0,
  enemies: [],          // { id, name, hp, hpMax, dps, fireIn }
  targetId: null,
  fireCooldown: 0,
  danger: 1,
  onEnd: null,          // callback(result: 'victory'|'fled'|'defeat')
  onUpdate: null,       // UI refresh callback
  fleeing: false,
};

let nextEnemyId = 1;
let rng = Math.random;

export function startCombat(danger, onEnd, onUpdate) {
  rng = makeRng((state.seed ^ (state.stats.jumps * 7919) ^ Math.floor(state.time)) >>> 0);
  combat.active = true;
  combat.danger = danger;
  combat.wave = 0;
  combat.totalWaves = clamp(1 + Math.floor(danger) + (rng() < 0.4 ? 1 : 0), 1, 4);
  combat.enemies = [];
  combat.targetId = null;
  combat.fireCooldown = 1.2;
  combat.onEnd = onEnd;
  combat.onUpdate = onUpdate;
  combat.fleeing = false;
  state.view = 'combat';
  scene.showCombat();
  sfx.alarm();
  log(`⚠ Hostile contacts! ${combat.totalWaves} attack wave${combat.totalWaves > 1 ? 's' : ''} inbound.`, 'bad');
  spawnWave();
}

function spawnWave() {
  combat.wave++;
  const n = randInt(rng, 2, 3 + Math.min(2, combat.danger));
  for (let i = 0; i < n; i++) {
    const id = nextEnemyId++;
    const hpMax = 18 + combat.danger * 9 + randInt(rng, 0, 10);
    combat.enemies.push({
      id,
      name: pick(rng, ALIEN_NAMES),
      hp: hpMax, hpMax,
      dps: 1.6 + combat.danger * 0.8 + rng(),
      fireIn: 1 + rng() * 2.5,
    });
    scene.addEnemy(id);
  }
  log(`Wave ${combat.wave}/${combat.totalWaves}: ${n} enemy fighters closing in.`, 'warn');
  combat.onUpdate && combat.onUpdate();
}

export function setTarget(id) {
  combat.targetId = id;
  scene.markTarget(id);
  combat.onUpdate && combat.onUpdate();
}

export function attemptFlee() {
  if (combat.fleeing) return;
  const eng = state.systems.engines.hp;
  if (eng < 30) { log('Engines too damaged to jump away!', 'bad'); return; }
  const chance = 0.35 + pilotBonus() * 0.04 + eng / 400;
  combat.fleeing = true;
  if (rng() < chance) {
    log('Emergency jump successful — we broke contact.', 'good');
    endCombat('fled');
  } else {
    log('Jump failed! The enemy presses the attack.', 'bad');
    // A failed escape gives the enemy a free volley.
    combat.enemies.forEach((e) => { e.fireIn = 0.2 + rng() * 0.6; });
    setTimeout(() => { combat.fleeing = false; }, 4000);
  }
}

function enemyShot(e) {
  const from = scene.enemyPosition(e.id);
  const to = scene.shipWorldPos();
  scene.laser(from, to, 0xff5566);
  const dmg = e.dps * (1.4 + rng()) * enemyDamageMult();
  const evade = clamp(pilotBonus() * 0.02, 0, 0.35);
  if (rng() < evade) { log('Evasive maneuver — shot went wide.', 'info'); return; }
  if (state.shield > 0) {
    state.shield = Math.max(0, state.shield - dmg);
    scene.shieldFlash();
    if (state.shield <= 0) log('Shields down!', 'bad');
  } else {
    scene.hullSpark();
    damageHull(dmg * 0.55);
    const sys = pick(rng, ['engines', 'weapons', 'shields', 'life']);
    damageSystem(sys, dmg * 0.9);
    if (rng() < 0.16) {
      const aboard = aboardCrew().filter((c) => c.hp > 0);
      if (aboard.length) {
        const victim = pick(rng, aboard);
        // Fearless crew keep their heads down at the right moments.
        if (!(victim.traits?.includes('fearless') && rng() < 0.5)) {
          victim.hp = Math.max(0, victim.hp - randInt(rng, 15, 35));
          if (victim.hp === 0) {
            victim.status = 'dead';
            log(`☠ ${victim.name} was killed in the attack.`, 'bad');
            moraleAll(-10);
          } else {
            log(`${victim.name} was injured in the blast (${victim.hp}%).`, 'warn');
            moraleShift(victim, -8);
          }
        }
      }
    }
  }
}

function playerShot() {
  const dmg = weaponDamage();
  if (dmg <= 2 || state.systems.weapons.hp <= 5) return;
  let target = combat.enemies.find((e) => e.id === combat.targetId);
  if (!target) target = combat.enemies[0];
  if (!target) return;
  const to = scene.enemyPosition(target.id);
  scene.laser(scene.shipWorldPos().add(to.clone().sub(scene.shipWorldPos()).normalize().multiplyScalar(4)), to, 0x37e5ff);
  target.hp -= dmg * (0.7 + rng() * 0.6);
  if (target.hp <= 0) {
    scene.removeEnemy(target.id);
    combat.enemies = combat.enemies.filter((e) => e !== target);
    state.stats.kills++;
    atStation('gunnery').forEach((c) => awardXp(c, 6));
    log(`${target.name} destroyed.`, 'good');
    if (combat.targetId === target.id) combat.targetId = null;
    if (combat.enemies.length === 0) {
      if (combat.wave >= combat.totalWaves) { victory(); return; }
      setTimeout(() => { if (combat.active && combat.enemies.length === 0) spawnWave(); }, 1800);
    }
  }
  combat.onUpdate && combat.onUpdate();
}

function victory() {
  const alloys = randInt(rng, 8, 16) + combat.danger * 6;
  const fuel = randInt(rng, 2, 8);
  const credits = randInt(rng, 8, 18) + combat.danger * 6;
  state.resources.alloys += alloys;
  state.resources.fuel += fuel;
  state.credits += credits;
  moraleAll(5);
  log(`Hostiles eliminated. Salvaged ${alloys} alloys, ${fuel} fuel and ${credits} credits' worth of bounty tags.`, 'good');
  endCombat('victory');
}

function endCombat(result) {
  combat.active = false;
  combat.enemies = [];
  const cb = combat.onEnd;
  combat.onEnd = null;
  cb && cb(result);
}

// Called every frame while combat is active.
export function updateCombat(dt) {
  if (!combat.active) return;
  // Shield recharge
  state.shield = Math.min(shieldMax(), state.shield + shieldRegen() * dt);
  // Enemy fire
  combat.enemies.forEach((e) => {
    e.fireIn -= dt;
    if (e.fireIn <= 0) {
      e.fireIn = 1.6 + rng() * 2.2;
      enemyShot(e);
      combat.onUpdate && combat.onUpdate();
    }
  });
  // Our guns
  combat.fireCooldown -= dt;
  if (combat.fireCooldown <= 0 && combat.enemies.length) {
    const gunners = atStation('gunnery').length;
    combat.fireCooldown = clamp(1.5 - gunners * 0.25, 0.5, 1.5);
    playerShot();
  }
  // Defeat check
  if (state.hull <= 0) {
    log('The hull has been breached beyond recovery…', 'bad');
    endCombat('defeat');
  }
}
