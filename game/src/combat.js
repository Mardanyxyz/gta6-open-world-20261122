// Combat: fists, pistol, SMG and shotgun for the player; armed enemies who
// take cover and shoot back; bullets, muzzle flashes, blood and smoke.
import { WEAPONS, PLAYER } from './config.js';
import { clamp, dist } from './random.js';
import { currentWeapon, damagePlayer, showMessage, addWanted } from './world.js';

export function fireWeapon(state, targetX, targetY) {
  const p = state.player;
  const w = currentWeapon(state);
  if (p.shootTimer > 0 || p.reloadTimer > 0) return false;
  if (p.weapon === 'fists') {
    p.shootTimer = w.rate;
    p.punchTimer = 0.3;
    // Punch: hurt the nearest enemy or ped in range, in the facing direction.
    const aim = Math.atan2(targetY - p.y, targetX - p.x);
    let hitAny = false;
    for (const e of state.enemies) {
      if (e.health <= 0) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      const ang = Math.atan2(e.y - p.y, e.x - p.x);
      if (d < PLAYER.punchRange + 14 && Math.abs(ang - aim) < 1.1) {
        hurtEnemy(state, e, w.damage, aim);
        hitAny = true;
      }
    }
    if (!hitAny) {
      for (const car of state.cars) {
        if (dist(p.x, p.y, car.x, car.y) < 60) { car.health -= 4; break; }
      }
    }
    return true;
  }
  if (p.mags[p.weapon] <= 0) {
    reloadWeapon(state);
    return false;
  }
  p.mags[p.weapon] -= 1;
  p.shootTimer = w.rate;
  state.stats.shotsFired += 1;
  const base = Math.atan2(targetY - p.y, targetX - p.x);
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const ang = base + (Math.random() - 0.5) * w.spread * 2;
    state.bullets.push({
      x: p.x + Math.cos(base) * 20, y: p.y + Math.sin(base) * 20,
      vx: Math.cos(ang) * w.speed, vy: Math.sin(ang) * w.speed,
      damage: w.damage, life: w.range / w.speed, friendly: true, kind: 'player',
    });
  }
  state.particles.push({ x: p.x + Math.cos(base) * 24, y: p.y + Math.sin(base) * 24, vx: 0, vy: 0, life: 0.07, max: 0.07, kind: 'flash', size: 18 });
  p.angle = base;
  if (state.wanted < 1) {
    // Firing in public draws the law.
    addWanted(state, 1);
    showMessage(state, 'Gunfire reported — the SBPD is coming');
  }
  return true;
}

export function reloadWeapon(state) {
  const p = state.player;
  const w = currentWeapon(state);
  if (!w.mag || p.weapon === 'fists') return;
  if (p.reloadTimer > 0) return;
  const need = w.mag - p.mags[p.weapon];
  const have = p.weapons[p.weapon] || 0;
  if (need <= 0 || have <= 0) return;
  p.reloadTimer = 0.9;
  p.reloadPending = Math.min(need, have);
}

export function finishReload(state) {
  const p = state.player;
  if (!p.reloadPending) return;
  p.mags[p.weapon] += p.reloadPending;
  p.weapons[p.weapon] -= p.reloadPending;
  p.reloadPending = 0;
}

export function hurtEnemy(state, enemy, damage, angle) {
  enemy.health -= damage;
  enemy.lastHit = 0;
  state.stats.shotsHit += 1;
  state.particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 80, vy: Math.sin(angle) * 80, life: 0.3, max: 0.3, kind: 'blood', size: 8 });
  if (enemy.health <= 0) {
    enemy.dead = true;
    state.kills += 1;
    state.score += 50;
    if (Math.random() < 0.5) {
      state.pickups.push({ kind: 'cash', x: enemy.x, y: enemy.y, amount: 40 + Math.floor(Math.random() * 80), taken: false, bob: 0 });
    }
  }
}

