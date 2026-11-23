// The city of Solara Bay: a seeded grid of roads and blocks, six districts,
// a beach and bay along the south and east edges, landmarks, parks, trees and
// collision rectangles for every building. Deterministic from the seed.
import { WORLD, DISTRICTS, PALETTE } from './config.js';
import { createRandom, clamp } from './random.js';

const ROAD_SPACING = WORLD.roadGap;
const HALF_ROAD = WORLD.roadWidth / 2;

export function buildCity(seed) {
  const rng = createRandom(seed);
  const size = WORLD.size;
  const roadsV = []; // x positions of vertical roads
  const roadsH = []; // y positions of horizontal roads
  for (let x = 420; x < size - 300; x += ROAD_SPACING) roadsV.push(x);
  for (let y = 420; y < size - 300; y += ROAD_SPACING) roadsH.push(y);

  const buildings = [];
  const trees = [];
  const parks = [];
  const landmarks = [];
  const colliders = []; // {x,y,w,h} axis-aligned, for cars and feet

  function districtAt(x, y) {
    for (const d of DISTRICTS) {
      if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
    }
    return DISTRICTS[0];
  }

  // Landmarks: named places the missions and the minimap point at.
  landmarks.push({ id: 'safehouse', name: 'Safehouse', x: 1080, y: 1180, kind: 'house', colour: '#e67e22' });
  landmarks.push({ id: 'garage', name: 'Rook Garage', x: 1420, y: 1180, kind: 'garage', colour: '#3498db' });
  landmarks.push({ id: 'museum', name: 'Solara Museum', x: 2050, y: 1900, kind: 'museum', colour: '#f1c40f' });
  landmarks.push({ id: 'bank', name: 'Bay Trust Bank', x: 2400, y: 1560, kind: 'bank', colour: '#2ecc71' });
  landmarks.push({ id: 'warehouse', name: 'Dock Warehouse', x: 3400, y: 3100, kind: 'warehouse', colour: '#e74c3c' });
  landmarks.push({ id: 'pier', name: 'Sunset Pier', x: 2500, y: 4480, kind: 'pier', colour: '#9b59b6' });
  landmarks.push({ id: 'stadium', name: 'Bay Stadium', x: 3900, y: 1500, kind: 'stadium', colour: '#1abc9c' });
  landmarks.push({ id: 'airport', name: 'Solara Airfield', x: 4300, y: 3300, kind: 'airport', colour: '#95a5a6' });

  // Buildings fill the blocks between roads, skipping parks, the beach strip
  // (y > 4300 is sand and sea) and the landmark plots.
  for (let ri = 0; ri < roadsV.length - 1; ri++) {
    for (let ci = 0; ci < roadsH.length - 1; ci++) {
      const bx0 = roadsV[ri] + HALF_ROAD + WORLD.sidewalk + 8;
      const by0 = roadsH[ci] + HALF_ROAD + WORLD.sidewalk + 8;
      const bx1 = roadsV[ri + 1] - HALF_ROAD - WORLD.sidewalk - 8;
      const by1 = roadsH[ci + 1] - HALF_ROAD - WORLD.sidewalk - 8;
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      if (cy > 4250) continue; // beach strip
      const nearLandmark = landmarks.some((l) => Math.abs(l.x - cx) < 260 && Math.abs(l.y - cy) < 260);
      if (nearLandmark) continue;
      if (rng.chance(0.14)) {
        parks.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 });
        for (let t = 0; t < 7; t++) trees.push({ x: rng.range(bx0 + 20, bx1 - 20), y: rng.range(by0 + 20, by1 - 20), r: rng.range(9, 15) });
        continue;
      }
      const d = districtAt(cx, cy);
      const bw = (bx1 - bx0) * rng.range(0.45, 0.85);
      const bh = (by1 - by0) * rng.range(0.45, 0.85);
      const bx = cx - bw / 2 + rng.range(-14, 14);
      const by = cy - bh / 2 + rng.range(-14, 14);
      const tall = d.style === 'towers' ? rng.range(26, 60) : d.style === 'industrial' ? rng.range(10, 18) : rng.range(8, 24);
      const b = {
        x: bx, y: by, w: bw, h: bh, height: tall,
        colour: rng.pick(PALETTE.buildingRoof),
        district: d.name, style: d.style,
        roof: rng.pick(['flat', 'flat', 'garden', 'pool']),
      };
      buildings.push(b);
      colliders.push({ x: bx, y: by, w: bw, h: bh });
      if (rng.chance(0.5)) trees.push({ x: bx - 24, y: by + bh / 2, r: rng.range(8, 13) });
    }
  }
  // Landmark buildings get colliders too.
  for (const l of landmarks) {
    const w = l.kind === 'stadium' ? 320 : l.kind === 'warehouse' ? 260 : 150;
    const h = l.kind === 'stadium' ? 220 : l.kind === 'warehouse' ? 170 : 110;
    colliders.push({ x: l.x - w / 2, y: l.y - h / 2, w, h });
  }
  // Scattered street trees along roads.
  for (let i = 0; i < 160; i++) {
    const vx = rng.pick(roadsV), hy = rng.pick(roadsH);
    trees.push({ x: vx + rng.range(-200, 200), y: hy + HALF_ROAD + 22, r: rng.range(8, 14) });
  }

  function isWater(x, y) {
    // Bay in the south-east corner and the sea along the south edge.
    if (y > 4620) return true;
    if (x > 4700 && y > 3900) return true;
    return false;
  }
  function isSand(x, y) { return y > 4300 && y <= 4620 && !isWater(x, y); }

  function collideCircle(x, y, r) {
    // Returns a corrected position after pushing out of building colliders.
    let px = x, py = y;
    for (const c of colliders) {
      const nx = clamp(px, c.x, c.x + c.w);
      const ny = clamp(py, c.y, c.y + c.h);
      const dx = px - nx, dy = py - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        if (d2 > 0.001) {
          const d = Math.sqrt(d2);
          px = nx + (dx / d) * r;
          py = ny + (dy / d) * r;
        } else {
          px += r; // centre inside: push out to the right
        }
      }
    }
    return { x: px, y: py };
  }

  function onRoad(x, y) {
    for (const rx of roadsV) if (Math.abs(x - rx) < HALF_ROAD) return true;
    for (const ry of roadsH) if (Math.abs(y - ry) < HALF_ROAD) return true;
    return false;
  }

  function nearestRoadPoint(x, y) {
    let best = null, bd = Infinity;
    for (const rx of roadsV) {
      const d = Math.abs(x - rx);
      if (d < bd) { bd = d; best = { x: rx, y }; }
    }
    for (const ry of roadsH) {
      const d = Math.abs(y - ry);
      if (d < bd) { bd = d; best = { x, y: ry }; }
    }
    return best;
  }

  function districtName(x, y) { return districtAt(x, y).name; }

  return {
    size, roadsV, roadsH, buildings, trees, parks, landmarks, colliders,
    districtAt, districtName, isWater, isSand, collideCircle, onRoad, nearestRoadPoint,
  };
}

// A point on a road, snapped to the nearest road centreline — used to spawn cars.
export function roadPoint(city, rng, margin = 500) {
  const x = rng.pick(city.roadsV);
  const y = rng.range(margin, city.size - margin);
  return { x, y, angle: rng.chance(0.5) ? 0 : Math.PI };
}
