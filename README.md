# The Sky, Again and Again: Stand Inside the SPHEREx Sky

> **NASA Space Apps Challenge** — *Planet X and SPHEREx* Track  
> A browser-native 3D celestial observatory, multi-epoch FITS cutout pipeline, and time-domain discovery platform for NASA's 102-band infrared all-sky survey.

---

## Quick Start (Run Locally on Any Computer)

This project is 100% portable and works out-of-the-box on any Linux, macOS, or Windows machine without hardcoded paths. All pre-fetched NASA IRSA TAP catalog rows (`data/movers_hits.csv`) and 36 real calibrated SPHEREx Level 2 FITS cutouts (`data/movers_cutouts/*.fits` across 6 targets with 6 frames each) are bundled directly inside the repository.

### 1. Start the Full-Stack Server (Recommended — Includes Live IRSA Cutout & Email API)
```bash
git clone https://github.com/catagfx/SPHEREx-Sky.git
cd SPHEREx-Sky
pip install numpy astropy matplotlib pillow requests reproject
python3 server.py
```
*(Optional: For static-only exploration without the live Python FITS cutout API, you can also run `python3 -m http.server 8080`.)*

### 2. Optional SMTP Configuration (For Email Delivery)
To send processed FITS cutout packages via email, copy `.env.example` to `.env` (which is git-ignored so credentials are never committed):
```bash
cp .env.example .env
# Edit .env with your SMTP_USER and 16-character Gmail App Password (SMTP_PASS)
```
If no SMTP credentials are configured, the **IRSA Cutout Studio** still processes all FITS cutouts, animated blink GIFs, and difference maps right on the page and generates a downloadable `.eml` package and browser email preview.

### Develop: `npm run dev` (only needed if you change the front end)
The whole front end is one Vite build of `ui/src/`: React + TypeScript (intro, Story Tour page), the three.js viewer (globe, time-domain explorer, data panels) as JavaScript modules, GSAP (ScrollTrigger, SplitText) and Lenis, all from npm — see `ui/README.md`. The production page loads the pre-built, committed `js/ui.bundle.js`, so `python server.py` still runs with **no npm at all** (and no CDN: the globe works offline).
```bash
npm install
npm run dev     # Python API (:8080) + Vite dev server with hot reload -> open http://localhost:5173
npm run build   # rebuild js/ui.bundle.js (commit it) for the no-npm path
npm test        # 132-check e2e suite + behaviour + intro flow (Playwright, headless)
```
Dev shortcuts: `?intro=0` skips the intro, `?motion=full|reduced|auto` forces the motion mode. Styles are plain CSS in `css/` (no build). Project rules — where code goes, animations, tests, merging another copy: **`CONTRIBUTING.md`**.

