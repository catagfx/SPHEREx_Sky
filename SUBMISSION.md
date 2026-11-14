# NASA Space Apps Challenge: Project Submission

## Project Title
**The Sky, Again and Again: Stand Inside the SPHEREx Sky**

### Challenge Track
**Planet X and SPHEREx** (Astrophysics, Planetary Science, Software & Interactive Data Visualization)

---

## 1. Project Overview & Problem Statement

### The Problem
In March 2025, NASA launched the **SPHEREx** (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) space observatory. Every six months, SPHEREx maps the entire sky in **102 distinct near-infrared colors** (from 0.75 to 5.0 microns), observing hundreds of millions of stars, distant galaxies, brown dwarfs, and variable stars.

This generates a staggering avalanche of continuous astronomical imagery. Crucially, astronomical bodies are not static:
- **Fast-moving brown dwarfs and nearby stars** shift positions across sequential 6-month survey passes.
- **Nearby stars** exhibit proper motion and annual parallax across sequential survey epochs.
- **Pulsating variable stars** (such as Miras and eruptive variables) oscillate in infrared brightness, acting as fundamental astrophysical probes.
- **Hypothetical outer solar system bodies (like "Planet X")** or ultra-cold brown dwarfs can only be detected by spotting anomalous motion between survey epochs.

No single research team can manually inspect billions of pixels across 102 spectral bands. Science needs an intuitive, rapid, browser-native tool that puts real SPHEREx data directly into the hands of citizen scientists, students, and educators.

### Our Solution
**The Sky, Again and Again** is an interactive, public-facing web platform and 3D celestial observatory:
1. **Stand Inside the Sky (360° WebGL Sphere)**: Re-projects NASA/JPL-Caltech SPHEREx all-sky survey maps into a virtual celestial sphere with real-time blending between stars/galaxies and dust/gas, coordinate grids, and WebXR (VR) support.
2. **Astrometric Coordinate Search (RA & Dec)**: Allows users to input Right Ascension and Declination in decimal degrees or sexagesimal notation (`hh:mm:ss`, `±dd:mm:ss`), smoothly navigating the sky globe and retrieving the nearest multi-epoch time-series cutouts.
3. **NASA Benchmark Targets Suite**: Directly implements all targets named in the challenge guidelines:
   - **Barnard's Star**: $10.33''/\text{yr}$ proper motion red dwarf.
   - **WISE 0855**: Sub-freezing brown dwarf (~250 K) with $8.1''/\text{yr}$ drift and thermal infrared emission.
   - **Epsilon Indi B**: Cold binary brown dwarf pair ($4.7''/\text{yr}$).
   - **RW Aurigae**: Young eruptive T Tauri variable with circumstellar dust disk occultations.
   - **R Draconis**: Mira pulsating red giant with a 245.6-day period.
