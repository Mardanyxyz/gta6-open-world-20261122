// Boot and the one loop for Solara Bay. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between title, play, paused, busted/wasted and win screens.
// ?seed=N fixes the city. ?shot=start|chase|mission|menu (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP, DAY_LENGTH } from './config.js';
import { createWorld } from './world.js';
import { createTraffic } from './traffic.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE } from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_WIN } from './render.js';
import { createAudio } from './audio.js';
import { stepGame } from './simulate.js';
import { stageShot } from './shots.js';
import { loadSave, applySave, readBest, saveBest, writeSave } from './save.js';
import { createRandom } from './random.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createWorld(seed);
createTraffic(state);
const renderer = createRenderer(canvas);
const audio = createAudio();

function announce(message) { status.textContent = message; }

// Camera: follows the player, pulls out with speed, zooms in on foot.
function updateCamera() {
  const p = state.player;
  const speed = p.inCar ? Math.abs(p.inCar.speed) : 0;
  const wantZoom = p.inCar ? 0.62 - Math.min(speed / 200, 0.14) : 0.92;
  const cam = state.camera || { x: p.x, y: p.y, zoom: wantZoom };
  cam.x += (p.x - cam.x) * 0.12;
  cam.y += (p.y - cam.y) * 0.12;
  cam.zoom += (wantZoom - cam.zoom) * 0.05;
  state.camera = cam;
  const view = renderer.view();
  state.viewW = view.w;
  state.viewH = view.h;
}

function runShot(name) {
  const scene = stageShot(name, state, renderer);
  state.viewW = renderer.view().w;
  state.viewH = renderer.view().h;
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, readBest());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const save = loadSave();
  if (save) applySave(state, save);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let sirenTimer = 0;

  function startGame() {
    audio.unlock();
    audio.setStation(state.radio);
    state.time = 0;
    screen = SCREEN_PLAY;
    announce('Playing Solara Bay. Steal a car and meet Mara at the Safehouse.');
  }

  function endRun(kind, text) {
    state.lastEnd = kind;
    state.lastEndText = text;
    screen = SCREEN_OVER;
    if (state.score > best) { best = state.score; saveBest(best); }
    announce(`${kind === 'busted' ? 'Busted' : 'Wasted'}. ${text}`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_OVER) { screen = SCREEN_PLAY; state.player.health = 100; announce('Back on the streets.'); }
      else if (screen === SCREEN_WIN) screen = SCREEN_PLAY;
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
    }
    // Click also starts from the title screen.
    const mouse = input.mouse();
    if (mouse.pressed && screen === SCREEN_TITLE) startGame();
    if (mouse.pressed && screen === SCREEN_OVER) { screen = SCREEN_PLAY; state.player.health = 100; }
    input.consumeMousePress();
    return actions;
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      // The city idles behind the title: traffic rolls, clock ticks.
      state.time += STEP;
      state.clock = (17.4 + state.time / DAY_LENGTH) % 24;
      return;
    }
    const beforeBusted = state.busted;
    const beforeWasted = state.wasted;
    stepGame(state, input, STEP, actions);
    // Audio cues.
    const p = state.player;
    audio.engine(p.inCar ? p.inCar.speed : 0, !!p.inCar && screen === SCREEN_PLAY);
    if (state.wanted > 0) {
      sirenTimer -= STEP;
      if (sirenTimer <= 0) { audio.siren(); sirenTimer = 1.6; }
    }
    audio.setMuted(state.muted);
    if (state.radio !== audio._station) { /* station changes are applied on C */ }
    if (state.busted && !beforeBusted) endRun('busted', 'The SBPD took you in. Cash lost, pride intact.');
    else if (state.wasted && !beforeWasted) endRun('wasted', 'You woke up in the hospital, lighter by a few hundred.');
    if (state.missionsDone >= 6 && screen === SCREEN_PLAY) {
      screen = SCREEN_WIN;
      if (state.score > best) { best = state.score; saveBest(best); }
      writeSave(state);
      announce('All six missions complete. Solara Bay is yours.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    updateCamera();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  });

  announce('Solara Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
void createRandom;
