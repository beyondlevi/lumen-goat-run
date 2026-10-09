// Renders public/icon-192.png and public/icon-512.png: the goat from behind, running up its lanes,
// in line art on black (the game's Rokid palette). Uses headless Chrome:
// CHROME_PATH=/path/to/chrome node scripts/render-icons.mjs (default /usr/bin/google-chrome).
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const chrome = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

// The goat of the game (src/art.ts), 72 x 84 local units, feet at y 84.
const goat = `
  <path d="M32 9 C29 2 21 -1 17 3 C14 7 17 11 21 9"/>
  <path d="M40 9 C43 2 51 -1 55 3 C58 7 55 11 51 9"/>
  <path d="M29 12 C29 6 43 6 43 12 L43 20 C43 24 40 27 36 27 C32 27 29 24 29 20 Z" fill="#0B2617"/>
  <path d="M29 14 L19 15 L28 19 M43 14 L53 15 L44 19"/>
  <path d="M36 23 C44 23 49 27 51 33 C57 39 60 46 59 53 C58 60 50 65 36 65 C22 65 14 60 13 53 C12 46 15 39 21 33 C23 27 28 23 36 23 Z" fill="#0B2617"/>
  <path d="M36 27 L36 33"/><path d="M36 46 Q37 39 42 37"/>
  <path d="M17 58 L20 63 L23 59 L26 64 L29 60 L32 65 L36 61 L40 65 L43 60 L46 64 L49 59 L52 63 L55 58"/>
  <path d="M25 63 L20 72 L25 78 M47 63 L49 84 M31 64 L30 81 M41 64 L45 71 L42 75"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#000000"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M56 104 L456 104" stroke="#2E7D50" stroke-width="8"/>
    <path d="M249 110 L36 520 M263 110 L476 520" stroke="#4FBF7E" stroke-width="13"/>
    <path d="M251 126 L248 142 M244 166 L240 190 M235 220 L230 252 M261 126 L264 142 M268 166 L272 190 M277 220 L282 252" stroke="#4FBF7E" stroke-width="9"/>
    <g transform="translate(300 232) scale(1.35)" fill="#154027" stroke="#C6FFDD" stroke-width="4.2">
      <path d="M0 -30 Q2 -18 8 -12" fill="none"/>
      <circle cx="-6" cy="-36" r="6"/><circle cx="6" cy="-36" r="6"/><circle cx="-6" cy="-24" r="6"/><circle cx="6" cy="-24" r="6"/>
    </g>
    <g transform="translate(151.6 247.4) scale(2.9)" stroke="#E2FFEE" stroke-width="3.2">${goat}</g>
  </g>
</svg>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'goat-run-icon-'));
for (const size of [512, 192]) {
  const html = path.join(dir, `icon-${size}.html`);
  fs.writeFileSync(html, `<!doctype html><html><head><style>html,body{margin:0;background:#000}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`);
  const out = path.join(root, 'public', `icon-${size}.png`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--window-size=${size},${size}`, `--screenshot=${out}`, `file://${html}`], {stdio: 'ignore'});
  console.log(`render-icons: public/icon-${size}.png`);
}
fs.rmSync(dir, {recursive: true, force: true});