4. **Dedicated Planet X / Planet Nine Mode (`[Hypothetical 450 AU Model]`)**: Demonstrates how an outer solar system body at $d = 450\text{ AU}$ reflects virtually no sunlight ($1/r^4$ falloff; pure solar equilibrium $\sim 13.1\text{ K}$), while internal Kelvin-Helmholtz core heat maintains $\sim 40\text{--}47\text{ K}$, producing a characteristic $\pi = 206,265'' / 450 = \mathbf{458.4''}$ ($7.64\text{ arcmin}$) annual trigonometric parallax shift between 6-month survey passes.
5. **Per-Detector Multi-Pass Band Co-addition Engine ($\text{SNR} \times \sqrt{N}$)**: Implements the challenge's co-addition consideration by stacking $N$ sequential survey passes within the same detector band (D1–D6) to boost the Signal-to-Noise Ratio by $\sqrt{N}$ ($\sqrt{3} \approx 1.73\times$ for 3 passes, $\sqrt{4} = 2.00\times$ across the 2-year nominal survey) without mixing incompatible spectral bands.
6. **On-Demand NASA IRSA Cutout Studio, FOV Selector & Cross-Match Links**: Queries live NASA/IPAC IRSA TAP (`spherex.obscore`), supports user-selectable cutout FOV (`0.15°`, `0.30°`, `0.50°`), displays SPHEREx Level 2 contamination bitmask flags (`0x00 Clean`, `0x02 Bright Star Core Masked`), links directly to SIMBAD, Aladin Lite (Gaia DR3 + AllWISE), and IRSA Finder Chart, and supports arbitrary `?ra=<RA>&dec=<Dec>&fov=<FOV>` URL deep links.
7. **Swipe Time-Domain Blink Comparator**: Directly swipe between multi-epoch observations to witness proper motion displacement and infrared variability.
8. **102-Band Infrared Spectroscopy**: An interactive multi-wavelength explorer across SPHEREx detectors D1 through D6 (0.75 to 5.0 µm) revealing stellar photospheric continua and molecular absorption bands.
9. **Astronomical Digital Image Subtraction ($I_B - I_A$)**: A difference imaging engine that cancels static background stars to flat neutral gray ($128$), instantly highlighting proper motion dipoles and transient flare events.
10. **Citizen Science "Flag Candidate / Anomaly Report" Tool**: An integrated discovery modal enabling community observers to tag new moving candidates or anomalous transients, review auto-extracted astrometry, and export standardized NASA-compliant JSON discovery dossiers.
11. **Reproducible Python Science Pipeline (`/scripts/`)**: Complete automated scripts querying JPL Horizons, simulating IRSA zodiacal light subtraction, executing 6-detector co-addition, and benchmarking against Gaia DR3.
12. **Universal Accessibility & PWA Offline Support**: Modularized to load in under 120 KB, featuring deep-link permalinks (`#target=planetx&mode=M`), one-click classroom iframe embeds, automated Web Speech voice-over tour, and a Service Worker (`sw.js`) enabling 100% offline field operation.
13. **Award-Winning Motion Design & Fluid UI (GSAP & Lenis)**: Orchestrated entrance timelines, spatial mouse parallax, hardware-accelerated dialog transitions, button spring physics, and buttery-smooth Lenis inertia scrolling with full accessibility safety (`prefers-reduced-motion`).

---

## 2. Scientific Data & Processing Pipeline

### Real NASA Data Sources
- **All-Sky Maps**: NASA/JPL-Caltech SPHEREx First Sky Survey maps. Layer 1: Near-infrared stars and galaxies ($0.75 - 1.6\,\mu\text{m}$). Layer 2: Interstellar dust and gas ($2.4 - 5.0\,\mu\text{m}$).
- **Target Cutouts**: NASA/IPAC Infrared Science Archive (IRSA) Level 2 Quick Release spectral images.
- **Orbital Ephemerides**: NASA JPL Horizons on-line solar system data service for predicted RA/Dec coordinates and visual magnitudes ($V$).
- **Stellar Astrometry**: Gaia DR3 / SIMBAD catalogs for proper motion vectors and parallax verification.

### Processing Pipeline
1. **Background & Zodiacal Subtraction**: Each FITS cutout has the mission-provided zodiacal-light model subtracted, followed by local median sky background removal.
2. **Astrometric Registration**: In "Watch it move" mode, frames are re-projected onto common celestial coordinates so fixed background stars stay stationary, making target motion immediately discernible to the human eye.
3. **Per-Detector Multi-Pass Band Stacking**: Co-adding $N$ sequential survey passes in the same detector band ($0.75 - 5.0\,\mu\text{m}$) averages down uncorrelated sensor read noise and Poisson noise by $\sqrt{N}$ ($\sqrt{3} \approx 1.73\times$ for 3 passes; $\sqrt{4} = 2.00\times$ for 4 passes).
4. **Dynamic Range Compression**: Calibrated fluxes are displayed using an inverse hyperbolic sine ($\operatorname{asinh}$) stretch to reveal faint diffuse astronomical features without saturating bright stellar cores.
5. **Photometric Integration**: Circular aperture photometry computes average flux density (MJy/sr) inside the target radius across epochs and wavelengths.
6. **Digital Difference Subtraction ($I_B - I_A$)**: Digital subtraction of registered epoch frames $D(x, y) = \operatorname{clamp}(128 + \text{gain} \times (I_B - I_A))$. Perfectly matched static background stars cancel to neutral zero-flux (128 gray), causing shifting bodies and transient variables to jump out as high-contrast bipolar residuals.

