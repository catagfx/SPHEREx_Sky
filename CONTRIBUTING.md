# Contributing to SPHEREx Sky

Guidelines and architectural conventions that keep the project clean, reliable, and performant. Read this before adding a feature, modifying astronomical data, or updating WebXR VR experiences.

Project developed by **Team PP.AP** for the **NASA Space Apps Challenge**.

---

## 1. Project Architecture & Directory Layout

| Area | Location | Description |
|---|---|---|
| **Page markup & modals** | `index.html` | Semantic HTML layout, modals, and container mount points (IDs form the DOM contract with JS modules). |
| **Intro & Onboarding** | `ui/src/intro/` + `css/intro.css` | React introductory interactive experience and mission onboarding. |
| **Story Tour (Hero & Sections)** | `ui/src/story/` + `css/story.css`, `css/hero.css` | React + TypeScript story narrative explaining SPHEREx's 102 infrared bands. |
| **3D Celestial Globe & Camera** | `ui/src/viewer/sky/` + `css/sky.css` | Three.js inverted celestial sphere, coordinate math (RA/Dec and Galactic $l, b$), camera controller. |
| **WebXR / VR Virtual Observatory** | `ui/src/viewer/sky/xr/` | Complete 6-DoF Meta Quest VR environment: 360° floating carousel, dark glass UI, controller rays, hand pinching. |
| **Audio Narration Pipeline** | `ui/src/viewer/audio/` + `assets/audio/` | Web Audio API narration manager with HTTP 206 byte-range streaming for 20 constellations and 11 landmarks. |
| **Constellations System** | `ui/src/viewer/sky/constellations.js` | 3D celestial figures, tangent-plane mini SVG diagrams, star chips, and automated audio tour triggers. |
| **Time-Domain Explorer (5 modes)** | `ui/src/viewer/explorer/` + `css/explorer.css` | Multi-epoch blinking, split view, animated comparator, difference imaging ($I_B - I_A$), and 6-band SED. |
| **Dialogs & Cutout Studio** | `ui/src/viewer/panels/` + `css/dialogs.css` | NASA IRSA cutout generator, telemetry review, search, and astronomical gallery. |
| **Core API & Environment** | `ui/src/core/api.ts` + `ui/src/core/env.ts` | Centralized backend resolution (`window.SPX_API_URL`), motion preferences, and shared state. |
| **Astronomical Datasets** | `ui/src/data/*.json` | Curated SPHEREx targets, epochs, landmarks, and scientific metadata (strictly pure JSON, never code). |
| **Python Backend API** | `backend/` + `server.py` | HTTP server, IRSA TAP queries, WCS FITS reprojection, and Level 2 bitmask analysis. |
| **LiveKit Voice Server** | `voice-server/` | Node.js Express server generating LiveKit WebRTC tokens for multi-user voice seminars. |
| **Static Build Output** | `js/ui.bundle.js` | Compiled bundle produced by `npm run build` (never edit directly). |
| **Static Site Distribution** | `dist/` + `scripts/build-site.mjs` | Self-contained static package deployed to GitHub Pages. |
| **Testing Suite** | `tests/` | Playwright E2E suite (132 checks), simulated Quest 3 WebXR automated test runner (`tests/vr.mjs`). |

---

## 2. Core Development Rules

1. **Single Responsibility**: One file = one clear responsibility. If a module exceeds ~300 lines or addresses two unrelated concerns, split it cleanly.
2. **No Inline Styling**: Avoid inline `style="..."` attributes in `index.html` or components (with the sole exception of `#ui-boot` which must paint before CSS loads to eliminate flashes). Put styling in the matching CSS stylesheet.
3. **Clean Code Hygiene**: Dead code is removed, never left commented out. Git keeps the historical record.
4. **Bundle Workflow**: Never hand-edit `js/ui.bundle.js`. Always update TypeScript/JavaScript sources in `ui/src/` and run `npm run build` (or `npm run build:pages`).
5. **DOM Element IDs**: The viewer binds directly by element ID. Renaming an ID in `index.html` requires updating all referencing modules (verify by searching `'#theId'`).

---

## 3. WebXR Virtual Reality Standards (Meta Quest)

* **Performance Target**: Maintain a stable 60–72 FPS inside the WebXR render loop (`ren.setAnimationLoop`).
* **Ergonomic Elevation**: Anchor floating dark glass panels between $y = 1.35\,\text{m}$ and $y = 1.65\,\text{m}$ relative to eye position so users never need to crane their necks.
* **Upright Celestial Navigation**: When navigating to landmarks or constellations (`travelTo`), use upright orthonormal basis matrices without introducing diagonal roll or twist around the line of sight.
* **Dual Input Handlers**: All 3D UI elements must support both controller trigger laser raycasting and natural hand-pinch interactions (`t.hit.kind === 'button'`).
* **Audio Playback in VR**: Meta Quest WebXR requires explicit user activation or unlocked AudioContext before streaming audio. Use `playNarration()` in `ui/src/viewer/audio/narration.js` to ensure HTTP 206 byte-range streaming.

---

## 4. Animation & Smooth Motion Guidelines

Everything in the web interface runs on **one** unified GSAP instance and **one** Lenis inertia scroll instance (`import gsap from 'gsap'`). Never inject duplicate CDN copies of GSAP, Lenis, or Three.js.

* **Scroll Management**: Control page scrolling exclusively via `glideTo()` / `topOf()` (`ui/src/story/scroll.ts`). This ensures full compatibility with the section pager and motion preferences.
* **Ownership of Animated Properties**: Avoid animating a CSS property that another active timeline already controls.
* **Hover State Restoration**: Always append `clearProps` at the conclusion of entrance animations to ensure CSS `:hover` states remain active.
* **Calm / Reduced-Motion Mode**: When a user enables reduced motion (`prefers-reduced-motion` or `?motion=reduced`), disable all 3D camera swoops, traveling zooms, and blur filters, replacing them with simple crossfades. Check `prefersReducedMotion` (`core/env.ts`) and use the `.reduce-motion` CSS class.

---

## 5. Development & Testing Workflow

```bash
# 1. Install dependencies
npm install
pip install -r requirements.txt

# 2. Run local development with Hot Module Replacement (HMR)
npm run dev                 # Starts Python API (:8080) + Vite dev server (:5173)

# 3. Run in Local VR mode with HTTPS SAN certificates
SPX_HTTPS=1 python3 server.py 8080

# 4. Run automated test suites
npm test                    # Full E2E suite across full and reduced motion
node tests/vr.mjs           # Automated WebXR headset test runner (18/18 checks)

# 5. Build static distribution for GitHub Pages
npm run build:pages         # Rebuilds bundle and packages into dist/
```

Before committing code:
- Run `npm run typecheck` to verify TypeScript types.
- Run `node tests/vr.mjs` to ensure WebXR sessions and 3D controller interactions remain green.
- Verify that all relative asset links resolve without HTTP 404 errors.
