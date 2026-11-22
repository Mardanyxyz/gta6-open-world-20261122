// Traffic and pedestrians: the city breathing on its own.
// Traffic cars drive their lane down a road, pick a new direction at every
// intersection, brake for the car ahead and swerve around wrecks. Pedestrians
// stroll the sidewalks and sprint away from gunfire, sirens and speeding cars.

import { WORLD, TRAFFIC_COUNT, PED_COUNT } from './config.js';
import { range, int, pick, chance, clamp, dist, angleDiff, angleTo } from './random.js';
import { makeCar, spawnPed, spawnParticles, collideCars, playerDist } from './world.js';
import { vRoadX, hRoadY, isRoadAt } from './city.js';

const { pitch, road } = WORLD;

function assignRoute(car, rng, city) {
  if (chance(rng, 0.5)) {
    const i = int(rng, 0, WORLD.cols);
    const dir = chance(rng, 0.5) ? 1 : -1; // +1 = southbound
    car.route = { kind: 'v', index: i, dir };
    car.x = vRoadX(i) + (dir > 0 ? 24 : -24);
    car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    const j = int(rng, 0, WORLD.rows);
    const dir = chance(rng, 0.5) ? 1 : -1; // +1 = eastbound
    car.route = { kind: 'h', index: j, dir };
    car.y = hRoadY(j) + (dir > 0 ? 24 : -24);
    car.angle = dir > 0 ? 0 : Math.PI;
  }
  car.targetSpeed = range(rng, 150, 240);
}

export function initTraffic(world) {
  const rng = world.rng;
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const type = pick(rng, ['sedan', 'sedan', 'coupe', 'taxi', 'van', 'truck', 'muscle']);
    const p = world.city.randomRoadPoint(rng);
    const car = makeCar(type, p.x, p.y, p.angle, pick(rng, [
      '#c94f43', '#e8b23a', '#3a7bd5', '#4fae62', '#8a8f98', '#e8e4da',
      '#7a2e8f', '#2e8f7a', '#d56a3a', '#37415c', '#a33a5c',
    ]), 'traffic', rng);
    assignRoute(car, rng, world.city);
    car.x = p.x; car.y = p.y; car.angle = p.angle;
    world.cars.push(car);
  }
  for (let i = 0; i < PED_COUNT; i += 1) {
    const p = world.city.randomRoadPoint(rng);
    const side = chance(rng, 0.5) ? 1 : -1;
    const ped = spawnPed(world, p.x + range(rng, -60, 60) + side * 60, p.y + range(rng, -60, 60), rng);
    ped.state = 'walk';
  }
}

function atIntersection(car) {
  const rx = car.x % pitch;
  const ry = car.y % pitch;
  return (rx < road / 2 + 30 || rx > pitch - road / 2 - 30) && (ry < road / 2 + 30 || ry > pitch - road / 2 - 30);
}

