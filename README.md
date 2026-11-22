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
| 1 / 2 / 3 | Fists / pistol / SMG |
| R | Reload |
| C | Change radio station |
| M | Mute |
| P / Esc | Pause |
| F5 | Quick save (at the safehouse) |

## Systems

- **On foot and by car** — distinct handling, car damage, smoke and fire
- **Traffic and pedestrians** — cars follow the roads, pedestrians stroll the
  sidewalks and flee from gunfire
- **Stealing cars** — take any parked or driven car; the owner calls it in
- **Wanted system** — 1–5 stars, police pursuit, roadblocks at 3+, a
  helicopter at 4+, and getting busted
- **Six story missions** — dialogue, a bank getaway, a street race, a rescue
  and a museum diamond heist
- **Combat** — fists, pistol and SMG, plus armed guards who shoot back
- **HUD + live minimap** — wanted stars, health, money, objectives, speed
- **Garage and safehouse** — store and repair cars, save and continue
- **Sound and music** — WebAudio effects and three procedural radio stations
- **Golden hour to dusk** — the light shifts as the in-game clock runs

## Layout

```
game/
  index.html        entry point
  src/
    config.js       tuning, palettes, districts
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

The four dossier screenshots are staged by `shots.js` — each one plays the
real game forward for a few seconds with an autopilot, so every frame is a
genuine render of the game: `1-cover.jpg` (getaway through downtown),
`2-chase.jpg` (five-star chase), `3-mission.jpg` (the warehouse shootout),
`4-menu.jpg` (the title screen).

## License

MIT — see `LICENSE`.
