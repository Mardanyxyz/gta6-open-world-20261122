// Keyboard + mouse input. Keys are held state; presses are one-shot actions
// consumed by takeActions() so a single tap never fires twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_RELOAD = 8;
export const ACTION_RADIO = 16;
export const ACTION_MUTE = 32;
export const ACTION_WEAPON_NEXT = 64;
export const ACTION_SAVE = 128;

const KEY_ACTIONS = {
  Space: ACTION_CONFIRM,
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER_CAR,
  KeyR: ACTION_RELOAD,
  KeyC: ACTION_RADIO,
  KeyM: ACTION_MUTE,
  KeyQ: ACTION_WEAPON_NEXT,
  KeyF: ACTION_SAVE,
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let mouseX = 0, mouseY = 0, mouseDown = false, mousePressed = false;
  let lastKey = '';

  function onKeyDown(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
    lastKey = e.code;
  }
  function onKeyUp(e) { held.delete(e.code); }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  }
  function onMouseDown(e) {
    onMouseMove(e);
    if (!mouseDown) mousePressed = true;
    mouseDown = true;
  }
  function onMouseUp() { mouseDown = false; }
  function onBlur() { held.clear(); mouseDown = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    // Normalised WASD / arrow movement vector.
    move() {
      let x = 0, y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },
    sprint() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    handbrake() { return held.has('Space'); },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown, pressed: mousePressed }; },
    consumeMousePress() { mousePressed = false; },
    lastKey() { return lastKey; },
    takeActions() {
      let out = 0;
      for (const code of pressed) {
        const a = KEY_ACTIONS[code];
        if (a) out |= a;
      }
      pressed.clear();
      return out;
    },
    anyKey() { const k = pressed.size > 0 || mousePressed; pressed.clear(); return k; },
  };
}
