// The SBPD: pursuit cruisers that ram and box the player in, roadblocks at
// 3+ stars, a search helicopter at 4+, and getting busted when a cop catches
// the player on foot. Wanted heat fades when the player stays unseen.
import { CARS, WANTED } from './config.js';
import { clamp, dist, angleDiff, wrapAngle } from './random.js';
import { makeCar, setWanted, showMessage, damagePlayer } from './world.js';

export function stepPolice(state, dt) {
  const p = state.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  const speed = p.inCar ? Math.abs(p.inCar.speed) : 0;

  // Wanted heat: fades when the player is slow and out of sight of cops.
  if (state.wanted > 0) {
    const nearestCop = state.cops.reduce((m, c) => Math.min(m, dist(c.x, c.y, px, py)), Infinity);
    const seen = nearestCop < 520 || speed > 25;
    if (!seen) state.wantedHeat -= WANTED.decay * dt * 2.2;
    else state.wantedHeat = Math.min(1, state.wantedHeat + dt * 0.05);
    if (state.wantedHeat <= 0) {
      state.wanted -= 1;
      state.wantedHeat = state.wanted > 0 ? 0.6 : 0;
      if (state.wanted === 0) {
        showMessage(state, 'You lost the cops. Lay low.');
        state.cops = [];
        state.roadblocks = [];
        state.heli = null;
      }
    }
  }

  const level = WANTED.levels[state.wanted];
  if (!level) return;

  // Spawn pursuit cruisers up to the wanted level's count.
  const wantCops = level.cops + (state.mission && state.mission.policeBoost ? 2 : 0);
  while (state.cops.length < wantCops) {
    const ang = Math.random() * Math.PI * 2;
    const c = makeCar('police', px + Math.cos(ang) * 620, py + Math.sin(ang) * 620, ang);
    c.parked = false; c.driver = 'police';
    c.colour = '#141428';
    state.cars.push(c);
    state.cops.push(c);
  }

  // Pursuit: chase, ram, and try to box the player in.
  for (const cop of state.cops) {
    const d = dist(cop.x, cop.y, px, py);
    const wantAngle = Math.atan2(py - cop.y, px - cop.x);
    const diff = angleDiff(cop.angle, wantAngle);
    cop.angle = wrapAngle(cop.angle + clamp(diff, -3.4 * dt, 3.4 * dt));
    const target = d > 90 ? CARS.police.top * 0.94 : CARS.police.top * 0.5;
    cop.speed += clamp(target - cop.speed, -40 * dt, 30 * dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    const fixed = state.city.collideCircle(cop.x, cop.y, 20);
    cop.x = fixed.x; cop.y = fixed.y;
    cop.siren = (cop.siren || 0) + dt;

    // Ram the player's car; on foot, a close cop busts the player.
    if (d < 52 && p.inCar) {
      const car = p.inCar;
      car.health -= 14 * dt;
      car.speed *= 0.985;
      const push = Math.atan2(car.y - cop.y, car.x - cop.x);
      car.x += Math.cos(push) * 30 * dt;
      car.y += Math.sin(push) * 30 * dt;
      if (car.health <= 0) explodeCar(state, car);
    }
    if (d < WANTED.bustRadius && !p.inCar && Math.abs(p.speed || 0) < 60) {
      state.busted = true;
      showMessage(state, 'BUSTED by the SBPD');
    }
    // Cop cars that fall far behind respawn closer.
    if (d > 1400) {
      const ang = Math.random() * Math.PI * 2;
      cop.x = px + Math.cos(ang) * 500;
      cop.y = py + Math.sin(ang) * 500;
    }
  }

  // Roadblocks at 3+ stars: two parked cruisers across the road ahead.
  if (level.roadblocks && state.roadblocks.length === 0 && p.inCar) {
    const aheadX = px + Math.cos(p.inCar.angle) * 700;
    const aheadY = py + Math.sin(p.inCar.angle) * 700;
    const near = state.city.nearestRoadPoint(aheadX, aheadY);
    for (const off of [-30, 30]) {
      const c = makeCar('police', near.x + off, near.y + off, p.inCar.angle + Math.PI / 2);
      c.parked = true; c.driver = 'police';
      state.cars.push(c);
      state.roadblocks.push(c);
    }
    showMessage(state, 'Roadblock ahead!');
  }
  if (state.roadblocks.length && dist(state.roadblocks[0].x, state.roadblocks[0].y, px, py) > 900) {
    for (const c of state.roadblocks) {
      const i = state.cars.indexOf(c);
      if (i >= 0) state.cars.splice(i, 1);
    }
    state.roadblocks = [];
  }

  // Helicopter at 4+ stars: circles overhead, spotlights the player.
  if (level.heli && !state.heli) {
    state.heli = { x: px + 300, y: py - 300, angle: 0, spotlight: 0 };
    showMessage(state, 'Police helicopter overhead!');
  }
  if (state.heli) {
    const h = state.heli;
    h.angle += dt * 0.9;
    const tx = px + Math.cos(h.angle) * 170;
    const ty = py + Math.sin(h.angle) * 170;
    h.x += (tx - h.x) * dt * 1.4;
    h.y += (ty - h.y) * dt * 1.4;
    h.spotlight = (h.spotlight + dt) % 1;
    if (state.wanted < 4) state.heli = null;
  }

  // Cops shoot at the player when close and the player is armed and wanted.
  if (state.wanted >= 2) {
    for (const cop of state.cops) {
      const d = dist(cop.x, cop.y, px, py);
      if (d < 340 && Math.random() < dt * 0.7) {
        const ang = Math.atan2(py - cop.y, px - cop.x) + (Math.random() - 0.5) * 0.2;
        state.bullets.push({
          x: cop.x, y: cop.y, vx: Math.cos(ang) * 850, vy: Math.sin(ang) * 850,
          damage: 6, life: 0.7, friendly: false, kind: 'cop',
        });
        state.particles.push({ x: cop.x, y: cop.y, vx: 0, vy: 0, life: 0.12, max: 0.12, kind: 'flash', size: 14 });
      }
    }
  }
}

export function explodeCar(state, car) {
  if (car.burning) return;
  car.burning = true;
  car.health = 0;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    state.particles.push({
      x: car.x, y: car.y,
      vx: Math.cos(a) * (60 + Math.random() * 220), vy: Math.sin(a) * (60 + Math.random() * 220),
      life: 0.5 + Math.random() * 0.7, max: 1.2,
      kind: Math.random() < 0.5 ? 'fire' : 'smoke', size: 10 + Math.random() * 18,
    });
  }
  const p = state.player;
  if (p.inCar === car) {
    p.inCar = null;
    damagePlayer(state, 35);
    showMessage(state, 'Your car blew up!');
  }
  if (car.driver === 'police') {
    const i = state.cops.indexOf(car);
    if (i >= 0) state.cops.splice(i, 1);
  }
  car.driver = null;
  car.speed = 0;
}
