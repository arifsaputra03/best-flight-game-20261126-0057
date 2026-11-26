# Golden Hour

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/arifsaputra03/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/arifsaputra03/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Sunset sorties over Gullwing Bay, in the Kestrel KH-1.**

Golden Hour is a complete little flight game that runs entirely offline in a
desktop browser. One sortie: throttle up on the strip at Gullwing Bay, lift off
into the evening, thread the six gold rings around the bay — over the east
fields, above the harbour town of Port Saffron, out over the water and home —
then come back and land before the fuel runs out. Thread a ring dead centre for
a bonus; grease the landing for another. Sink too hard, drop her in with the
gear up, ditch in the bay, or bend her on a rough field, and the sortie ends
the way those sorties end.

Built for the make.fun bounty
[best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057).

## Play it

Serve the `game/` folder with any static file server — or use the one bundled
here (Node 22, no dependencies):

```sh
node serve.ts          # then open http://localhost:8080
```

Press **Enter** to fly. Everything is keyboard and mouse; nothing is loaded
from the network.

| Key | Does |
| --- | --- |
| W / S | throttle up / down (mouse wheel works too) |
| Arrow Up / Arrow Down | pitch the nose down / up |
| Arrow Left / Arrow Right | roll left / right |
| A / D | rudder left / right |
| Mouse drag | the stick: pitch and roll together |
| G | landing gear up / down |
| B | brakes on the ground, airbrake in the air |
| C | cockpit / chase camera |
| P | pause |
| M | mute |
| R | restart after landing or crashing |
| Enter | start the sortie |

## The aeroplane and the bay

The Kestrel KH-1 is an original cream-and-red high-wing tourer, built from
boxes and frusta in code — cowl, glazed cabin, struts, taildragger gear that
retracts, a propeller that spools up with the throttle and blurs into a disc.
She stalls if you haul her nose up too slowly, turns by banking, burns more
fuel the harder you push her, and tells you about all of it through six lit
gauges (airspeed, altimeter, attitude, heading, vertical speed, engine/fuel),
a compass strip, and tapes in the chase view.

Gullwing Bay is one hand-modelled piece of country: a bay and an inlet, a
patchwork of fields, the Saffron Hills, a northern ridge, the harbour town of
Port Saffron with its windows lit for the evening, and a grass plateau holding
the strip — threshold bars, centreline dashes, edge lights and PAPI, a hangar,
a tower and fuel drums. The sun sits low in the west the whole sortie; the fog
is golden.

## Scoring

- Through a ring: **100** points, **150** through the centre.
- Finishing all six rings: **250**.
- Landing: greased **300** · firm **200** · hard **80** — judged on sink rate.
- Fuel left in the tank at the end counts too, if you finished the course.

## How it is made

Plain static files and hand-rolled code — no engine, no libraries, no network:

- `game/src/render3d.js` — a small WebGL renderer: gradient sky with sun disc
  and glow, sun-lit terrain with painted fields, billboard clouds, golden fog.
- `game/src/flight.js` — the sortie model: engine spool and fuel, lift, stall,
  banked turns, ground handling, ring passes, touchdown grading.
- `game/src/world.js` — the analytic landscape every other system reads.
- `game/src/aircraft.js`, `geometry.js` — the Kestrel, built vertex by vertex.
- `game/src/hud.js` — the canvas HUD: panel gauges, tapes, markers, panels.
- `game/src/audio.js` — procedural WebAudio: engine, wind, stall beeper, chimes.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with the kit's library.

MIT licensed — see `LICENSE`.
