[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solara Bay — an open-world crime game

A full open-world crime game in the spirit of GTA 6, rebuilt from scratch for the make.fun **gta6-01** bounty ("Make GTA 6"). It runs offline in a desktop browser from static files — no network, no libraries, no build step.

See the bounty: https://make.fun/bounty/gta6-01

**The city:** Solara Bay, a sun-soaked coastal city with six districts — Downtown, the Marina, Old Town, the Industrial Quarter, Beachfront and the Hills — plus a bay, a beach, parks, a safehouse and a garage.

**The story:** Rio "Rook" Santana, a getaway driver new in town, works his way up from his first stolen car to the biggest score in Solara Bay history across six story missions, with chases, a street race, a rescue and a museum heist. Everything — city, characters, vehicles, names, story, art, sound and music — is original. Nothing is taken from Rockstar Games or any other commercial game.

## Run it

- Open `game/index.html` in desktop Chrome, or
- run `node serve.ts` and open http://localhost:8080/

## How to play

| Key | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| E | Enter / exit a car (steal it) |
| Mouse + click | Aim / shoot |
| Space | Handbrake (in car) |
| Shift | Sprint |
| Q | Switch weapon |
| R | Reload |
| C | Change radio station |
| M | Mute |
| P / Esc | Pause |
| F | Save (at the Safehouse) |

## Systems

- **On foot and by car** — distinct handling, car damage, smoke and fire
- **Traffic and pedestrians** — cars follow the roads, pedestrians stroll the sidewalks and flee from gunfire
- **Stealing cars** — take any parked or driven car; the owner calls it in
- **Wanted system** — 1–5 stars, police pursuit, roadblocks at 3+, a helicopter at 4+, and getting busted
- **Six story missions** — a bank getaway, a street race, a rescue, a warehouse war and a museum diamond heist
- **Combat** — fists, pistol, SMG and shotgun, plus armed guards who shoot back
- **HUD + live minimap** — wanted stars, health, armour, money, objectives, speed
- **Safehouse** — save and continue
- **Sound and music** — WebAudio effects and three procedural radio stations
- **Golden hour to dusk** — the light shifts as the in-game clock runs

## Layout

```
game/
  index.html        entry point
  src/
    config.js       tuning, palettes, districts, cars, weapons
    random.js       seeded RNG + math helpers
    input.js        keyboard + mouse, one-shot presses
    city.js         the seeded city: blocks, landmarks, collision
    world.js        live state: player, cars, wanted, pickups
    traffic.js      traffic cars + pedestrians
    police.js       pursuit, roadblocks, helicopter, busted
    combat.js       weapons, enemies, bullets
    missions.js     the six story missions
    simulate.js     one frame: every system in order
    audio.js        WebAudio effects + procedural radio
    render.js       canvas world, HUD, minimap, menus
    shots.js        the four staged screenshot scenes
    save.js         localStorage save / load
    main.js         screens, game loop, controls
main.ts             the program that hands the entry in (dossier.json)
serve.ts            tiny static server for local play-testing
shots.json          the four screenshots and their scene queries
```

## Screenshots

The four dossier screenshots are staged by `shots.js` — each one plays the real game forward for a few seconds with an autopilot, so every frame is a genuine render of the game: `1-cover.jpg` (bank getaway through downtown, 3 stars), `2-chase.jpg` (five-star chase at dusk on Beachfront), `3-mission.jpg` (the warehouse shootout), `4-menu.jpg` (the title screen).

## License

MIT — see `LICENSE`.
