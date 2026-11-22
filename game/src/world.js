// The living state of Solara Bay: the player, every car, pedestrian and
// cop, the wanted level, pickups and particles — plus the step functions
// that move the player on foot and behind the wheel. Missions, traffic,
// police and combat live in their own modules and work on this state.

import { WORLD, PLAYER, CAR, CAR_TYPES, CAR_COLORS, WANTED, DAY } from './config.js';
import { makeRng, range, int, pick, chance, clamp, dist, angleDiff } from './random.js';
import { buildCity } from './city.js';

export function createWorld(seed) {
  const rng = makeRng(seed);
  const city = buildCity(seed);
  const home = city.specials.safehouse;

  const world = {
    seed,
    rng,
    city,
    time: 0,
    hour: DAY.startHour,
    paused: false,
    over: false,
    overKind: null, // 'busted' | 'wasted' | 'won'
    player: {
      x: home.doorX, y: home.doorY + 30, angle: Math.PI / 2,
      vx: 0, vy: 0, health: PLAYER.health, inCar: null,
      weapon: 'fists', weapons: ['fists'],
      ammo: { pistol: 12, smg: 0 },
      reserve: { pistol: 96, smg: 0 },
      cooldown: 0, meleeCooldown: 0, hurtFlash: 0, dead: false,
    },
    cars: [],
    peds: [],
    cops: [],
    heli: null,
    roadblocks: [],
    wanted: 0,
    wantedTimer: 0,
    crimeCooldown: 0,
    money: 250,
    missionsDone: 0,
    mission: null,
    particles: [],
    bullets: [],
    pickups: [],
    enemies: [],
    messages: [],
    stats: { kills: 0, carsStolen: 0, missions: 0, shots: 0, hits: 0 },
    garage: [],
    respect: 0,
    radioStation: 0,
    muted: false,
    camera: { x: home.doorX, y: home.doorY + 30 },
    shake: 0,
    missionBanner: null,
    dialogue: null,
    race: null,
  };

  // Parked cars around the city, free for the taking.
  const parkedTypes = ['sedan', 'coupe', 'sports', 'taxi', 'van', 'muscle', 'sedan', 'coupe'];
  for (let i = 0; i < 22; i += 1) {
    const p = city.randomRoadPoint(rng);
    world.cars.push(makeCar(
      pick(rng, parkedTypes), p.x, p.y, p.angle, pick(rng, CAR_COLORS), 'parked', rng,
    ));
  }
  // Rio's own starter car waits by the safehouse.
  const starter = makeCar('coupe', home.doorX + 90, home.doorY + 60, Math.PI / 2, '#3a7bd5', 'parked', rng);
  starter.owned = true;
  world.cars.push(starter);

  // Cash, health and ammo pickups scattered through the districts.
  for (let i = 0; i < 14; i += 1) {
    const p = city.randomRoadPoint(rng);
    world.pickups.push({ x: p.x + range(rng, -40, 40), y: p.y + range(rng, -40, 40), kind: 'cash', amount: int(rng, 50, 300), bob: rng() * 6 });
  }
  for (let i = 0; i < 6; i += 1) {
    const p = city.randomRoadPoint(rng);
    world.pickups.push({ x: p.x, y: p.y, kind: 'health', amount: 40, bob: rng() * 6 });
  }
  for (let i = 0; i < 6; i += 1) {
    const p = city.randomRoadPoint(rng);
    world.pickups.push({ x: p.x, y: p.y, kind: 'ammo', amount: 36, bob: rng() * 6 });
  }

  return world;
}

export function makeCar(type, x, y, angle, color, driver, rng) {
  const spec = CAR_TYPES[type] ?? CAR_TYPES.sedan;
  return {
    id: Math.floor((rng ? rng() : Math.random()) * 1e9),
    type, x, y, angle,
    speed: 0, steer: 0,
    length: spec.length, width: spec.width,
    accel: spec.accel, maxSpeed: spec.maxSpeed,
    color: color ?? '#c94f43',
    health: CAR.health,
    driver, // 'parked' | 'traffic' | 'player' | 'police' | 'rival' | 'mission' | 'roadblock'
    route: null, // traffic: {kind:'v'|'h', index, dir}
    targetSpeed: 0,
    smoke: 0,
    dead: false,
    owned: false,
    siren: 0,
    stuck: 0,
  };
}

export function addMessage(world, text, color) {
  world.messages.push({ text, color: color ?? '#ffffff', t: 0, life: 3.2 });
}

