// The story of Solara Bay: six missions for Rio "Rook" Santana, from his
// first stolen car to the biggest score in the city's history.
// Each mission is a small state machine: start() sets it up, update() returns
// 'done' when the last step lands, objective() is the HUD line, and marker()
// is the yellow blip on the minimap and the arrow on screen. Between missions
// the next one waits at the safehouse — walk into the M marker to start it.

import { WORLD } from './config.js';
import { range, int, dist, angleTo } from './random.js';
import { makeCar, addWanted, addMessage, playerPos, playerDist, spawnParticles } from './world.js';
import { giveWeapon, spawnEnemy } from './combat.js';
import { clearHeat } from './police.js';

export function setDialogue(world, lines, onDone) {
  world.dialogue = { lines, index: 0, onDone: onDone ?? null };
}

export function advanceDialogue(world) {
  const d = world.dialogue;
  if (!d) return;
  d.index += 1;
  if (d.index >= d.lines.length) {
    const cb = d.onDone;
    world.dialogue = null;
    if (cb) cb();
  }
}

function markerAt(world, x, y, label) {
  return { x, y, label: label ?? '' };
}

const RACE_POINTS = [
  { x: 2800, y: 280 }, { x: 4480, y: 280 }, { x: 4480, y: 1680 },
  { x: 2800, y: 1680 }, { x: 1120, y: 1680 }, { x: 1120, y: 280 },
];

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: '1 — First Wheels',
    giver: 'Mia',
    payout: 500,
    briefing: [
      { who: 'MIA', text: 'Rook. You are in my city now, and in my city nobody walks. See that blue coupe by the house? It is yours. The rest are not — yet.' },
      { who: 'MIA', text: 'Walk up to any car and press E to take it. Then bring it home to the garage. Try not to scratch the paint. Actually — scratch it. Paint is cheap.' },
    ],
    start(world) {
      world.mission.data = { stage: 0 };
    },
    objective(world) {
      return world.mission.data.stage === 0
        ? 'Steal a car — walk up to one and press E'
        : 'Drive home to the garage';
    },
    marker(world) {
      if (world.mission.data.stage === 0) return null;
      return markerAt(world, world.city.specials.garage.doorX, world.city.specials.garage.doorY, 'GARAGE');
    },
    update(world) {
      const d = world.mission.data;
      if (d.stage === 0 && world.player.inCar) {
        d.stage = 1;
        addMessage(world, 'Nice. Now bring it home.', '#ffd76a');
      } else if (d.stage === 1) {
        const g = world.city.specials.garage;
        if (world.player.inCar && playerDist(world, g.doorX, g.doorY) < 90) return 'done';
      }
      return null;
    },
  },
  {
    id: 'the-pickup',
    title: '2 — The Pickup',
    giver: 'Big Lou',
    payout: 800,
    briefing: [
      { who: 'BIG LOU', text: 'Rook, I hear you drive. A package is waiting at the docks — Pier 9, east side. Bring it to the Solara Hotel on the beach. No detours, no sightseeing.' },
      { who: 'MIA', text: 'Take my pistol, Rook. The docks are not a friendly place after dark. Press 2 to draw it, click to fire, R to reload.' },
    ],
    start(world) {
      world.mission.data = { stage: 0, tipped: false };
      giveWeapon(world, 'pistol');
      world.player.ammo.pistol = Math.max(world.player.ammo.pistol, 24);
      world.player.reserve.pistol += 48;
    },
    objective(world) {
      const d = world.mission.data;
      if (d.stage === 0) return 'Drive to the docks — Pier 9';
      if (d.stage === 1) return 'Get out and grab the package (E)';
      return 'Deliver the package to the Solara Hotel';
    },
    marker(world) {
      const d = world.mission.data;
      const s = world.city.specials;
      if (d.stage === 0) return markerAt(world, s.docks.cx, s.docks.cy, 'DOCKS');
      if (d.stage === 1) return markerAt(world, s.docks.cx, s.docks.cy, 'PACKAGE');
      return markerAt(world, s.hotel.doorX, s.hotel.doorY, 'HOTEL');
    },
    update(world) {
      const d = world.mission.data;
      const s = world.city.specials;
      if (d.stage === 0 && playerDist(world, s.docks.cx, s.docks.cy) < 110) {
        d.stage = 1;
        addMessage(world, 'The package is on the crate. Grab it.', '#ffd76a');
      } else if (d.stage === 1) {
        if (!world.player.inCar && playerDist(world, s.docks.cx, s.docks.cy) < 70 && world.inputAction) {
          d.stage = 2;
          world.mission.data.hasPackage = true;
          addMessage(world, 'Package secured. Move!', '#ffd76a');
        }
      } else if (d.stage === 2) {
        if (!d.tipped && playerDist(world, s.hotel.doorX, s.hotel.doorY) < 700) {
          d.tipped = true;
          addWanted(world, 1, 'someone tipped off the cops');
        }
        if (playerDist(world, s.hotel.doorX, s.hotel.doorY) < 100) return 'done';
      }
      return null;
    },
  },
  {
    id: 'getaway',
    title: '3 — Getaway',
    giver: 'Big Lou',
    payout: 1500,
    briefing: [
      { who: 'BIG LOU', text: 'The crew hits the First Bay Bank at noon. You are the wheel. Park outside, wait for my word, and when the alarms go — you drive like the whole city is on fire. Because it will be.' },
      { who: 'MIA', text: 'I tuned your car, Rook. And I left something in the glovebox. Press 2 for the pistol, and — new toy — an SMG is in there too when things get loud.' },
    ],
    start(world) {
      world.mission.data = { stage: 0, wait: 0, cps: 0 };
      giveWeapon(world, 'smg');
      world.player.ammo.smg = 30;
      world.player.reserve.smg += 90;
    },
    objective(world) {
      const d = world.mission.data;
      if (d.stage === 0) return 'Drive to the First Bay Bank';
      if (d.stage === 1) return 'Wait for the crew — stay by the bank';
      return `Escape! Reach checkpoint ${d.cps + 1} of 3`;
    },
    marker(world) {
      const d = world.mission.data;
      const s = world.city.specials;
      if (d.stage === 0 || d.stage === 1) return markerAt(world, s.bank.doorX, s.bank.doorY, 'BANK');
      const cps = [
        { x: 1120, y: 280 }, { x: 4480, y: 2800 }, { x: 280, y: 2800 },
      ];
      return markerAt(world, cps[Math.min(d.cps, 2)].x, cps[Math.min(d.cps, 2)].y, `ESCAPE ${d.cps + 1}/3`);
    },
    update(world, dt) {
      const d = world.mission.data;
      const s = world.city.specials;
      if (d.stage === 0 && world.player.inCar && playerDist(world, s.bank.doorX, s.bank.doorY) < 130) {
        d.stage = 1;
        d.wait = 0;
        addMessage(world, 'The crew is inside. Hold position...', '#ffd76a');
      } else if (d.stage === 1) {
        d.wait += dt;
        if (playerDist(world, s.bank.doorX, s.bank.doorY) > 260) {
          d.wait = 0;
          addMessage(world, 'Too far! Get back to the bank!', '#ff5a4e');
        }
        if (d.wait >= 8) {
          d.stage = 2;
          addWanted(world, 3, 'the bank alarms are screaming');
          addMessage(world, 'GO GO GO! Lose them!', '#ff5a4e');
        }
      } else if (d.stage === 2) {
        const cps = [
          { x: 1120, y: 280 }, { x: 4480, y: 2800 }, { x: 280, y: 2800 },
        ];
        const cp = cps[d.cps];
        if (playerDist(world, cp.x, cp.y) < 110) {
          d.cps += 1;
          spawnParticles(world, cp.x, cp.y, 20, '#ffd76a', 200, 0.7, 4);
          if (d.cps >= 3) {
            clearHeat(world);
            return 'done';
          }
          addMessage(world, `Checkpoint ${d.cps} of 3 — keep moving!`, '#ffd76a');
        }
      }
      return null;
    },
  },
  {
    id: 'bay-street-race',
    title: '4 — Bay Street Race',
    giver: 'Vex',
    payout: 2500,
    briefing: [
      { who: 'VEX', text: 'So you are the new wheel in town. Cute. Tonight, six blocks, five gates, three of my best drivers. Beat them and the streets are yours. Lose and you walk home.' },
      { who: 'MIA', text: 'Vex plays dirty, Rook. Her drivers will ram you. Just stay on the gates — follow the yellow markers — and do not let them push you into a wall.' },
    ],
    start(world) {
      const rng = world.rng;
      world.mission.data = { stage: 0, cp: 0, finished: null, rivalsDone: 0 };
      world.race = { checkpoints: RACE_POINTS, rivals: [], rivalCp: [0, 0, 0], done: [false, false, false] };
      const start = { x: 2800, y: 840 };
      const colors = ['#a33a5c', '#2e8f7a', '#d56a3a'];
      for (let i = 0; i < 3; i += 1) {
        const car = makeCar('sports', start.x - 90 - i * 80, start.y + (i - 1) * 90, 0, colors[i], 'rival', rng);
        car.targetSpeed = 400 + i * 15;
        world.cars.push(car);
        world.race.rivals.push(car);
      }
    },
    objective(world) {
      const d = world.mission.data;
      if (d.stage === 0) return 'Drive to the race start — Bay Boulevard';
      if (d.finished) return 'Race over — see the results';
      return `Race! Gate ${d.cp + 1} of ${RACE_POINTS.length}`;
    },
    marker(world) {
      const d = world.mission.data;
      if (d.stage === 0) return markerAt(world, 2800, 840, 'RACE START');
      if (d.finished) return null;
      const cp = RACE_POINTS[d.cp];
      return markerAt(world, cp.x, cp.y, `GATE ${d.cp + 1}`);
    },
    update(world, dt) {
      const d = world.mission.data;
      if (d.stage === 0) {
        if (playerDist(world, 2800, 840) < 120) {
          d.stage = 1;
          addMessage(world, '3... 2... 1... GO!', '#ffd76a');
        }
        return null;
      }
      if (d.finished) return 'done';
      // Rivals: steer at their next gate, slide around buildings.
      const race = world.race;
      for (let i = 0; i < race.rivals.length; i += 1) {
        const car = race.rivals[i];
        if (race.done[i] || car.dead) continue;
        const cp = RACE_POINTS[race.rivalCp[i]];
        const want = angleTo(car.x, car.y, cp.x, cp.y);
        const diff = (want - car.angle + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        car.angle += Math.max(-1.6, Math.min(1.6, diff * 2)) * dt;
        car.speed += (car.targetSpeed - car.speed) * dt * 0.8;
        const nx = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny = car.y + Math.sin(car.angle) * car.speed * dt;
        if (!world.city.hitsBuilding(nx, ny, 26)) { car.x = nx; car.y = ny; }
        else { car.speed *= 0.4; car.angle += 0.9 * dt * 8; }
        if (dist(car.x, car.y, cp.x, cp.y) < 110) {
          race.rivalCp[i] += 1;
          if (race.rivalCp[i] >= RACE_POINTS.length) {
            race.done[i] = true;
            d.rivalsDone += 1;
            addMessage(world, `A rival finished — ${d.rivalsDone} ahead of you!`, '#ff9a4e');
          }
        }
      }
      // Player gates.
      const cp = RACE_POINTS[d.cp];
      if (playerDist(world, cp.x, cp.y) < 110) {
        d.cp += 1;
        spawnParticles(world, cp.x, cp.y, 20, '#ffd76a', 200, 0.7, 4);
        if (d.cp >= RACE_POINTS.length) {
          d.finished = true;
          const place = d.rivalsDone + 1;
          const payouts = [2500, 1200, 600, 300];
          world.mission.data.racePayout = payouts[place - 1];
          addMessage(world, place === 1 ? 'YOU WIN THE RACE!' : `You finished #${place}`, place === 1 ? '#ffd76a' : '#ffffff');
          for (const car of race.rivals) car.driver = 'traffic';
          world.race = null;
          return 'done';
        }
        addMessage(world, `Gate ${d.cp} of ${RACE_POINTS.length}`, '#ffd76a');
      }
      return null;
    },
  },
  {
    id: 'the-rescue',
    title: '5 — The Rescue',
    giver: 'Big Lou',
    payout: 2000,
    briefing: [
      { who: 'BIG LOU', text: 'They took Mia. The Vipers grabbed her off the Marina and they are holding her in the old warehouse, Industrial Quarter. Six of their boys, all armed.' },
      { who: 'BIG LOU', text: 'Go in loud, Rook. Get my girl out. And Rook — bring her home safe, or do not come home at all.' },
    ],
    start(world) {
      const w = world.city.specials.warehouse;
      world.mission.data = { stage: 0, guardsLeft: 6, mia: null };
      // Guards hold the yard around the warehouse — outside its walls, so
      // they are visible and can move. Three at the south door, the rest on
      // the flanks and the north side.
      const spots = [
        { x: w.cx - 120, y: w.y + w.h + 46 },
        { x: w.cx, y: w.y + w.h + 46 },
        { x: w.cx + 120, y: w.y + w.h + 46 },
        { x: w.x - 46, y: w.cy },
        { x: w.x + w.w + 46, y: w.cy },
        { x: w.cx, y: w.y - 46 },
      ];
      for (const s of spots) {
        spawnEnemy(world, s.x, s.y, { health: 70, role: 'viper' });
      }
    },
    objective(world) {
      const d = world.mission.data;
      if (d.stage === 0) return 'Reach the warehouse — Industrial Quarter';
      if (d.stage === 1) return `Take out the Vipers — ${d.guardsLeft} left`;
      if (d.stage === 2) return 'Reach Mia!';
      return 'Get Mia home to the safehouse!';
    },
    marker(world) {
      const d = world.mission.data;
      const s = world.city.specials;
      if (d.stage === 0 || d.stage === 1) return markerAt(world, s.warehouse.cx, s.warehouse.cy, 'WAREHOUSE');
      if (d.stage === 2) return markerAt(world, d.mia.x, d.mia.y, 'MIA');
      return markerAt(world, s.safehouse.doorX, s.safehouse.doorY, 'SAFEHOUSE');
    },
    update(world) {
      const d = world.mission.data;
      const s = world.city.specials;
      if (d.stage === 0 && playerDist(world, s.warehouse.cx, s.warehouse.cy) < 320) {
        d.stage = 1;
        addMessage(world, 'Six Vipers between you and Mia. Go loud.', '#ff5a4e');
      } else if (d.stage === 1) {
        const left = world.enemies.filter((e) => !e.dead && e.role === 'viper').length;
        d.guardsLeft = left;
        if (left === 0) {
          d.stage = 2;
          const w = world.city.specials.warehouse;
          d.mia = { x: w.doorX, y: w.doorY + 26 };
          addMessage(world, 'MIA: Rook! I knew you would come!', '#8fd6a0');
        }
      } else if (d.stage === 2) {
        if (playerDist(world, d.mia.x, d.mia.y) < 60) {
          d.stage = 3;
          addMessage(world, 'MIA: Let us go home. Drive, Rook!', '#8fd6a0');
        }
      } else if (d.stage === 3) {
        if (playerDist(world, s.safehouse.doorX, s.safehouse.doorY) < 120) return 'done';
      }
      return null;
    },
  },
  {
    id: 'the-big-score',
    title: '6 — The Big Score',
    giver: 'Big Lou',
    payout: 5000,
    briefing: [
      { who: 'BIG LOU', text: 'One last job, Rook. The Solara Diamond sits in the museum vault — one stone, eight million dollars, and a whole police department that wants it to stay there.' },
      { who: 'MIA', text: 'The vault door is on the south side. Grab the stone, get to the yacht at the docks, and do not stop for anything. Not the cops, not the helicopter — nothing.' },
      { who: 'BIG LOU', text: 'Do this and we are legends, kid. The whole Bay will know the name Rook.' },
    ],
    start(world) {
      world.mission.data = { stage: 0, hasDiamond: false };
    },
    objective(world) {
      const d = world.mission.data;
      if (d.stage === 0) return 'Reach the Solara Museum — Downtown';
      if (d.stage === 1) return 'Grab the Solara Diamond (E at the vault)';
      return 'Escape to the yacht at the docks — 5 stars!';
    },
    marker(world) {
      const d = world.mission.data;
      const s = world.city.specials;
      if (d.stage === 0 || d.stage === 1) return markerAt(world, s.museum.doorX, s.museum.doorY, 'MUSEUM');
      return markerAt(world, s.yacht.x, s.yacht.y, 'YACHT');
    },
    update(world) {
      const d = world.mission.data;
      const s = world.city.specials;
      if (d.stage === 0 && playerDist(world, s.museum.doorX, s.museum.doorY) < 130) {
        d.stage = 1;
        addMessage(world, 'The vault is inside. Go in on foot and grab it.', '#ffd76a');
      } else if (d.stage === 1) {
        if (!world.player.inCar && playerDist(world, s.museum.doorX, s.museum.doorY) < 60 && world.inputAction) {
          d.stage = 2;
          d.hasDiamond = true;
          addWanted(world, 5, 'the Solara Diamond is gone!');
          addMessage(world, 'THE DIAMOND IS YOURS! RUN!', '#ffd76a');
        }
      } else if (d.stage === 2) {
        if (playerDist(world, s.yacht.x, s.yacht.y) < 130) return 'done';
      }
      return null;
    },
  },
];

