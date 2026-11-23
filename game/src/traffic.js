// Traffic cars that follow the road grid and pedestrians who stroll the
// sidewalks, cross streets, and flee from gunfire and speeding cars.
import { CARS } from './config.js';
import { createRandom, clamp, dist, angleDiff, wrapAngle } from './random.js';
import { makeCar } from './world.js';
import { roadPoint } from './city.js';

const MAX_TRAFFIC = 22;
const MAX_PEDS = 34;

export function createTraffic(state) {
  const rng = state.rng;
  // Spawn the rolling traffic fleet.
  for (let i = 0; i < 14; i++) {
    const p = roadPoint(state.city, rng);
    const kind = rng.pick(['sedan', 'sedan', 'taxi', 'van', 'coupe', 'truck']);
    const c = makeCar(kind, p.x, p.y, rng.chance(0.5) ? 0 : Math.PI / 2);
    c.parked = false;
    c.driver = 'traffic';
    c.targetSpeed = rng.range(16, 26);
    c.lane = rng.chance(0.5) ? -14 : 14;
    state.cars.push(c);
  }
  for (let i = 0; i < 26; i++) spawnPed(state);
}

function spawnPed(state) {
  const rng = state.rng;
  const p = roadPoint(state.city, rng);
  const palette = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#ecf0f1', '#1abc9c'];
  state.peds.push({
    x: p.x + rng.range(-60, 60), y: p.y + rng.range(-60, 60),
    angle: rng.range(0, Math.PI * 2), speed: rng.range(14, 30),
    colour: rng.pick(palette), shirt: rng.pick(palette),
    walkPhase: rng.range(0, 6), fleeing: 0, target: null,
    pause: rng.range(0, 3), state: 'walk',
  });
}

function steerAlongRoad(car, city, dt) {
  // Pick the nearest road axis and drive along it; at intersections, turn.
  const onV = city.roadsV.reduce((best, rx) => Math.abs(car.x - rx) < Math.abs(car.x - best) ? rx : best, city.roadsV[0]);
  const onH = city.roadsH.reduce((best, ry) => Math.abs(car.y - ry) < Math.abs(car.y - best) ? ry : best, city.roadsH[0]);
  const dv = Math.abs(car.x - onV), dh = Math.abs(car.y - onH);
  let want;
  if (dv < dh) want = car.y < onH ? Math.PI / 2 : -Math.PI / 2; // vertical road: go up/down
  else want = car.x < onV ? 0 : Math.PI; // horizontal road
  // At an intersection, sometimes turn onto the other road.
  if (dv < 30 && dh < 30 && car.turnCooldown <= 0) {
    if (Math.random() < 0.25) want = want + Math.PI / 2;
    car.turnCooldown = 2 + Math.random() * 3;
  }
  car.turnCooldown = Math.max(0, (car.turnCooldown || 0) - dt);
  const diff = angleDiff(car.angle, want);
  car.angle = wrapAngle(car.angle + clamp(diff, -2.2 * dt, 2.2 * dt));
  // Stay in lane: nudge toward the road centreline.
  const laneTarget = dv < dh ? onV + (car.lane || 0) : onH + (car.lane || 0);
  const lateral = dv < dh ? car.x - laneTarget : car.y - laneTarget;
  car.angle = wrapAngle(car.angle - clamp(lateral * 0.02, -0.6, 0.6) * dt * 4);
}

export function stepTraffic(state, dt) {
  const p = state.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;

  // --- traffic cars ---
  let trafficCount = 0;
  for (const c of state.cars) {
    if (c.driver !== 'traffic') continue;
    trafficCount++;
    const dPlayer = dist(c.x, c.y, px, py);
    // Avoid the player and cars ahead.
    let slow = false;
    for (const o of state.cars) {
      if (o === c || o.driver === 'police') continue;
      const d = dist(c.x, c.y, o.x, o.y);
      if (d < 70 && d > 1) {
        const ahead = Math.cos(o.angle - c.angle) > 0.3;
        if (ahead && d < 60) slow = true;
      }
    }
    if (dPlayer < 60) slow = true;
    const target = slow ? 0 : c.targetSpeed;
    c.speed += clamp(target - c.speed, -30 * dt, 14 * dt);
    steerAlongRoad(c, state.city, dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    const fixed = state.city.collideCircle(c.x, c.y, 20);
    c.x = fixed.x; c.y = fixed.y;
    // Recycle far-away traffic to a random road elsewhere, so the streets stay alive.
    if (dPlayer > 1500 && !state.shotMode) {
      const spot = roadPoint(state.city, state.rng);
      c.x = spot.x + (Math.random() - 0.5) * 40;
      c.y = spot.y + (Math.random() - 0.5) * 40;
      c.angle = Math.random() * Math.PI * 2;
    }
    // Separation: traffic cars push apart instead of piling up.
    for (const o of state.cars) {
      if (o === c || o.driver !== 'traffic') continue;
      const d = dist(c.x, c.y, o.x, o.y);
      if (d < 52 && d > 0.1) {
        const push = Math.atan2(c.y - o.y, c.x - o.x);
        c.x += Math.cos(push) * 40 * dt;
        c.y += Math.sin(push) * 40 * dt;
      }
    }
  }
  while (trafficCount < 12 && !state.shotMode) {
    const spot = roadPoint(state.city, state.rng);
    const kind = state.rng.pick(['sedan', 'taxi', 'van', 'coupe']);
    const c = makeCar(kind, spot.x, spot.y, Math.random() * Math.PI * 2);
    c.parked = false; c.driver = 'traffic'; c.targetSpeed = state.rng.range(16, 26);
    c.lane = state.rng.chance(0.5) ? -14 : 14;
    state.cars.push(c);
    trafficCount++;
  }

  // --- pedestrians ---
  for (const ped of state.peds) {
    const dPlayer = dist(ped.x, ped.y, px, py);
    const danger = state.bullets.length > 0 || (p.inCar && p.inCar.speed > 20 && dPlayer < 120);
    if (danger && dPlayer < 260) ped.fleeing = 2.5;
    if (ped.fleeing > 0) {
      ped.fleeing -= dt;
      const away = Math.atan2(ped.y - py, ped.x - px);
      ped.angle = away;
      ped.x += Math.cos(away) * 95 * dt;
      ped.y += Math.sin(away) * 95 * dt;
      ped.walkPhase += dt * 14;
    } else {
      ped.pause -= dt;
      if (ped.pause <= 0) {
        ped.angle += (Math.random() - 0.5) * 1.2;
        ped.pause = 1 + Math.random() * 3;
      }
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      ped.walkPhase += dt * 7;
      // Wander back onto a road if they drift too far.
      if (!state.city.onRoad(ped.x, ped.y) && dist(ped.x, ped.y, px, py) > 700) {
        const near = state.city.nearestRoadPoint(ped.x, ped.y);
        ped.x = near.x + (Math.random() - 0.5) * 60;
        ped.y = near.y + (Math.random() - 0.5) * 60;
      }
    }
    const fixed = state.city.collideCircle(ped.x, ped.y, 10);
    ped.x = fixed.x; ped.y = fixed.y;
    if (dPlayer > 1600) {
      const near = state.city.nearestRoadPoint(px, py);
      ped.x = near.x + (Math.random() - 0.5) * 400;
      ped.y = near.y + (Math.random() - 0.5) * 400;
    }
  }
  while (state.peds.length < MAX_PEDS) spawnPed(state);
  void MAX_TRAFFIC;
  void CARS;
  void createRandom;
}
