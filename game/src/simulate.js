// One frame of Solara Bay: every system stepped in order, driven by a
// normalized control object. The live game builds the controls from the
// keyboard and mouse; the screenshot scenes build them from an autopilot.
// Keeping this separate from main.js means a shot is a real game, simulated.

import { STEP, DAY } from './config.js';
import { clamp, dist, angleTo } from './random.js';
import {
  createWorld, stepPlayerOnFoot, stepCar, stepWanted, stepPickups, stepFx,
  stepCamera, nearestCar, enterCar, exitCar, addMessage, addWanted,
  playerDist, playerPos,
} from './world.js';
import { initTraffic, stepTraffic, stepPeds } from './traffic.js';
import { stepPolice, clearHeat } from './police.js';
import { stepCombat, fireWeapon, reloadWeapon } from './combat.js';
import {
  MISSIONS, startMission, completeMission, setDialogue, advanceDialogue,
  nextMissionMarker,
} from './missions.js';
import { saveGame } from './save.js';

export function createGame(seed) {
  const world = createWorld(seed);
  initTraffic(world);
  return world;
}

/**
 * controls: {
 *   move {x,y}, aim (world angle), fire (one-shot), fireHeld,
 *   handbrake, sprint, enter (one-shot), interact (one-shot),
 *   weapon (name|null), reload (one-shot), radio (one-shot), mute (one-shot),
 *   save (one-shot), garage (one-shot)
 * }
 * Returns 'won' when the final mission completes, else null.
 */
export function stepGame(world, controls, dt, audio) {
  world.time += dt;
  world.hour += dt / DAY.secondsPerHour;
  if (world.hour >= 24) world.hour -= 24;
  world.inputAction = !!controls.interact;
  const p = world.player;

  // Dialogue eats the interact key and freezes the player.
  if (world.dialogue) {
    if (controls.interact || controls.fire) advanceDialogue(world);
    stepFx(world, dt);
    stepCamera(world, dt);
    return null;
  }

  // Mission banner timer.
  if (world.missionBanner) {
    world.missionBanner.t += dt;
    if (world.missionBanner.t > 3.4) world.missionBanner = null;
  }
  if (world.saveFlash) world.saveFlash -= dt;
  if (world.pendingNext !== undefined && world.pendingNext > 0) world.pendingNext -= dt;

  // Next-mission marker: E starts it.
  if (!world.mission && world.missionsDone < MISSIONS.length && (world.pendingNext ?? 0) <= 0) {
    const marker = nextMissionMarker(world);
    if (marker && playerDist(world, marker.x, marker.y) < 90 && controls.interact) {
      startMission(world, world.missionsDone);
      if (audio) audio.mission();
      return null;
    }
  }

  // Active mission.
  if (world.mission) {
    const result = world.mission.def.update(world, dt);
    if (result === 'done') {
      const wasLast = world.mission.index === MISSIONS.length - 1;
      completeMission(world);
      if (audio) audio.mission();
      saveGame(world);
      if (wasLast) {
        world.over = true;
        world.overKind = 'won';
        return 'won';
      }
      return null;
    }
  }

  // Weapon switching / reload / radio / mute / save.
  if (controls.weapon && p.weapons.includes(controls.weapon)) {
    p.weapon = controls.weapon;
    p.cooldown = Math.max(p.cooldown, 0.15);
  }
  if (controls.reload) reloadWeapon(world);
  if (controls.radio && audio) {
    addMessage(world, audio.setStation(audio.station + 1), '#9ecfff');
  }
  if (controls.mute && audio) {
    audio.setMuted(!audio.muted);
    addMessage(world, audio.muted ? 'Sound muted' : 'Sound on', '#9ecfff');
  }
  if (controls.save) {
    if (saveGame(world)) {
      world.saveFlash = 2;
      addMessage(world, 'Game saved', '#8fd6a0');
    }
  }

  // Garage: E in a car by the garage stores (and repairs) it; E on foot
  // by the garage brings the last stored car back out.
  const garage = world.city.specials.garage;
  if (controls.garage || controls.interact) {
    if (p.inCar && playerDist(world, garage.doorX, garage.doorY) < 130) {
      const car = p.inCar;
      car.health = 100;
      car.dead = false;
      world.garage.push({ type: car.type, color: car.color });
      world.cars = world.cars.filter((c) => c !== car);
      exitCar(world);
      addMessage(world, 'Car stored in the garage — repaired and resprayed', '#8fd6a0');
    } else if (!p.inCar && world.garage.length > 0 && playerDist(world, garage.doorX, garage.doorY) < 130) {
      const spec = world.garage.pop();
      spawnGarageCar(world, spec);
      p.x = garage.doorX;
      p.y = garage.doorY + 40;
      addMessage(world, 'Your car is ready', '#8fd6a0');
    }
  }

  // Player control.
  if (p.inCar) {
    const car = p.inCar;
    const throttle = -controls.move.y; // W = forward
    const steer = controls.move.x;
    stepCar(world, car, dt, throttle, steer, controls.handbrake);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (controls.enter) exitCar(world);
    if (car.dead) {
      // Wrecked: bail out.
      exitCar(world);
      addMessage(world, 'Your car is wrecked!', '#ff5a4e');
    }
  } else {
    const aim = controls.aim ?? p.angle;
    stepPlayerOnFoot(world, dt, controls.move, aim, controls.sprint);
    if (controls.fire || (controls.fireHeld && p.weapon === 'smg')) {
      const fired = fireWeapon(world);
      if (fired && audio) audio.gunshot();
    }
    if (controls.enter) {
      const car = nearestCar(world, p.x, p.y, 64);
      if (car) {
        enterCar(world, car);
        if (audio) audio.click();
      }
    }
  }

  // The world around the player.
  stepTraffic(world, dt);
  stepPeds(world, dt);
  stepPolice(world, dt);
  stepCombat(world, dt);
  stepWanted(world, dt);
  stepPickups(world, dt);
  stepFx(world, dt);
  stepCamera(world, dt);

  // Audio follows the car and the heat.
  if (audio) {
    audio.engine(p.inCar ? p.inCar.speed : 0, !!p.inCar);
    audio.siren(world.wanted > 0);
    audio.radioTick();
  }

  // Busted / wasted end the run; the mission restarts from the safehouse.
  if (world.over && world.overKind !== 'won') return world.overKind;
  return null;
}

