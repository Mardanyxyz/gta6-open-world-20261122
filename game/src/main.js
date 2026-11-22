// Solara Bay — entry point. Owns the screens (title / play / pause /
// busted-wasted / won), the fixed-step loop, and the mapping from keyboard
// and mouse to the normalized controls simulate.js steps. In screenshot mode
// (?shot=cover|chase|mission|menu) it stages one deterministic scene, renders
// it once, and stops — that frame is what the dossier ships.

import { TICK } from './config.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { createGame, stepGame, resetAfterFail } from './simulate.js';
import { startMission } from './missions.js';
import { loadSave, applySave, saveGame, hasSave } from './save.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? 7) || 7;

const input = createInput(canvas);
const renderer = createRenderer(canvas);
const audio = createAudio();

function fit() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', fit);
fit();

let world = createGame(seed);
let screen = 'title';
let titleDrift = 0;

// ---- Screenshot mode: one staged frame, then stop. ----
const shotName = params.get('shot');
if (shotName) {
  screen = stageShot(shotName, world);
  renderer.render(world, screen, input, audio);
  statusEl.textContent = `Solara Bay — ${shotName} scene`;
  window.__shotDone = true;
} else {
  // ---- Live game. ----
  window.addEventListener('keydown', () => audio.ensure(), { once: true });
  canvas.addEventListener('mousedown', () => audio.ensure(), { once: true });

  function buildControls() {
    const axis = input.axis();
    const { w, h } = renderer.view();
    const aimWorldX = world.camera.x + (input.mouseX - w / 2);
    const aimWorldY = world.camera.y + (input.mouseY - h / 2);
    const aim = Math.atan2(aimWorldY - world.player.y, aimWorldX - world.player.x);
    // Read E once: it is enter + interact + garage, and a second read
    // would see nothing (one-shot presses are consumed on read).
    const ePressed = input.wasPressed('KeyE');
    return {
      move: axis,
      aim,
      fire: input.clicked(),
      fireHeld: input.mouseDown,
      handbrake: input.isDown('Space'),
      sprint: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
      enter: ePressed,
      interact: ePressed,
      garage: ePressed,
      weapon: input.wasPressed('Digit1') ? 'fists'
        : input.wasPressed('Digit2') ? 'pistol'
        : input.wasPressed('Digit3') ? 'smg' : null,
      reload: input.wasPressed('KeyR'),
      radio: input.wasPressed('KeyC'),
      mute: input.wasPressed('KeyM'),
      save: input.wasPressed('F5'),
    };
  }

  function clickButton() {
    if (!input.clicked()) return null;
    for (const b of renderer.buttons) {
      if (input.mouseX >= b.x && input.mouseX <= b.x + b.w && input.mouseY >= b.y && input.mouseY <= b.y + b.h) {
        return b.action;
      }
    }
    return null;
  }

  function newGame() {
    world = createGame(seed);
    screen = 'play';
    statusEl.textContent = 'Solara Bay — free roam. Head to the M marker to start mission 1.';
  }

  function continueGame() {
    const data = loadSave();
    world = createGame(seed);
    if (data) {
      applySave(world, data);
      screen = 'play';
      statusEl.textContent = `Solara Bay — welcome back, Rook. ${data.missionsDone} missions done.`;
    } else {
      screen = 'play';
    }
  }

  let last = performance.now();
  let acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;

    if (screen === 'title') {
      // Slow pan over downtown behind the menu.
      titleDrift += dt;
      world.camera.x = 2800 + Math.cos(titleDrift * 0.08) * 700;
      world.camera.y = 1400 + Math.sin(titleDrift * 0.06) * 500;
      world.time += dt;
      const action = clickButton();
      if (action === 'new') newGame();
      else if (action === 'continue') continueGame();
      else if (action === 'help') world.showHelp = true;
      else if (action === 'close-help') world.showHelp = false;
      if (input.wasPressed('Enter')) newGame();
    } else if (screen === 'play') {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        screen = 'pause';
      } else if (acc >= TICK) {
        // Build the controls only when a step will actually run: building
        // them consumes the one-shot keys, and a frame with no step would
        // swallow a tap of E entirely.
        const controls = buildControls();
        let steps = 0;
        while (acc >= TICK && steps < 5) {
          const result = stepGame(world, controls, TICK, audio);
          acc -= TICK;
          steps += 1;
          // One-shot keys are consumed by the first step of the frame, so a
          // slow frame running two steps never enters AND exits a car.
          controls.enter = false;
          controls.interact = false;
          controls.garage = false;
          controls.fire = false;
          controls.weapon = null;
          controls.reload = false;
          controls.radio = false;
          controls.mute = false;
          controls.save = false;
          if (result === 'won') {
            screen = 'won';
            break;
          }
          if (result === 'busted' || result === 'wasted') {
            screen = 'over';
            break;
          }
        }
        if (steps === 5) acc = 0;
      }
    } else if (screen === 'pause') {
      const action = clickButton();
      if (action === 'resume' || input.wasPressed('KeyP') || input.wasPressed('Escape')) screen = 'play';
      else if (action === 'save') {
        saveGame(world);
        world.saveFlash = 2;
      } else if (action === 'title') {
        world = createGame(seed);
        screen = 'title';
      }
    } else if (screen === 'over') {
      const action = clickButton();
      if (action === 'retry' || input.wasPressed('KeyR')) {
        resetAfterFail(world);
        screen = 'play';
      } else if (action === 'title' || input.wasPressed('Enter')) {
        world = createGame(seed);
        screen = 'title';
      }
    } else if (screen === 'won') {
      const action = clickButton();
      if (action === 'free-roam' || input.wasPressed('KeyR')) {
        world.over = false;
        world.overKind = null;
        screen = 'play';
      } else if (action === 'title' || input.wasPressed('Enter')) {
        world = createGame(seed);
        screen = 'title';
      }
    }

    renderer.render(world, screen, input, audio);
    input.endStep();
  }

  requestAnimationFrame(frame);

  // Test hooks: the play-test drives the real game through these.
  window.SOLARA = {
    get world() { return world; },
    get screen() { return screen; },
    newGame,
    continueGame,
    startMission: (i) => startMission(world, i),
    resetAfterFail: () => resetAfterFail(world),
    setScreen: (s) => { screen = s; },
  };
}
