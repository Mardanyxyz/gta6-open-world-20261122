// Keyboard + mouse state, kept as one plain object the game loop reads.
// Keys are tracked by their `code` (KeyW, ArrowUp, Space, ...). Mouse position
// is in canvas pixels. One-shot presses are consumed on read (`wasPressed` /
// `clicked`), and a press nobody reads within 150 ms expires — so a quick tap
// is never dropped by landing between the frame's read and its cleanup, and a
// stale press never leaks into the next screen.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Map(), // code -> performance.now() when pressed
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    mouseClicked: false,
    mouseClickTime: 0,
    frame: 0,
  };

  const down = (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F5'].includes(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed.set(e.code, performance.now());
    input.keys.add(e.code);
  };
  const up = (e) => input.keys.delete(e.code);
  const move = (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
  };
  const click = (e) => {
    move(e);
    input.mouseDown = true;
    input.mouseClicked = true;
    input.mouseClickTime = performance.now();
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mousedown', click);
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  input.isDown = (code) => input.keys.has(code);
  /** True once per press; consumes it. */
  input.wasPressed = (code) => {
    if (!input.pressed.has(code)) return false;
    input.pressed.delete(code);
    return true;
  };
  /** True once per click; consumes it. */
  input.clicked = () => {
    if (!input.mouseClicked) return false;
    input.mouseClicked = false;
    return true;
  };
  input.axis = () => {
    let x = 0;
    let y = 0;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) x -= 1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) x += 1;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) y -= 1;
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) y += 1;
    return { x, y };
  };
  /** End of frame: expire presses nobody consumed within 150 ms. */
  input.endStep = () => {
    input.frame += 1;
    const now = performance.now();
    for (const [code, t] of input.pressed) {
      if (now - t > 150) input.pressed.delete(code);
    }
    if (input.mouseClicked && now - input.mouseClickTime > 150) input.mouseClicked = false;
  };
  return input;
}
