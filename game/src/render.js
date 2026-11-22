// Rendering: the canvas view of Solara Bay, the HUD, the live minimap and
// every menu. The world is drawn top-down with a camera that follows the
// player; the time of day tints the light from golden hour into dusk. HUD and
// menus are drawn on the same canvas so a screenshot always shows the whole
// game — city, cars, police, HUD and minimap in one frame.

import { WORLD, DISTRICTS, districtOf, respectName } from './config.js';
import { clamp, lerp, dist, angleTo, fmtMoney } from './random.js';
import { vRoadX, hRoadY, isRoadAt } from './city.js';
import { MISSIONS } from './missions.js';
import { hasSave } from './save.js';

const { pitch, road } = WORLD;
const MAP_W = 232;
const MAP_H = 158;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = MAP_W;
  mapCanvas.height = MAP_H;
  const mapCtx = mapCanvas.getContext('2d');

  const renderer = {
    canvas, ctx,
    buttons: [], // {x,y,w,h,action,label} — main.js reads clicks against these
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
    },
    view() {
      return { w: canvas.width, h: canvas.height };
    },
  };

  function visible(world) {
    const { w, h } = renderer.view();
    const cam = world.camera;
    return {
      x0: cam.x - w / 2 - 80, y0: cam.y - h / 2 - 80,
      x1: cam.x + w / 2 + 80, y1: cam.y + h / 2 + 80,
      w, h,
    };
  }

  function drawGround(world, vis) {
    const c = ctx;
    // Base grass.
    c.fillStyle = '#5d7a4a';
    c.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
    // District ground per block.
    for (let col = 0; col < WORLD.cols; col += 1) {
      for (let row = 0; row < WORLD.rows; row += 1) {
        const x = col * pitch + road / 2;
        const y = row * pitch + road / 2;
        if (x > vis.x1 || y > vis.y1 || x + WORLD.block < vis.x0 || y + WORLD.block < vis.y0) continue;
        c.fillStyle = DISTRICTS[districtOf(col, row)].ground;
        c.fillRect(x, y, WORLD.block, WORLD.block);
        // Sidewalk edge.
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fillRect(x, y, WORLD.block, 10);
        c.fillRect(x, y, 10, WORLD.block);
      }
    }
    // Park.
    const park = world.city.specials.park;
    if (park && park.x < vis.x1 && park.x + park.w > vis.x0 && park.y < vis.y1 && park.y + park.h > vis.y0) {
      c.fillStyle = '#4a7a3a';
      c.fillRect(park.x, park.y, park.w, park.h);
      c.fillStyle = '#3f8fbf';
      c.beginPath();
      c.ellipse(park.cx + 90, park.cy - 40, 70, 46, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#2f6f9f';
      c.lineWidth = 4;
      c.stroke();
    }
    // Sand and the bay.
    if (vis.x1 > WORLD.sandX) {
      c.fillStyle = '#d8c08a';
      c.fillRect(WORLD.sandX, vis.y0, WORLD.waterX - WORLD.sandX, vis.y1 - vis.y0);
      const grad = c.createLinearGradient(WORLD.waterX, 0, WORLD.width, 0);
      grad.addColorStop(0, '#2f7fb8');
      grad.addColorStop(1, '#1d5a8a');
      c.fillStyle = grad;
      c.fillRect(WORLD.waterX, vis.y0, WORLD.width - WORLD.waterX, vis.y1 - vis.y0);
      // Gentle waves.
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.lineWidth = 2;
      for (let y = Math.floor(vis.y0 / 90) * 90; y < vis.y1; y += 90) {
        c.beginPath();
        for (let x = WORLD.waterX + 10; x < WORLD.width; x += 40) {
          c.lineTo(x, y + Math.sin((x + world.time * 40) / 90) * 6);
        }
        c.stroke();
      }
      // Yacht.
      const yacht = world.city.specials.yacht;
      if (yacht) {
        c.save();
        c.translate(yacht.x, yacht.y);
        c.fillStyle = '#f2f2f2';
        roundRect(c, -45, -16, 90, 32, 12);
        c.fill();
        c.fillStyle = '#3a7bd5';
        c.fillRect(-18, -30, 36, 16);
        c.fillStyle = '#ffd76a';
        c.font = 'bold 11px sans-serif';
        c.textAlign = 'center';
        c.fillText('YACHT', 0, 5);
        c.restore();
      }
    }
    // Roads: asphalt, centre dashes, crosswalks.
    c.fillStyle = '#33363d';
    for (let i = 0; i <= WORLD.cols; i += 1) {
      const x = vRoadX(i) - road / 2;
      if (x > vis.x1 || x + road < vis.x0) continue;
      c.fillRect(x, vis.y0, road, vis.y1 - vis.y0);
    }
    for (let j = 0; j <= WORLD.rows; j += 1) {
      const y = hRoadY(j) - road / 2;
      if (y > vis.y1 || y + road < vis.y0) continue;
      c.fillRect(vis.x0, y, vis.x1 - vis.x0, road);
    }
    c.fillStyle = '#e8e4da';
    for (let i = 0; i <= WORLD.cols; i += 1) {
      const x = vRoadX(i);
      if (x < vis.x0 || x > vis.x1) continue;
      for (let y = Math.floor(vis.y0 / 46) * 46; y < vis.y1; y += 46) {
        if (isRoadAt(x, y) && !((y % pitch) < road / 2 + 20 || (y % pitch) > pitch - road / 2 - 20)) {
          c.fillRect(x - 2, y, 4, 22);
        }
      }
    }
    for (let j = 0; j <= WORLD.rows; j += 1) {
      const y = hRoadY(j);
      if (y < vis.y0 || y > vis.y1) continue;
      for (let x = Math.floor(vis.x0 / 46) * 46; x < vis.x1; x += 46) {
        if (isRoadAt(x, y) && !((x % pitch) < road / 2 + 20 || (x % pitch) > pitch - road / 2 - 20)) {
          c.fillRect(x, y - 2, 22, 4);
        }
      }
    }
    // Crosswalks at intersections.
    c.fillStyle = 'rgba(232,228,218,0.85)';
    for (let i = 0; i <= WORLD.cols; i += 1) {
      for (let j = 0; j <= WORLD.rows; j += 1) {
        const x = vRoadX(i);
        const y = hRoadY(j);
        if (x < vis.x0 - 60 || x > vis.x1 + 60 || y < vis.y0 - 60 || y > vis.y1 + 60) continue;
        for (let k = -3; k <= 3; k += 1) {
          c.fillRect(x + k * 12 - 4, y - road / 2 + 4, 8, 14);
          c.fillRect(x + k * 12 - 4, y + road / 2 - 18, 8, 14);
        }
      }
    }
  }

  function drawBuildings(world, vis) {
    const c = ctx;
    for (const b of world.city.buildings) {
      if (b.x > vis.x1 || b.y > vis.y1 || b.x + b.w < vis.x0 || b.y + b.h < vis.y0) continue;
      // Drop shadow from the height.
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.fillRect(b.x + b.height * 0.4, b.y + b.height * 0.4, b.w, b.h);
      c.fillStyle = b.color;
      c.fillRect(b.x, b.y, b.w, b.h);
      // Roof.
      c.fillStyle = shade(b.color, 0.82);
      c.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      c.fillStyle = b.roof;
      c.fillRect(b.x + 12, b.y + 12, b.w - 24, b.h - 24);
      // Roof details.
      c.fillStyle = 'rgba(255,255,255,0.18)';
      const cols = Math.max(1, Math.floor(b.w / 46));
      const rows = Math.max(1, Math.floor(b.h / 46));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          c.fillRect(b.x + 20 + i * 46, b.y + 20 + j * 46, 16, 10);
        }
      }
      if (b.helipad) {
        c.strokeStyle = '#ffd76a';
        c.lineWidth = 3;
        c.beginPath();
        c.arc(b.x + b.w / 2, b.y + b.h / 2, 22, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = '#ffd76a';
        c.font = 'bold 20px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('H', b.x + b.w / 2, b.y + b.h / 2);
      }
      if (b.museum) {
        c.fillStyle = '#ffd76a';
        c.font = 'bold 15px sans-serif';
        c.textAlign = 'center';
        c.fillText('SOLARA MUSEUM', b.x + b.w / 2, b.y + b.h / 2);
      }
      if (b.bank) {
        c.fillStyle = '#e8e4da';
        c.font = 'bold 15px sans-serif';
        c.textAlign = 'center';
        c.fillText('FIRST BAY BANK', b.x + b.w / 2, b.y + b.h / 2);
      }
      if (b.house) {
        c.fillStyle = '#7a4a30';
        c.beginPath();
        c.moveTo(b.x, b.y + 40);
        c.lineTo(b.x + b.w / 2, b.y - 6);
        c.lineTo(b.x + b.w, b.y + 40);
        c.closePath();
        c.fill();
      }
    }
    // Trees.
    for (const t of world.city.trees) {
      if (t.x < vis.x0 || t.x > vis.x1 || t.y < vis.y0 || t.y > vis.y1) continue;
      c.fillStyle = '#5d4a30';
      c.fillRect(t.x - 2, t.y - 2, 4, 6);
      c.fillStyle = t.palm ? '#3f8f5f' : '#2f6b3a';
      c.beginPath();
      c.arc(t.x, t.y - 4, t.r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.beginPath();
      c.arc(t.x - 3, t.y - 8, t.r * 0.5, 0, Math.PI * 2);
      c.fill();
    }
    // Lamps.
    for (const l of world.city.lamps) {
      if (l.x < vis.x0 || l.x > vis.x1 || l.y < vis.y0 || l.y > vis.y1) continue;
      c.fillStyle = '#2c2f36';
      c.fillRect(l.x - 2, l.y - 2, 4, 4);
      if (world.hour >= 18) {
        c.fillStyle = 'rgba(255,214,106,0.35)';
        c.beginPath();
        c.arc(l.x, l.y, 14, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  function drawCarShape(world, car) {
    const c = ctx;
    const spec = car;
    c.save();
    c.translate(car.x, car.y);
    c.rotate(car.angle);
    // Shadow.
    c.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(c, -spec.length / 2 + 3, -spec.width / 2 + 4, spec.length, spec.width, 9);
    c.fill();
    // Body.
    const body = car.health < 30 ? shade(car.color, 0.6) : car.color;
    c.fillStyle = body;
    roundRect(c, -spec.length / 2, -spec.width / 2, spec.length, spec.width, 9);
    c.fill();
    // Roof + windshield + rear window.
    c.fillStyle = shade(car.color, 0.75);
    roundRect(c, -spec.length / 2 + 14, -spec.width / 2 + 5, spec.length - 30, spec.width - 10, 6);
    c.fill();
    c.fillStyle = '#1d2733';
    c.fillRect(spec.length / 2 - 16, -spec.width / 2 + 5, 6, spec.width - 10);
    c.fillRect(-spec.length / 2 + 8, -spec.width / 2 + 5, 5, spec.width - 10);
    // Taxi sign / police light bar.
    if (car.type === 'taxi') {
      c.fillStyle = '#f2c200';
      c.fillRect(-6, -spec.width / 2 - 2, 12, 5);
    }
    if (car.driver === 'police' || car.driver === 'roadblock') {
      const flash = Math.floor(world.time * 6) % 2 === 0;
      c.fillStyle = flash ? '#ff2e2e' : '#2e7bff';
      c.fillRect(-8, -spec.width / 2 + 2, 8, 6);
      c.fillStyle = flash ? '#2e7bff' : '#ff2e2e';
      c.fillRect(-8, spec.width / 2 - 8, 8, 6);
      c.fillStyle = '#e8e4da';
      c.font = 'bold 9px sans-serif';
      c.textAlign = 'center';
      c.fillText('SBPD', 0, 3);
    }
    // Headlights at dusk.
    if (world.hour >= 17.6) {
      const grad = c.createRadialGradient(spec.length / 2, 0, 4, spec.length / 2, 0, 90);
      grad.addColorStop(0, 'rgba(255,240,180,0.35)');
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(spec.length / 2, -10);
      c.lineTo(spec.length / 2 + 90, -34);
      c.lineTo(spec.length / 2 + 90, 34);
      c.lineTo(spec.length / 2, 10);
      c.closePath();
      c.fill();
      c.fillStyle = '#ffe9a8';
      c.fillRect(spec.length / 2 - 2, -spec.width / 2 + 3, 3, 5);
      c.fillRect(spec.length / 2 - 2, spec.width / 2 - 8, 3, 5);
    }
    // Brake lights.
    if (car.driver === 'player' && car.speed < -5) {
      c.fillStyle = '#ff2e2e';
      c.fillRect(-spec.length / 2 - 1, -spec.width / 2 + 3, 3, 5);
      c.fillRect(-spec.length / 2 - 1, spec.width / 2 - 8, 3, 5);
    }
    // Smoke from a dying engine.
    if (car.health < 40 && !car.dead) {
      c.fillStyle = 'rgba(60,60,60,0.5)';
      c.beginPath();
      c.arc(-spec.length / 2 + 6 + Math.sin(world.time * 9) * 4, 0, 7 + Math.sin(world.time * 7) * 2, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawPerson(world, x, y, angle, shirt, scale, gun) {
    const c = ctx;
    const s = scale ?? 1;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(2, 3, 12 * s, 9 * s, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = shirt;
    c.beginPath();
    c.arc(0, 0, 11 * s, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e8b98a';
    c.beginPath();
    c.arc(6 * s, 0, 5.5 * s, 0, Math.PI * 2);
    c.fill();
    if (gun) {
      c.fillStyle = '#22242a';
      c.fillRect(10 * s, -2 * s, 12 * s, 3.5 * s);
    }
    c.restore();
  }

  function drawWorld(world) {
    const c = ctx;
    const vis = visible(world);
    const shakeX = world.shake > 0 ? (Math.random() - 0.5) * world.shake : 0;
    const shakeY = world.shake > 0 ? (Math.random() - 0.5) * world.shake : 0;
    c.save();
    c.translate(Math.round(vis.w / 2 - world.camera.x + shakeX), Math.round(vis.h / 2 - world.camera.y + shakeY));
    drawGround(world, vis);
    drawBuildings(world, vis);

    // Mission marker: pulsing diamond + beam.
    const marker = currentMarker(world);
    if (marker) {
      const pulse = 1 + Math.sin(world.time * 5) * 0.15;
      c.save();
      c.translate(marker.x, marker.y);
      c.fillStyle = 'rgba(255,215,106,0.18)';
      c.fillRect(-16, -260, 32, 260);
      c.fillStyle = '#ffd76a';
      c.rotate(Math.PI / 4);
      const s = 15 * pulse;
      c.fillRect(-s / 2, -s / 2, s, s);
      c.restore();
      c.fillStyle = '#ffd76a';
      c.font = 'bold 13px sans-serif';
      c.textAlign = 'center';
      c.fillText(marker.label, marker.x, marker.y - 34);
      const d = dist(world.camera.x, world.camera.y, marker.x, marker.y);
      if (d > 60) {
        c.fillStyle = 'rgba(255,215,106,0.9)';
        c.font = '12px sans-serif';
        c.fillText(`${Math.round(d)}m`, marker.x, marker.y - 18);
      }
    }

    // Pickups.
    for (const pk of world.pickups) {
      if (pk.x < vis.x0 || pk.x > vis.x1 || pk.y < vis.y0 || pk.y > vis.y1) continue;
      const bob = Math.sin(pk.bob * 2) * 3;
      c.save();
      c.translate(pk.x, pk.y + bob);
      if (pk.kind === 'cash') {
        c.fillStyle = '#2f9e4f';
        roundRect(c, -11, -8, 22, 16, 3);
        c.fill();
        c.fillStyle = '#ffd76a';
        c.font = 'bold 12px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('$', 0, 1);
      } else if (pk.kind === 'health') {
        c.fillStyle = '#e8e4da';
        roundRect(c, -10, -10, 20, 20, 4);
        c.fill();
        c.fillStyle = '#d43a2e';
        c.fillRect(-2.5, -7, 5, 14);
        c.fillRect(-7, -2.5, 14, 5);
      } else {
        c.fillStyle = '#c98a2e';
        roundRect(c, -10, -7, 20, 14, 3);
        c.fill();
        c.fillStyle = '#22242a';
        c.font = 'bold 9px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('AMMO', 0, 1);
      }
      c.restore();
    }

    // Safehouse / garage labels.
    const s = world.city.specials;
    c.font = 'bold 12px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#8fd6a0';
    c.fillText('SAFEHOUSE', s.safehouse.cx, s.safehouse.y - 14);
    c.fillStyle = '#9ecfff';
    c.fillText('GARAGE', s.garage.cx, s.garage.y - 14);

    // Cars (dead ones as wrecks, drawn flat).
    for (const car of world.cars) {
      if (car.x < vis.x0 - 80 || car.x > vis.x1 + 80 || car.y < vis.y0 - 80 || car.y > vis.y1 + 80) continue;
      if (car.dead) {
        c.save();
        c.translate(car.x, car.y);
        c.rotate(car.angle);
        c.fillStyle = '#1a1a1a';
        roundRect(c, -car.length / 2, -car.width / 2, car.length, car.width, 9);
        c.fill();
        c.restore();
        continue;
      }
      drawCarShape(world, car);
    }
    // Pedestrians.
    for (const ped of world.peds) {
      if (ped.dead) continue;
      if (ped.x < vis.x0 || ped.x > vis.x1 || ped.y < vis.y0 || ped.y > vis.y1) continue;
      drawPerson(world, ped.x, ped.y, ped.angle, ped.shirt, ped.panic > 0 ? 1.05 : 1, false);
    }
    // Enemies.
    for (const e of world.enemies) {
      if (e.dead) continue;
      if (e.x < vis.x0 || e.x > vis.x1 || e.y < vis.y0 || e.y > vis.y1) continue;
      drawPerson(world, e.x, e.y, e.angle, '#a33a2e', 1.1, true);
    }
    // Mia, when rescued and waiting.
    if (world.mission && world.mission.data.mia && world.mission.data.stage === 2) {
      const m = world.mission.data.mia;
      drawPerson(world, m.x, m.y, Math.PI / 2, '#e8b23a', 1.05, false);
      c.fillStyle = '#ffd76a';
      c.font = 'bold 12px sans-serif';
      c.textAlign = 'center';
      c.fillText('MIA', m.x, m.y - 22);
    }
    // The player on foot.
    const p = world.player;
    if (!p.inCar && !p.dead) {
      const flash = p.hurtFlash > 0 && Math.floor(world.time * 12) % 2 === 0;
      drawPerson(world, p.x, p.y, p.angle, flash ? '#ffffff' : '#2e6b8f', 1.15, p.weapon !== 'fists');
    }
    // Helicopter shadow + body.
    if (world.heli) {
      const h = world.heli;
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath();
      c.ellipse(h.x + 40, h.y + 46, 34, 18, 0, 0, Math.PI * 2);
      c.fill();
      // Spotlight cone on the player.
      const pp = p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };
      const grad = c.createRadialGradient(pp.x, pp.y, 10, pp.x, pp.y, 120);
      grad.addColorStop(0, 'rgba(255,240,180,0.28)');
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      c.fillStyle = grad;
      c.beginPath();
      c.arc(pp.x, pp.y, 120, 0, Math.PI * 2);
      c.fill();
      c.save();
      c.translate(h.x, h.y);
      c.rotate(h.angle);
      c.fillStyle = '#1c2733';
      c.beginPath();
      c.ellipse(0, 0, 26, 14, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#e8e4da';
      c.font = 'bold 9px sans-serif';
      c.textAlign = 'center';
      c.fillText('SBPD', 0, 3);
      c.strokeStyle = '#c8ccd4';
      c.lineWidth = 3;
      const rot = world.time * 22;
      c.beginPath();
      c.moveTo(Math.cos(rot) * 34, Math.sin(rot) * 34);
      c.lineTo(-Math.cos(rot) * 34, -Math.sin(rot) * 34);
      c.stroke();
      c.restore();
    }
    // Bullets as tracers.
    c.strokeStyle = '#ffe9a8';
    c.lineWidth = 2;
    for (const b of world.bullets) {
      c.beginPath();
      c.moveTo(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    // Particles.
    for (const pt of world.particles) {
      const a = 1 - pt.t / pt.life;
      c.globalAlpha = a;
      c.fillStyle = pt.color;
      c.beginPath();
      c.arc(pt.x, pt.y, pt.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.restore();

    // Time-of-day tint.
    const hour = world.hour;
    if (hour >= 17.5 && hour < 19.5) {
      const t = (hour - 17.5) / 2;
      c.fillStyle = `rgba(255,120,40,${0.10 + t * 0.08})`;
      c.fillRect(0, 0, vis.w, vis.h);
    } else if (hour >= 19.5) {
      c.fillStyle = 'rgba(20,30,80,0.22)';
      c.fillRect(0, 0, vis.w, vis.h);
    }
  }

  function currentMarker(world) {
    if (world.mission) {
      const m = world.mission.def.marker(world);
      if (m) return m;
    }
    if (!world.mission && world.missionsDone < MISSIONS.length && (world.pendingNext ?? 0) <= 0) {
      const s = world.city.specials.safehouse;
      return { x: s.doorX, y: s.doorY - 40, label: 'NEXT MISSION — M' };
    }
    return null;
  }

  function drawMinimap(world) {
    const c = mapCtx;
    const sx = MAP_W / WORLD.width;
    const sy = MAP_H / WORLD.height;
    c.clearRect(0, 0, MAP_W, MAP_H);
    c.fillStyle = '#20344a';
    c.fillRect(0, 0, MAP_W, MAP_H);
    // Water + sand.
    c.fillStyle = '#d8c08a';
    c.fillRect(WORLD.sandX * sx, 0, (WORLD.waterX - WORLD.sandX) * sx, MAP_H);
    c.fillStyle = '#2f7fb8';
    c.fillRect(WORLD.waterX * sx, 0, MAP_W - WORLD.waterX * sx, MAP_H);
    // Blocks.
    c.fillStyle = '#5d6b58';
    for (let col = 0; col < WORLD.cols; col += 1) {
      for (let row = 0; row < WORLD.rows; row += 1) {
        c.fillRect((col * pitch + road / 2) * sx, (row * pitch + road / 2) * sy, WORLD.block * sx, WORLD.block * sy);
      }
    }
    // Roads.
    c.fillStyle = '#33363d';
    for (let i = 0; i <= WORLD.cols; i += 1) c.fillRect(vRoadX(i) * sx - 1, 0, 2, MAP_H);
    for (let j = 0; j <= WORLD.rows; j += 1) c.fillRect(0, hRoadY(j) * sy - 1, MAP_W, 2);
    // Safehouse + garage.
    const s = world.city.specials;
    c.fillStyle = '#8fd6a0';
    c.fillRect(s.safehouse.cx * sx - 2, s.safehouse.cy * sy - 2, 4, 4);
    c.fillStyle = '#9ecfff';
    c.fillRect(s.garage.cx * sx - 2, s.garage.cy * sy - 2, 4, 4);
    // Mission marker.
    const marker = currentMarker(world);
    if (marker) {
      const pulse = 2 + Math.sin(world.time * 5) * 1;
      c.fillStyle = '#ffd76a';
      c.beginPath();
      c.arc(marker.x * sx, marker.y * sy, 3 + pulse, 0, Math.PI * 2);
      c.fill();
    }
    // Cops.
    const flash = Math.floor(world.time * 4) % 2 === 0;
    for (const cop of world.cops) {
      if (cop.dead) continue;
      c.fillStyle = flash ? '#ff2e2e' : '#2e7bff';
      c.beginPath();
      c.arc(cop.x * sx, cop.y * sy, 3, 0, Math.PI * 2);
      c.fill();
    }
    // Heli.
    if (world.heli) {
      c.fillStyle = '#ff2e2e';
      c.beginPath();
      c.arc(world.heli.x * sx, world.heli.y * sy, 3, 0, Math.PI * 2);
      c.fill();
    }
    // Player arrow.
    const p = world.player;
    const px = (p.inCar ? p.inCar.x : p.x) * sx;
    const py = (p.inCar ? p.inCar.y : p.y) * sy;
    const pa = p.inCar ? p.inCar.angle : p.angle;
    c.save();
    c.translate(px, py);
    c.rotate(pa);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(7, 0);
    c.lineTo(-5, -5);
    c.lineTo(-5, 5);
    c.closePath();
    c.fill();
    c.restore();
    // Frame.
    const { w, h } = renderer.view();
    const mx = w - MAP_W - 14;
    const my = h - MAP_H - 14;
    ctx.drawImage(mapCanvas, mx, my);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, my, MAP_W, MAP_H);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(mx, my, 74, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SOLARA BAY', mx + 5, my + 3);
  }

  function drawHud(world, audio) {
    const c = ctx;
    const { w, h } = renderer.view();
    const p = world.player;
    c.textBaseline = 'alphabetic';

    // Top-left: wanted stars + respect.
    c.textAlign = 'left';
    c.font = 'bold 26px sans-serif';
    for (let i = 0; i < 5; i += 1) {
      c.fillStyle = i < world.wanted ? '#ff2e2e' : 'rgba(255,255,255,0.35)';
      c.fillText('★', 16 + i * 30, 40);
    }
    c.font = 'bold 13px sans-serif';
    c.fillStyle = '#ffffff';
    c.fillText(respectName(world.missionsDone), 16, 62);

    // Top-right: money.
    c.textAlign = 'right';
    c.font = 'bold 26px sans-serif';
    c.fillStyle = '#8fd6a0';
    c.fillText(fmtMoney(world.money), w - 16, 40);
    c.font = '12px sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillText(`Missions ${world.missionsDone}/${MISSIONS.length}`, w - 16, 60);

    // Mission objective bar, top centre.
    const objective = world.mission
      ? world.mission.def.objective(world)
      : world.missionsDone >= MISSIONS.length
        ? 'Bay Legend — free roam Solara Bay'
        : 'Head to the M marker at the safehouse';
    c.textAlign = 'center';
    c.font = 'bold 15px sans-serif';
    const tw = c.measureText(objective).width + 28;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(c, w / 2 - tw / 2, 12, tw, 44, 8);
    c.fill();
    c.fillStyle = '#ffd76a';
    c.font = 'bold 15px sans-serif';
    c.fillText(world.mission ? `★ ${world.mission.def.title}` : 'FREE ROAM', w / 2, 28);
    c.fillStyle = '#ffffff';
    c.font = '13px sans-serif';
    c.fillText(objective, w / 2, 46);

    // Bottom-left: health, weapon, ammo.
    const hx = 16;
    const hy = h - 64;
    c.textAlign = 'left';
    c.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(c, hx - 6, hy - 6, 220, 58, 8);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = 'bold 12px sans-serif';
    c.fillText('HEALTH', hx, hy + 10);
    c.fillStyle = '#22242a';
    c.fillRect(hx + 62, hy, 140, 12);
    c.fillStyle = p.health > 50 ? '#4fae62' : p.health > 25 ? '#e8b23a' : '#d43a2e';
    c.fillRect(hx + 62, hy, 140 * (p.health / 100), 12);
    const weaponName = p.weapon === 'fists' ? 'FISTS' : p.weapon.toUpperCase();
    const ammoText = p.weapon === 'fists' ? '—' : `${p.ammo[p.weapon]} / ${p.reserve[p.weapon]}`;
    c.fillStyle = '#ffffff';
    c.fillText(`${weaponName}   ${ammoText}`, hx, hy + 32);
    c.fillStyle = 'rgba(255,255,255,0.65)';
    c.font = '11px sans-serif';
    c.fillText(audio ? audio.stationName() : '', hx, hy + 48);

    // Speed, bottom centre-right.
    if (p.inCar) {
      const speed = Math.abs(p.inCar.speed) * 0.16;
      c.textAlign = 'right';
      c.font = 'bold 30px sans-serif';
      c.fillStyle = '#ffffff';
      c.fillText(`${Math.round(speed)}`, w - MAP_W - 40, h - 30);
      c.font = '12px sans-serif';
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fillText('MPH', w - MAP_W - 40, h - 14);
      // Car health.
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(w - MAP_W - 150, h - 58, 110, 10);
      c.fillStyle = p.inCar.health > 40 ? '#4fae62' : '#d43a2e';
      c.fillRect(w - MAP_W - 150, h - 58, 110 * clamp(p.inCar.health / 100, 0, 1), 10);
      c.fillStyle = '#ffffff';
      c.font = '11px sans-serif';
      c.textAlign = 'left';
      c.fillText('CAR', w - MAP_W - 150, h - 64);
    }

    // Floating messages.
    c.textAlign = 'left';
    c.font = 'bold 15px sans-serif';
    let my = h - 130;
    for (const m of world.messages) {
      c.globalAlpha = clamp(1 - m.t / m.life, 0, 1);
      c.fillStyle = m.color;
      c.fillText(m.text, 16, my);
      my -= 22;
    }
    c.globalAlpha = 1;

    // Mission banner.
    if (world.missionBanner) {
      const b = world.missionBanner;
      const a = clamp(1 - Math.max(0, b.t - 2.4) / 0.8, 0, 1);
      c.globalAlpha = a;
      c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(0, h * 0.3, w, 86);
      c.fillStyle = '#ffd76a';
      c.font = 'bold 34px sans-serif';
      c.fillText(b.title, w / 2, h * 0.3 + 40);
      c.fillStyle = '#ffffff';
      c.font = '16px sans-serif';
      c.fillText(b.giver, w / 2, h * 0.3 + 66);
      c.globalAlpha = 1;
    }

    // Dialogue box.
    if (world.dialogue) {
      const d = world.dialogue;
      const line = d.lines[d.index];
      const bw = Math.min(w - 80, 760);
      const bx = (w - bw) / 2;
      const by = h - 178;
      c.fillStyle = 'rgba(0,0,0,0.78)';
      roundRect(c, bx, by, bw, 92, 10);
      c.fill();
      c.strokeStyle = '#ffd76a';
      c.lineWidth = 2;
      roundRect(c, bx, by, bw, 92, 10);
      c.stroke();
      c.textAlign = 'left';
      c.fillStyle = '#ffd76a';
      c.font = 'bold 14px sans-serif';
      c.fillText(line.who, bx + 18, by + 24);
      c.fillStyle = '#ffffff';
      c.font = '15px sans-serif';
      wrapText(c, line.text, bx + 18, by + 46, bw - 36, 20);
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.font = '11px sans-serif';
      c.textAlign = 'right';
      c.fillText('E / click — continue', bx + bw - 12, by + 80);
    }

    // Controls hint, first seconds of play.
    if (world.time < 18 && !world.mission) {
      c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.font = '13px sans-serif';
      c.fillText('WASD drive / walk   •   E steal car   •   Mouse aim, click shoot   •   P pause   •   C radio   •   M mute', w / 2, h - 190);
    }

    drawMinimap(world);
  }

  function wrapText(c, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (c.measureText(test).width > maxWidth && line) {
        c.fillText(line, x, yy);
        line = word;
        yy += lineHeight;
      } else {
        line = test;
      }
    }
    c.fillText(line, x, yy);
  }

  function drawButton(c, b, hover) {
    c.fillStyle = hover ? '#ffd76a' : 'rgba(0,0,0,0.6)';
    roundRect(c, b.x, b.y, b.w, b.h, 8);
    c.fill();
    c.strokeStyle = '#ffd76a';
    c.lineWidth = 2;
    roundRect(c, b.x, b.y, b.w, b.h, 8);
    c.stroke();
    c.fillStyle = hover ? '#1a1a1a' : '#ffffff';
    c.font = 'bold 17px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    c.textBaseline = 'alphabetic';
  }

  function drawTitle(world, input) {
    const c = ctx;
    const { w, h } = renderer.view();
    drawWorld(world);
    c.fillStyle = 'rgba(10,14,24,0.45)';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.fillStyle = '#ffd76a';
    c.font = 'bold 84px sans-serif';
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 18;
    c.fillText('SOLARA BAY', w / 2, h * 0.30);
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff';
    c.font = 'bold 22px sans-serif';
    c.fillText('A STREET EMPIRE STORY', w / 2, h * 0.30 + 38);
    c.font = '15px sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillText('Steal cars. Outrun the law. Take the city.', w / 2, h * 0.30 + 66);

    renderer.buttons = [];
    const bw = 280;
    const bx = w / 2 - bw / 2;
    let by = h * 0.52;
    const defs = [];
    if (hasSave()) defs.push({ label: 'CONTINUE', action: 'continue' });
    defs.push({ label: 'NEW GAME', action: 'new' });
    defs.push({ label: 'HOW TO PLAY', action: 'help' });
    for (const d of defs) {
      const b = { x: bx, y: by, w: bw, h: 52, label: d.label, action: d.action };
      const hover = input.mouseX >= b.x && input.mouseX <= b.x + b.w && input.mouseY >= b.y && input.mouseY <= b.y + b.h;
      drawButton(c, b, hover);
      renderer.buttons.push(b);
      by += 66;
    }
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.font = '13px sans-serif';
    c.fillText('An original open-world crime game — no Rockstar content. Made for the make.fun GTA 6 bounty.', w / 2, h - 24);
    c.fillText('WASD move/drive  •  E steal car  •  Mouse aim, click shoot  •  Space handbrake  •  P pause', w / 2, h - 46);

    if (world.showHelp) {
      c.fillStyle = 'rgba(0,0,0,0.85)';
      roundRect(c, w / 2 - 320, h * 0.2, 640, 420, 12);
      c.fill();
      c.strokeStyle = '#ffd76a';
      c.strokeRect(w / 2 - 320, h * 0.2, 640, 420);
      c.fillStyle = '#ffd76a';
      c.font = 'bold 20px sans-serif';
      c.fillText('HOW TO PLAY', w / 2, h * 0.2 + 36);
      c.fillStyle = '#ffffff';
      c.font = '15px sans-serif';
      const lines = [
        'You are Rio "Rook" Santana, a getaway driver new to Solara Bay.',
        'Complete 6 story missions to become a Bay Legend.',
        '',
        'WASD / arrows — walk and drive',
        'E — steal / enter a car, grab items, talk',
        'Mouse — aim, click — shoot, Space — punch / handbrake',
        '1 / 2 — fists / pistol (3 — SMG when unlocked), R — reload',
        'Shift — sprint, C — change radio, M — mute, P — pause',
        '',
        'Wanted stars bring the police. Lay low and the heat fades.',
        'Save at the safehouse with F5. Your garage stores stolen cars.',
        'The diamond job is waiting. Good luck, Rook.',
      ];
      lines.forEach((line, i) => c.fillText(line, w / 2, h * 0.2 + 70 + i * 24));
      const b = { x: w / 2 - 100, y: h * 0.2 + 420 - 56, w: 200, h: 42, label: 'CLOSE', action: 'close-help' };
      const hover = input.mouseX >= b.x && input.mouseX <= b.x + b.w && input.mouseY >= b.y && input.mouseY <= b.y + b.h;
      drawButton(c, b, hover);
      renderer.buttons.push(b);
    }
  }

  function drawPause(world, input) {
    const c = ctx;
    const { w, h } = renderer.view();
    drawWorld(world);
    drawHud(world, null);
    c.fillStyle = 'rgba(0,0,0,0.65)';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.fillStyle = '#ffd76a';
    c.font = 'bold 44px sans-serif';
    c.fillText('PAUSED', w / 2, h * 0.3);
    renderer.buttons = [];
    const bw = 280;
    const bx = w / 2 - bw / 2;
    let by = h * 0.42;
    for (const d of [
      { label: 'RESUME', action: 'resume' },
      { label: 'SAVE GAME', action: 'save' },
      { label: 'QUIT TO TITLE', action: 'title' },
    ]) {
      const b = { x: bx, y: by, w: bw, h: 52, label: d.label, action: d.action };
      const hover = input.mouseX >= b.x && input.mouseX <= b.x + b.w && input.mouseY >= b.y && input.mouseY <= b.y + b.h;
      drawButton(c, b, hover);
      renderer.buttons.push(b);
      by += 66;
    }
    if (world.saveFlash) {
      c.fillStyle = '#8fd6a0';
      c.font = 'bold 16px sans-serif';
      c.fillText('GAME SAVED', w / 2, by + 10);
    }
  }

  function drawOver(world, input) {
    const c = ctx;
    const { w, h } = renderer.view();
    drawWorld(world);
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    if (world.overKind === 'busted') {
      c.fillStyle = '#2e7bff';
      c.font = 'bold 72px sans-serif';
      c.fillText('BUSTED!', w / 2, h * 0.38);
      c.fillStyle = '#ffffff';
      c.font = '18px sans-serif';
      c.fillText('The SBPD caught up with you. The crew posts your bail —', w / 2, h * 0.38 + 36);
      c.fillText('but the mission restarts.', w / 2, h * 0.38 + 60);
    } else if (world.overKind === 'wasted') {
      c.fillStyle = '#ff2e2e';
      c.font = 'bold 72px sans-serif';
      c.fillText('WASTED', w / 2, h * 0.38);
      c.fillStyle = '#ffffff';
      c.font = '18px sans-serif';
      c.fillText('Solara Bay is not done with you yet. The mission restarts.', w / 2, h * 0.38 + 36);
    } else if (world.overKind === 'won') {
      c.fillStyle = '#ffd76a';
      c.font = 'bold 64px sans-serif';
      c.fillText('BAY LEGEND', w / 2, h * 0.34);
      c.fillStyle = '#ffffff';
      c.font = '20px sans-serif';
      c.fillText('The Solara Diamond is yours. The whole Bay knows the name Rook.', w / 2, h * 0.34 + 40);
      c.font = '16px sans-serif';
      c.fillText(`Final take: ${fmtMoney(world.money)}   •   Cars stolen: ${world.stats.carsStolen}   •   Missions: ${world.stats.missions}/6`, w / 2, h * 0.34 + 72);
    }
    renderer.buttons = [];
    const bw = 300;
    const bx = w / 2 - bw / 2;
    const b = { x: bx, y: h * 0.58, w: bw, h: 52, label: world.overKind === 'won' ? 'KEEP PLAYING' : 'RETRY MISSION', action: world.overKind === 'won' ? 'free-roam' : 'retry' };
    const hover = input.mouseX >= b.x && input.mouseX <= b.x + b.w && input.mouseY >= b.y && input.mouseY <= b.y + b.h;
    drawButton(c, b, hover);
    renderer.buttons.push(b);
    const b2 = { x: bx, y: h * 0.58 + 66, w: bw, h: 52, label: 'TITLE SCREEN', action: 'title' };
    const hover2 = input.mouseX >= b2.x && input.mouseX <= b2.x + b2.w && input.mouseY >= b2.y && input.mouseY <= b2.y + b2.h;
    drawButton(c, b2, hover2);
    renderer.buttons.push(b2);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.font = '13px sans-serif';
    c.fillText('or press R to retry, Enter for the title screen', w / 2, h * 0.58 + 150);
  }

  renderer.render = function render(world, screen, input, audio) {
    renderer.buttons = [];
    if (screen === 'title') drawTitle(world, input);
    else if (screen === 'pause') drawPause(world, input);
    else if (screen === 'over' || screen === 'won') drawOver(world, input);
    else {
      drawWorld(world);
      drawHud(world, audio);
    }
  };

  return renderer;
}
