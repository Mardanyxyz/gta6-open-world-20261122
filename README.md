# Solara Bay — an open-world crime game

A complete open-world crime game in the spirit of GTA 6, built from scratch
for make.fun's **gta6-01** bounty ("Make GTA 6"). It plays offline in a desktop
browser from static files — no network requests, no libraries, no build step.

**The city:** Solara Bay, a sun-soaked coastal city with six districts —
Downtown, the Marina, Old Town, the Industrial Quarter, Beachfront and the
Hills — plus a bay, a beach, parks, a safehouse and a garage.

**The story:** Rio "Rook" Santana, a getaway driver new in town, works his way
up from his first stolen car to the biggest score in Solara Bay history across
six story missions, with dialogue, chases, a street race, a rescue and a museum
heist. Everything — city, characters, vehicles, names, story, art, sound and
music — is original. Nothing is taken from Rockstar Games or any other
commercial game.

## Play

Open `game/index.html` in desktop Chrome (or run `node serve.ts` and open
http://localhost:8080/game/).

| Key | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| E | Enter / exit a car (steal it) |
| Mouse + click | Aim / shoot |
| Space | Handbrake (in car) / punch (on foot) |
| Shift | Sprint |
| 1 / 2 | Fists / pistol |
| R | Reload |
| P / Esc | Pause |
| M | Mute radio & sound |
| F5 | Quick save (at the safehouse) |

## Systems

- **On foot and by car** — distinct handling, car damage, smoke and fire
- **Traffic and pedestrians** — cars follow the roads, pedestrians stroll the
  sidewalks and flee from gunfire
- **Wanted level 1–5** — police cars chase, roadblocks at 3+, a police
  helicopter at 4+, wanted decays when you lay low
- **6 story missions** with dialogue, objectives, markers and a minimap blip
- **Combat** — fists and pistol, ammo, health pickups, enemy guards
- **Money & respect** — mission payouts, cash pickups, respect ranks from
  Wheelman to Bay Legend
- **Garage & safehouse** — store cars, repair and respray, save your game
- **HUD & live minimap** — health, money, wanted stars, ammo, speed, mission
  objective, radio station
- **Procedural sound** — WebAudio sound effects and three radio stations
  (synthwave, latin groove, talk radio) generated live, no audio files
- **Save / load** — progress saved to localStorage at the safehouse

## Layout

```
main.ts            entry program: copies game/ + screenshots/ to /output,
                   writes dossier.json with vendor/makefun-game.ts
serve.ts           tiny static server for local testing
game/
  index.html       page shell, canvas + HUD overlay
  src/
    config.js      tuning constants and palettes
    random.js      seeded RNG
    audio.js       WebAudio SFX + procedural radio
    input.js       keyboard + mouse
    city.js        city generation: roads, blocks, districts, props
    world.js       game state: player, cars, peds, police, wanted
    traffic.js     traffic + pedestrian AI
    police.js      police chase, roadblocks, helicopter
    missions.js    six story missions, dialogue, objectives
    combat.js      shooting, melee, pickups
    render.js      canvas rendering, HUD, minimap, menus
    save.js        localStorage save / load
    shots.js       deterministic screenshot scenes (?shot=cover|chase|mission|menu)
    main.js        game loop + state machine
vendor/
  makefun-game.ts  make.fun dossier library (kit copy, unchanged)
screenshots/      four real renders of the game's own code
```

## License

MIT — see `LICENSE`.
