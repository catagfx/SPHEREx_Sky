# SPHEREx Sky — front end (`ui/src/`)

One Vite build of everything that runs in the page: **React 18 + TypeScript** (intro, Story Tour page),
the **3D viewer** (three.js r128, modern JS modules), **GSAP** (ScrollTrigger, SplitText, ScrollToPlugin) and
**Lenis**, all from npm. `npm run build` writes one classic script, `../js/ui.bundle.js`, which is committed so
`python server.py` runs with no npm at all.

```
ui/src/
  main.tsx              boot order: story page -> intro -> smooth scroll -> viewer
  core/                 shared by everything
    env.ts              calm mode (prefers-reduced-motion, ?motion=full|reduced|auto), embed mode
    globals.ts          one GSAP instance; gsap / Lenis also on window for the e2e suite and the console
    smooth-scroll.ts    the page's Lenis instance (getLenis)
    store.ts            sceneReady / reveal / error, shared by the intro and the viewer
    header.ts           search button width = brand width
  intro/                ── INTRO ──────────────  css/intro.css
    Intro.tsx           flying stars -> SPHEREx title over the sky -> the first scroll reveals the page
    Warp.tsx            GLSL star field (raw WebGL)
  story/                ── STORY TOUR PAGE ────  css/story.css (+ css/hero.css: section 1)
    Story.tsx           section order (= scroll order)
    Hero.tsx            section 1 (+ Constellation.tsx, the hero's sky)
    ShowcaseSection.tsx card shell of sections 2-6; sections/ PlanetX · Diff · Benchmarks · Spectro · Citizen
    useSectionPager.ts  one scroll gesture = one section
    useSectionReveal.ts card entrance on scroll
    ProgressNav.tsx     section markers on the header's progress line
    scroll.ts           glideTo(): the ONE way to scroll the page programmatically
  viewer/               ── 3D SKY + TOOLS ─────  css/base, header, sky, explorer, dialogs
    index.js            startViewer(): init order
    sky/                globe (scene.js), camera & controls, landmarks, info card, layers, gyro, VR, coordinates
    explorer/           "See it change" dialog: state, modes S/F (epochs), M (series), C (spectrum), D (difference),
                        right panel (aside, telemetry, cross-match)
    panels/             share, help, gallery, tour, search, data releases, anomaly report, IRSA cutouts
    story/              the story sections' interactions + the sky following the scroll (sky-sync.js)
    ui/                 modal, toast, header (dropdowns, active item, progress line), page-chrome motion, download
    navigation.js       story page <-> free-look, header shortcuts, hero buttons, Home, Esc
    routes.js           deep links (?target=, ?ra=&dec=&fov=&mode=)
    api.js              what is exposed on window (tests, console, inline chart handlers)
  data/                 plain JSON: comet epochs & colors, the fixed-field catalog (field/), landmarks,
                        per-target insights, benchmark cards; index.js exports them
```

## Work on it

From the **project root**:

```bash
npm install
npm run dev         # Python API (:8080) + Vite dev server with HMR -> http://localhost:5173  (?intro=0 skips the intro)
npm run typecheck   # TypeScript
npm run build       # -> js/ui.bundle.js (commit it), then bump ?v= on its <script> in index.html
npm test            # e2e suite + behaviour checks + intro flow (see tests/)
```

CSS is plain files, **no build step**: edit `css/*.css` and refresh. Rules for adding things (where code goes,
animations, scrolling): [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
