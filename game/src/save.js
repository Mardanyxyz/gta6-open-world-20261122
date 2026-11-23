// Save / load: a small JSON record in localStorage, written at the Safehouse
// (F) and read back on the title screen. Best score is kept separately.
import { SAVE_KEY, BEST_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money,
      missionsDone: state.missionsDone,
      missionIndex: state.missionIndex,
      score: state.score,
      kills: state.kills,
      carsStolen: state.carsStolen,
      time: state.time,
      savedAt: new Date().toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

export function applySave(state, save) {
  if (!save) return;
  state.money = save.money ?? state.money;
  state.missionsDone = save.missionsDone ?? 0;
  state.missionIndex = save.missionIndex ?? 0;
  state.score = save.score ?? 0;
  state.kills = save.kills ?? 0;
  state.carsStolen = save.carsStolen ?? 0;
  state.objective = state.missionIndex < 6
    ? 'Continue: go to the mission marker'
    : 'All missions complete — free roam!';
}
