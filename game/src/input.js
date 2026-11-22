// Keyboard + mouse state, kept as one plain object the game loop reads.
// Keys are tracked by their `code` (KeyW, ArrowUp, Space, ...). Mouse position
// is in canvas pixels; clicks are consumed as one-shot events.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(), // one-shot: cleared by the loop after each step
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    mouseClicked: false,
    wheel: 0,
  };

  const down = (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F5'].includes(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
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
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mousedown', click);
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  input.isDown = (code) => input.keys.has(code);
  input.wasPressed = (code) => input.pressed.has(code);
  input.axis = () => {
    let x = 0;
    let y = 0;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) x -= 1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) x += 1;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) y -= 1;
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) y += 1;
    return { x, y };
  };
  input.endStep = () => {
    input.pressed.clear();
    input.mouseClicked = false;
  };
  return input;
}
