// Save / load: one localStorage slot, written at the safehouse and after
// every completed mission. Nothing leaves the browser.

const KEY = 'solara-bay-save-v1';

export function hasSave() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(world) {
  try {
    const p = world.player;
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      money: world.money,
      missionsDone: world.missionsDone,
      hour: world.hour,
      player: {
        x: p.inCar ? p.inCar.x : p.x,
        y: p.inCar ? p.inCar.y : p.y,
        health: p.health,
        weapons: p.weapons,
        ammo: p.ammo,
        reserve: p.reserve,
      },
      garage: world.garage.map((c) => ({ type: c.type, color: c.color })),
      stats: world.stats,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function applySave(world, data) {
  world.money = data.money;
  world.missionsDone = data.missionsDone;
  world.hour = data.hour ?? 16.2;
  const p = world.player;
  p.x = data.player.x;
  p.y = data.player.y;
  p.health = data.player.health;
  p.weapons = data.player.weapons;
  p.ammo = data.player.ammo;
  p.reserve = data.player.reserve;
  p.weapon = p.weapons[p.weapons.length - 1] ?? 'fists';
  world.garage = data.garage ?? [];
  world.stats = data.stats ?? world.stats;
  world.camera.x = p.x;
  world.camera.y = p.y;
  world.pendingNext = 1;
  return true;
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