### 3. Open in Browser (`http://localhost:8080`)
- **Interactive App**: [http://localhost:8080/](http://localhost:8080/)
- **Arbitrary Coordinate & FOV Deep Link**: [http://localhost:8080/?ra=133.795&dec=-7.245&fov=0.30&mode=M](http://localhost:8080/?ra=133.795&dec=-7.245&fov=0.30&mode=M)
- **Direct to Planet X (Hypothetical 450 AU Model)**: [http://localhost:8080/#target=planetx&mode=M](http://localhost:8080/#target=planetx&mode=M)
- **Direct to WISE 0855 (Sub-Freezing Brown Dwarf)**: [http://localhost:8080/#target=wise0855&mode=M](http://localhost:8080/#target=wise0855&mode=M)
- **Direct to Epsilon Indi B (Binary Brown Dwarf)**: [http://localhost:8080/#target=epsindi&mode=M](http://localhost:8080/#target=epsindi&mode=M)
- **Direct to Barnard's Star (Proper Motion)**: [http://localhost:8080/#target=barnard&mode=M](http://localhost:8080/#target=barnard&mode=M)
- **Direct to RW Aurigae (Dust Eclipse Variable)**: [http://localhost:8080/#target=rwaur&mode=M](http://localhost:8080/#target=rwaur&mode=M)
- **Direct to R Draconis (Mira Variable)**: [http://localhost:8080/#target=rdraconis&mode=M](http://localhost:8080/#target=rdraconis&mode=M)
- **Direct to Multi-Band Infrared Spectroscopy (D1–D6)**: [http://localhost:8080/#target=barnard&mode=C](http://localhost:8080/#target=barnard&mode=C)
- **Direct to Difference Image Subtraction ($I_B - I_A$)**: [http://localhost:8080/#target=planetx&mode=D](http://localhost:8080/#target=planetx&mode=D)
- **Clean Embed Mode (for iframes)**: [http://localhost:8080/?embed=true#target=planetx&mode=M](http://localhost:8080/?embed=true#target=planetx&mode=M)

---

## Directory Structure

```
spherex-sky/
├── index.html                  # The page: header, dialogs, mount points (no inline styles)
├── server.py                   # Starts the backend: python server.py [port]
├── backend/                    # Python backend: HTTP routes, IRSA TAP + byte-range cutouts, FITS telemetry,
│                               #   image rendering, email reports, the cutout job pipeline
├── ui/src/                     # Front-end source (see ui/README.md)
│   ├── intro/  story/          #   React + TypeScript: intro, Story Tour page
│   ├── viewer/                 #   three.js globe, "See it change" explorer, data panels (JS modules)
│   ├── core/                   #   shared: motion/embed flags, GSAP, Lenis, store
│   └── data/                   #   curated SPHEREx targets, epochs, landmarks (JSON)
├── js/ui.bundle.js             # Build output of ui/src (committed; never edited by hand)
├── css/                        # base · header · sky · explorer · dialogs · intro · story · hero (plain CSS)
├── tests/                      # e2e suite (132 checks), behaviour, intro flow, render/style snapshots, API compare
├── .env.example                # Template for optional local SMTP environment variables (git-safe)
├── data/                       # Bundled portable NASA IRSA data for offline & multi-machine reliability
│   ├── movers_hits.csv         # 3,976 real NASA IRSA TAP observation records across benchmark targets
│   └── movers_cutouts/         # 36 real calibrated SPHEREx Level 2 FITS cutouts (*.fits)
├── scripts/                    # Reproducible NASA/JPL data processing & validation pipeline
│   ├── find_and_cut_movers.py         # SPHEREx Level 2 IRSA FITS cutout & WCS reprojection engine (used by backend/)
│   ├── dev.mjs                        # `npm run dev`: backend + Vite dev server
│   ├── fetch_horizons_ephemerides.py  # JPL Horizons small-body ephemeris query script
│   ├── process_irsa_cutouts.py        # IRSA cutout processor & per-detector multi-pass band co-addition
│   └── generate_benchmarks.py         # Ground-truth astrometric & physical validator
├── assets/                     # Calibrated sky textures & multi-epoch target cutouts
│   ├── sky_stars.jpg           # Re-projected all-sky stars & galaxies layer (0.75–1.6 µm)
│   ├── sky_dust.jpg            # Re-projected all-sky dust & gas layer (2.4–5.0 µm)
│   └── field_*.jpg             # Multi-epoch cutouts (6 frames each for Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis, Planet X)
├── manifest.json               # Progressive Web App manifest
├── sw.js                       # Service Worker for offline astronomical field use
├── SUBMISSION.md               # Full NASA Space Apps submission text, pitch script & slides
├── CONTRIBUTING.md             # Project rules: structure, animations, tests, merging
└── README.md                   # Documentation and data pipeline guide
```

---

## Key Features

### 1. 360° All-Sky Celestial Globe (Three.js WebGL & WebXR)
- Re-projects NASA/JPL-Caltech SPHEREx all-sky survey maps into an inverted celestial sphere.
- **Dual-Layer Shader**: Blends near-infrared stars/galaxies ($0.75 - 1.6\,\mu\text{m}$) and mid-infrared gas/dust ($2.4 - 5.0\,\mu\text{m}$).
- **Tools**: Live compare divider, celestial RA/Dec grid, gyroscope mobile look, auto-rotation, and WebXR immersive VR.

### 2. Arbitrary Coordinate Search, FOV Zoom & Shareable URL State
- Enter celestial coordinates in decimal degrees (`RA: 133.795°, Dec: -7.245°`) or sexagesimal notation (`08h 55m 10.8s, -07° 14′ 43″`).
- **Shareable URL Routing**: Supports arbitrary `?ra=<RA>&dec=<Dec>&fov=<FOV>&mode=<M|S|B|D|C>` query or hash parameters so any sky coordinate and zoom state can be bookmarked or shared.
- **Cutout Angular Field of View (FOV) Selector**: Switch between `0.15° × 0.11°` (Deep Zoom), `0.30° × 0.23°` (Standard), and `0.50° × 0.38°` (Wide Field) directly in the viewer and IRSA Cutout Studio.

### 3. On-Demand NASA IRSA IPAC Cutout & Email Delivery Studio
- Queries live NASA/IPAC IRSA TAP (`spherex.obscore`) with bundled fallback to `data/movers_hits.csv` and `data/movers_cutouts/*.fits`.
- Reprojects 3 multi-epoch FITS passes onto a common North-Up WCS tangent plane, extracts an on-the-fly multi-band infrared spectrum, generates an animated 3-pass blink GIF and digital difference image (`Pass 3 − Pass 1`), and optionally emails the telemetry package.

### 4. SPHEREx Level 2 Contamination Flags & External Archive Cross-Match
- Displays **SPHEREx Level 2 Bitmask Quality Flags** (`FLAG 0x00: CLEAN L2` vs. `FLAG 0x02: BRIGHT STAR CORE MASKED`) explaining pipeline artifact masking around saturated stars.
- One-click **External Archive Cross-Match** buttons inside the viewer dynamically link the active target's `(RA, Dec, FOV)` to **CDS SIMBAD**, **Aladin Lite (Gaia DR3 + AllWISE overlay)**, and **NASA/IPAC IRSA Finder Chart**.

### 5. The Search for Planet X (Hypothetical 450 AU Model)
- Demonstrates why a hypothetical Neptune-mass body at $d = 450\text{ AU}$ reflects almost no sunlight ($1/r^4$ falloff): pure solar radiative equilibrium at $450\text{ AU}$ is only $T_{\text{eq}} \approx 278\text{ K} / \sqrt{450} \approx 13.1\text{ K}$, whereas internal Kelvin-Helmholtz gravitational core heat maintains an effective temperature of **$T_{\text{eff}} \approx 40\text{--}47\text{ K}$** (Fortney et al. 2016; Linder & Mordasini 2016).
- Exhibits the true annual trigonometric parallax at $450\text{ AU}$, $\pi = 1\text{ AU} / 450\text{ AU} = 206,265'' / 450 = \mathbf{458.4''}$ ($7.64\text{ arcmin}$ baseline shift per 6-month pass), stacked onto real SPHEREx Taurus ecliptic background frames (`RA 63.01°, Dec +18.50°`).

### 6. Per-Detector Multi-Pass Band Co-Addition ($\text{SNR} \times \sqrt{N}$)
- Because SPHEREx's 6 detector arrays (`D1`–`D6`) cover 6 distinct wavelength bands ($0.75 - 5.0\,\mu\text{m}$), scientific co-addition stacks $N$ sequential survey passes **within the same detector band** ($\text{SNR} \propto \sqrt{N}$, e.g. $\sqrt{3} \approx 1.73\times$ for 3 passes or $\sqrt{4} = 2.00\times$ across the 2-year nominal survey), preserving spectral purity while suppressing uncorrelated read noise.

---

## Known Limitations & Scientific Honesty

1. **Real NASA IRSA Level 2 Data vs. Hypothetical Models**:
   - All 5 benchmark moving/variable targets (**Barnard's Star**, **WISE 0855-0714**, **Epsilon Indi B**, **RW Aurigae**, **R Draconis**) use **real calibrated NASA/IPAC IRSA SPHEREx Level 2 Quick Release observations** with 6 multi-epoch frames each.
   - **Planet X (450 AU)** has not yet been discovered in nature; therefore, its card is explicitly badged `[Hypothetical 450 AU Model]` and illustrates how a $458.4''$ annual parallax shift looks superimposed on real SPHEREx Detector D6 Taurus background frames.
2. **Uncached Arbitrary Coordinates**:
   - When querying arbitrary coordinates in the **IRSA Cutout Studio**, the server queries the live NASA IRSA TAP archive (`25s` timeout). If the target coordinates have no public multi-epoch SPHEREx Level 2 coverage or if the user is offline, the server honestly reports `status: "no_coverage"` by default rather than silently fabricating data. Users may optionally check *"Allow clearly labeled Illustrative Synthetic Simulation"* for offline classroom demonstrations, which stamps every generated frame and Obs ID with `[SYNTHETIC ILLUSTRATIVE SIMULATION — NOT REAL IRSA DATA]`.
3. **Browser-Side Difference Imaging & Co-Addition**:
   - In the interactive browser canvas, difference subtraction ($I_B - I_A$) and multi-pass band co-addition operate on WCS-registered 8-bit/16-bit display renders derived from the underlying `MJy/sr` FITS cutouts, while `find_and_cut_movers.py` performs full 32-bit floating-point FITS WCS reprojection (`astropy.wcs`).

---

## Data Citation & Credits

- **Official NASA / IPAC IRSA SPHEREx Citation**:  
  SPHEREx Science Team (2025), *SPHEREx Level 2 Quick Release Archive*, NASA/IPAC Infrared Science Archive, **DOI: [10.26131/IRSA629](https://doi.org/10.26131/IRSA629)**.
- **Ephemerides & Astrometry**: NASA JPL Horizons On-Line Ephemeris System, ESA Gaia DR3, and CDS SIMBAD.
