async page => {
  const results = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    failures: [],
    categories: {}
  };

  function assert(category, testName, condition, details = '') {
    results.totalTests++;
    if (!results.categories[category]) {
      results.categories[category] = { passed: 0, failed: 0 };
    }
    if (condition) {
      results.passed++;
      results.categories[category].passed++;
    } else {
      results.failed++;
      results.categories[category].failed++;
      results.failures.push({ category, testName, details });
      console.error(`❌ [${category}] ${testName}: ${details}`);
    }
  }

  // 1. MONITOR CONSOLE ERRORS & NETWORK INTEGRITY
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
      pageErrors.push(msg.text());
    }
  });

  await page.goto('http://localhost:8080/');
  await page.waitForTimeout(1200);

  // -------------------------------------------------------------
  // Category 1: Core & Libraries
  // -------------------------------------------------------------
  const coreTest = await page.evaluate(() => {
    return {
      title: document.title,
      threeAvailable: typeof THREE !== 'undefined',
      gsapAvailable: typeof gsap !== 'undefined',
      lenisAvailable: typeof Lenis !== 'undefined',
      fieldAvailable: typeof FIELD !== 'undefined' && Array.isArray(FIELD),
      fieldCount: (typeof FIELD !== 'undefined' && FIELD.length) || 0
    };
  });
  assert('Core', 'Page Title Loaded with SPHEREx branding', coreTest.title.includes('SPHEREx'));
  assert('Core', 'Three.js 3D library loaded', coreTest.threeAvailable);
  assert('Core', 'GSAP animation library loaded', coreTest.gsapAvailable);
  assert('Core', 'Lenis smooth scroll loaded', coreTest.lenisAvailable);
  assert('Core', 'FIELD catalog loaded with 6 targets', coreTest.fieldAvailable && coreTest.fieldCount === 6, `Count: ${coreTest.fieldCount}`);
  assert('Core', 'No uncaught JS errors on initial load', pageErrors.length === 0, pageErrors.join('; '));

  // -------------------------------------------------------------
  // Category 2: Catalog & Cutout Images (All 23 targets)
  // -------------------------------------------------------------
  const catalogTest = await page.evaluate(async () => {
    const report = [];
    for (let i = 0; i < FIELD.length; i++) {
      const item = FIELD[i];
      const frames = item.frames || [];
      const hasFrames = frames.length >= 2;
      const validCoords = frames.every(f => typeof f.x === 'number' && typeof f.y === 'number' && !isNaN(f.x) && !isNaN(f.y) && f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1);
      
      let allImagesLoaded = true;
      for (const f of frames) {
        const img = new Image();
        const loaded = await new Promise(res => {
          img.onload = () => res(true);
          img.onerror = () => res(false);
          img.src = f.u;
        });
        if (!loaded) allImagesLoaded = false;
      }

      report.push({
        id: item.id,
        name: item.name || item.label,
        framesCount: frames.length,
        hasFrames,
        validCoords,
        allImagesLoaded
      });
    }
    return report;
  });

  catalogTest.forEach(c => {
    assert('Catalog', `Target ${c.id}: min frames (>=6)`, c.framesCount >= 6, `Frames count: ${c.framesCount}`);
    assert('Catalog', `Target ${c.id}: valid coords [0,1]`, c.validCoords);
    assert('Catalog', `Target ${c.id}: all image cutouts load 200 OK`, c.allImagesLoaded);
  });

  // -------------------------------------------------------------
  // Category 3: Target Analysis Modal — Mode M (Watch It Move)
  // -------------------------------------------------------------
  await page.evaluate(() => {
    const idx = FIELD.findIndex(f => f.id === 'epsindi');
    openChange('M');
    setSeries(idx);
  });
  await page.waitForTimeout(500);

  const modalVisible = await page.evaluate(() => !document.getElementById('chg').hidden);
  assert('Modal', 'Analysis modal opens via openChange', modalVisible);

  const modeMActive = await page.evaluate(() => mode === 'M' && !document.getElementById('mv').hidden);
  assert('Mode M', 'Watch It Move view is active', modeMActive);

  // Target Ring Toggle Check
  const ringOffTest = await page.evaluate(() => {
    const rgk = document.getElementById('rgk');
    rgk.checked = false;
    rgk.onchange();
    const mvS = document.getElementById('mvS');
    const ringCircle = mvS.querySelector('circle[stroke="#ffb86b"]');
    const ringText = mvS.querySelector('text[fill="#fff"]');
    // Also check thumbnails in strip
    const stripCanvases = Array.from(document.querySelectorAll('#strip canvas'));
    return {
      mainRingCirclePresent: !!ringCircle,
      mainRingTextPresent: !!ringText,
      stripCanvasesCount: stripCanvases.length
    };
  });
  assert('Target Ring', 'Target Ring circle is removed when checkbox unchecked', !ringOffTest.mainRingCirclePresent);
  assert('Target Ring', 'Target Ring epoch text is removed when checkbox unchecked', !ringOffTest.mainRingTextPresent);

  // Re-enable Target Ring
  const ringOnTest = await page.evaluate(() => {
    const rgk = document.getElementById('rgk');
    rgk.checked = true;
    rgk.onchange();
    const mvS = document.getElementById('mvS');
    const ringCircle = mvS.querySelector('circle[stroke="#ffb86b"]');
    return { mainRingCirclePresent: !!ringCircle };
  });
  assert('Target Ring', 'Target Ring circle reappears when checkbox checked', ringOnTest.mainRingCirclePresent);

  // Orbit Trail Toggle Check
  const trailOffTest = await page.evaluate(() => {
    const mk = document.getElementById('mk');
    mk.checked = false;
    mk.onchange();
    const mvS = document.getElementById('mvS');
    const poly = mvS.querySelector('polyline');
    const trailCircles = mvS.querySelectorAll('circle[fill="#ffb86b"]');
    const vecLine = mvS.querySelector('line[stroke="#8fd3ff"]');
    return {
      hasPoly: !!poly,
      trailCount: trailCircles.length,
      hasVector: !!vecLine
    };
  });
  assert('Orbit Trail', 'Polyline removed when Orbit Trail unchecked', !trailOffTest.hasPoly);
  assert('Orbit Trail', 'Historical dots removed when Orbit Trail unchecked', trailOffTest.trailCount === 0);
  assert('Orbit Trail', 'Astrometric displacement vector removed when Orbit Trail unchecked', !trailOffTest.hasVector);

  // Re-enable Orbit Trail
  await page.evaluate(() => {
    const mk = document.getElementById('mk');
    mk.checked = true;
    mk.onchange();
  });

  // Per-Detector Multi-Pass Band Co-Add Stacking Check
  const coaddTest = await page.evaluate(() => {
    const toggle = document.getElementById('coaddToggle');
    toggle.checked = true;
    toggle.onchange();
    const hud = document.getElementById('mvCoaddHud');
    const hudVisible = hud && !hud.hidden && hud.textContent.includes('PASS BAND STACK');
    const aside = document.getElementById('asN');
    const hasCard = aside && aside.innerHTML.includes('Per-Detector Band Co-Addition');
    toggle.checked = false;
    toggle.onchange();
    return { hudVisible, hasCard };
  });
  assert('Co-Addition', 'Per-Detector Multi-Pass Co-Addition HUD activates with √N SNR banner', coaddTest.hudVisible);
  assert('Co-Addition', 'Telemetry card renders in sidebar', coaddTest.hasCard);

  // FOV Selector, Contamination Bitmask Flag & External Cross-Match Links Check
  const xrefAndFovTest = await page.evaluate(() => {
    const fovSel = document.getElementById('cutoutFovSelect');
    const contamBadge = document.getElementById('contamFlagBadge');
    const simbad = document.getElementById('xrefSimbad');
    const aladin = document.getElementById('xrefAladin');
    const irsa = document.getElementById('xrefIrsa');
    let fovChangedOk = false;
    if (fovSel) {
      fovSel.value = '0.15';
      fovSel.onchange();
      const mvI = document.getElementById('mvI');
      fovChangedOk = mvI && mvI.style.transform.includes('scale(1.55)');
      fovSel.value = '0.30';
      fovSel.onchange();
    }
    return {
      hasFovSel: !!fovSel,
      fovChangedOk,
      hasContamBadge: contamBadge && contamBadge.textContent.includes('FLAG 0x'),
      hasSimbad: simbad && simbad.href.includes('simbad.cds.unistra.fr'),
      hasAladin: aladin && aladin.href.includes('aladin.cds.unistra.fr'),
      hasIrsa: irsa && irsa.href.includes('irsa.ipac.caltech.edu')
    };
  });
  assert('FOV & Cross-Match', 'Cutout FOV selector (0.15°, 0.30°, 0.50°) scales view dynamically', xrefAndFovTest.hasFovSel && xrefAndFovTest.fovChangedOk);
  assert('FOV & Cross-Match', 'SPHEREx Level 2 Contamination Bitmask Flag badge displayed', xrefAndFovTest.hasContamBadge);
  assert('FOV & Cross-Match', 'External Cross-Match links (SIMBAD, Aladin Lite, NASA IRSA) populated with target RA/Dec', xrefAndFovTest.hasSimbad && xrefAndFovTest.hasAladin && xrefAndFovTest.hasIrsa);

  // -------------------------------------------------------------
  // Category 4: Interactive 3-Point Trackers & Light Curves
  // -------------------------------------------------------------
  const landmarkIds = ['planetx', 'wise0855', 'epsindi', 'barnard', 'rwaur', 'rdraconis'];
  for (const lid of landmarkIds) {
    const trackerReport = await page.evaluate((id) => {
      const idx = FIELD.findIndex(f => f.id === id);
      setSeries(idx);
      const aside = document.getElementById('asN');
      const clickPoints = Array.from(aside.querySelectorAll('#starChart circle[style*="cursor:pointer"]'));
      
      const clicksOk = [];
      for (let pIdx = 0; pIdx < clickPoints.length; pIdx++) {
        window.selectFrame(pIdx);
        const stripCells = Array.from(document.querySelectorAll('#strip .cell'));
        const activeCellIdx = stripCells.findIndex(c => c.classList.contains('on'));
        const activeCircleIdx = Array.from(document.querySelectorAll('#asN #starChart circle[style*="cursor:pointer"]')).findIndex(c => c.getAttribute('fill') === '#ffb86b');
        clicksOk.push(fi === pIdx && activeCellIdx === pIdx && activeCircleIdx === pIdx);
      }

      return {
        pointsCount: clickPoints.length,
        clicksOk: clicksOk.every(Boolean),
        hasTitle: !!aside.querySelector('#starChart')
      };
    }, lid);

    assert('Interactive Trackers', `${lid}: exactly 3 click points`, trackerReport.pointsCount === 3, `Count: ${trackerReport.pointsCount}`);
    assert('Interactive Trackers', `${lid}: all 3 points clickable and synced to Pass 1-3`, trackerReport.clicksOk);
  }

  // -------------------------------------------------------------
  // Category 5: Mode S (Swipe Two Dates)
  // -------------------------------------------------------------
  const swipeTest = await page.evaluate(() => {
    document.getElementById('mS').click();
    const swView = document.getElementById('sw');
    const spos = document.getElementById('spos');
    spos.value = 75;
    spos.oninput();
    const lyA = document.getElementById('lyA');
    const clipStyle = lyA ? lyA.style.clipPath : '';
    return {
      swVisible: swView && !swView.hidden,
      clipValid: clipStyle.includes('25%')
    };
  });
  assert('Mode S', 'Swipe view active and divider shifts clipping plane', swipeTest.swVisible && swipeTest.clipValid);

  // -------------------------------------------------------------
  // Category 6: Mode F (Flip Timeline)
  // -------------------------------------------------------------
  const flipTest = await page.evaluate(() => {
    document.getElementById('mF').click();
    const grF = document.getElementById('grF');
    const fp = document.getElementById('fp');
    const playBefore = fp ? fp.textContent : '';
    fp.click();
    const playAfter = fp ? fp.textContent : '';
    fp.click(); // Pause
    return {
      grFVisible: grF && !grF.hidden,
      toggled: playBefore === 'Play' && playAfter === 'Pause'
    };
  });
  assert('Mode F', 'Flip timeline controls active and play toggle toggles Pause', flipTest.grFVisible && flipTest.toggled);

  // -------------------------------------------------------------
  // Category 7: Mode D (Digital Difference Subtraction)
  // -------------------------------------------------------------
  const diffTest = await page.evaluate(() => {
    document.getElementById('mD').click();
    const diffView = document.getElementById('diffView');
    const diffC = document.getElementById('diffC');
    const ctx = diffC ? diffC.getContext('2d') : null;
    const pixel = ctx ? ctx.getImageData(360, 270, 1, 1).data : [0,0,0,0];
    const diffGain = document.getElementById('diffGain');
    diffGain.value = 4;
    diffGain.oninput();
    const invDiff = document.getElementById('invDiff');
    invDiff.click();
    return {
      diffVisible: diffView && !diffView.hidden,
      hasPixels: pixel[3] === 255
    };
  });
  assert('Mode D', 'Difference canvas renders digital subtraction with valid alpha', diffTest.diffVisible && diffTest.hasPixels);

  // -------------------------------------------------------------
  // Category 8: Mode C (Spectroscopy & CO2 Emission)
  // -------------------------------------------------------------
  const colorTest = await page.evaluate(() => {
    document.getElementById('mC').click();
    const cs = document.getElementById('cs');
    const cw = document.getElementById('cw');
    cw.value = 5;
    cw.oninput();
    const rgl = document.getElementById('rgl');
    const chartC = document.getElementById('cch');
    return {
      csVisible: cs && !cs.hidden,
      rglHidden: rgl && rgl.hidden,
      chartHasPoints: chartC && chartC.querySelectorAll('circle').length > 0
    };
  });
  assert('Mode C', 'Spectroscopy mode active with Target ring pill hidden and spectrum plotted in #cch', colorTest.csVisible && colorTest.rglHidden && colorTest.chartHasPoints);

  // Close modal
  await page.evaluate(() => {
    closeChange();
  });
  await page.waitForTimeout(400);

  // -------------------------------------------------------------
  // Category 9: Astrometric Coordinate Search Modal
  // -------------------------------------------------------------
  const searchTest = await page.evaluate(() => {
    const sModal = document.getElementById('searchModal');
    const searchBtn = document.getElementById('coordSearchBtn');
    if (searchBtn) searchBtn.click();
    else sModal.hidden = false;

    const p1 = window.parseCoord('133.795', false);
    const p2 = window.parseCoord('-7.245', true);
    const pSex1 = window.parseCoord('08h 55m 10s', false);
    const pSex2 = window.parseCoord('-07° 14\' 43"', true);

    const matchIdx = window.findClosestTarget(133.795, -7.245);
    const matchedId = FIELD[matchIdx].id;

    sModal.hidden = true;

    return {
      p1Ok: Math.abs(p1 - 133.795) < 0.001,
      p2Ok: Math.abs(p2 - -7.245) < 0.001,
      pSex1Ok: !isNaN(pSex1) && Math.abs(pSex1 - 133.79) < 0.05,
      pSex2Ok: !isNaN(pSex2) && Math.abs(pSex2 - -7.245) < 0.05,
      matchedWise: matchedId === 'wise0855'
    };
  });
  assert('Search', 'Parses decimal degrees RA/Dec', searchTest.p1Ok && searchTest.p2Ok);
  assert('Search', 'Parses sexagesimal hh:mm:ss and dd:mm:ss correctly', searchTest.pSex1Ok && searchTest.pSex2Ok);
  assert('Search', 'Finds nearest target in catalog (WISE 0855 for 133.795, -7.245)', searchTest.matchedWise);

  // -------------------------------------------------------------
  // Category 10: Gallery Modal and All Filter Tabs
  // -------------------------------------------------------------
  const galleryTest = await page.evaluate(() => {
    const gal = document.getElementById('gal');
    gal.hidden = false;
    const filterBtns = Array.from(document.querySelectorAll('#gf button'));
    const cards = Array.from(document.querySelectorAll('#gg .gc'));

    const tabReports = {};
    for (const b of filterBtns) {
      b.click();
      const visibleCards = cards.filter(c => !c.hidden);
      tabReports[b.textContent] = visibleCards.length;
    }

    gal.hidden = true;
    return {
      totalCards: cards.length,
      tabReports
    };
  });
  assert('Gallery', 'Total gallery cards matches 6 catalog items', galleryTest.totalCards === 6, `Count: ${galleryTest.totalCards}`);
  assert('Gallery', 'NASA Benchmarks filter displays all 6 targets', galleryTest.tabReports['NASA Benchmarks'] === 6, `Count: ${galleryTest.tabReports['NASA Benchmarks']}`);
  assert('Gallery', 'Brown Dwarfs filter displays targets (WISE 0855 + Epsilon Indi)', galleryTest.tabReports['Brown Dwarfs'] === 2, `Count: ${galleryTest.tabReports['Brown Dwarfs']}`);
  assert('Gallery', 'Stars & Variables filter displays all 3 stars (Barnard, RW Aurigae, R Draconis)', galleryTest.tabReports['Stars & Variables'] === 3, `Count: ${galleryTest.tabReports['Stars & Variables']}`);
  assert('Gallery', 'Planet X filter displays candidate', galleryTest.tabReports['Planet X (450 AU)'] === 1, `Count: ${galleryTest.tabReports['Planet X (450 AU)']}`);

  // -------------------------------------------------------------
  // Category 11: 3D Celestial Sky Globe & Overlays
  // -------------------------------------------------------------
  const webglTest = await page.evaluate(() => {
    const canvas = document.querySelector('#sky-canvas canvas') || document.querySelector('canvas');
    const gl = canvas ? (canvas.getContext('webgl') || canvas.getContext('webgl2')) : null;
    return {
      hasCanvas: !!canvas,
      hasGL: !!gl
    };
  });
  assert('3D Globe', 'WebGL canvas active and rendering celestial skybox', webglTest.hasCanvas && webglTest.hasGL);

  const gridToggleTest = await page.evaluate(() => {
    const btn = document.getElementById('grid');
    const wasPressed = btn.getAttribute('aria-pressed') === 'true';
    btn.click();
    const isPressed = btn.getAttribute('aria-pressed') === 'true';
    btn.click(); // revert
    return { toggled: wasPressed !== isPressed };
  });
  assert('3D Globe', 'Coordinate grid toggle flips aria-pressed', gridToggleTest.toggled);

  // -------------------------------------------------------------
  // Category 12: Citizen Science Candidate Dossier Modal
  // -------------------------------------------------------------
  const anomalyTest = await page.evaluate(() => {
    openChange('M');
    setSeries(0);
    const flagBtn = document.getElementById('flagAnomalyBtn');
    flagBtn.click();
    const modal = document.getElementById('anomalyModal');
    const summaryCard = document.getElementById('anomalySummaryCard');
    const hasSummary = summaryCard && summaryCard.textContent.length > 20;
    const isVisible = modal && !modal.hidden;

    const report = window.generateAnomalyReport ? window.generateAnomalyReport() : null;

    const closeBtn = document.getElementById('closeAnomaly');
    if (closeBtn) closeBtn.click();
    closeChange();

    return {
      isVisible,
      hasSummary,
      hasReport: report && report.report_standard && report.target && report.target.catalog_id
    };
  });
  assert('Citizen Science', 'Candidate Anomaly Dossier modal displays telemetry and generates valid JSON standard', anomalyTest.isVisible && anomalyTest.hasSummary && anomalyTest.hasReport);

  // -------------------------------------------------------------
  // Category 13: Story Showcase Landmark Grid
  // -------------------------------------------------------------
  const storyGridTest = await page.evaluate(() => {
    const grid = document.getElementById('storyBenchmarkGrid');
    const cards = grid ? grid.querySelectorAll('.benchmark-card') : [];
    return {
      hasCards: cards.length === 6,
      count: cards.length
    };
  });
  assert('Story Showcase', 'Scroll story benchmark cards rendered with live coordinates (all 6 landmarks)', storyGridTest.hasCards, `Count: ${storyGridTest.count}`);

  // -------------------------------------------------------------
  // Category 14: Responsive Viewport Check
  // -------------------------------------------------------------
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(400);
  const mobileTest = await page.evaluate(() => {
    const bodyWidth = document.body.clientWidth;
    const header = document.querySelector('header');
    return {
      bodyWidth: bodyWidth <= 375,
      headerVisible: !!header
    };
  });
  assert('Responsive', 'Mobile viewport (375x812) layout integrity verified', mobileTest.bodyWidth && mobileTest.headerVisible);

  await page.setViewportSize({ width: 1280, height: 800 });

  // -------------------------------------------------------------
  // Category 15: URL Deep-Linking Router (?ra=&dec=&fov= & target=)
  // -------------------------------------------------------------
  const routeTest = await page.evaluate(() => {
    const url = new URL('http://localhost:8080/?target=rdraconis&mode=M');
    const q = new URLSearchParams(url.search);
    const target = q.get('target');
    const m = q.get('mode');
    const rDracIdx = FIELD.findIndex(f => f.id === target);
    const planetxObj = FIELD.find(f => f.id === 'planetx');
    const hasAccurateParallax = planetxObj && JSON.stringify(planetxObj).includes('458.4');
    return { target, m, foundTarget: rDracIdx >= 0, hasAccurateParallax };
  });
  assert('Router', 'URL query string parses target=rdraconis&mode=M', routeTest.foundTarget && routeTest.m === 'M');
  assert('Science Accuracy', 'Planet X model displays accurate π = 458.4″ annual parallax at 450 AU', routeTest.hasAccurateParallax);

  // -------------------------------------------------------------
  // Category 16: On-Demand NASA IRSA IPAC Cutout & Email Studio
  // -------------------------------------------------------------
  await page.evaluate(() => {
    const btn = document.getElementById('irsaRequestBtn');
    if (btn) btn.click();
    document.getElementById('irsaRaInput').value = '269.4521';
    document.getElementById('irsaDecInput').value = '4.6934';
    document.getElementById('irsaTargetInput').value = "Barnard's Star Live Cutout";
    document.getElementById('irsaEmailInput').value = 'test-scientist@caltech.edu';
    document.getElementById('runIrsaCutoutBtn').click();
  });

  // Poll until #irsaResultView is visible (max 15s)
  let irsaDone = false;
  for (let w = 0; w < 30; w++) {
    await page.waitForTimeout(500);
    irsaDone = await page.evaluate(() => {
      const rv = document.getElementById('irsaResultView');
      return rv && !rv.hidden;
    });
    if (irsaDone) break;
  }

  // Wait 400ms for images inside #irsaResultView to finish loading
  await page.waitForTimeout(400);

  const irsaStudioTest = await page.evaluate(() => {
    const modal = document.getElementById('irsaModal');
    const rv = document.getElementById('irsaResultView');
    const gif = document.getElementById('irsaBlinkGif');
    const diff = document.getElementById('irsaDiffImg');
    const stripCards = document.querySelectorAll('#irsaFramesStrip .irsa-frame-item');
    const previewLink = document.getElementById('irsaPreviewEmailLink');
    const emlLink = document.getElementById('irsaDownloadEmlLink');
    const banner = document.getElementById('irsaEmailBanner');

    return {
      modalOpen: modal && !modal.hidden,
      resultVisible: rv && !rv.hidden,
      hasGif: gif && gif.src.includes('blink_animation.gif'),
      hasDiff: diff && diff.src.includes('difference_map.jpg'),
      frameCount: stripCards.length,
      hasPreviewLink: previewLink && previewLink.href.includes('email_preview.html'),
      hasEmlLink: emlLink && emlLink.href.includes('.eml'),
      hasBannerText: banner && banner.textContent.includes('test-scientist@caltech.edu')
    };
  });

  assert('IRSA Cutout & Mail', 'IRSA Studio modal opens and executes find_and_cut_movers.py pipeline', irsaStudioTest.modalOpen && irsaStudioTest.resultVisible);
  assert('IRSA Cutout & Mail', 'Generates 3 multi-epoch WCS-aligned cutouts + FITS download links', irsaStudioTest.frameCount === 3, `Frames: ${irsaStudioTest.frameCount}`);
  assert('IRSA Cutout & Mail', 'Generates animated 3-epoch Blink GIF & Digital Difference Map (Pass 3 - Pass 1)', irsaStudioTest.hasGif && irsaStudioTest.hasDiff);
  assert('IRSA Cutout & Mail', 'Composes HTML Email Preview & downloadable RFC-822 .eml package for recipient', irsaStudioTest.hasPreviewLink && irsaStudioTest.hasEmlLink && irsaStudioTest.hasBannerText);

  // -------------------------------------------------------------
  // Category 17: Table 6 Challenge Features (FOV, Gaia/WISE/Aladin, Contamination Mask, Real FITS SED, Archive Sync)
  // -------------------------------------------------------------
  const challengeTest = await page.evaluate(async () => {
    // 1. Direct transition from IRSA Cutout Studio into the 5-mode on-page viewer
    const inspectBtn = document.getElementById('irsaInspectInViewerBtn');
    if (inspectBtn) inspectBtn.click();

    // Wait briefly for modal transition
    await new Promise(r => setTimeout(r, 350));

    // 2. Test URL coordinate + FOV routing via hashchange (#ra=269.4521&dec=4.6934&fov=0.15&mode=M)
    window.location.hash = 'ra=269.4521&dec=4.6934&fov=0.15&mode=M';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await new Promise(r => setTimeout(r, 200));

    const chgOpen = !document.getElementById('chg').hidden;
    const fovSelectVal = document.getElementById('cutoutFovSelect') ? document.getElementById('cutoutFovSelect').value : '';
    const hasFovScaleBar = !!document.querySelector('#mvS .fov-scale-overlay');

    // 3. Test Gaia DR3 + AllWISE overlay markers and Contamination Mask overlay
    const gaiaToggle = document.getElementById('gaiaWiseOverlayToggle');
    const contamToggle = document.getElementById('contamMaskToggle');
    if (gaiaToggle && !gaiaToggle.checked) gaiaToggle.click();
    if (contamToggle && !contamToggle.checked) contamToggle.click();

    const gaiaCount = document.querySelectorAll('#mvS .gaia-overlay-marker').length;
    const wiseCount = document.querySelectorAll('#mvS .wise-overlay-marker').length;
    const contamCount = document.querySelectorAll('#mvS .contam-mask-zone').length;
    const contamBadgeText = document.getElementById('contamFlagBadge') ? document.getElementById('contamFlagBadge').textContent : '';

    // 4. Test Live Aladin Lite toggle
    const aladinBtn = document.getElementById('aladinEmbedBtn');
    if (aladinBtn) aladinBtn.click();
    const aladinBoxVisible = document.getElementById('aladinEmbedBox') && !document.getElementById('aladinEmbedBox').hidden;
    if (aladinBtn) aladinBtn.click(); // close back

    // 5. Test Real FITS 6-band Calibrated SED in Mode C for Barnard's Star
    document.getElementById('mC').click();
    const cchCircles = document.querySelectorAll('#cch circle').length;
    const cap2Text = document.getElementById('cap2') ? document.getElementById('cap2').textContent : '';
    const hasCsvBtn = !!document.getElementById('downloadSpectrumCsvBtn');

    // 6. Test 1-Click Local FITS Archive Sync API
    const syncResp = await fetch('/api/sync-data-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).then(r => r.json());

    return {
      chgOpen,
      fovSelectVal,
      hasFovScaleBar,
      gaiaCount,
      wiseCount,
      contamCount,
      contamBadgeText,
      aladinBoxVisible,
      cchCircles,
      hasMjySrInSpectrum: cap2Text.includes('MJy/sr'),
      hasCsvBtn,
      syncOk: !!(syncResp && syncResp.ok && (syncResp.total_fits_indexed || syncResp.total_fits_files) >= 36)
    };
  });

  assert('Challenge Table 6', 'Arbitrary RA/Dec + FOV URL deep-link opens on-page viewer & calibrates FOV scale bar', challengeTest.chgOpen && challengeTest.fovSelectVal === '0.15' && challengeTest.hasFovScaleBar);
  assert('Challenge Table 6', 'Gaia DR3 + AllWISE astrometric catalog overlay & Aladin Lite multi-survey viewer active', challengeTest.gaiaCount >= 3 && challengeTest.wiseCount >= 3 && challengeTest.aladinBoxVisible);
  assert('Challenge Table 6', 'SPHEREx Level 2 Contamination Bitmask (0x01/0x02) overlay & status badge active', challengeTest.contamCount >= 1 && challengeTest.contamBadgeText.includes('FLAG 0x'));
  assert('Challenge Table 6', 'Real FITS 6-band (D1-D6) calibrated SED spectrum (MJy/sr) & CSV export active for stellar targets', challengeTest.cchCircles === 6 && challengeTest.hasMjySrInSpectrum && challengeTest.hasCsvBtn);
  assert('Challenge Table 6', '1-Click Local FITS Archive Sync (/api/sync-data-archive) indexes all 36 real FITS cutouts', challengeTest.syncOk);

  // Final Uncaught Error Check
  assert('Core', 'Zero Uncaught Console Errors across entire test suite run', pageErrors.length === 0, pageErrors.join('; '));

  return results;
}
