# Working on SPHEREx Sky

The rules that keep the project clean. Read this before adding a feature, an animation, or merging another copy
of the project.

## 1. Where things go

| What | Where |
|---|---|
| Page markup (header, dialogs) | `index.html` (ids are the contract with the viewer) |
| Intro | `ui/src/intro/` + `css/intro.css` |
| Story Tour page (hero + sections) | `ui/src/story/` (React) + `css/story.css`, `css/hero.css` (section 1) |
| What a story section *does* (buttons, canvases) | `ui/src/viewer/story/<section>.js` |
| 3D globe, camera, landmarks | `ui/src/viewer/sky/` + `css/sky.css` |
| "See it change" explorer (5 modes) | `ui/src/viewer/explorer/` + `css/explorer.css` |
| Dialogs (gallery, search, IRSA, ...) | `ui/src/viewer/panels/` + `css/dialogs.css` |
| Header, modal, toast helpers | `ui/src/viewer/ui/` + `css/header.css`, `css/dialogs.css` |
| Shared tokens, buttons, form fields | `css/base.css` |
| Data (targets, epochs, landmarks, texts) | `ui/src/data/*.json` — data, never code |
| Backend (API, IRSA, FITS, email) | `backend/` (`server.py` only starts it) |
| Data pipeline scripts | `scripts/` |
| Tests | `tests/` |

* One file = one job. If a file grows past ~300 lines or does two things, split it.
* No inline `style="..."` in `index.html` (one exception: `#ui-boot`, it must paint before any CSS loads).
  Put the rule in the CSS file of that area.
* Dead code is deleted, not commented out. Git keeps the history.
* `js/ui.bundle.js` is a build output: never edit it, run `npm run build`.

## 2. Animations

Everything runs on **one** GSAP and **one** Lenis, from npm (`import gsap from 'gsap'`). Never add a CDN copy
of GSAP, Lenis or three.js: two copies fight over the same elements.

* Scroll the page only through `glideTo()` / `topOf()` (`ui/src/story/scroll.ts`). It respects calm mode and the
  section pager; `window.scrollTo` or a second Lenis would not.
* Don't animate a property that something else already animates on the same element. Known owners:
  `#hc` opacity / filter (Hero.tsx scroll dissolve), `#top` + `.bg-watermark` (viewer/ui/chrome.js entrance),
  `#spFill` width (viewer/ui/header.js), the camera (viewer/sky/camera.js).
* After an entrance, `clearProps` so CSS hovers keep working.
* **Calm mode** (Windows "Animation effects" off, macOS "Reduce motion", or `?motion=reduced`): fades only, no
  travelling / zooming / blur. Check `prefersReducedMotion` (`core/env.ts`); in CSS use `.reduce-motion`, not the
  media query (the `?motion=` override must win). Test both modes.
* New sky movement for a story section: add it to `SECTIONS` in `viewer/story/sky-sync.js`.

## 3. Ids and data

* The viewer binds by element id. Renaming an id in `index.html` or a React component = updating the module that
  uses it (search for `'#theId'`).
* Story inputs are uncontrolled (`defaultValue`) and containers the viewer fills (`#storyBenchmarkGrid`) are
  rendered empty: React must never re-render their children.
* A new target = a new entry in `ui/src/data/field/*.json` (+ `target-insights.json` for its metrics panel,
  + FITS cutouts in `data/movers_cutouts/` and `backend/config.py KNOWN_BENCHMARKS` if the backend serves it).

## 4. Run and test

```bash
npm install                 # once (Playwright uses your installed Chrome; else: npx playwright install chromium)
pip install numpy astropy matplotlib pillow requests reproject
npm run dev                 # http://localhost:5173 (backend on :8080)
npm test                    # 132-check e2e suite + behaviour + intro flow, full and calm motion
```

`npm test` uses the server at `BASE_URL` (default `http://localhost:8080`) or starts `python server.py` itself.
`BASE_URL=http://localhost:5173 npm test` checks the dev server.

Before a refactor (a change that should look and behave exactly the same):

```bash
npm run snapshot:save       # rendered HTML of every target/mode + computed styles on 11 screens (tests/.baselines/)
# ... change things ...
npm run snapshot:compare    # every difference is listed; 0 = nothing visible changed
```

Backend refactor: run the old and the new server side by side and
`python tests/api_compare.py http://localhost:8080 http://localhost:8091` (all endpoints + a full cutout job).

Finish with `npm run typecheck`, `npm run build`, bump the `?v=` of anything you changed in `index.html`, and
`npm test` again.

## 5. Merging another copy of the project

Never copy files from an older copy over this structure (an old `app.js`, `style.css` or `data.js` would bring
back the bugs and the leftovers). Instead:

1. Find the version that copy started from (a git commit, ideally) and take **only its differences**
   (`git diff <start>..<copy>`).
2. Move each change to where it belongs today (table above): a change to the old `js/app.js` gallery code goes to
   `ui/src/viewer/panels/gallery.js`, a new target in `js/data.js` goes to `ui/src/data/field/*.json`,
   a rule from `css/style.css` goes to the matching `css/*.css` file, a change to `server.py` goes to `backend/`.
3. `npm test`, the snapshots where relevant, then commit.