function pickNewRoute(car, rng) {
  // At an intersection: keep going, turn left or turn right.
  const r = rng();
  const cur = car.route;
  if (cur.kind === 'v') {
    const col = cur.index;
    const row = Math.round(car.y / pitch);
    if (r < 0.6) {
      // straight on
      car.route = { kind: 'v', index: col, dir: cur.dir };
      car.angle = cur.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (r < 0.8) {
      car.route = { kind: 'h', index: clamp(row, 0, WORLD.rows), dir: 1 };
      car.angle = 0;
    } else {
      car.route = { kind: 'h', index: clamp(row, 0, WORLD.rows), dir: -1 };
      car.angle = Math.PI;
    }
  } else {
    const row = cur.index;
    const col = Math.round(car.x / pitch);
    if (r < 0.6) {
      car.route = { kind: 'h', index: row, dir: cur.dir };
      car.angle = cur.dir > 0 ? 0 : Math.PI;
    } else if (r < 0.8) {
      car.route = { kind: 'v', index: clamp(col, 0, WORLD.cols), dir: 1 };
      car.angle = Math.PI / 2;
    } else {
      car.route = { kind: 'v', index: clamp(col, 0, WORLD.cols), dir: -1 };
      car.angle = -Math.PI / 2;
    }
  }
  // Snap to the new lane.
  if (car.route.kind === 'v') car.x = vRoadX(car.route.index) + (car.route.dir > 0 ? 24 : -24);
  else car.y = hRoadY(car.route.index) + (car.route.dir > 0 ? 24 : -24);
  car.targetSpeed = range(rng, 150, 240);
}

function carAhead(world, car) {
  let best = Infinity;
  for (const other of world.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (ahead > 0 && ahead < 110 && side < 30 && ahead < best) best = ahead;
  }
  return best;
}

export function stepTraffic(world, dt) {
  const rng = world.rng;
  for (const car of world.cars) {
    if (car.driver !== 'traffic' || car.dead) continue;
    // Ease toward the target speed; brake for the car ahead.
    const ahead = carAhead(world, car);
    let want = car.targetSpeed;
    if (ahead < 90) want = 0;
    else if (ahead < 150) want = 60;
    car.speed += clamp(want - car.speed, -500 * dt, 260 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!world.city.hitsBuilding(nx, ny, 26)) {
      car.x = nx;
      car.y = ny;
    } else {
      car.speed = 0;
      pickNewRoute(car, rng);
    }
    if (car.speed > 20 && atIntersection(car) && chance(rng, 0.5)) pickNewRoute(car, rng);
    // Off the east edge (into the beach road) or past the map: turn around.
    if (car.x > WORLD.sandX - 60 || car.x < 40 || car.y < 40 || car.y > WORLD.height - 40) {
      pickNewRoute(car, rng);
    }
  }
  // Car-car bumps.
  const movers = world.cars.filter((c) => !c.dead);
  for (let i = 0; i < movers.length; i += 1) {
    for (let j = i + 1; j < movers.length; j += 1) {
      const a = movers[i];
      const b = movers[j];
      if (Math.abs(a.x - b.x) < 70 && Math.abs(a.y - b.y) < 70) collideCars(a, b, world);
    }
  }
}

export function stepPeds(world, dt) {
  const rng = world.rng;
  const pp = world.player.inCar ? world.player.inCar : world.player;
  for (const ped of world.peds) {
    if (ped.dead) continue;
    ped.t += dt;
    // Panic: run from gunfire, sirens and speeding cars.
    const nearDanger = playerDist(world, ped.x, ped.y) < 260 && (world.player.inCar ? Math.abs(world.player.inCar.speed) > 300 : false);
    const gunfire = world.bullets.length > 0 && dist(ped.x, ped.y, world.player.x, world.player.y) < 500;
    if (nearDanger || gunfire || (world.wanted > 0 && dist(ped.x, ped.y, pp.x, pp.y) < 200)) {
      ped.panic = 2.5;
      ped.state = 'flee';
    }
    if (ped.panic > 0) {
      ped.panic -= dt;
      const away = angleTo(pp.x, pp.y, ped.x, ped.y);
      ped.angle += angleDiff(ped.angle, away) * dt * 6;
      ped.speed = 260;
    } else {
      ped.state = 'walk';
      ped.speed = 60;
      if (ped.t > 4 && chance(rng, 0.02)) {
        ped.angle += pick(rng, [-Math.PI / 2, Math.PI / 2, Math.PI]);
        ped.t = 0;
      }
    }
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    if (!world.city.hitsBuilding(nx, ny, 10) && nx > 10 && nx < WORLD.waterX - 10 && ny > 10 && ny < WORLD.height - 10) {
      ped.x = nx;
      ped.y = ny;
    } else {
      ped.angle += Math.PI / 2;
    }
    // Keep peds off the middle of roads when strolling: nudge toward sidewalk.
    if (ped.state === 'walk' && isRoadAt(ped.x, ped.y) && chance(rng, 0.01)) ped.angle += Math.PI / 2;
    // Run over by a fast car.
    const car = world.player.inCar;
    if (car && Math.abs(car.speed) > 200 && dist(ped.x, ped.y, car.x, car.y) < 30) {
      ped.dead = true;
      spawnParticles(world, ped.x, ped.y, 10, '#ff5a4e', 160, 0.6, 4);
      world.stats.kills += 1;
    }
  }
  // Top the crowd back up.
  if (world.peds.filter((p) => !p.dead).length < PED_COUNT - 6) {
    const p = world.city.randomRoadPoint(rng);
    spawnPed(world, p.x, p.y, rng);
  }
  world.peds = world.peds.filter((p) => !p.dead || p.t < 9999);
}
