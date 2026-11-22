// Keyboard + mouse state as one plain object the game loop reads.
// Keys are tracked by `code` (KeyW, ArrowUp, Space, ...). Mouse position is
// in canvas pixels.
//
// One-shot presses are consumed on read (`wasPressed` / `clicked`), and a
// press nobody reads within 150 ms expires on its own. That pair of rules
// is what makes a quick tap of E never get dropped between frames and never
// leak into the next screen — a tap that lands between the frame's read and
// its cleanup is still there for the next read, and a stale one is gone.

const PRESS_TTL_MS = 150;
const SCROLL_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F5'];

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Map(), // code -> performance.now() of the keydown
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    mouseClicked: false,
    mouseClickTime: 0,
    frame: 0,
  };

  function onKeyDown(e) {
    if (SCROLL_KEYS.includes(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed.set(e.code, performance.now());
    input.keys.add(e.code);
  }
  function onKeyUp(e) {
    input.keys.delete(e.code);
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
  }
  function onMouseDown(e) {
    onMouseMove(e);
    input.mouseDown = true;
    input.mouseClicked = true;
    input.mouseClickTime = performance.now();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  input.isDown = (code) => input.keys.has(code);

  /** True exactly once per key press; consumes it. */
  input.wasPressed = (code) => {
    if (!input.pressed.has(code)) return false;
    input.pressed.delete(code);
    return true;
  };

  /** True exactly once per click; consumes it. */
  input.clicked = () => {
    if (!input.mouseClicked) return false;
    input.mouseClicked = false;
    return true;
  };

  /** WASD / arrows as a -1..1 movement vector. */
  input.axis = () => {
    const k = input.keys;
    return {
      x: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      y: (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0),
    };
  };

  /** End of frame: drop presses and clicks nobody consumed in time. */
  input.endStep = () => {
    input.frame += 1;
    const now = performance.now();
    for (const [code, t] of input.pressed) {
      if (now - t > PRESS_TTL_MS) input.pressed.delete(code);
    }
    if (input.mouseClicked && now - input.mouseClickTime > PRESS_TTL_MS) {
      input.mouseClicked = false;
    }
  };

  return input;
}
