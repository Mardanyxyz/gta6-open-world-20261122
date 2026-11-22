// The Solara Bay Police Department: wanted response, pursuits, roadblocks,
// the helicopter, and getting busted.
// Wanted 1–2: patrol cars chase and ram. Wanted 3: roadblocks ahead of you.
// Wanted 4–5: a helicopter circles overhead with a spotlight and takes
// shots. Get caught on foot at low speed, or with a wrecked car, and it is
// over.

import { WORLD, WANTED } from './config.js';
import { range, chance, clamp, dist, angleDiff, angleTo } from './random.js';
import { makeCar, spawnParticles, addMessage, playerPos } from './world.js';

export function wantedCopCount(wanted) {
  return Math.min(WANTED.MAX_COPS ?? 8, wanted * WANTED.copsPerStar);
}

export function stepPolice(world, dt) {
  const rng = world.rng;
  const pp = playerPos(world);
  const wanted = world.wanted;

  // Spawn / despawn pursuit cars to match the wanted level.
  const want = wanted === 0 ? 0 : wantedCopCount(wanted);
  const cap = world.copCap ?? want;
  const target = Math.min(want, cap);
  const alive = world.cops.filter((c) => !c.dead);
  if (alive.length < target) {
    const car = makeCar('police', 0, 0, 0, '#1c2733', 'police', rng);
    // Drop in a few blocks away, on a road, heading toward the player.
    let x = 0;
    let y = 0;
    let tries = 0;
    do {
      const p = world.city.randomRoadPoint(rng);
      x = p.x;
      y = p.y;
      tries += 1;
    } while (dist(x, y, pp.x, pp.y) < 900 && tries < 12);
    car.x = x;
    car.y = y;
    car.angle = angleTo(x, y, pp.x, pp.y);
    car.speed = 200;
    world.cars.push(car);
    world.cops.push(car);
  }
  if (wanted === 0) {
    for (const cop of world.cops) {
      if (cop.dead) continue;
      // Give up and pull over as a parked car — never as a traffic car,
      // because a pursuit car has no route and traffic cars need one.
      cop.driver = 'parked';
      cop.speed = 0;
    }
    world.cops = [];
    // Do not litter the city with parked cruisers.
    const parkedCops = world.cars.filter((c) => c.driver === 'parked' && c.type === 'police');
    for (let i = 0; i < parkedCops.length - 4; i += 1) {
      world.cars.splice(world.cars.indexOf(parkedCops[i]), 1);
    }
    world.roadblocks = [];
    world.heli = null;
  }
  world.cops = world.cops.filter((c) => !c.dead);

  // Pursuit: each cop aims for its own slot around the player, so the pack
  // surrounds the car instead of piling onto one point and hiding it.
  for (let ci = 0; ci < world.cops.length; ci += 1) {
    const cop = world.cops[ci];
    if (cop.dead) continue;
    cop.siren += dt;
    const slot = (ci / Math.max(1, world.cops.length)) * Math.PI * 2 + world.time * 0.25;
    const tx = pp.x + Math.cos(slot) * 74;
    const ty = pp.y + Math.sin(slot) * 74;
    const targetAngle = angleTo(cop.x, cop.y, tx, ty);
    const d = dist(cop.x, cop.y, pp.x, pp.y);
    const diff = angleDiff(cop.angle, targetAngle);
    const steer = clamp(diff * 2.2, -1, 1);
    let throttle = 1;
    if (d < 90) throttle = 0.25;
    // Ram the player's car; on foot, slow down to make the bust.
    if (!world.player.inCar && d < 120) throttle = 0.3;
    cop.speed += cop.accel * dt * throttle;
    cop.speed -= cop.speed * 0.3 * dt;
    cop.speed = clamp(cop.speed, -100, cop.maxSpeed);
    cop.angle += steer * 2.4 * clamp(Math.abs(cop.speed) / 260, 0, 1) * dt * (cop.speed >= 0 ? 1 : -1);
    const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
    const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
    if (!world.city.hitsBuilding(nx, ny, 26)) {
      cop.x = nx;
      cop.y = ny;
    } else {
      cop.speed *= -0.2;
      cop.angle += 0.6;
    }
    if (cop.x > WORLD.waterX - 30) cop.x = WORLD.waterX - 30;
    if (cop.health < 40) cop.smoke += dt;
    // Ram damage to the player's car.
    if (world.player.inCar && dist(cop.x, cop.y, world.player.inCar.x, world.player.inCar.y) < 40) {
      const pc = world.player.inCar;
      if (Math.abs(cop.speed - pc.speed) > 150) {
        pc.health -= 4;
        pc.speed *= 0.7;
        spawnParticles(world, pc.x, pc.y, 5, '#ffd76a', 130, 0.35, 3);
        world.shake = 6;
      }
    }
  }

  // Cops keep their distance from each other — no pile-ups.
  for (let i = 0; i < world.cops.length; i += 1) {
    for (let j = i + 1; j < world.cops.length; j += 1) {
      const a = world.cops[i];
      const b = world.cops[j];
      if (a.dead || b.dead) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < 58 && d > 0.01) {
        const push = (58 - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }

  // Roadblocks at wanted 3+: parked cop cars across the road ahead of you.
  // (Staged screenshot scenes set world.noRoadblocks to keep the chase clean.)
  if (wanted >= WANTED.roadblockAt && !world.noRoadblocks) {
    if (world.roadblocks.length === 0 && chance(rng, dt * 0.5)) {
      const heading = world.player.inCar ? world.player.inCar.angle : world.player.angle;
      const bx = pp.x + Math.cos(heading) * 620;
      const by = pp.y + Math.sin(heading) * 620;
      const block = [];
      for (let i = -1; i <= 1; i += 1) {
        const car = makeCar(
          'police',
          bx - Math.sin(heading) * i * 46, by + Math.cos(heading) * i * 46,
          heading + Math.PI / 2, '#1c2733', 'roadblock', rng,
        );
        car.speed = 0;
        world.cars.push(car);
        block.push(car);
      }
      world.roadblocks.push({ cars: block, x: bx, y: by, t: 0 });
      addMessage(world, 'ROADBLOCK AHEAD — find another way!', '#ff5a4e');
    }
  }
  for (const rb of world.roadblocks) {
    rb.t += dt;
    if (rb.t > 45 || dist(rb.x, rb.y, pp.x, pp.y) > 1800) {
      for (const car of rb.cars) car.dead = true;
    }
  }
  world.roadblocks = world.roadblocks.filter((rb) => rb.t <= 45 && dist(rb.x, rb.y, pp.x, pp.y) <= 1800);

  // Helicopter at wanted 4+.
  if (wanted >= WANTED.heliAt) {
    if (!world.heli) {
      world.heli = { x: pp.x - 300, y: pp.y - 300, angle: 0, t: 0, shootTimer: 2 };
      addMessage(world, 'POLICE HELICOPTER overhead!', '#ff5a4e');
    }
    const h = world.heli;
    h.t += dt;
    const orbit = h.t * 0.55;
    const tx = pp.x + Math.cos(orbit) * 260;
    const ty = pp.y + Math.sin(orbit) * 260;
    h.x += (tx - h.x) * dt * 1.4;
    h.y += (ty - h.y) * dt * 1.4;
    h.angle = angleTo(h.x, h.y, pp.x, pp.y);
    h.shootTimer -= dt;
    if (h.shootTimer <= 0) {
      h.shootTimer = range(rng, 1.6, 2.6);
      // Inaccurate fire: a burst near the player.
      for (let i = 0; i < 3; i += 1) {
        const a = h.angle + range(rng, -0.25, 0.25);
        world.bullets.push({ x: h.x, y: h.y, angle: a, speed: 900, life: 1.1, from: 'heli', damage: 8 });
      }
      spawnParticles(world, h.x, h.y, 4, '#ffd76a', 120, 0.3, 3);
    }
  } else if (world.heli) {
    world.heli = null;
  }

  // Busted: a cop car sits on you while you are on foot and slow, or your
  // car is wrecked with cops on top of you.
  if (wanted > 0 && !world.over) {
    const onFoot = !world.player.inCar;
    for (const cop of world.cops) {
      if (cop.dead) continue;
      const d = dist(cop.x, cop.y, pp.x, pp.y);
      if (onFoot && d < 46 && Math.abs(cop.speed) < 60) {
        cop.bustTimer = (cop.bustTimer ?? 0) + dt;
        if (cop.bustTimer > 1.4) {
          world.over = true;
          world.overKind = 'busted';
          return;
        }
      } else {
        cop.bustTimer = 0;
      }
      if (world.player.inCar && world.player.inCar.health <= 0 && d < 120) {
        world.over = true;
        world.overKind = 'busted';
        return;
      }
    }
  }
}

/** Remove every cop, roadblock and the heli (mission complete, or clean getaway). */
export function clearHeat(world) {
  world.wanted = 0;
  world.wantedTimer = 0;
  for (const cop of world.cops) cop.driver = 'parked';
  world.cops = [];
  for (const rb of world.roadblocks) {
    for (const car of rb.cars) car.dead = true;
  }
  world.roadblocks = [];
  world.heli = null;
}
