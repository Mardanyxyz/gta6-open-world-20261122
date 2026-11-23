// Staged screenshot scenes. Each one sets up a real game state, plays it
// forward with a simple autopilot for a few seconds, then paints it twice and
// sets window.__shotReady so the screenshot tool can capture the frame.
// Every frame is a genuine render of the game — nothing is composited.
import { createWorld, setWanted, showBanner, showMessage } from './world.js';
import { createRandom, dist } from './random.js';
import { startMission } from './missions.js';
import { spawnEnemy, fireWeapon } from './combat.js';
import { makeCar } from './world.js';
import { STEP } from './config.js';
import { stepGame } from './simulate.js';

// A fake input that drives like a player: holds W, steers toward a target.
function autopilotInput(target) {
  const keys = new Set(['KeyW']);
  return {
    takeActions() { return 0; },
    move() { return { x: 0, y: -1 }; },
    sprint() { return false; },
    handbrake() { return false; },
    mouse() { return { x: 640, y: 300, down: false, pressed: false }; },
    consumeMousePress() {},
    lastKey() { return 'KeyW'; },
    anyKey() { return false; },
    target,
  };
}

function steerToward(state, target, input) {
  // Override the autopilot steering by nudging the car angle directly.
  const car = state.player.inCar;
  if (!car) return;
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.6 * STEP, Math.min(2.6 * STEP, diff));
  car.speed = Math.min(car.speed + 24 * STEP, 44);
}

function clearNearbyTraffic(state, x, y, r) {
  // Staged scenes: keep the road around the player clear so the hero car
  // reads at a glance instead of drowning in a traffic pile.
  state.shotMode = true;
  state.cars = state.cars.filter((c) => c.driver !== 'traffic' || dist(c.x, c.y, x, y) > r);
}

export function stageShot(name, world, renderer) {
  const state = world;
  const input = autopilotInput(null);

  if (name === 'start') {
    // Cover: Rook tearing east through Downtown in a stolen Falcon GT, 3 stars,
    // cruisers in pursuit, mission banner up, minimap live.
    const car = makeCar('sport', 1200, 1440, 0, '#e67e22');
    car.parked = false; car.driver = 'player';
    state.cars.push(car);
    state.player.inCar = car;
    state.player.x = car.x; state.player.y = car.y;
    state.player.weapons.smg = 90;
    state.player.weapon = 'smg';
    state.money = 1250;
    state.carsStolen = 1;
    clearNearbyTraffic(state, car.x, car.y, 700);
    setWanted(state, 3, 'cover');
    startMission(state, 1);
    state.mission.stage = 1;
    state.objective = 'Escape the police (3 stars) — then Safehouse';
    showBanner(state, 'THE BAY TRUST JOB', 'Grab the cash and RUN — 3 stars!');
    state.bannerTimer = 99;
    const target = { x: 2900, y: 1440 };
    for (let i = 0; i < 60 * 4; i++) {
      steerToward(state, target, input);
      stepGame(state, input, STEP);
      state.bannerTimer = 99;
    }
    state.camera = { x: state.player.x, y: state.player.y - 130, zoom: 0.82 };
    return { screen: 'play', state };
  }

  if (name === 'chase') {
    // Five-star lockdown at dusk on Beachfront: helicopter, roadblock, cruisers.
    state.time = 660; // clock 19:36, dusk
    const car = makeCar('muscle', 1500, 4160, 0, '#922b21');
    car.parked = false; car.driver = 'player';
    state.cars.push(car);
    state.player.inCar = car;
    state.player.x = car.x; state.player.y = car.y;
    state.money = 8420;
    state.missionsDone = 5;
    state.carsStolen = 4;
    clearNearbyTraffic(state, car.x, car.y, 700);
    setWanted(state, 5, 'chase');
    state.objective = 'Lose a 5-star lockdown, reach Sunset Pier';
    showMessage(state, '5 STARS! Lose them and reach the Pier!');
    state.messageTimer = 99;
    const target = { x: 2800, y: 4160 };
    for (let i = 0; i < 60 * 5; i++) {
      steerToward(state, target, input);
      stepGame(state, input, STEP);
      state.messageTimer = 99;
    }
    state.camera = { x: state.player.x, y: state.player.y + 130, zoom: 0.82 };
    return { screen: 'play', state };
  }

  if (name === 'mission') {
    // Warehouse shootout on foot: guards, muzzle flashes, SMG in hand.
    state.time = 240; // clock 18:12, golden hour
    const p = state.player;
    p.x = 3350; p.y = 3350; p.angle = -Math.PI / 2;
    p.weapons.smg = 120; p.weapons.shotgun = 24;
    p.weapon = 'smg';
    p.mags.smg = 30;
    state.money = 3900;
    state.missionsDone = 3;
    state.carsStolen = 2;
    startMission(state, 4);
    // Rook holds his ground in the open grass south of the warehouse and
    // trades fire with the crew — he stays put so he reads clearly.
    const still = { ...input, move: () => ({ x: 0, y: 0 }) };
    for (let i = 0; i < 60 * 3; i++) {
      stepGame(state, still, STEP);
      if (i % 15 === 0) {
        const alive = state.enemies.filter((e) => !e.dead && e.health > 0);
        if (alive.length) {
          const near = alive.reduce((a, b) => ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 < (b.x - p.x) ** 2 + (b.y - p.y) ** 2 ? a : b));
          fireWeapon(state, near.x, near.y);
        }
      }
    }
    state.bannerTimer = 0;
    state.messageTimer = 0;
    state.camera = { x: p.x, y: p.y, zoom: 1.15 };
    return { screen: 'play', state };
  }

  if (name === 'menu') {
    // Title screen over the live city at golden hour.
    state.time = 120; // clock 17:48
    state.missionsDone = 0;
    return { screen: 'title', state };
  }

  return { screen: 'title', state };
}