### Reproducible Pipeline Scripts (`/scripts/`)
- **`fetch_horizons_ephemerides.py`**: Queries NASA JPL Horizons REST API for ephemerides and orbital tracking.
- **`process_irsa_cutouts.py`**: Simulates background subtraction, asinh stretch, and 6-detector co-addition.
- **`generate_benchmarks.py`**: Validates astrometry and light curve ranges against Gaia DR3.

---

## 3. Team Roles & Contributions

- **Team Lead & Pitch**: Designed the narrative story, structured the challenge deliverables, wrote the pitch deck and live demo script, and managed compliance with Space Apps Challenge rules.
- **Data & Science Lead**: Sourced SPHEREx FITS cutouts from NASA/IPAC IRSA, verified target coordinates, modeled Planet X parallax at 450 AU, calculated proper motion vectors for Barnard's Star, WISE 0855, and Epsilon Indi B, and modeled RW Aurigae and R Draconis light curves.
- **Web Developer (Main Experience)**: Built the WebGL 360° Three.js sphere with custom GLSL multi-layer shaders, built the RA/Dec celestial coordinate navigation system, created the 6-detector co-addition filter engine, implemented the data release switcher and custom JSON ingestion pipeline, and optimized initial page load from 9.2 MB down to 115 KB.
- **VR & 3D Specialist**: Configured WebXR immersive VR session hooks, mobile device orientation gyro-controls, and spherical coordinate projection math (`dir(l,b,r)`).
- **Designer & QA**: Crafted the obsidian dark-mode luxury product aesthetic (inspired by modern 3D design reference), refined accessibility (focus indicators, ARIA live regions, reduced-motion preferences), tested responsive breakpoints across devices, and packaged the repository.

---

## 4. Statements of Credit & Scientific Provenance

