# Goat Run

An endless lane runner for [Rokid Lumen](https://github.com/beyondlevi/rokid-lumen) glasses,
played with the Meta Neural Band. The goat of Goat Climb, seen from behind, runs down three lanes:
change lanes, jump and slide past what comes, pick up clovers, and see how far you get.

| Band | In the game |
| --- | --- |
| Swipe left | One lane left |
| Swipe right | One lane right |
| Swipe up | Jump over low things: rocks, fences (on the title: play; after a crash: run again) |
| Swipe down | Slide under low branches (mid-air: drop and slide) |
| Index tap | How to play; resume from the pause |
| Middle tap | Pause; quit from the pause; exit from the title |

Boulders and trees block their lane: change lanes. Some rows block two lanes: take the third. On
an ice patch you cannot change lanes, but you can still jump and slide. A gesture that comes a
little early still counts (a jump just before landing, a lane change just before the ice ends).
The score is the distance, in meters; the best one, and the zone it reached, stay on the glasses.

## Three zones

| Distance | Zone | Speed | What changes |
| --- | --- | --- | --- |
| 0 m | Meadow | 10 to 11.5 m/s | Rocks, fences and boulders |
| 500 m | Forest | 12.5 to 14 m/s | Low branches (slide under them) and trees |
| 1,200 m | Snow | 15 to 17 m/s | Ice patches: no lane changes on them. Faster up to 2,000 m |

Every track is generated from a seed, and every row of obstacles leaves a way through from any
lane you could have passed the row before, with time for the band's latency (up to about 0.4 s
from a gesture to the game): a free lane, a jump or a slide. Obstacles show from 50 m away, at
least 2.3 s before they reach the goat at the top speed, and no row comes while a zone's banner
covers the road. The unit tests check it on 200 tracks and run 20 of them to 2,000 m with an
automatic player that only uses the four swipes, each one arriving late.

## Install on the glasses

Download the `.mrbd.zip` from the latest [release](https://github.com/beyondlevi/lumen-goat-run/releases)
and add it from the Lumen companion's Apps tab, or push it to the glasses:

```sh
adb push lumen-goat-run-<version>.mrbd.zip /sdcard/Android/data/dev.lumen.glasses/files/webapps/
```

Lumen installs it the next time its home opens. The game runs offline: it never uses the
internet.

## Development

```sh
npm ci
npm run dev        # http://localhost:5173 (arrows, Enter, Escape play it)
npm run typecheck
npm test           # unit tests: the track's fairness, collisions, ice, zones, the screens, the texts, and the automatic player
npm run package    # dist/lumen-goat-run.mrbd.zip
npm run test:e2e   # after a build: plays it in Chromium and Firefox, screenshots in .e2e-output/
```

`CHROME_PATH=/usr/bin/google-chrome E2E_BROWSERS=chromium,firefox npm run test:e2e` uses an
installed Chrome. The game draws on a 600 x 600 canvas, the square Lumen gives a web app, with
line art on black: black is see-through on the glasses, and their green display turns colors into
brightness. The texts are in English and Brazilian Portuguese (`src/i18n.ts`). The icons come from
`node scripts/render-icons.mjs` (headless Chrome).

## License

MIT (see [LICENSE](LICENSE)). The fonts, [Bungee](https://github.com/djrrb/Bungee) and
[Chakra Petch](https://github.com/m4rc1e/Chakra-Petch), are under the SIL Open Font License 1.1
(`public/fonts/OFL-*.txt`).
