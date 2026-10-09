# Working on this game

A [Rokid Lumen](https://github.com/beyondlevi/rokid-lumen) web app: a canvas game that Lumen runs
offline on Rokid glasses from a `.mrbd.zip` package. Lumen's guide for apps is
[docs/building-apps.md](https://github.com/beyondlevi/rokid-lumen/blob/main/docs/building-apps.md).
It doesn't use the UI Toolkit for Meta Ray-Ban Display: it follows its own approved design, drawn
as line art on a `<canvas>`.

## Rules

- **The band drives it as keys.** Swipes are arrow keys (left and right change lanes, up jumps,
  down slides), the index tap is `Enter`, the middle tap is Back (`Escape`, sent to the focused
  element). Call `preventDefault()` on `Escape` only when the game used it: on the title it must
  reach Lumen, which closes the app. Ignore repeated keys.
- **Fair tracks, with the band's latency.** A gesture may take up to about 0.4 s to arrive.
  `Track` builds every row so that, from every lane the goat can pass the row before, there is a
  way through in time (the timing model is `TIMING` and `need()` in `src/track.ts`); ice only lies
  in a lane that is open at the next row; no row comes while a zone's banner covers the road. The
  unit tests check it on many seeds, with an automatic player that only uses the four swipes.
- **Set the canvas transform every frame.** When the glasses sleep, Android may kill Gecko's GPU
  process, and the canvas comes back reset; a scale set once is lost then.
- **A hidden app is suspended.** On `visibilitychange` a run pauses, and its distance is already
  kept as the best (also when a run is quit from the pause).
- **Black is see-through on the glasses**, and their display is green: colors become brightness.
  Use the design's Rokid palette (`src/art.ts`); texts at least 14 px, only in its bright text
  colors.
- **The screen is 600 x 600 CSS px** (Lumen's web app square). Animations run at about 30 fps
  there: the game moves in fixed time steps, and motion must read at 30 fps.
- **Offline.** Fonts and everything else ship in the package; nothing loads from the internet.
  The manifest has no `lumen_internet` and no `lumen_config`.
- **English first, multilingual from the start.** Every text lives in `src/i18n.ts`, English by
  default and Brazilian Portuguese (`pt`, for any `pt-*`) with it; placeholders, never
  concatenation; numbers through `Intl.NumberFormat`. Code, comments, docs and commits in English.
- **GeckoView only** (Firefox 156 on the glasses).

## Commands

- `npm run dev`, `npm run typecheck`, `npm test` (unit), `npm run test:e2e` (after a build: plays
  the game in Chromium and Firefox with the band's keys, screenshots in `.e2e-output/`)
- `npm run package` builds `dist/lumen-goat-run.mrbd.zip`, the package Lumen installs.
