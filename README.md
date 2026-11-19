# PALMERA BAY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/farah2222/gta6-01-v2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/farah2222/gta6-01-v2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). Referral code: 03swhpzc (https://make.fun/r/03swhpzc).

**Palmera Bay** is a complete original open-world crime game that runs in a desktop
browser from static files. You are **Danny Reyes**, a young driver fresh off the bus in
Palmera Bay — a sun-soaked coastal city of glass towers, palm-lined boulevards, a long
beach and a pier. You are broke, but the fixer **Marisol Vega** has work for anyone with
fast hands and a faster car. Run her five jobs, dodge the Palmera Bay police, and earn
enough to make this city yours.

Everything in the game is original: the city, the characters, the vehicles, the story,
the art and the sound. No Rockstar / GTA names, characters, maps or assets are used.

## What is in the game

- **A 3D open-world city** (three.js): road grid with downtown glass towers, suburbs,
  beach houses, sidewalks, palm trees, a beach with umbrellas and a lifeguard tower, a
  wooden pier with a getaway boat, streetlights, drifting clouds, sun and sea.
- **On foot**: third-person character, WASD movement, mouse-drag orbit camera, Shift to
  run, Space to jump, F / click to punch.
- **Cars**: eight parked drivable cars with distinct colours and speeds. Press **E** near
  one to get in or out. Driving uses W/S for accelerate and brake/reverse and A/D to
  steer, with a chase camera, body lean, spinning wheels and car damage.
- **Traffic**: AI cars that drive the road network, turn at intersections and stop for
  cars ahead, plus pedestrians strolling the sidewalks.
- **Wanted system**: 1–5 stars. Stealing a car, hitting a pedestrian or an officer, or
  ramming a police car raises the heat. Patrol cars chase and ram you; foot officers run
  you down and try to arrest you. Stay out of sight and the heat cools off. Getting
  caught is **BUSTED**; losing all your health is **WASTED**.
- **Missions**: a five-job story chain for Marisol Vega with on-screen objectives, a
  3D waypoint beacon, an edge-of-screen arrow, a minimap marker, dialogue and cash
  rewards — a timed delivery, a pickup with a 2-star getaway, a car theft, a beach-road
  checkpoint race, and a final 3-star getaway to the boat.
- **HUD**: live minimap (roads, player arrow, mission marker, police dots, traffic),
  health bar, money, wanted stars, speedometer and car health, mission objective, timer,
  message feed and a controls hint.
- **Screens & saving**: start screen with the story, pause menu, mission-complete toasts,
  BUSTED / WASTED / mission-failed / story-complete screens, and progress (money,
  missions, stats) saved to localStorage.
- **Sound**: fully procedural WebAudio — engine hum tied to speed, two-tone police
  siren, pickup chimes, crashes, punches and UI clicks. **M** mutes.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move on foot / drive |
| Mouse drag | Orbit camera |
| Shift | Run |
| Space | Jump |
| E | Enter / exit car |
| F or click | Punch |
| P / Esc | Pause |
| M | Mute sound |
| R | Retry after BUSTED / WASTED / failed mission |

## How to run locally

```bash
node serve.ts
# open http://localhost:8080
```

Node 22 or later. No build step and no network at runtime: the game is static files
under `game/`, and three.js is vendored as `game/vendor/three.module.min.js`.

## Tech

- **three.js** (vendored, minified build) for the 3D city, cars and characters.
- Plain ES modules under `game/js/`, one job per file: `city`, `player`, `vehicles`,
  `traffic`, `police`, `missions`, `hud`, `audio`, `utils`, `main`.
- `main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to
  `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` with the kit's
  `buildDossier` from `vendor/makefun-game.ts`.

## Screenshots

See `screenshots/`: driving downtown, on foot in the city, a police chase with wanted
stars, and a mission moment — all captured from the running game.