export function missionCount() {
  return MISSIONS.length;
}

/** Start mission `index` (0-based) on the world. */
export function startMission(world, index) {
  const def = MISSIONS[index];
  world.mission = { index, def, data: {}, startedAt: world.time };
  world.missionBanner = { title: def.title, giver: def.giver, t: 0 };
  def.start(world);
  setDialogue(world, def.briefing);
}

/** Complete the active mission: payout, respect, banner. Returns true. */
export function completeMission(world) {
  const m = world.mission;
  const payout = m.data.racePayout ?? m.def.payout;
  world.money += payout;
  world.missionsDone += 1;
  world.stats.missions += 1;
  addMessage(world, `MISSION COMPLETE — +$${payout}`, '#ffd76a');
  world.missionBanner = { title: `${m.def.title} — COMPLETE`, giver: `+$${payout}`, t: 0 };
  world.mission = null;
  world.pendingNext = 2.5; // seconds until the next mission marker appears
  // A small bonus pickup shower at the safehouse.
  return true;
}

/** The marker for the next mission while between missions. */
export function nextMissionMarker(world) {
  if (world.missionsDone >= MISSIONS.length) return null;
  const s = world.city.specials.safehouse;
  return markerAt(world, s.doorX, s.doorY - 40, 'M');
}
