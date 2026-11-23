// One frame of Solara Bay: player movement on foot and behind the wheel,
// stealing cars, pickups, car damage and fire, the day cycle, and the
// busted / wasted resets. Every other system steps from here.
import { PLAYER, CARS, DAY_LENGTH, STEP } from './config.js';
import { clamp, dist, angleDiff, wrapAngle } from './random.js';
import { setWanted, addWanted, showMessage, showBanner, healPlayer, giveWeapon, nearestCar, damagePlayer } from './world.js';
import { stepTraffic } from './traffic.js';
import { stepPolice, explodeCar } from './police.js';
import { stepCombat, fireWeapon, reloadWeapon } from './combat.js';
import { stepMissions, tryStartMission } from './missions.js';

export function stepGame(state, input, dt, extActions) {
  state.time += dt;
  state.clock = (17.4 + state.time / DAY_LENGTH) % 24;
  if (state.messageTimer > 0) state.messageTimer -= dt;
  if (state.bannerTimer > 0) state.bannerTimer -= dt;

  const p = state.player;
  // Actions are taken once per frame by the caller (main.js) and handed in;
  // a direct caller (screenshots) falls back to reading them here.
  const actions = extActions === undefined ? input.takeActions() : extActions;
  const move = input.move();
  const mouse = input.mouse();

  if (p.inCar) stepDriving(state, input, move, dt);
  else stepOnFoot(state, input, move, mouse, dt);

  if (actions & 4) { // ACTION_ENTER_CAR
    if (p.inCar) exitCar(state);
    else tryEnterCar(state);
  }
  if (actions & 8) reloadWeapon(state); // ACTION_RELOAD
  if (actions & 16) { // ACTION_RADIO
    state.radio = (state.radio + 1) % 3;
    showMessage(state, `Radio: ${['Bay FM — Sunset Pop', 'Static 88 — Synthwave', 'Harbour Talk'][state.radio]}`);
  }
  if (actions & 32) state.muted = !state.muted; // ACTION_MUTE
  if (actions & 64) { // ACTION_WEAPON_NEXT
    const order = ['fists', 'pistol', 'smg', 'shotgun'];
    const owned = order.filter((k) => k === 'fists' || (p.weapons[k] || 0) > 0 || (p.mags[k] || 0) > 0);
    const i = owned.indexOf(p.weapon);
    p.weapon = owned[(i + 1) % owned.length];
    showMessage(state, `Weapon: ${p.weapon}`);
  }
  if (actions & 128) { // ACTION_SAVE
    if (dist(p.x, p.y, 1080, 1180) < 220) {
      try { window.localStorage.setItem('solara-bay-save-v2', JSON.stringify({ money: state.money, missionsDone: state.missionsDone, missionIndex: state.missionIndex, time: state.time })); showMessage(state, 'Game saved at the Safehouse'); } catch { /* storage off */ }
    } else showMessage(state, 'Save only at the Safehouse');
  }

  // Mouse fire (on foot only; driving uses the car).
  if (!p.inCar && mouse.down && p.weapon !== 'fists') {
    const aim = worldAim(state, mouse);
    fireWeapon(state, aim.x, aim.y);
  } else if (!p.inCar && mouse.pressed) {
    const aim = worldAim(state, mouse);
    fireWeapon(state, aim.x, aim.y);
  }
  input.consumeMousePress();

  // Pickups.
  for (const pk of state.pickups) {
    if (pk.taken) continue;
    const d = dist(p.x, p.y, pk.x, pk.y);
    if (d < 34) {
      pk.taken = true;
      if (pk.kind === 'health') { healPlayer(state, 50); showMessage(state, '+50 health'); }
      else if (pk.kind === 'armour') { p.armour = Math.min(100, p.armour + 50); showMessage(state, '+50 armour'); }
      else if (pk.kind === 'cash') { state.money += pk.amount; state.score += pk.amount; showMessage(state, `+$${pk.amount}`); }
      else if (pk.kind === 'ammo') { giveWeapon(state, 'pistol', 36); }
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);

  // Car damage: burning cars smoke, then explode.
  for (const car of state.cars) {
    if (car.health < 35 && car.health > 0 && !car.burning) {
      car.smoke += dt;
      if (Math.random() < dt * 6) {
        state.particles.push({ x: car.x + (Math.random() - 0.5) * 20, y: car.y + (Math.random() - 0.5) * 20, vx: 0, vy: -30, life: 0.9, max: 0.9, kind: 'smoke', size: 12 });
      }
    }
    if (car.health <= 0 && !car.burning && car.health < -20) explodeCar(state, car);
    if (car.health <= 0 && !car.burning) explodeCar(state, car);
  }

  stepTraffic(state, dt);
  stepPolice(state, dt);
  stepCombat(state, dt);
  stepMissions(state, dt);
  tryStartMission(state);

  // Busted / wasted: fine, hospital, respawn at the safehouse.
  if (state.busted) {
    state.busted = false;
    const fine = Math.min(state.money, 300);
    state.money -= fine;
    state.wanted = 0; state.wantedHeat = 0; state.cops = []; state.roadblocks = []; state.heli = null;
    respawn(state, `BUSTED — fined $${fine}`);
  }
  if (state.wasted) {
    state.wasted = false;
    const lost = Math.min(state.money, 200);
    state.money -= lost;
    state.wanted = 0; state.wantedHeat = 0; state.cops = [];
    respawn(state, `WASTED — hospital bill $${lost}`);
  }
}

function respawn(state, text) {
  const p = state.player;
  p.inCar = null;
  p.x = 1080; p.y = 1300; p.health = 100; p.armour = 0;
  showBanner(state, text, 'You wake up at the Safehouse');
  state.mission = null;
  state.objective = 'Return to the mission marker to retry';
}

function stepOnFoot(state, input, move, mouse, dt) {
  const p = state.player;
  const sprint = input.sprint() && (move.x || move.y);
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  p.sprinting = sprint;
  p.moving = !!(move.x || move.y);
  p.x += move.x * speed * dt;
  p.y += move.y * speed * dt;
  if (move.x || move.y) p.angle = Math.atan2(move.y, move.x);
  else {
    // Aim with the mouse when standing still.
    const aim = worldAim(state, mouse);
    if (mouse.down || p.weapon !== 'fists') p.angle = Math.atan2(aim.y - p.y, aim.x - p.x);
  }
  const fixed = state.city.collideCircle(p.x, p.y, PLAYER.radius);
  p.x = fixed.x; p.y = fixed.y;
  // Water is deadly-ish: push back out.
  if (state.city.isWater(p.x, p.y)) {
    p.y -= 60 * dt * 10;
    damagePlayer(state, 8 * dt);
  }
  p.speed = p.moving ? speed : 0;
}

function stepDriving(state, input, move, dt) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  const spec = CARS[car.kind];
  // move.y: W = accelerate, S = brake/reverse. move.x steers.
  let accel = 0;
  if (move.y < 0) accel = spec.accel;
  else if (move.y > 0) accel = car.speed > 1 ? -spec.accel * 1.4 : -spec.accel * 0.5;
  if (input.handbrake()) accel = -Math.sign(car.speed) * spec.accel * 1.8;
  car.speed += accel * dt;
  // Drag and rolling resistance.
  car.speed -= car.speed * 0.35 * dt;
  car.speed = clamp(car.speed, -spec.top * 0.45, spec.top);
  const steer = move.x * spec.turn * clamp(Math.abs(car.speed) / 18, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle = wrapAngle(car.angle + steer * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // Crash into buildings: lose speed and health.
  const before = { x: car.x, y: car.y };
  const fixed = state.city.collideCircle(nx, ny, 24);
  car.x = fixed.x; car.y = fixed.y;
  const hitWall = dist(fixed.x, fixed.y, nx, ny) > 1;
  if (hitWall && Math.abs(car.speed) > 14) {
    car.health -= Math.abs(car.speed) * 0.45;
    car.speed *= -0.25;
    state.particles.push({ x: car.x, y: car.y, vx: 0, vy: 0, life: 0.3, max: 0.3, kind: 'spark', size: 10 });
    if (Math.abs(car.speed) > 20) showMessage(state, 'Crash!');
  }
  // Bump other cars.
  for (const o of state.cars) {
    if (o === car) continue;
    const d = dist(car.x, car.y, o.x, o.y);
    if (d < 56 && d > 0.1) {
      const push = Math.atan2(o.y - car.y, o.x - car.x);
      o.x += Math.cos(push) * 6 * dt * 10;
      o.y += Math.sin(push) * 6 * dt * 10;
      car.speed *= 0.92;
      if (o.driver === 'traffic' && Math.abs(car.speed) > 12) {
        o.driver = null; o.parked = false;
        if (state.wanted < 1) addWanted(state, 1);
      }
    }
  }
  // Run over pedestrians (dark, but it is GTA): wanted + cash drop.
  for (const ped of state.peds) {
    if (Math.abs(car.speed) > 8 && dist(car.x, car.y, ped.x, ped.y) < 26) {
      ped.x += 9000; // flung far away (respawn logic recycles them)
      ped.fleeing = 3;
      if (state.wanted < 2) addWanted(state, 1);
    }
  }
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  state.stats.distanceDriven += Math.abs(car.speed) * dt;
  void before;
}

export function tryEnterCar(state) {
  const p = state.player;
  const car = nearestCar(state, p.x, p.y, 95);
  if (!car) return;
  const wasParked = car.parked;
  const hadDriver = car.driver === 'traffic';
  car.driver = 'player';
  car.parked = false;
  p.inCar = car;
  p.x = car.x; p.y = car.y;
  if (!car.stolenBefore) {
    car.stolenBefore = true;
    state.carsStolen += 1;
    state.score += 25;
  }
  if (!wasParked || hadDriver) {
    addWanted(state, 1);
    showMessage(state, `Stole the ${car.label} — the owner called it in!`);
  } else {
    showMessage(state, `In the ${car.label}`);
  }
}

export function exitCar(state) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  p.inCar = null;
  car.driver = null;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 34;
  p.y = car.y + Math.sin(side) * 34;
  const fixed = state.city.collideCircle(p.x, p.y, PLAYER.radius);
  p.x = fixed.x; p.y = fixed.y;
}

// Convert screen mouse coordinates to world coordinates using the camera.
export function worldAim(state, mouse) {
  const cam = state.camera || { x: state.player.x, y: state.player.y, zoom: 1 };
  const w = state.viewW || 1280, h = state.viewH || 800;
  return {
    x: cam.x + (mouse.x - w / 2) / cam.zoom,
    y: cam.y + (mouse.y - h / 2) / cam.zoom,
  };
}
