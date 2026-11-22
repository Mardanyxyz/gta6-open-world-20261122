// Combat: fists, pistol and SMG for the player, and the guards and rivals
// who shoot back. Bullets are fast tracers with a short life; enemies are
// simple state machines — hold position, chase, shoot — with lousy aim at
// range so a fair fight stays winnable.

import { WEAPONS } from './config.js';
import { range, chance, clamp, dist, angleTo, angleDiff } from './random.js';
import { spawnParticles, addWanted, addMessage, playerPos } from './world.js';

export function giveWeapon(world, name) {
  const p = world.player;
  if (!p.weapons.includes(name)) p.weapons.push(name);
  p.weapon = name;
  if (name === 'pistol' && p.ammo.pistol === 0) p.ammo.pistol = WEAPONS.pistol.ammo;
  if (name === 'smg' && p.ammo.smg === 0) p.ammo.smg = WEAPONS.smg.ammo;
}

export function fireWeapon(world) {
  const p = world.player;
  if (p.inCar || p.cooldown > 0 || p.dead) return false;
  const spec = WEAPONS[p.weapon];
  if (p.weapon !== 'fists') {
    if (p.ammo[p.weapon] <= 0) {
      p.cooldown = 0.3;
      return false; // click — empty; R reloads
    }
    p.ammo[p.weapon] -= 1;
  }
  p.cooldown = spec.rate;
  world.stats.shots += 1;
  const spread = p.weapon === 'smg' ? 0.09 : 0.03;
  const angle = p.angle + range(world.rng, -spread, spread);
  const mx = p.x + Math.cos(p.angle) * 20;
  const my = p.y + Math.sin(p.angle) * 20;

  if (p.weapon === 'fists') {
    // A short swing: anything in front and close takes the hit.
    for (const e of world.enemies) {
      if (e.dead) continue;
      const facing = Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, e.x, e.y))) < 0.9;
      if (facing && dist(p.x, p.y, e.x, e.y) < spec.range + 14) damageEnemy(world, e, spec.damage);
    }
    for (const ped of world.peds) {
      if (ped.dead) continue;
      const facing = Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, ped.x, ped.y))) < 0.9;
      if (facing && dist(p.x, p.y, ped.x, ped.y) < spec.range) {
        ped.dead = true;
        world.stats.kills += 1;
        addWanted(world, 1, 'assault');
      }
    }
    spawnParticles(world, mx, my, 3, '#ffffff', 60, 0.15, 2);
    return true;
  }

  world.bullets.push({
    x: mx, y: my, angle, speed: 1050,
    life: spec.range / 1050 + 0.05, from: 'player', damage: spec.damage,
  });
  spawnParticles(world, mx, my, 4, '#ffd76a', 140, 0.18, 3);
  // Gunfire in public draws the law.
  addWanted(world, 1, 'shots fired');
  return true;
}

export function reloadWeapon(world) {
  const p = world.player;
  const spec = WEAPONS[p.weapon];
  if (!spec || p.weapon === 'fists') return;
  const need = spec.ammo - p.ammo[p.weapon];
  if (need <= 0 || p.reserve[p.weapon] <= 0) return;
  const take = Math.min(need, p.reserve[p.weapon]);
  p.ammo[p.weapon] += take;
  p.reserve[p.weapon] -= take;
  p.cooldown = Math.max(p.cooldown, 0.5);
}

export function damageEnemy(world, enemy, dmg) {
  enemy.health -= dmg;
  world.stats.hits += 1;
  spawnParticles(world, enemy.x, enemy.y, 5, '#ff5a4e', 130, 0.4, 3);
  if (enemy.health <= 0 && !enemy.dead) {
    enemy.dead = true;
    world.stats.kills += 1;
    spawnParticles(world, enemy.x, enemy.y, 14, '#ff5a4e', 200, 0.7, 4);
    if (chance(world.rng, 0.5)) {
      world.pickups.push({ x: enemy.x, y: enemy.y, kind: 'cash', amount: 120, bob: 0 });
    }
  }
}

