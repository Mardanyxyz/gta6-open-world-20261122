// Solara Bay — a complete open-world crime game for make.fun's gta6-01 bounty.
// The program that hands the entry in: it copies this repository's game/ and
// screenshots/ into the output directory and writes dossier.json with the
// vendored make.fun library, exactly as the bounty requires. Node 22, standard
// library only. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function countEntries(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    total += 1;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) total += countEntries(full);
  }
  return total;
}

function dirSize(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    total += st.isDirectory() ? dirSize(full) : st.size;
  }
  return total;
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Refuse early, with a clear message, what the sealed scorer would refuse:
// more than 4 screenshots or one over 256 KiB, or a game/ tree over the
// scorer's caps (993 entries, 48 MiB). The dossier cap shapes the bytes.
const shots = existsSync(join(here, 'screenshots')) ? readdirSync(join(here, 'screenshots')) : [];
if (shots.length > 4) throw new Error(`too many screenshots: ${shots.length} (max 4)`);
for (const name of shots) {
  const size = statSync(join(here, 'screenshots', name)).size;
  if (size > 262144) throw new Error(`screenshot ${name} is ${size} bytes (max 262144)`);
}
const gameEntries = countEntries(join(here, 'game'));
if (gameEntries > 993) throw new Error(`game/ has ${gameEntries} entries (max 993)`);
const gameBytes = dirSize(join(here, 'game'));
if (gameBytes > 50331648) throw new Error(`game/ is ${gameBytes} bytes (max 50331648)`);

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Solara Bay dossier written to ${out} (${shots.length} screenshots, ${gameEntries} game entries)`);
