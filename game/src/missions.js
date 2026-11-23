// Six story missions for Rio "Rook" Santana, a getaway driver new in Solara
// Bay. Each mission is a small state machine: intro dialogue, objectives that
// complete as the player acts, and a payout. Missions are started by driving
// or walking into the glowing marker on the map.
import { MISSION_REWARDS } from './config.js';
import { dist } from './random.js';
import { addMoney, showBanner, showMessage, setWanted, addWanted, giveWeapon, nearestCar } from './world.js';
import { spawnEnemy } from './combat.js';
import { makeCar } from './world.js';

export const MISSION_LIST = [
  {
    id: 'first-wheels', title: 'First Wheels', giver: 'Mara',
    brief: 'Steal any car and bring it to the Safehouse. Rook needs wheels before he can work.',
    marker: { x: 1180, y: 1300 },
  },
  {
    id: 'bank-job', title: 'The Bay Trust Job', giver: 'Mara',
    brief: 'Hit the Bay Trust Bank, grab the cash, then lose a 3-star wanted level. Drive fast, Rook.',
    marker: { x: 2400, y: 1560 },
  },
  {
    id: 'street-race', title: 'Sunset Grand Prix', giver: 'Dante',
    brief: 'Beat Dante through 5 checkpoints around the Marina. First across the line takes the pot.',
    marker: { x: 3900, y: 1500 },
  },
  {
    id: 'rescue', title: 'Get Lou Out', giver: 'Mara',
    brief: 'Lou is pinned down at the Dock Warehouse. Fight through the guards and bring him to the Safehouse.',
    marker: { x: 3400, y: 3100 },
  },
  {
    id: 'warehouse', title: 'Warehouse War', giver: 'Dante',
    brief: 'Clear the warehouse crew — 8 guards — then grab the shipment. Bring a gun. Bring two.',
    marker: { x: 3400, y: 3100 },
  },
  {
    id: 'museum-heist', title: 'The Solara Diamond', giver: 'Mara',
    brief: 'The big one: lift the Solara Diamond from the museum, then lose a 5-star lockdown and reach the Pier.',
    marker: { x: 2050, y: 1900 },
  },
];

export function startMission(state, index) {
  const def = MISSION_LIST[index];
  if (!def) return null;
  const m = {
    index, id: def.id, title: def.title, giver: def.giver, brief: def.brief,
    stage: 0, timer: 0, killsNeeded: 0, kills: 0,
    checkpoints: [], checkpointIndex: 0,
    target: null, marker: { ...def.marker },
    dialogue: [], dialogueIndex: 0,
    policeBoost: false, completed: false, failed: false,
  };
  state.mission = m;
  state.objective = def.brief;
  showBanner(state, def.title, `${def.giver}: ${def.brief}`);
  // Mission-specific setup.
  if (m.id === 'bank-job') {
    m.stage = 0; // 0 = reach bank, 1 = grab cash, 2 = escape
    m.target = { x: 2400, y: 1560 };
  } else if (m.id === 'street-race') {
    m.checkpoints = [
      { x: 3600, y: 1000 }, { x: 3000, y: 900 }, { x: 2500, y: 1900 },
      { x: 3400, y: 2400 }, { x: 3900, y: 1500 },
    ];
    m.raceCar = spawnRaceRival(state);
    m.target = m.checkpoints[0];
    m.raceProgress = 0;
  } else if (m.id === 'rescue' || m.id === 'warehouse') {
    const spots = [
      [3260, 2980], [3520, 2960], [3300, 3220], [3560, 3240],
      [3180, 3120], [3620, 3100], [3400, 2900], [3400, 3300],
    ];
    m.killsNeeded = m.id === 'warehouse' ? 8 : 4;
    for (let i = 0; i < m.killsNeeded; i++) {
      const [x, y] = spots[i];
      spawnEnemy(state, x, y, { health: 70, kind: 'crew' });
    }
    m.target = { x: 3400, y: 3100 };
    if (m.id === 'rescue') m.stage = 0; // 0 = clear guards, 1 = escort Lou home
  } else if (m.id === 'museum-heist') {
    for (const [x, y] of [[1960, 1820], [2140, 1820], [1960, 1980], [2140, 1980], [2050, 1740]]) {
      spawnEnemy(state, x, y, { health: 80, kind: 'museum-guard', colour: '#1b4f72' });
    }
    m.stage = 0; // 0 = reach museum, 1 = grab diamond, 2 = escape to pier
    m.target = { x: 2050, y: 1900 };
  }
  return m;
}

function spawnRaceRival(state) {
  const car = makeCar('sport', 3840, 1560, -Math.PI / 2, '#f1c40f');
  car.parked = false; car.driver = 'rival';
  state.cars.push(car);
  return car;
}

export function completeMission(state) {
  const m = state.mission;
  if (!m) return;
  const reward = MISSION_REWARDS[m.index] || 500;
  m.completed = true;
  state.missionsDone += 1;
  state.missionIndex = Math.min(state.missionIndex + 1, MISSION_LIST.length);
  addMoney(state, reward, `${m.title} complete`);
  showBanner(state, 'MISSION PASSED', `${m.title} — $${reward}`);
  state.objective = state.missionIndex < MISSION_LIST.length
    ? `Go to the ${MISSION_LIST[state.missionIndex].title} marker (${MISSION_LIST[state.missionIndex].giver})`
    : 'All missions complete — Solara Bay is yours. Free roam!';
  state.mission = null;
  state.wanted = Math.max(0, state.wanted - 1);
}

export function failMission(state, why) {
  const m = state.mission;
  if (!m) return;
  m.failed = true;
  showBanner(state, 'MISSION FAILED', why || 'Try again at the marker');
  state.mission = null;
  state.objective = 'Return to the mission marker to retry';
}

