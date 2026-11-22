// Solara Bay itself: a seeded grid city with six districts, a beach and a bay.
// Roads run on a regular pitch; every block between them gets buildings in its
// district's palette, and a handful of blocks are hand-placed landmarks the
// story uses: the safehouse, the garage, the museum, the bank, the warehouse,
// the docks, the hotel and the park. Collision is circle-vs-building-AABB, and
// the water at the east edge is a hard wall.

import { WORLD, DISTRICTS, districtOf } from './config.js';
import { makeRng, range, int, pick, chance } from './random.js';

const { pitch, road, block, cols, rows } = WORLD;

/** Centre line of vertical road i / horizontal road j. */
export function vRoadX(i) { return i * pitch; }
export function hRoadY(j) { return j * pitch; }

export function isRoadAt(x, y) {
  if (x < 0 || y < 0 || x > WORLD.width || y > WORLD.height) return false;
  const rx = x % pitch;
  const ry = y % pitch;
  return rx < road / 2 || rx > pitch - road / 2 || ry < road / 2 || ry > pitch - road / 2;
}

function blockRect(col, row) {
  return {
    x: col * pitch + road / 2 + 8,
    y: row * pitch + road / 2 + 8,
    w: block - 16,
    h: block - 16,
  };
}

function makeBuilding(rng, x, y, w, h, districtKey, tall) {
  const pal = DISTRICTS[districtKey];
  return {
    x, y, w, h,
    color: pick(rng, pal.building),
    roof: pal.roof,
    height: tall ? range(rng, 26, 60) : range(rng, 8, 22),
    helipad: tall && chance(rng, 0.12),
    windows: int(rng, 2, 5),
  };
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const specials = {};

  const parkBlock = { col: 5, row: 4 };
  const landmarkBlocks = {
    '4,1': 'museum',
    '3,0': 'bank',
    '4,4': 'safehouse',
    '1,3': 'warehouse',
    '8,0': 'docks',
    '7,3': 'hotel',
  };

  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const key = `${col},${row}`;
      const districtKey = districtOf(col, row);
      const rect = blockRect(col, row);
      const pal = DISTRICTS[districtKey];

      if (col === parkBlock.col && row === parkBlock.row) {
        // Solara Park: grass, a pond and a ring of palms, no buildings.
        specials.park = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 };
        for (let i = 0; i < 26; i += 1) {
          trees.push({ x: range(rng, rect.x + 20, rect.x + rect.w - 20), y: range(rng, rect.y + 20, rect.y + rect.h - 20), r: range(rng, 10, 16), palm: chance(rng, 0.5) });
        }
        continue;
      }

      const landmark = landmarkBlocks[key];
      if (landmark === 'museum') {
        const b = makeBuilding(rng, rect.x + 60, rect.y + 90, rect.w - 120, rect.h - 180, districtKey, true);
        b.color = '#c8b89a'; b.roof = '#8a7a5e'; b.height = 34; b.museum = true;
        buildings.push(b);
        specials.museum = { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h + 26, doorX: b.x + b.w / 2, doorY: b.y + b.h + 6 };
        continue;
      }
      if (landmark === 'bank') {
        const b = makeBuilding(rng, rect.x + 70, rect.y + 80, rect.w - 140, rect.h - 160, districtKey, true);
        b.color = '#9aa4b5'; b.roof = '#4a5468'; b.height = 44; b.bank = true;
        buildings.push(b);
        specials.bank = { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h + 26, doorX: b.x + b.w / 2, doorY: b.y + b.h + 6 };
        continue;
      }
      if (landmark === 'safehouse') {
        // Rio's safehouse: a low house with a driveway and a garage beside it.
        const house = { x: rect.x + 60, y: rect.y + 60, w: 150, h: 120, color: '#c98a5e', roof: '#7a4a30', height: 12, windows: 3, house: true };
        const garage = { x: rect.x + 240, y: rect.y + 60, w: 130, h: 110, color: '#8a8f98', roof: '#4a4e55', height: 10, windows: 1, garage: true };
        buildings.push(house, garage);
        specials.safehouse = { x: house.x, y: house.y, w: house.w, h: house.h, cx: house.x + house.w / 2, cy: house.y + house.h / 2, doorX: house.x + house.w / 2, doorY: house.y + house.h + 8 };
        specials.garage = { x: garage.x, y: garage.y, w: garage.w, h: garage.h, cx: garage.x + garage.w / 2, cy: garage.y + garage.h / 2, doorX: garage.x + garage.w / 2, doorY: garage.y + garage.h + 8 };
        for (let i = 0; i < 6; i += 1) trees.push({ x: range(rng, rect.x + 16, rect.x + rect.w - 16), y: range(rng, rect.y + rect.h - 60, rect.y + rect.h - 16), r: range(rng, 9, 13), palm: false });
        continue;
      }
      if (landmark === 'warehouse') {
        const b = makeBuilding(rng, rect.x + 40, rect.y + 70, rect.w - 80, rect.h - 140, districtKey, false);
        b.color = '#7a7568'; b.roof = '#46443e'; b.height = 16; b.warehouse = true;
        buildings.push(b);
        specials.warehouse = { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h + 26, doorX: b.x + b.w / 2, doorY: b.y + b.h + 6 };
        continue;
      }
      if (landmark === 'docks') {
        // The docks: crates and a pier office at the water's edge.
        const b = makeBuilding(rng, rect.x + 60, rect.y + 90, rect.w - 120, rect.h - 200, districtKey, false);
        b.color = '#6b7a72'; b.roof = '#3e4a44'; b.height = 12; b.docks = true;
        buildings.push(b);
        specials.docks = { x: b.x, y: b.y, w: b.w, h: b.h, cx: rect.x + rect.w / 2, cy: rect.y + rect.h - 30, doorX: b.x + b.w / 2, doorY: b.y + b.h + 6 };
        specials.yacht = { x: WORLD.waterX - 60, y: 340, w: 90, h: 34 };
        continue;
      }
      if (landmark === 'hotel') {
        const b = makeBuilding(rng, rect.x + 50, rect.y + 60, rect.w - 100, rect.h - 140, districtKey, true);
        b.color = '#e8dcc8'; b.roof = '#7a6a52'; b.height = 52; b.hotel = true;
        buildings.push(b);
        specials.hotel = { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h + 26, doorX: b.x + b.w / 2, doorY: b.y + b.h + 6 };
        continue;
      }

      // Ordinary block: 1-4 buildings with streets between them.
      const tall = pal.tall;
      const count = tall ? int(rng, 1, 2) : int(rng, 2, 4);
      if (count === 1) {
        buildings.push(makeBuilding(rng, rect.x + 30, rect.y + 30, rect.w - 60, rect.h - 60, districtKey, tall));
      } else if (count === 2) {
        const vertical = chance(rng, 0.5);
        if (vertical) {
          buildings.push(makeBuilding(rng, rect.x + 24, rect.y + 24, rect.w / 2 - 36, rect.h - 48, districtKey, tall));
          buildings.push(makeBuilding(rng, rect.x + rect.w / 2 + 12, rect.y + 24, rect.w / 2 - 36, rect.h - 48, districtKey, tall));
        } else {
          buildings.push(makeBuilding(rng, rect.x + 24, rect.y + 24, rect.w - 48, rect.h / 2 - 36, districtKey, tall));
          buildings.push(makeBuilding(rng, rect.x + 24, rect.y + rect.h / 2 + 12, rect.w - 48, rect.h / 2 - 36, districtKey, tall));
        }
      } else {
        const qw = rect.w / 2 - 30;
        const qh = rect.h / 2 - 30;
        buildings.push(makeBuilding(rng, rect.x + 18, rect.y + 18, qw, qh, districtKey, tall));
        buildings.push(makeBuilding(rng, rect.x + rect.w / 2 + 12, rect.y + 18, qw, qh, districtKey, tall));
        buildings.push(makeBuilding(rng, rect.x + 18, rect.y + rect.h / 2 + 12, qw, qh, districtKey, tall));
        buildings.push(makeBuilding(rng, rect.x + rect.w / 2 + 12, rect.y + rect.h / 2 + 12, qw, qh, districtKey, tall));
      }

      // A few sidewalk trees around the block.
      const treeCount = int(rng, 2, 6);
      for (let i = 0; i < treeCount; i += 1) {
        const edge = int(rng, 0, 3);
        if (edge === 0) trees.push({ x: range(rng, rect.x, rect.x + rect.w), y: rect.y - 14, r: range(rng, 8, 13), palm: districtKey === 'beachfront' || districtKey === 'marina' });
        else if (edge === 1) trees.push({ x: range(rng, rect.x, rect.x + rect.w), y: rect.y + rect.h + 14, r: range(rng, 8, 13), palm: districtKey === 'beachfront' || districtKey === 'marina' });
        else if (edge === 2) trees.push({ x: rect.x - 14, y: range(rng, rect.y, rect.y + rect.h), r: range(rng, 8, 13), palm: districtKey === 'beachfront' || districtKey === 'marina' });
        else trees.push({ x: rect.x + rect.w + 14, y: range(rng, rect.y, rect.y + rect.h), r: range(rng, 8, 13), palm: districtKey === 'beachfront' || districtKey === 'marina' });
      }
    }
  }

  // Street lamps at every intersection.
  for (let i = 0; i <= cols; i += 1) {
    for (let j = 0; j <= rows; j += 1) {
      lamps.push({ x: vRoadX(i) + road / 2 + 6, y: hRoadY(j) - road / 2 - 6 });
    }
  }

  const city = { buildings, trees, lamps, specials, seed };

  /** Push a circle (x, y, radius) out of every building and the water wall. */
  city.resolveCollision = function resolveCollision(x, y, radius) {
    let px = x;
    let py = y;
    for (let pass = 0; pass < 2; pass += 1) {
      for (const b of buildings) {
        const nx = Math.max(b.x, Math.min(px, b.x + b.w));
        const ny = Math.max(b.y, Math.min(py, b.y + b.h));
        const dx = px - nx;
        const dy = py - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 < radius * radius) {
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            px = nx + (dx / d) * radius;
            py = ny + (dy / d) * radius;
          } else {
            // Centre inside the building: push out along the smallest axis.
            const left = px - b.x;
            const right = b.x + b.w - px;
            const top = py - b.y;
            const bottom = b.y + b.h - py;
            const m = Math.min(left, right, top, bottom);
            if (m === left) px = b.x - radius;
            else if (m === right) px = b.x + b.w + radius;
            else if (m === top) py = b.y - radius;
            else py = b.y + b.h + radius;
          }
        }
      }
    }
    if (px > WORLD.waterX - radius) px = WORLD.waterX - radius;
    if (px < radius) px = radius;
    if (py < radius) py = radius;
    if (py > WORLD.height - radius) py = WORLD.height - radius;
    return { x: px, y: py };
  };

  /** True when a circle overlaps any building. */
  city.hitsBuilding = function hitsBuilding(x, y, radius) {
    for (const b of buildings) {
      const nx = Math.max(b.x, Math.min(x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(y, b.y + b.h));
      if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < radius * radius) return true;
    }
    return false;
  };

  /** A random point on a road, with the road's direction (radians). */
  city.randomRoadPoint = function randomRoadPoint(rng) {
    if (chance(rng, 0.5)) {
      const i = int(rng, 0, cols);
      const y = range(rng, 60, WORLD.height - 60);
      const dir = chance(rng, 0.5) ? Math.PI / 2 : -Math.PI / 2;
      return { x: vRoadX(i) + (dir > 0 ? 22 : -22), y, angle: dir };
    }
    const j = int(rng, 0, rows);
    const x = range(rng, 60, WORLD.sandX - 60);
    const dir = chance(rng, 0.5) ? 0 : Math.PI;
    return { x, y: hRoadY(j) + (dir === 0 ? 22 : -22), angle: dir };
  };

  return city;
}
