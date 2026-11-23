// Solara Bay tuning: every number that shapes how the city feels lives here.
// Districts, palettes, car handling, weapons, wanted levels and mission rewards.
export const WORLD = {
  size: 5200, // city is a square, WORLD.size metres a side (1 px = 1 m at zoom 1)
  roadGap: 340, // distance between road centrelines
  roadWidth: 64,
  sidewalk: 14,
};

export const DISTRICTS = [
  { name: 'Downtown', x: 1500, y: 1500, w: 1500, h: 1200, tint: '#3d4a6b', style: 'towers' },
  { name: 'Marina', x: 3000, y: 900, w: 1200, h: 900, tint: '#2e6f8e', style: 'marina' },
  { name: 'Old Town', x: 900, y: 2700, w: 1300, h: 1200, tint: '#8a6a4a', style: 'old' },
  { name: 'Industrial', x: 3000, y: 2700, w: 1300, h: 1200, tint: '#5a5f66', style: 'industrial' },
  { name: 'Beachfront', x: 900, y: 3900, w: 3400, h: 900, tint: '#d9a05b', style: 'beach' },
  { name: 'The Hills', x: 3900, y: 3900, w: 900, h: 900, tint: '#4a7a4a', style: 'hills' },
];

export const PALETTE = {
  grass: '#5d8a4a',
  grassDry: '#7d9a52',
  road: '#33363d',
  roadLine: '#e8d44d',
  sidewalk: '#8d8d84',
  buildingRoof: ['#7a5a4a', '#5a6a7a', '#8a7a5a', '#6a5a6a', '#4a6a5a', '#9a8a6a'],
  water: '#2a6f9e',
  waterDeep: '#1d4f78',
  sand: '#e0c184',
  park: '#4a7a3a',
  plaza: '#9a9a90',
};

export const PLAYER = {
  walkSpeed: 210,
  sprintSpeed: 330,
  radius: 13,
  maxHealth: 100,
  punchDamage: 12,
  punchRange: 34,
  punchCooldown: 0.38,
};

export const CARS = {
  // name, top speed (m/s), accel, turn rate, colour set, class
  sedan: { label: 'Vesper Sedan', top: 46, accel: 26, turn: 2.6, colours: ['#c0392b', '#2c3e50', '#7f8c8d', '#16a085'] },
  coupe: { label: 'Comet Coupe', top: 58, accel: 32, turn: 2.9, colours: ['#e74c3c', '#f1c40f', '#8e44ad', '#111111'] },
  taxi: { label: 'Bay Taxi', top: 44, accel: 24, turn: 2.6, colours: ['#f1c40f'] },
  truck: { label: 'Hauler Truck', top: 36, accel: 18, turn: 2.1, colours: ['#7f8c8d', '#95a5a6', '#2c3e50'] },
  police: { label: 'SBPD Cruiser', top: 56, accel: 34, turn: 3.0, colours: ['#1a1a2e'] },
  van: { label: 'Courier Van', top: 40, accel: 20, turn: 2.2, colours: ['#ecf0f1', '#3498db'] },
  sport: { label: 'Falcon GT', top: 66, accel: 38, turn: 3.1, colours: ['#e67e22', '#c0392b', '#2ecc71'] },
  muscle: { label: 'Bruiser Muscle', top: 52, accel: 30, turn: 2.4, colours: ['#922b21', '#1b4f72', '#7d6608'] },
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, rate: 0.38, range: 34, auto: false, ammo: Infinity, mag: Infinity },
  pistol: { name: 'P9 Pistol', damage: 22, rate: 0.24, range: 420, auto: false, ammo: 120, mag: 12, spread: 0.05, speed: 900 },
  smg: { name: 'VK-9 SMG', damage: 13, rate: 0.085, range: 380, auto: true, ammo: 240, mag: 30, spread: 0.11, speed: 1000 },
  shotgun: { name: 'Riot Shotgun', damage: 15, rate: 0.85, range: 260, auto: false, ammo: 48, mag: 6, spread: 0.22, speed: 800, pellets: 6 },
};

export const WANTED = {
  decay: 0.011, // stars lost per second while unseen
  bustRadius: 26,
  levels: [
    null,
    { cops: 1, label: 'Petty theft' },
    { cops: 2, label: 'Grand theft auto' },
    { cops: 3, label: 'Armed robbery', roadblocks: true },
    { cops: 4, label: 'Police manhunt', roadblocks: true, heli: true },
    { cops: 5, label: 'City-wide lockdown', roadblocks: true, heli: true },
  ],
};

export const STEP = 1 / 60;
export const SAVE_KEY = 'solara-bay-save-v2';
export const BEST_KEY = 'solara-bay-best-v2';
export const DAY_LENGTH = 300; // seconds for a full day cycle
export const MISSION_REWARDS = [400, 900, 1500, 2200, 3500, 8000];