function atTarget(state, target, radius = 90) {
  const p = state.player;
  const x = p.inCar ? p.inCar.x : p.x;
  const y = p.inCar ? p.inCar.y : p.y;
  return dist(x, y, target.x, target.y) < radius;
}

export function stepMissions(state, dt) {
  const m = state.mission;
  if (!m) return;
  m.timer += dt;
  const p = state.player;

  if (m.id === 'first-wheels') {
    if (p.inCar && atTarget(state, { x: 1080, y: 1180 }, 130)) completeMission(state);
    else if (p.inCar) state.objective = 'Drive the stolen car to the Safehouse (orange house)';
  } else if (m.id === 'bank-job') {
    if (m.stage === 0 && atTarget(state, m.target, 90)) {
      m.stage = 1;
      addMoney(state, 600, 'Bank cash grabbed');
      setWanted(state, 3, 'bank');
      showMessage(state, 'Grab the cash and RUN — 3 stars!');
      m.target = { x: 1080, y: 1180 };
      state.objective = 'Lose the cops, then reach the Safehouse';
    } else if (m.stage === 1) {
      if (state.wanted === 0 && atTarget(state, m.target, 130)) completeMission(state);
      else if (state.wanted === 0) state.objective = 'Cops lost — reach the Safehouse';
      else state.objective = `Escape the police (${state.wanted} stars) — then Safehouse`;
    }
  } else if (m.id === 'street-race') {
    const cp = m.checkpoints[m.checkpointIndex];
    if (cp && atTarget(state, cp, 110)) {
      m.checkpointIndex += 1;
      m.raceProgress = m.checkpointIndex;
      showMessage(state, `Checkpoint ${m.checkpointIndex}/5`);
      if (m.checkpointIndex >= m.checkpoints.length) {
        completeMission(state);
        return;
      }
      m.target = m.checkpoints[m.checkpointIndex];
      state.objective = `Race: checkpoint ${m.checkpointIndex + 1}/5`;
    } else if (cp) {
      m.target = cp;
      state.objective = `Race: checkpoint ${m.checkpointIndex + 1}/5 — beat Dante!`;
    }
    // Rival drives the checkpoint route; if the player is far behind too long, Dante wins.
    if (m.raceCar) {
      const rival = m.raceCar;
      const rcp = m.checkpoints[Math.min(m.checkpointIndex, m.checkpoints.length - 1)];
      const want = Math.atan2(rcp.y - rival.y, rcp.x - rival.x);
      rival.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, want - rival.angle));
      rival.speed = Math.min(rival.speed + 20 * dt, 42);
      rival.x += Math.cos(rival.angle) * rival.speed * dt;
      rival.y += Math.sin(rival.angle) * rival.speed * dt;
    }
    if (m.timer > 150) failMission(state, 'Dante won the race');
  } else if (m.id === 'rescue') {
    const alive = state.enemies.filter((e) => !e.dead && e.health > 0).length;
    if (m.stage === 0) {
      state.objective = `Clear the warehouse guards (${m.killsNeeded - alive}/${m.killsNeeded})`;
      if (alive === 0) {
        m.stage = 1;
        m.target = { x: 1080, y: 1180 };
        showMessage(state, 'Lou is safe! Get him to the Safehouse');
        state.objective = 'Drive Lou to the Safehouse';
      }
    } else if (atTarget(state, m.target, 130)) completeMission(state);
  } else if (m.id === 'warehouse') {
    const alive = state.enemies.filter((e) => !e.dead && e.health > 0).length;
    state.objective = `Clear the crew (${m.killsNeeded - alive}/${m.killsNeeded} down)`;
    if (alive === 0) {
      addMoney(state, 800, 'Shipment seized');
      completeMission(state);
    }
  } else if (m.id === 'museum-heist') {
    if (m.stage === 0 && atTarget(state, m.target, 90)) {
      m.stage = 1;
      addWanted(state, 2);
      showMessage(state, 'Inside! Grab the diamond — alarms are going off');
      state.objective = 'Grab the Solara Diamond (walk into the gold case)';
      m.target = { x: 2050, y: 1900 };
    } else if (m.stage === 1) {
      if (!p.inCar && dist(p.x, p.y, 2050, 1900) < 46) {
        m.stage = 2;
        addMoney(state, 1500, 'Diamond lifted');
        setWanted(state, 5, 'museum');
        m.target = { x: 2500, y: 4480 };
        state.objective = 'Lose a 5-star lockdown, reach Sunset Pier';
        showMessage(state, '5 STARS! Lose them and reach the Pier!');
      }
    } else if (m.stage === 2) {
      if (state.wanted === 0 && atTarget(state, m.target, 130)) completeMission(state);
      else state.objective = `Escape (${state.wanted} stars), then reach Sunset Pier`;
    }
  }
}

// The glowing marker for the next mission, when no mission is active.
export function nextMissionMarker(state) {
  if (state.mission) return state.mission.target || state.mission.marker;
  if (state.missionIndex >= MISSION_LIST.length) return null;
  return MISSION_LIST[state.missionIndex].marker;
}

export function tryStartMission(state) {
  if (state.mission) return false;
  if (state.missionIndex >= MISSION_LIST.length) return false;
  const marker = MISSION_LIST[state.missionIndex].marker;
  const p = state.player;
  const x = p.inCar ? p.inCar.x : p.x;
  const y = p.inCar ? p.inCar.y : p.y;
  if (dist(x, y, marker.x, marker.y) < 120) {
    startMission(state, state.missionIndex);
    return true;
  }
  return false;
}
