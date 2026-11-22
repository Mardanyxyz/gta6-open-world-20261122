// Solara Bay — tuning constants, world layout and palettes.
// Everything in one place so the rest of the game reads like a spec sheet.

export const WORLD = {
  width: 5800,
  height: 3720,
  // City grid: roads are ROAD wide, blocks are BLOCK wide, pitch is the sum.
  pitch: 560,
  road: 96,
  block: 464,
  cols: 9, // vertical roads: 0..9
  rows: 6, // horizontal roads: 0..6
  // The bay: water starts here, sand before it.
  sandX: 5136,
  waterX: 5310,
};

export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 235,
  sprintSpeed: 345,
  accel: 2400,
  friction: 0.86,
  health: 100,
};

export const CAR = {
  length: 64,
  width: 32,
  accel: 460,
  brake: 900,
  reverseAccel: 300,
  maxSpeed: 560,
  maxReverse: 190,
  turnRate: 2.6,
  grip: 0.94,
  health: 100,
};

export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 42;
export const MAX_COPS = 8;

export const WANTED = {
  decaySeconds: 26,
  copCarsPerStar: 2,
  roadblockAt: 3,
  heliAt: 4,
};

export const WEAPONS = {
  fists: { name: 'FISTS', damage: 12, rate: 0.32, range: 42, ammo: Infinity, auto: false },
  pistol: { name: 'PISTOL', damage: 34, rate: 0.28, range: 420, ammo: 12, reserve: 96, auto: false },
  smg: { name: 'SMG', damage: 16, rate: 0.09, range: 380, ammo: 30, reserve: 180, auto: true },
};

export const CAR_TYPES = {
  sedan: { length: 64, width: 32, accel: 430, maxSpeed: 520, color: '#c94f43' },
  coupe: { length: 60, width: 30, accel: 480, maxSpeed: 560, color: '#e8b23a' },
  sports: { length: 62, width: 30, accel: 560, maxSpeed: 660, color: '#3a7bd5' },
  taxi: { length: 64, width: 32, accel: 430, maxSpeed: 520, color: '#f2c200' },
  van: { length: 78, width: 34, accel: 340, maxSpeed: 430, color: '#8a8f98' },
  truck: { length: 92, width: 36, accel: 300, maxSpeed: 400, color: '#5d7a52' },
  police: { length: 66, width: 32, accel: 520, maxSpeed: 620, color: '#1c2733' },
  muscle: { length: 68, width: 34, accel: 500, maxSpeed: 590, color: '#7a2e8f' },
};

export const CAR_COLORS = [
  '#c94f43', '#e8b23a', '#3a7bd5', '#4fae62', '#8a8f98', '#e8e4da',
  '#7a2e8f', '#2e8f7a', '#d56a3a', '#37415c', '#a33a5c', '#5c7a3a',
];

export const DISTRICTS = {
  downtown: { name: 'Downtown', ground: '#6f6a63', building: ['#7d8aa0', '#5d6b84', '#8fa3bd', '#6b7f9e'], roof: '#3d4657', tall: true },
  oldtown: { name: 'Old Town', ground: '#7a6a58', building: ['#a67c52', '#8f6b48', '#b08a5e', '#96684a'], roof: '#6b4f38', tall: false },
  marina: { name: 'Marina', ground: '#77808a', building: ['#7fa8b8', '#5f8a9e', '#93b7c4', '#6b94a6'], roof: '#41586a', tall: false },
  industrial: { name: 'Industrial Quarter', ground: '#6a6a66', building: ['#7a7568', '#6b6a62', '#857c6e', '#5f5b52'], roof: '#46443e', tall: false },
  hills: { name: 'The Hills', ground: '#5f7a52', building: ['#b08a6e', '#9c7a5e', '#c09a7a', '#8a6f56'], roof: '#5d4a3a', tall: false },
  beachfront: { name: 'Beachfront', ground: '#8a7f68', building: ['#e8dcc8', '#d8c8a8', '#c8b898', '#efe8d8'], roof: '#7a6a52', tall: true },
};

/** Which district a block (col,row) belongs to. */
export function districtOf(col, row) {
  if (col >= 6 && row >= 2) return 'beachfront';
  if (col >= 6) return 'marina';
  if (row >= 3 && col <= 2) return 'industrial';
  if (row >= 3) return 'hills';
  if (col <= 2) return 'oldtown';
  return 'downtown';
}

export const RESPECT_RANKS = [
  { at: 0, name: 'WHEELMAN' },
  { at: 2, name: 'HUSTLER' },
  { at: 4, name: 'SHOT CALLER' },
  { at: 6, name: 'BAY LEGEND' },
];

export function respectName(missionsDone) {
  let name = RESPECT_RANKS[0].name;
  for (const rank of RESPECT_RANKS) if (missionsDone >= rank.at) name = rank.name;
  return name;
}

/** Clock: the game starts in the golden hour and drifts toward dusk. */
export const DAY = {
  startHour: 16.2,
  secondsPerHour: 240,
};