export function addWanted(world, n, why) {
  // One crime per moment: the cooldown stops a single burst from stacking.
  if (world.wantedTimer > 0 && world.crimeCooldown > 0) return;
  const before = world.wanted;
  world.wanted = clamp(world.wanted + n, 0, 5);
  world.wantedTimer = WANTED.decaySeconds;
  world.crimeCooldown = 1.5;
  if (world.wanted > before) {
    addMessage(world, `WANTED LEVEL ${world.wanted} — ${why ?? 'the law is on you'}`, '#ff5a4e');
  }
}

export function spawnParticles(world, x, y, count, color, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const a = world.rng() * Math.PI * 2;
    const s = range(world.rng, speed * 0.3, speed);
    world.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      t: 0, life: range(world.rng, life * 0.5, life),
      size: range(world.rng, size * 0.5, size * 1.4), color,
    });
  }
}

/** Step the player on foot. `move` is {x, y} in -1..1, `aim` a world angle. */
export function stepPlayerOnFoot(world, dt, move, aimAngle, sprinting) {
  const p = world.player;
  const top = sprinting ? PLAYER.sprint : PLAYER.walk;
  p.vx += move.x * PLAYER.accel * dt;
  p.vy += move.y * PLAYER.accel * dt;
  const f = Math.pow(PLAYER.drag, dt * 60);
  p.vx *= f;
  p.vy *= f;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > top) {
    p.vx = (p.vx / sp) * top;
    p.vy = (p.vy / sp) * top;
  }
  const next = world.city.resolveCollision(p.x + p.vx * dt, p.y + p.vy * dt, PLAYER.radius);
  p.x = next.x;
  p.y = next.y;
  p.angle = aimAngle;
  if (p.cooldown > 0) p.cooldown -= dt;
  if (p.meleeCooldown > 0) p.meleeCooldown -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
}

/** Arcade car physics: throttle -1..1, steer -1..1, handbrake bool. */
export function stepCar(world, car, dt, throttle, steer, handbrake) {
  if (throttle > 0) {
    car.speed += car.accel * throttle * dt;
  } else if (throttle < 0) {
    if (car.speed > 30) car.speed -= CAR.brake * dt; // brake
    else car.speed += CAR.reverseAccel * throttle * dt; // reverse
  }
  // Rolling drag, and a handbrake slide.
  car.speed -= car.speed * (handbrake ? 1.6 : 0.35) * dt;
  const cap = car.maxSpeed * (car.type === 'sports' ? 1.18 : 1);
  car.speed = clamp(car.speed, -CAR.maxReverse, cap);
  const turn = steer * CAR.turn * clamp(Math.abs(car.speed) / 260, 0, 1) * (handbrake ? 1.5 : 1);
  car.angle += turn * dt * (car.speed >= 0 ? 1 : -1);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (world.city.hitsBuilding(nx, ny, 26)) {
    if (Math.abs(car.speed) > 240) {
      car.health -= Math.abs(car.speed) * 0.045;
      spawnParticles(world, nx, ny, 8, '#ffb347', 160, 0.5, 4);
      world.shake = Math.min(10, Math.abs(car.speed) * 0.02);
    }
    car.speed *= -0.25;
  } else {
    car.x = nx;
    car.y = ny;
  }
  // Water wall and world bounds.
  if (car.x > WORLD.waterX - 30) { car.x = WORLD.waterX - 30; car.speed *= 0.5; }
  if (car.x < 30) { car.x = 30; car.speed *= 0.5; }
  if (car.y < 30) { car.y = 30; car.speed *= 0.5; }
  if (car.y > WORLD.height - 30) { car.y = WORLD.height - 30; car.speed *= 0.5; }
  if (car.health < 40) car.smoke += dt;
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    spawnParticles(world, car.x, car.y, 40, '#ff7a2e', 260, 1.1, 7);
    spawnParticles(world, car.x, car.y, 24, '#3a3a3a', 120, 1.6, 9);
    world.shake = 14;
  }
  return car;
}