### Data & Image Credits
- **NASA / JPL-Caltech**: SPHEREx mission, all-sky survey maps, and science releases.
- **NASA / IPAC Infrared Science Archive (IRSA)**: SPHEREx Level 2 Quick Release images and observation tables (**DOI: [10.26131/IRSA629](https://doi.org/10.26131/IRSA629)**).
- **NASA JPL Horizons**: Small-body ephemerides and orbital tracking.
- **ESA / Gaia Mission & CDS SIMBAD**: Stellar proper motion and parallax baselines.

### Known Limitations & Scientific Honesty
- All 5 benchmark stars/brown dwarfs (**Barnard's Star, WISE 0855, Epsilon Indi B, RW Aurigae, R Draconis**) use **real calibrated NASA/IPAC IRSA SPHEREx Level 2 Quick Release FITS cutouts** (`data/movers_cutouts/*.fits`) with 6 multi-epoch frames each.
- Because **Planet X (450 AU)** is an undiscovered hypothetical body, its sequence is explicitly labeled `[Hypothetical 450 AU Model]` and demonstrates a physically accurate $\pi = 458.4''$ ($7.64\text{ arcmin}$) annual parallax track superimposed on real SPHEREx Detector D6 Taurus ecliptic background frames.
- For uncached arbitrary coordinates in the IRSA Cutout Studio, the backend queries live NASA IRSA TAP (`25s` timeout) and returns an honest `no_coverage` notice if no public Level 2 frames exist, unless the user explicitly checks *"Allow clearly labeled Illustrative Synthetic Simulation"*.

---

## 5. Three-Minute Live Demo Pitch Script

**Duration**: Exactly 3 minutes (180 seconds)  
**Presenter**: Team Lead (speaking) + Web Dev (driving the live demo on screen)

---

### [0:00 - 0:30] The Hook & The Problem
> **[Speaker]**: "Look up on a clear night. The stars look permanent, quiet, and unchanging. But look through the eyes of NASA's newest space telescope, **SPHEREx**, and the sky is alive with motion.  
> Every six months, SPHEREx maps the entire sky in 102 infrared colors. It observes over a billion objects—tracking cold brown dwarfs, high proper-motion stars, pulsating variables, and potentially undiscovered outer solar system worlds like Planet X.  
> But there's a problem: SPHEREx produces more data than any human team can ever inspect. How do we help everyday citizens and students spot what changes across this ocean of infrared data?  
> Our answer is **The Sky, Again and Again**."

*(On screen: Presenter loads the sleek obsidian landing page. Clicks 'Stand in 360° Sky' and smoothly pans across the glowing Milky Way dust and stars.)*

---

### [0:30 - 1:10] Demo 1: Coordinate Navigation & NASA Benchmark Targets
> **[Speaker]**: "Notice this search button at the top: users can enter exact Right Ascension and Declination coordinates in degrees or hours, minutes, seconds.  
> We have pre-loaded all NASA benchmark targets: from **WISE 0855**—a sub-freezing brown dwarf colder than ice that drifts over eight arcseconds a year—to **RW Aurigae**, a young erupting star being occulted by circumstellar dust streams.  
> Click any target, and the sky globe automatically glides across the cosmos to center upon it."

*(On screen: Presenter clicks 'Search RA/Dec', picks 'WISE 0855 (Brown Dwarf)', clicks 'Pan 360° Sky Globe'. Camera zooms smoothly to the object's celestial location.)*

---

### [1:10 - 1:55] Demo 2: The Search for Planet X, Difference Subtraction & Multi-Pass Band Co-Addition
> **[Speaker]**: "Now, let's address the heart of our challenge: **Planet X**.  
> If an undiscovered Neptune-mass planet exists in the outer solar system at 450 AU, reflected sunlight is negligible—its pure solar equilibrium temperature is only 13 Kelvin, while internal Kelvin-Helmholtz core heat keeps it around 40 to 47 Kelvin.  
> In our explicitly labeled **Hypothetical 450 AU Model**, watch the candidate move between 6-month survey passes: it displays a huge 458.4-arcsecond (7.6-arcminute) annual parallax loop caused by Earth orbiting the Sun.  
> To spot faint candidates without mixing wavelengths, clicking **'Per-Detector Pass Stack'** co-adds sequential passes in the same detector band, boosting Signal-to-Noise by square-root of N.  
> And with our **'Difference (B − A)'** mode, static background stars cancel to neutral gray, making motion dipoles instantly leap out. Anyone can then cross-match with **SIMBAD, Aladin Lite, or IRSA** in one click, or hit **'Flag Anomaly'** to export a verified candidate dossier."

*(On screen: Presenter selects Planet X Candidate. Hits Play Motion showing the parallactic wobble. Toggles '6-Array Co-Add', switches to 'Difference (B − A)' mode showing stellar cancellation, and clicks 'Flag Anomaly' to reveal the citizen science discovery dossier.)*

---

### [1:55 - 2:30] Demo 3: Multi-Band Infrared Spectroscopy & Multi-Epoch Benchmarks
> **[Speaker]**: "Next, switch to **'Scan the colors'**. Across 102 infrared channels from 0.75 to 5.0 microns, SPHEREx captures stellar photospheric continua and molecular absorption bands across detectors D1 to D6. Slide the divider in **'See it change'** to inspect multi-pass Level 2 infrared views of high proper-motion benchmark stars and cold brown dwarfs across sequential survey epochs."

*(On screen: Presenter demonstrates multi-pass comparisons, then clicks 'Scan colors' and scrubs through detectors D1 to D6 to show calibrated FITS spectral energy distributions.)*

---

### [2:30 - 3:00] The Pitch: Impact, Extensibility & Future Roadmap
> **[Speaker]**: "We built this for universal education and research. At just 115 KB initial download, it runs effortlessly on any smartphone.  
> Educators can click **'Embed'** to integrate live interactive targets directly into classroom science portals.  
> Researchers can open **'Data Releases'** to ingest custom SPHEREx candidate JSON files directly into the client.  
> By transforming complex all-sky infrared archives into an accessible, interactive time machine, we empower the global public to search the sky, again and again—and help NASA uncover the secrets of our cosmos.  
> Thank you!"

*(On screen: Presenter shows the Embed modal, clicks Share showing 'Link copied to clipboard!', and returns to the luxury showcase landing view.)*

---

## 6. Slide Deck Outline (7 Slides)

### Slide 1: Title & Hook
- **Visual**: Obsidian dark-mode showcase with SPHEREx celestial globe and Planet X candidate track.
- **Title**: The Sky, Again and Again: Stand Inside the SPHEREx Sky
- **Subtitle**: Crowdsourcing discovery across NASA's 102-color infrared time machine.
- **Team**: Planet X and SPHEREx Challenge Team.

### Slide 2: The Challenge: The Infrared Data Avalanche
- **Key Points**:
  - Full-sky survey repeated every 6 months.
  - 102 spectral bands ($0.75 - 5.0\,\mu\text{m}$).
  - Billions of moving, variable, and transient objects.
  - Problem: Scientific teams cannot manually review billions of pixels.
- **Graphic**: Diagram comparing raw 2D FITS files vs. human cognitive overload.

### Slide 3: The Solution: An Interactive Time-Domain Observatory
- **Features**:
  - Full 360° spherical projection (Three.js WebGL & WebXR).
  - Astrometric RA/Dec coordinate navigation with decimal and sexagesimal support.
  - Multi-layer shader blending stars and interstellar dust.
  - Sub-120 KB mobile-first performance.

### Slide 4: Science Spotlight 1: Planet X Detection, Difference Imaging & Per-Detector Co-Addition
- **Highlights**:
  - Parallactic reflex detection of candidates at 450 AU ($\pi = 458.4''$ or $7.64'$ annual parallax loop).
  - Why optical surveys fail ($1/r^4$ falloff) vs. internal Kelvin-Helmholtz heat ($\sim 40\text{--}47\text{ K}$ vs. $\sim 13\text{ K}$ solar radiative equilibrium).
  - Per-detector multi-pass band co-addition boosting Signal-to-Noise Ratio by $\sqrt{N}$ ($\times 1.73$ for 3 passes, $\times 2.00$ for 4 passes).
  - Digital Difference Subtraction ($I_B - I_A$) canceling static stars to reveal subtle motion dipoles.

### Slide 5: Science Spotlight 2: NASA Benchmark Targets Suite
- **Highlights**:
  - WISE 0855: Sub-freezing brown dwarf ($8.1''/\text{yr}$).
  - Epsilon Indi B: Cold binary brown dwarf system ($4.7''/\text{yr}$).
  - Barnard's Star: High proper-motion red dwarf ($10.33''/\text{yr}$).
  - Variable Stars: RW Aurigae dust occultations, and R Draconis Mira pulsations.

### Slide 6: Science Spotlight 3: 102-Band Infrared Spectroscopy & Multi-Epoch Science
- **Highlights**:
  - Multi-band spectrophotometry from 0.75 to 5.0 µm across detectors D1 to D6.
  - Tracking cool stellar atmospheres and molecular absorption features.
  - 36 real calibrated SPHEREx Level 2 Quick Release FITS cutouts (6 frames each across all benchmark targets).

### Slide 7: Citizen Science Discovery & Offline PWA Readiness
- **Features**:
  - Citizen Science "Flag Candidate / Anomaly Report" tool generating standardized JSON discovery dossiers.
  - One-click classroom embedding (`<iframe>`) & URL deep linking (`#target=planetx&mode=M`).
  - Offline field readiness backed by Progressive Web App manifest and Service Worker caching.
  - Reproducible Python pipeline scripts (`/scripts/`) for JPL Horizons queries, IRSA processing & Gaia DR3 validation.
  - Empowering the next generation of citizen astronomers to find Planet Nine.
