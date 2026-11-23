// Rendering: the canvas world (roads, buildings with height and shadow,
// beach and bay, traffic, the player, effects), the HUD with a live minimap,
// and every menu screen. One draw() call paints a frame.
import { WORLD, DISTRICTS, PALETTE, CARS } from './config.js';
import { clamp, lerp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const CAR_COLOURS = { police: '#141428' };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 1280, viewH = 800;

  function resize() {
    viewW = canvas.clientWidth || window.innerWidth;
    viewH = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function daylight(clock) {
    // 6:00 sunrise, 12:00 noon, 18:00 golden hour, 21:00 night.
    if (clock < 6) return { sky: '#0d1526', tint: 'rgba(10,16,40,0.42)', sun: 0.2 };
    if (clock < 9) return { sky: '#f2a65a', tint: 'rgba(242,166,90,0.10)', sun: 0.55 };
    if (clock < 16) return { sky: '#7ec8e3', tint: 'rgba(126,200,227,0.03)', sun: 1 };
    if (clock < 19) return { sky: '#ff9a3c', tint: 'rgba(255,154,60,0.16)', sun: 0.8 };
    if (clock < 21) return { sky: '#5a3a6b', tint: 'rgba(90,58,107,0.24)', sun: 0.4 };
    return { sky: '#0d1526', tint: 'rgba(10,16,40,0.45)', sun: 0.15 };
  }

  function drawCar(c, x, y, zoom, light) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.angle);
    const L = 62, W = 34;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(4, 5, L / 2 + 2, W / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
    // Body.
    ctx.fillStyle = c.colour || '#888';
    roundRect(-L / 2, -W / 2, L, W, 9); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(-L / 2, -W / 2, L, 8, 6); ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = '#1c2733';
    roundRect(-L / 2 + 16, -W / 2 + 5, 22, W - 10, 5); ctx.fill();
    ctx.fillStyle = 'rgba(140,200,255,0.5)';
    ctx.fillRect(-L / 2 + 18, -W / 2 + 6, 5, W - 12);
    // Headlights / taillights.
    ctx.fillStyle = light ? '#fff6b0' : '#ffe98a';
    ctx.fillRect(L / 2 - 3, -W / 2 + 3, 3, 7);
    ctx.fillRect(L / 2 - 3, W / 2 - 10, 3, 7);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-L / 2, -W / 2 + 3, 3, 7);
    ctx.fillRect(-L / 2, W / 2 - 10, 3, 7);
    if (c.kind === 'police') {
      ctx.fillStyle = '#ecf0f1';
      ctx.fillRect(-L / 2 + 6, -W / 2 + 2, L - 12, 5);
      ctx.fillStyle = '#ecf0f1';
      ctx.fillRect(-L / 2 + 6, W / 2 - 7, L - 12, 5);
      const blink = Math.floor(performance.now() / 220) % 2 === 0;
      ctx.fillStyle = blink ? '#ff2d55' : '#2d7bff';
      ctx.beginPath(); ctx.arc(2, -6, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = blink ? '#2d7bff' : '#ff2d55';
      ctx.beginPath(); ctx.arc(2, 6, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (c.kind === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    if (c.burning) {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath(); ctx.arc(-6, 0, 10 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPed(ped, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ped.angle);
    const bob = Math.sin(ped.walkPhase) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 3, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(6, bob * 0.3, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPlayer(p, x, y, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.angle);
    const bob = p.moving ? Math.sin(time * 14) * 2.5 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 4, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
    // Jacket, arms, head — Rook in a teal jacket.
    ctx.fillStyle = '#0e7c7b';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(7, bob * 0.4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(4, -3, 3, 0, Math.PI * 2); ctx.fill();
    // Gun in hand.
    if (p.weapon !== 'fists') {
      ctx.fillStyle = '#222';
      ctx.fillRect(8, -2, 14, 4);
    } else if (p.punchTimer > 0) {
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath(); ctx.arc(16, 0, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawWorld(state, cam) {
    const city = state.city;
    const zoom = cam.zoom;
    const ox = viewW / 2 - cam.x * zoom;
    const oy = viewH / 2 - cam.y * zoom;
    const day = daylight(state.clock);
    const t = state.time;

    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, viewW, viewH);

    // Visible bounds, in world coordinates.
    const vx0 = cam.x - viewW / 2 / zoom - 80, vy0 = cam.y - viewH / 2 / zoom - 80;
    const vx1 = cam.x + viewW / 2 / zoom + 80, vy1 = cam.y + viewH / 2 / zoom + 80;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(zoom, zoom);

    // Water + sand along the south edge and the south-east bay.
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(vx0, 4620, vx1 - vx0, vy1 - 4620);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(vx0, 4620, vx1 - vx0, 60);
    for (let wx = Math.floor(vx0 / 90) * 90; wx < vx1; wx += 90) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wx, 4640 + Math.sin(t * 1.4 + wx * 0.05) * 4);
      ctx.lineTo(wx + 46, 4640 + Math.sin(t * 1.4 + wx * 0.05 + 1) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(vx0, 4300, vx1 - vx0, 320);
    // Beach umbrellas.
    ctx.fillStyle = '#e74c3c';
    for (let ux = 1100; ux < 4200; ux += 420) {
      ctx.beginPath(); ctx.arc(ux, 4460, 16, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.arc(ux + 210, 4520, 16, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#e74c3c';
    }

    // Parks.
    ctx.fillStyle = PALETTE.park;
    for (const pk of city.parks) {
      if (pk.x > vx1 || pk.x + pk.w < vx0 || pk.y > vy1 || pk.y + pk.h < vy0) continue;
      ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    }

    // Roads: asphalt, sidewalks, centre dashes, crosswalks.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of city.roadsV) ctx.fillRect(rx - WORLD.roadWidth / 2 - WORLD.sidewalk, vy0, WORLD.roadWidth + WORLD.sidewalk * 2, vy1 - vy0);
    for (const ry of city.roadsH) ctx.fillRect(vx0, ry - WORLD.roadWidth / 2 - WORLD.sidewalk, vx1 - vx0, WORLD.roadWidth + WORLD.sidewalk * 2);
    ctx.fillStyle = PALETTE.road;
    for (const rx of city.roadsV) ctx.fillRect(rx - WORLD.roadWidth / 2, vy0, WORLD.roadWidth, vy1 - vy0);
    for (const ry of city.roadsH) ctx.fillRect(vx0, ry - WORLD.roadWidth / 2, vx1 - vx0, WORLD.roadWidth);
    ctx.fillStyle = PALETTE.roadLine;
    for (const rx of city.roadsV) {
      for (let y = Math.floor(vy0 / 46) * 46; y < vy1; y += 46) ctx.fillRect(rx - 2, y, 4, 24);
    }
    for (const ry of city.roadsH) {
      for (let x = Math.floor(vx0 / 46) * 46; x < vx1; x += 46) ctx.fillRect(x, ry - 2, 24, 4);
    }
    // Crosswalks at intersections.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const rx of city.roadsV) for (const ry of city.roadsH) {
      if (rx < vx0 || rx > vx1 || ry < vy0 || ry > vy1) continue;
      for (let i = -3; i <= 3; i++) ctx.fillRect(rx + i * 9 - 3, ry - WORLD.roadWidth / 2 - 8, 6, 16);
    }

    // Landmarks.
    for (const l of city.landmarks) {
      if (l.x < vx0 - 200 || l.x > vx1 + 200 || l.y < vy0 - 200 || l.y > vy1 + 200) continue;
      const w = l.kind === 'stadium' ? 320 : l.kind === 'warehouse' ? 260 : 150;
      const h = l.kind === 'stadium' ? 220 : l.kind === 'warehouse' ? 170 : 110;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(l.x - w / 2 + 8, l.y - h / 2 + 10, w, h);
      ctx.fillStyle = l.colour;
      ctx.fillRect(l.x - w / 2, l.y - h / 2, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(l.x - w / 2, l.y - h / 2, w, 12);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(l.name.toUpperCase(), l.x, l.y + 5);
    }

    // Buildings with height: roof, lit windows, drop shadow.
    const night = day.sun < 0.4;
    for (const b of city.buildings) {
      if (b.x > vx1 || b.x + b.w < vx0 || b.y > vy1 || b.y + b.h < vy0) continue;
      const hgt = b.height * 0.55;
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(b.x + hgt * 0.4, b.y + hgt * 0.4, b.w, b.h);
      ctx.fillStyle = b.colour;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x, b.y, b.w, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x, b.y + b.h - 6, b.w, 6);
      if (b.roof === 'garden') {
        ctx.fillStyle = '#4a7a3a';
        ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
      } else if (b.roof === 'pool') {
        ctx.fillStyle = '#3a9ad9';
        ctx.fillRect(b.x + b.w * 0.25, b.y + b.h * 0.25, b.w * 0.5, b.h * 0.4);
      }
      if (night) {
        ctx.fillStyle = 'rgba(255,214,120,0.85)';
        const cols = Math.floor(b.w / 26), rows = Math.floor(b.h / 26);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          if ((i * 7 + j * 13 + Math.floor(b.x)) % 5 === 0) ctx.fillRect(b.x + 8 + i * 26, b.y + 8 + j * 26, 10, 8);
        }
      }
    }

    // Trees.
    for (const tr of city.trees) {
      if (tr.x < vx0 || tr.x > vx1 || tr.y < vy0 || tr.y > vy1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(tr.x + 4, tr.y + 5, tr.r, tr.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f6b2f';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a8a3a';
      ctx.beginPath(); ctx.arc(tr.x - 3, tr.y - 3, tr.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }

    // Pickups.
    for (const pk of state.pickups) {
      const bobY = Math.sin(t * 3 + pk.bob) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bobY);
      if (pk.kind === 'health') { ctx.fillStyle = '#fff'; ctx.fillRect(-11, -11, 22, 22); ctx.fillStyle = '#e74c3c'; ctx.fillRect(-3, -8, 6, 16); ctx.fillRect(-8, -3, 16, 6); }
      else if (pk.kind === 'armour') { ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', 0, 4); }
      else if (pk.kind === 'cash') { ctx.fillStyle = '#2ecc71'; ctx.fillRect(-11, -7, 22, 14); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 4); }
      else { ctx.fillStyle = '#f1c40f'; ctx.fillRect(-9, -9, 18, 18); ctx.fillStyle = '#111'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('AMMO', 0, 3); }
      ctx.restore();
    }

    // Mission marker (pulsing).
    const marker = state.mission ? (state.mission.target || state.mission.marker) : null;
    const nextMarker = marker || (state.missionIndex < 6 ? { x: 1180, y: 1300 } : null);
    if (nextMarker && state.missionIndex < 6) {
      const pulse = 1 + Math.sin(t * 4) * 0.18;
      ctx.save();
      ctx.translate(nextMarker.x, nextMarker.y);
      ctx.strokeStyle = state.mission ? '#f1c40f' : '#2ecc71';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = state.mission ? '#f1c40f' : '#2ecc71';
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Cars (player car last so it draws on top).
    const cars = [...state.cars].sort((a, b) => (a.driver === 'player' ? 1 : 0) - (b.driver === 'player' ? 1 : 0));
    for (const c of cars) {
      if (c.x < vx0 - 100 || c.x > vx1 + 100 || c.y < vy0 - 100 || c.y > vy1 + 100) continue;
      drawCar(c, c.x, c.y, zoom, night);
      if (c.smoke > 0 && !c.burning) {
        ctx.fillStyle = 'rgba(120,120,120,0.5)';
        ctx.beginPath(); ctx.arc(c.x, c.y - 10, 10 + Math.sin(t * 6) * 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Enemies.
    for (const e of state.enemies) {
      if (e.dead) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 4, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = e.colour;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath(); ctx.arc(6, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(8, -2, 16, 4);
      ctx.restore();
      // Health bar.
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - 14, e.y - 22, 28, 4);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(e.x - 14, e.y - 22, 28 * clamp(e.health / 80, 0, 1), 4);
    }

    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.x < vx0 || ped.x > vx1 || ped.y < vy0 || ped.y > vy1) continue;
      drawPed(ped, ped.x, ped.y);
    }

    // Player on foot.
    const p = state.player;
    if (!p.inCar) drawPlayer(p, p.x, p.y, t);

    // Bullets.
    ctx.fillStyle = '#ffe98a';
    for (const b of state.bullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Particles.
    for (const pt of state.particles) {
      const a = clamp(pt.life / pt.max, 0, 1);
      if (pt.kind === 'fire') ctx.fillStyle = `rgba(255,${Math.floor(120 * a)},0,${a})`;
      else if (pt.kind === 'smoke') ctx.fillStyle = `rgba(90,90,90,${a * 0.6})`;
      else if (pt.kind === 'blood') ctx.fillStyle = `rgba(180,20,20,${a})`;
      else if (pt.kind === 'flash') ctx.fillStyle = `rgba(255,240,150,${a})`;
      else ctx.fillStyle = `rgba(255,220,120,${a})`;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill();
    }

    // Helicopter spotlight.
    if (state.heli) {
      ctx.fillStyle = 'rgba(255,255,200,0.13)';
      ctx.beginPath();
      ctx.moveTo(state.heli.x, state.heli.y);
      ctx.arc(p.x, p.y, 130, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.ellipse(state.heli.x, state.heli.y, 26, 12, state.heli.angle, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();

    // Day / night tint over everything.
    ctx.fillStyle = day.tint;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function drawMinimap(state, cam) {
    const size = 208, pad = 16;
    const x0 = viewW - size - pad, y0 = pad;
    const scale = size / state.city.size;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,24,0.82)';
    roundRect(x0 - 6, y0 - 6, size + 12, size + 12, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    // Water + sand.
    ctx.fillStyle = '#1d4f78';
    ctx.fillRect(x0, y0 + size * (4620 / state.city.size), size, size);
    ctx.fillStyle = '#e0c184';
    ctx.fillRect(x0, y0 + size * (4300 / state.city.size), size, size * (320 / state.city.size));
    // Roads.
    ctx.strokeStyle = '#9a9a90';
    ctx.lineWidth = 2;
    for (const rx of state.city.roadsV) {
      ctx.beginPath(); ctx.moveTo(x0 + rx * scale, y0); ctx.lineTo(x0 + rx * scale, y0 + size); ctx.stroke();
    }
    for (const ry of state.city.roadsH) {
      ctx.beginPath(); ctx.moveTo(x0, y0 + ry * scale); ctx.lineTo(x0 + size, y0 + ry * scale); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = 'rgba(200,200,200,0.5)';
    for (const b of state.city.buildings) ctx.fillRect(x0 + b.x * scale, y0 + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
    // Mission marker.
    const marker = state.mission ? (state.mission.target || state.mission.marker) : null;
    if (marker) {
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.arc(x0 + marker.x * scale, y0 + marker.y * scale, 6, 0, Math.PI * 2); ctx.fill();
    }
    // Cops.
    ctx.fillStyle = '#2d7bff';
    for (const c of state.cops) {
      ctx.beginPath(); ctx.arc(x0 + c.x * scale, y0 + c.y * scale, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const p = state.player;
    ctx.save();
    ctx.translate(x0 + p.x * scale, y0 + p.y * scale);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    // Viewport box.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(x0 + cam.x * scale - (viewW / 2 / cam.zoom) * scale, y0 + cam.y * scale - (viewH / 2 / cam.zoom) * scale, (viewW / cam.zoom) * scale, (viewH / cam.zoom) * scale);
    ctx.restore();
    // North + district label.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('N', x0 + 4, y0 + size + 20);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(state.city.districtName(p.x, p.y), x0, y0 + size + 38);
  }

  function drawHUD(state) {
    const p = state.player;
    // Wanted stars.
    for (let i = 0; i < 5; i++) {
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = i < state.wanted ? '#ffd700' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', 18 + i * 32, 44);
    }
    // Cash + score.
    ctx.fillStyle = 'rgba(8,12,24,0.75)';
    roundRect(viewW - 224, 12, 208, 34, 8); ctx.fill();
    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`$${state.money.toLocaleString()}`, viewW - 28, 37);
    // Health + armour bars.
    ctx.fillStyle = 'rgba(8,12,24,0.75)';
    roundRect(14, 56, 220, 44, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(24, 66, 200, 10);
    ctx.fillStyle = p.health > 30 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(24, 66, 200 * clamp(p.health / 100, 0, 1), 10);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(24, 82, 200, 8);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(24, 82, 200 * clamp(p.armour / 100, 0, 1), 8);
    // Weapon.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    const mag = p.mags[p.weapon] ?? 0;
    const reserve = p.weapons[p.weapon] ?? 0;
    ctx.fillText(p.weapon === 'fists' ? 'FISTS' : `${p.weapon.toUpperCase()}  ${mag} / ${reserve}`, 24, 122);
    // Objective.
    ctx.fillStyle = 'rgba(8,12,24,0.72)';
    const objW = Math.min(520, viewW - 480);
    roundRect(14, viewH - 86, objW, 62, 8); ctx.fill();
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('OBJECTIVE', 26, viewH - 64);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(state.objective.slice(0, 72), 26, viewH - 42);
    // Clock + radio.
    const hh = Math.floor(state.clock), mm = Math.floor((state.clock - hh) * 60);
    ctx.fillStyle = 'rgba(8,12,24,0.72)';
    roundRect(viewW - 224, 56, 208, 30, 8); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  •  ${['Bay FM', 'Static 88', 'Talk'][state.radio]}`, viewW - 28, 76);
    // Speedometer (in car).
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 3.6);
      ctx.fillStyle = 'rgba(8,12,24,0.75)';
      roundRect(viewW - 150, viewH - 96, 134, 72, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(kmh), viewW - 40, viewH - 52);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText('km/h', viewW - 40, viewH - 34);
      // Car health.
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(viewW - 138, viewH - 28, 110, 7);
      ctx.fillStyle = p.inCar.health > 35 ? '#2ecc71' : '#e74c3c';
      ctx.fillRect(viewW - 138, viewH - 28, 110 * clamp(p.inCar.health / 100, 0, 1), 7);
    }
    // Mission counter.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Missions ${state.missionsDone}/6   •   Kills ${state.kills}   •   Cars stolen ${state.carsStolen}`, 24, 148);
    // Message + banner.
    if (state.messageTimer > 0 && state.message) {
      ctx.fillStyle = 'rgba(8,12,24,0.8)';
      const mw = ctx.measureText(state.message).width + 32;
      roundRect((viewW - mw) / 2, 64, mw, 34, 8); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.message, viewW / 2, 87);
    }
    if (state.bannerTimer > 0 && state.banner) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,12,24,0.55)';
      ctx.fillRect(0, viewH / 2 - 130, viewW, 92);
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText(state.banner.title, viewW / 2, viewH / 2 - 84);
      ctx.fillStyle = '#fff';
      ctx.font = '17px sans-serif';
      ctx.fillText(state.banner.sub, viewW / 2, viewH / 2 - 54);
    }
    // Controls hint.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('WASD move/drive • E enter car • Mouse aim • Click shoot • Q weapon • C radio • P pause', viewW - 16, viewH - 12);
  }

  function drawTitle(state, best) {
    // Sunset title screen over the live city.
    drawWorld(state, { x: 2400, y: 2200, zoom: 0.32 });
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, 'rgba(20,10,40,0.25)');
    g.addColorStop(1, 'rgba(20,10,40,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 84px Georgia, serif';
    ctx.fillText('SOLARA BAY', viewW / 2, viewH * 0.3);
    ctx.fillStyle = '#fff';
    ctx.font = 'italic 26px Georgia, serif';
    ctx.fillText('An open-world crime story', viewW / 2, viewH * 0.3 + 44);
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('RIO "ROOK" SANTANA  •  SIX MISSIONS  •  ONE BIG SCORE', viewW / 2, viewH * 0.3 + 84);
    // Menu card.
    ctx.fillStyle = 'rgba(8,12,24,0.82)';
    roundRect(viewW / 2 - 300, viewH * 0.52, 600, 210, 14); ctx.fill();
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('▶  PRESS SPACE OR CLICK TO START', viewW / 2, viewH * 0.52 + 52);
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#ccc';
    ctx.fillText('WASD move / drive  •  E steal & enter cars  •  Mouse aim, click to shoot', viewW / 2, viewH * 0.52 + 92);
    ctx.fillText('Q switch weapon  •  C radio  •  P pause  •  F save at the Safehouse', viewW / 2, viewH * 0.52 + 120);
    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`Best score: ${best}   •   Missions completed: ${state.missionsDone}/6`, viewW / 2, viewH * 0.52 + 158);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px sans-serif';
    ctx.fillText('An original game. No Rockstar content. Runs offline in your browser.', viewW / 2, viewH * 0.52 + 188);
  }

  function drawPaused(state) {
    ctx.fillStyle = 'rgba(8,12,24,0.72)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText('PAUSED', viewW / 2, viewH / 2 - 20);
    ctx.font = '17px sans-serif';
    ctx.fillStyle = '#ccc';
    ctx.fillText('Press P or Space to resume  •  F save at the Safehouse', viewW / 2, viewH / 2 + 24);
    ctx.fillText(`Cash $${state.money}  •  Missions ${state.missionsDone}/6  •  Wanted ${state.wanted}★`, viewW / 2, viewH / 2 + 56);
  }

  function drawOver(state, title, sub) {
    ctx.fillStyle = 'rgba(10,8,16,0.8)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = title === 'BUSTED' ? '#2d7bff' : '#e74c3c';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText(title, viewW / 2, viewH / 2 - 30);
    ctx.fillStyle = '#fff';
    ctx.font = '19px sans-serif';
    ctx.fillText(sub, viewW / 2, viewH / 2 + 14);
    ctx.fillStyle = '#ccc';
    ctx.font = '16px sans-serif';
    ctx.fillText('Press Space to continue from the Safehouse', viewW / 2, viewH / 2 + 58);
  }

  function drawWin(state) {
    ctx.fillStyle = 'rgba(10,20,12,0.85)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 64px Georgia, serif';
    ctx.fillText('THE SOLARA DIAMOND IS YOURS', viewW / 2, viewH / 2 - 40);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Rook pulled off the biggest score in Solara Bay history. Score ${state.score} • Cash $${state.money}`, viewW / 2, viewH / 2 + 8);
    ctx.fillStyle = '#ccc';
    ctx.font = '16px sans-serif';
    ctx.fillText('Press Space to keep roaming free', viewW / 2, viewH / 2 + 52);
  }

  return {
    resize,
    view() { return { w: viewW, h: viewH }; },
    draw(state, screen, best) {
      const p = state.player;
      const cam = state.camera || { x: p.x, y: p.y, zoom: 0.85 };
      if (screen === SCREEN_TITLE) { drawTitle(state, best); return; }
      drawWorld(state, cam);
      if (screen === SCREEN_PLAY) {
        drawMinimap(state, cam);
        drawHUD(state);
      } else if (screen === SCREEN_PAUSED) {
        drawMinimap(state, cam);
        drawHUD(state);
        drawPaused(state);
      } else if (screen === SCREEN_OVER) {
        drawOver(state, state.lastEnd === 'busted' ? 'BUSTED' : 'WASTED', state.lastEndText || 'The SBPD got you.');
      } else if (screen === SCREEN_WIN) {
        drawWin(state);
      }
    },
  };
}