/** Simple circle push between two cars; returns true on a hard hit. */
export function collideCars(a, b, world) {
  const d = dist(a.x, a.y, b.x, b.y);
  const min = 34;
  if (d >= min || d === 0) return false;
  const push = (min - d) / 2;
  const nx = (b.x - a.x) / d;
  const ny = (b.y - a.y) / d;
  const hard = Math.abs(a.speed - b.speed) > 200;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  if (hard) {
    a.speed *= 0.55;
    b.speed *= 0.55;
    a.health -= 6;
    b.health -= 6;
    spawnParticles(world, (a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd76a', 140, 0.4, 3);
  }
  return hard;
}

/** Wanted decay, crime cooldown, message ageing and camera shake. */
export function stepWanted(world, dt) {
  if (world.crimeCooldown > 0) world.crimeCooldown -= dt;
  if (world.wanted > 0) {
    world.wantedTimer -= dt;
    if (world.wantedTimer <= 0) {
      world.wanted -= 1;
      world.wantedTimer = WANTED.decaySeconds;
      if (world.wanted === 0) addMessage(world, 'You lost the heat. Lay low.', '#8fd6a0');
    }
  }
  for (let i = world.messages.length - 1; i >= 0; i -= 1) {
    world.messages[i].t += dt;
    if (world.messages[i].t > world.messages[i].life) world.messages.splice(i, 1);
  }
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 30);
}

/** Pickups: walk or drive over one to collect it. */
export function stepPickups(world, dt) {
  const p = world.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    const pk = world.pickups[i];
    pk.bob += dt;
    if (dist(px, py, pk.x, pk.y) >= 46) continue;
    if (pk.kind === 'cash') {
      world.money += pk.amount;
      addMessage(world, `+${pk.amount} cash`, '#ffd76a');
    } else if (pk.kind === 'health') {
      p.health = Math.min(100, p.health + pk.amount);
      addMessage(world, `+${pk.amount} health`, '#8fd6a0');
    } else if (pk.kind === 'ammo') {
      p.reserve.pistol += pk.amount;
      p.reserve.smg += pk.amount;
      addMessage(world, `+${pk.amount} ammo`, '#9ecfff');
    }
    world.pickups.splice(i, 1);
  }
}

/** Particles and bullets age out. */
export function stepFx(world, dt) {
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const pt = world.particles[i];
    pt.t += dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.94;
    pt.vy *= 0.94;
    if (pt.t >= pt.life) world.particles.splice(i, 1);
  }
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const b = world.bullets[i];
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    if (b.life <= 0 || world.city.hitsBuilding(b.x, b.y, 2)) {
      if (world.city.hitsBuilding(b.x, b.y, 2)) {
        spawnParticles(world, b.x, b.y, 3, '#ffd76a', 90, 0.25, 2);
      }
      world.bullets.splice(i, 1);
    }
  }
}

/** The camera eases toward the player (or their car). */
export function stepCamera(world, dt) {
  const p = world.player;
  const tx = p.inCar ? p.inCar.x : p.x;
  const ty = p.inCar ? p.inCar.y : p.y;
  const k = 1 - Math.pow(0.0015, dt);
  world.camera.x += (tx - world.camera.x) * k;
  world.camera.y += (ty - world.camera.y) * k;
}

/** The nearest drivable car to a point, within `maxDist`. */
export function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.dead) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** Put the player in a car (stealing it if it has a driver). */
export function enterCar(world, car) {
  const p = world.player;
  if (car.driver === 'traffic') {
    car.driver = 'player';
    world.stats.carsStolen += 1;
    addWanted(world, 1, 'grand theft auto');
    addMessage(world, 'Car jacked! The owner called it in.', '#ff9a4e');
    // The victim runs off.
    spawnPed(world, car.x + 40, car.y, world.rng);
  } else if (car.driver === 'parked') {
    car.driver = 'player';
    if (!car.owned) {
      world.stats.carsStolen += 1;
      addWanted(world, 1, 'grand theft auto');
      addMessage(world, 'Hotwired! That car was not yours.', '#ff9a4e');
    }
  }
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
}

export function exitCar(world) {
  const p = world.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = 'parked';
  const side = car.angle + Math.PI / 2;
  const spot = world.city.resolveCollision(
    car.x + Math.cos(side) * 34, car.y + Math.sin(side) * 34, PLAYER.radius,
  );
  p.x = spot.x;
  p.y = spot.y;
  p.vx = 0;
  p.vy = 0;
  p.inCar = null;
}

/** Spawn one pedestrian at a point. */
export function spawnPed(world, x, y, rng) {
  const ped = {
    x, y, angle: rng() * Math.PI * 2,
    speed: range(rng, 40, 85), state: 'walk',
    color: pick(rng, ['#e8b23a', '#4fae62', '#c94f43', '#3a7bd5', '#e8e4da', '#7a2e8f']),
    shirt: pick(rng, ['#e8b23a', '#4fae62', '#c94f43', '#3a7bd5', '#e8e4da', '#7a2e8f']),
    panic: 0, dead: false, t: 0,
  };
  world.peds.push(ped);
  return ped;
}

/** Distance from the player (or their car) to a point. */
export function playerDist(world, x, y) {
  const p = world.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  return dist(px, py, x, y);
}

export function playerPos(world) {
  const p = world.player;
  return p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };
}