export function spawnEnemy(state, x, y, opts = {}) {
  const e = {
    x, y, angle: Math.random() * Math.PI * 2,
    health: opts.health || 60, speed: opts.speed || 120,
    shootTimer: 1 + Math.random(), burst: 0,
    kind: opts.kind || 'guard', colour: opts.colour || '#7b2d26',
    weapon: opts.weapon || 'pistol', guardX: x, guardY: y,
    dead: false, lastHit: 99,
  };
  state.enemies.push(e);
  return e;
}

export function stepCombat(state, dt) {
  const p = state.player;
  p.shootTimer = Math.max(0, p.shootTimer - dt);
  p.punchTimer = Math.max(0, p.punchTimer - dt);
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) finishReload(state);
  }

  // Bullets fly, hit buildings, cars, enemies and the player.
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    // Building hit.
    const hitWall = state.city.colliders.some((c) => b.x > c.x && b.x < c.x + c.w && b.y > c.y && b.y < c.y + c.h);
    if (hitWall) {
      b.life = 0;
      state.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.2, max: 0.2, kind: 'spark', size: 6 });
      continue;
    }
    if (b.friendly) {
      for (const e of state.enemies) {
        if (e.dead || e.health <= 0) continue;
        if (dist(b.x, b.y, e.x, e.y) < 16) {
          hurtEnemy(state, e, b.damage, Math.atan2(b.vy, b.vx));
          b.life = 0;
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const car of state.cars) {
        if (car.driver === 'player') continue;
        if (Math.abs(b.x - car.x) < 22 && Math.abs(b.y - car.y) < 34) {
          car.health -= b.damage;
          b.life = 0;
          break;
        }
      }
    } else {
      const tx = p.inCar ? p.inCar.x : p.x;
      const ty = p.inCar ? p.inCar.y : p.y;
      if (dist(b.x, b.y, tx, ty) < (p.inCar ? 34 : 15)) {
        if (p.inCar) { p.inCar.health -= b.damage * 0.5; }
        else damagePlayer(state, b.damage);
        b.life = 0;
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);

  // Enemies: hold ground, strafe, and shoot at the player in range.
  for (const e of state.enemies) {
    if (e.dead) continue;
    e.lastHit += dt;
    const d = dist(e.x, e.y, p.x, p.y);
    const want = Math.atan2(p.y - e.y, p.x - e.x);
    e.angle = want;
    if (d < 420 && d > 120) {
      e.x += Math.cos(want) * e.speed * 0.55 * dt;
      e.y += Math.sin(want) * e.speed * 0.55 * dt;
    } else if (d <= 120) {
      e.x -= Math.cos(want) * e.speed * 0.4 * dt;
      e.y -= Math.sin(want) * e.speed * 0.4 * dt;
    }
    const fixed = state.city.collideCircle(e.x, e.y, 12);
    e.x = fixed.x; e.y = fixed.y;
    e.shootTimer -= dt;
    if (d < 460 && e.shootTimer <= 0) {
      e.shootTimer = 0.9 + Math.random() * 0.7;
      const ang = want + (Math.random() - 0.5) * 0.16;
      state.bullets.push({
        x: e.x, y: e.y, vx: Math.cos(ang) * 820, vy: Math.sin(ang) * 820,
        damage: 7, life: 0.6, friendly: false, kind: 'enemy',
      });
      state.particles.push({ x: e.x + Math.cos(ang) * 20, y: e.y + Math.sin(ang) * 20, vx: 0, vy: 0, life: 0.07, max: 0.07, kind: 'flash', size: 14 });
    }
  }
  state.enemies = state.enemies.filter((e) => !e.dead || e.lastHit < 3);

  // Particles age and drift.
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += (pt.vx || 0) * dt;
    pt.y += (pt.vy || 0) * dt;
    if (pt.kind === 'smoke' || pt.kind === 'fire') pt.size += dt * 22;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  void clamp;
  void WEAPONS;
}