export function damagePlayer(world, dmg) {
  const p = world.player;
  if (p.dead || world.over) return;
  p.health -= dmg;
  p.hurtFlash = 0.35;
  world.shake = Math.max(world.shake, 4);
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    world.over = true;
    world.overKind = 'wasted';
    spawnParticles(world, p.x, p.y, 24, '#ff5a4e', 220, 0.9, 5);
  }
}

/** Spawn a guard / rival gunman at a point. */
export function spawnEnemy(world, x, y, opts) {
  const e = {
    x, y, angle: range(world.rng, 0, Math.PI * 2),
    health: opts?.health ?? 70,
    speed: opts?.speed ?? 130,
    damage: opts?.damage ?? 9,
    shootTimer: range(world.rng, 0.4, 1.2),
    state: opts?.state ?? 'guard', // guard | chase | hold
    dead: false,
    guardX: x, guardY: y,
    role: opts?.role ?? 'guard',
  };
  world.enemies.push(e);
  return e;
}

/** Enemy AI + bullet hits, stepped every frame. */
export function stepCombat(world, dt) {
  const p = world.player;
  const pp = playerPos(world);

  // Player bullets vs enemies, peds and cop cars.
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const b = world.bullets[i];
    if (b.from !== 'player') continue;
    let hit = false;
    for (const e of world.enemies) {
      if (e.dead) continue;
      if (dist(b.x, b.y, e.x, e.y) < 15) {
        damageEnemy(world, e, b.damage);
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const ped of world.peds) {
        if (ped.dead) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 12) {
          ped.dead = true;
          world.stats.kills += 1;
          addWanted(world, 1, 'a bystander was hit');
          hit = true;
          break;
        }
      }
    }
    if (!hit) {
      for (const cop of world.cops) {
        if (cop.dead) continue;
        if (dist(b.x, b.y, cop.x, cop.y) < 26) {
          cop.health -= b.damage;
          if (cop.health <= 0) {
            cop.dead = true;
            spawnParticles(world, cop.x, cop.y, 30, '#ff7a2e', 240, 1, 6);
            addWanted(world, 1, 'a police car was destroyed');
          }
          hit = true;
          break;
        }
      }
    }
    if (hit) world.bullets.splice(i, 1);
  }

  // Heli / enemy bullets vs the player.
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const b = world.bullets[i];
    if (b.from === 'player') continue;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    const r = p.inCar ? 28 : 14;
    if (dist(b.x, b.y, px, py) < r) {
      if (p.inCar) p.inCar.health -= b.damage;
      else damagePlayer(world, b.damage);
      world.bullets.splice(i, 1);
    }
  }

  // Enemy movement and shooting.
  for (const e of world.enemies) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, pp.x, pp.y);
    const seePlayer = d < 520;
    if (e.state === 'guard') {
      if (seePlayer && d < 420) e.state = 'chase';
      // Wander around the post.
      if (chance(world.rng, dt * 0.3)) e.angle += range(world.rng, -1.2, 1.2);
      e.x += Math.cos(e.angle) * 22 * dt;
      e.y += Math.sin(e.angle) * 22 * dt;
    } else if (e.state === 'chase') {
      const want = angleTo(e.x, e.y, pp.x, pp.y);
      e.angle += angleDiff(e.angle, want) * dt * 5;
      if (d > 60) {
        const nx = e.x + Math.cos(e.angle) * e.speed * dt;
        const ny = e.y + Math.sin(e.angle) * e.speed * dt;
        if (!world.city.hitsBuilding(nx, ny, 12)) { e.x = nx; e.y = ny; }
      }
      if (d > 620) e.state = 'guard';
    }
    // Shoot when close enough and roughly facing the player.
    e.shootTimer -= dt;
    if (seePlayer && e.shootTimer <= 0 && d < 460) {
      e.shootTimer = range(world.rng, 0.7, 1.4);
      const a = angleTo(e.x, e.y, pp.x, pp.y) + range(world.rng, -0.22, 0.22);
      world.bullets.push({
        x: e.x + Math.cos(a) * 18, y: e.y + Math.sin(a) * 18,
        angle: a, speed: 780, life: 0.8, from: 'enemy', damage: e.damage,
      });
      spawnParticles(world, e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18, 3, '#ffd76a', 110, 0.15, 2);
    }
  }
  world.enemies = world.enemies.filter((e) => !e.dead || e.health > -100);
}
