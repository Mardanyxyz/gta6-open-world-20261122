// Live world state: the player, every car on the street, pickups, the wanted
// level, cash and health. Pure data plus the small mutations the systems use.
import { CARS, PLAYER, WEAPONS, WANTED } from './config.js';
import { createRandom, clamp, dist } from './random.js';
import { buildCity, roadPoint } from './city.js';

let carId = 1;

export function makeCar(kind, x, y, angle, colour) {
  const spec = CARS[kind];
  return {
    id: carId++, kind, label: spec.label, x, y, angle,
    speed: 0, colour: colour || spec.colours[0],
    health: 100, smoke: 0, burning: false, parked: true,
    driver: null, // 'traffic' | 'police' | 'player' | null
    targetSpeed: 0, steer: 0, stuck: 0, honk: 0,
    w: 34, l: 62,
  };
}

export function createWorld(seed) {
  const rng = createRandom(seed);
  const city = buildCity(seed);
  const state = {
    seed, rng, city,
    time: 0, clock: 17.4, // golden hour start (17:24)
    money: 250,
    wanted: 0,
    wantedHeat: 0, // 0..1 within the current star, drives decay
    score: 0,
    kills: 0,
    carsStolen: 0,
    missionsDone: 0,
    deaths: 0,
    busted: false,
    wasted: false,
    player: {
      x: 1080, y: 1300, angle: -Math.PI / 2, speed: 0,
      health: PLAYER.maxHealth, armour: 0,
      weapon: 'pistol', weapons: { fists: Infinity, pistol: 72, smg: 0, shotgun: 0 },
      mags: { pistol: 12, smg: 30, shotgun: 6 },
      inCar: null, punchTimer: 0, shootTimer: 0, reloadTimer: 0,
      moving: false, sprinting: false,
    },
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    pickups: [],
    enemies: [],
    cops: [],
    heli: null,
    roadblocks: [],
    radio: 0, muted: false,
    mission: null, // active mission object from missions.js
    missionIndex: 0,
    message: null, messageTimer: 0,
    banner: null, bannerTimer: 0,
    objective: 'Steal a car and meet Mara at the Safehouse',
    stats: { shotsFired: 0, shotsHit: 0, distanceDriven: 0 },
  };

  // Parked cars around the safehouse and along the roads.
  const parkedSpots = [
    [1180, 1300, 'sedan'], [1260, 1330, 'coupe'], [1010, 1420, 'van'],
    [1560, 1180, 'sport'], [1760, 1240, 'muscle'], [900, 1100, 'sedan'],
  ];
  for (const [x, y, kind] of parkedSpots) {
    const c = makeCar(kind, x, y, rng.range(0, Math.PI * 2));
    state.cars.push(c);
  }
  for (let i = 0; i < 26; i++) {
    const p = roadPoint(city, rng);
    const kind = rng.pick(['sedan', 'sedan', 'coupe', 'taxi', 'van', 'truck', 'muscle']);
    const c = makeCar(kind, p.x + rng.range(-18, 18), p.y + rng.range(-18, 18), rng.chance(0.5) ? 0 : Math.PI);
    c.parked = rng.chance(0.55);
    state.cars.push(c);
  }

  // Health, armour and cash pickups scattered through the city.
  const pickupKinds = ['health', 'armour', 'cash', 'ammo'];
  for (let i = 0; i < 26; i++) {
    const p = roadPoint(city, rng);
    state.pickups.push({
      kind: rng.pick(pickupKinds),
      x: p.x + rng.range(-90, 90), y: p.y + rng.range(-90, 90),
      amount: rng.int(25, 120), taken: false, bob: rng.range(0, 6),
    });
  }
  return state;
}

export function setWanted(state, stars, reason) {
  const next = clamp(stars, 0, 5);
  if (next > state.wanted) {
    state.wantedHeat = 1;
    if (reason) showMessage(state, `WANTED — ${WANTED.levels[next].label}`);
  }
  state.wanted = next;
}

export function addWanted(state, stars) {
  setWanted(state, state.wanted + stars);
}

export function showMessage(state, text, seconds = 3.2) {
  state.message = text;
  state.messageTimer = seconds;
}

export function showBanner(state, title, sub) {
  state.banner = { title, sub: sub || '' };
  state.bannerTimer = 3.4;
}

export function addMoney(state, amount, why) {
  state.money += amount;
  state.score += Math.max(0, amount);
  if (why) showMessage(state, `+$${amount} — ${why}`);
}

export function nearestCar(state, x, y, maxDist = 90) {
  let best = null, bd = maxDist;
  for (const c of state.cars) {
    if (c.driver === 'police') continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function damagePlayer(state, amount) {
  const p = state.player;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, amount);
    p.armour -= absorbed;
    amount -= absorbed;
  }
  p.health -= amount;
  if (p.health <= 0) {
    p.health = 0;
    state.wasted = true;
    state.deaths += 1;
  }
}

export function healPlayer(state, amount) {
  state.player.health = clamp(state.player.health + amount, 0, PLAYER.maxHealth);
}

export function giveWeapon(state, key, ammo) {
  const p = state.player;
  if (!(key in p.weapons)) p.weapons[key] = 0;
  p.weapons[key] += ammo;
  p.weapon = key;
  showMessage(state, `Picked up ${WEAPONS[key].name} (+${ammo} rounds)`);
}

export function currentWeapon(state) {
  return WEAPONS[state.player.weapon] || WEAPONS.fists;
}