function spawnGarageCar(world, spec) {
  // Imported lazily to avoid a cycle: world.js already exports makeCar.
  const garage = world.city.specials.garage;
  const car = {
    id: Math.floor(world.rng() * 1e9),
    type: spec.type, x: garage.doorX, y: garage.doorY + 80, angle: Math.PI / 2,
    speed: 0, steer: 0, length: 64, width: 32, accel: 480, maxSpeed: 560,
    color: spec.color, health: 100, driver: 'parked', route: null,
    targetSpeed: 0, smoke: 0, dead: false, owned: true, siren: 0, stuck: 0,
  };
  world.cars.push(car);
  return car;
}

/** Reset after busted/wasted: safehouse, health, heat gone, mission restarts. */
export function resetAfterFail(world) {
  const s = world.city.specials.safehouse;
  const p = world.player;
  if (p.inCar) {
    p.inCar.driver = 'parked';
    p.inCar = null;
  }
  p.x = s.doorX;
  p.y = s.doorY + 30;
  p.vx = 0;
  p.vy = 0;
  p.health = 100;
  p.dead = false;
  p.ammo.pistol = Math.max(p.ammo.pistol, 12);
  world.enemies = [];
  world.race = null;
  world.bullets = [];
  clearHeat(world);
  if (world.overKind === 'busted') {
    world.money = Math.max(0, world.money - 200);
    addMessage(world, 'Bail cost you $200', '#ff9a4e');
  }
  world.mission = null;
  world.pendingNext = 1;
  world.over = false;
  world.overKind = null;
  world.camera.x = p.x;
  world.camera.y = p.y;
}
