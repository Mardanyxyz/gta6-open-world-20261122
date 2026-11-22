// The four screenshot scenes. Each one plays the real rules forward from a
// fresh world for a fixed number of steps, steered by a simple autopilot, so
// the frame is what a short game really looks like and the same seed always
// gives the same frame. The cover shows the city, a car, the police, the HUD
// and the minimap at once.

import { TICK } from './config.js';
import { clamp, dist, angleTo, angleDiff } from './random.js';
import { stepGame } from './simulate.js';
import { startMission } from './missions.js';
import { makeCar, addWanted, playerPos } from './world.js';

const SAMPLE = TICK;

/** Drive a loop of road intersections: steer at the next corner, slow to turn. */
function makeDriver(waypoints) {
  let wp = 0;
  let stuckTimer = 0;
  let reversing = 0;
  return function drive(world) {
    const car = world.player.inCar;
    if (!car) return { move: { x: 0, y: 0 }, aim: 0 };
    const target = waypoints[wp];
    if (dist(car.x, car.y, target.x, target.y) < 130) wp = (wp + 1) % waypoints.length;
    const want = angleTo(car.x, car.y, waypoints[wp].x, waypoints[wp].y);
    const diff = angleDiff(car.angle, want);
    const speed = Math.abs(car.speed);
    if (speed < 25) stuckTimer += SAMPLE;
    else stuckTimer = 0;
    if (stuckTimer > 1.6) {
      reversing = 1.0;
      stuckTimer = 0;
    }
    if (reversing > 0) {
      reversing -= SAMPLE;
      return { move: { x: -clamp(diff * 2, -1, 1), y: 1 }, aim: car.angle, handbrake: false };
    }
    const steer = clamp(diff * 2.4, -1, 1);
    const throttle = Math.abs(diff) > 1.1 ? 0.35 : 1;
    return { move: { x: steer, y: -throttle }, aim: car.angle, handbrake: false };
  };
}

function putPlayerInCar(world, type, x, y, angle, color) {
  const car = makeCar(type, x, y, angle, color, 'player', world.rng);
  // Staged scenes run a long sim under police fire: the hero car is
  // effectively invulnerable so the frame still shows a chase, not a wreck.
  car.health = 10000;
  world.cars.push(car);
  world.player.inCar = car;
  world.player.x = x;
  world.player.y = y;
  world.player.angle = angle;
  world.camera.x = x;
  world.camera.y = y;
  return car;
}

function addCopBehind(world, x, y, angle) {
  const car = makeCar('police', x, y, angle, '#1c2733', 'police', world.rng);
  car.speed = 520;
  car.maxSpeed = 720; // staged pursuit cars keep up with the hero car
  world.cars.push(car);
  world.cops.push(car);
  return car;
}

const EMPTY_CONTROLS = {
  move: { x: 0, y: 0 }, aim: 0,
  fire: false, fireHeld: false, handbrake: false, sprint: false,
  enter: false, interact: false, garage: false,
  weapon: null, reload: false, radio: false, mute: false, save: false,
};

function stepN(world, controlsFn, seconds) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const controls = controlsFn(world, i);
    stepGame(world, { ...EMPTY_CONTROLS, ...controls }, SAMPLE, null);
    if (world.over && world.overKind !== 'won') {
      // A staged scene never ends on camera: revive and keep rolling.
      world.player.dead = false;
      world.player.health = 80;
      world.over = false;
      world.overKind = null;
    }
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Scenes: cover | chase | mission | menu.
 */
export function stageShot(name, world) {
  world.money = 12450;
  world.missionsDone = 2;
  if (name === 'chase') {
    world.hour = 18.7;
    world.copCap = 4;
    world.noRoadblocks = true;
    putPlayerInCar(world, 'muscle', 4480, 900, Math.PI / 2, '#7a2e8f');
    world.wanted = 5;
    world.wantedTimer = 60;
    startMission(world, 5);
    world.mission.data.stage = 2;
    world.mission.data.hasDiamond = true;
    world.dialogue = null;
    addCopBehind(world, 4480, 680, Math.PI / 2);
    addCopBehind(world, 4420, 620, Math.PI / 2);
    addCopBehind(world, 4540, 740, Math.PI / 2);
    const drive = makeDriver([
      { x: 4480, y: 1120 }, { x: 4480, y: 2240 }, { x: 2800, y: 2240 },
      { x: 2800, y: 1120 },
    ]);
    stepN(world, () => drive(world), 2.5);
    return 'play';
  }
  if (name === 'mission') {
    world.hour = 18.9;
    startMission(world, 4);
    world.mission.data.stage = 1;
    world.dialogue = null;
    // Five guards in view for the frame; a short sim so the shootout is
    // still raging when the frame is taken.
    world.enemies = world.enemies.slice(0, 5);
    const w = world.city.specials.warehouse;
    world.player.x = w.cx - 220;
    world.player.y = w.cy + 120;
    world.player.weapon = 'pistol';
    if (!world.player.weapons.includes('pistol')) world.player.weapons.push('pistol');
    world.player.ammo.pistol = 24;
    world.camera.x = world.player.x;
    world.camera.y = world.player.y;
    stepN(world, () => {
      const p = world.player;
      let target = null;
      let best = Infinity;
      for (const e of world.enemies) {
        if (e.dead) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d < best) { best = d; target = e; }
      }
      if (!target) return { move: { x: 0, y: 0 }, aim: p.angle };
      const aim = angleTo(p.x, p.y, target.x, target.y);
      const toward = angleTo(p.x, p.y, target.x, target.y);
      const mx = Math.cos(toward) * (best > 200 ? 1 : 0);
      const my = Math.sin(toward) * (best > 200 ? 1 : 0);
      return { move: { x: mx, y: my }, aim, fire: best < 420, sprint: false };
    }, 2.5);
    return 'play';
  }
  if (name === 'menu') {
    world.hour = 16.4;
    world.camera.x = 2800;
    world.camera.y = 1400;
    world.time = 30;
    return 'title';
  }
  // Default: cover — a getaway through downtown at golden hour.
  world.hour = 16.4;
  world.copCap = 3;
  world.noRoadblocks = true;
  putPlayerInCar(world, 'sports', 1680, 560, 0, '#3a7bd5');
  world.wanted = 3;
  world.wantedTimer = 60;
  startMission(world, 2);
  world.mission.data.stage = 2;
  world.mission.data.cps = 0;
  world.dialogue = null;
  addCopBehind(world, 1530, 560, 0);
  addCopBehind(world, 1470, 600, 0);
  const drive = makeDriver([
    { x: 2240, y: 560 }, { x: 3920, y: 560 }, { x: 3920, y: 1680 },
    { x: 2240, y: 1680 },
  ]);
  stepN(world, () => drive(world), 3);
  return 'play';
}
