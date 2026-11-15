import { $ } from './dom';
import { isEmbed } from '../core/env';
import { sceneReady, fail, onReveal } from '../core/store';
import { createSky } from './sky/scene';
import { initLayers } from './sky/layers';
import { initCamera, startRenderLoop } from './sky/camera';
import { initCard } from './sky/card';
import { initLandmarks } from './sky/landmarks';
import { initConstellations } from './sky/constellations';
import { initGyro } from './sky/gyro';
import { initXR } from './sky/xr';
import { initHeader } from './ui/header';
import { playChromeEntrance, initMicroInteractions } from './ui/chrome';
import { initExplorer } from './explorer';
import { initShare } from './panels/share';
import { initHelp } from './panels/help';
import { initGallery } from './panels/gallery';
import { initTour } from './panels/tour';
import { initSearch } from './panels/search';
import { initRelease } from './panels/release';
import { initAnomaly } from './panels/anomaly';
import { initIrsa } from './panels/irsa';
import { initNavigation } from './navigation';
import { initStory } from './story';
import { initRoutes } from './routes';
import { exposeApi } from './api';
import { initScientificResources } from '../scientific-resources/index.js';

// The SPHEREx viewer: the 360° WebGL sky behind the page, the header tools, the "See it change" explorer and
// the data panels. It binds to index.html and to the story DOM rendered by React, so main.tsx starts it after
// React has rendered.
//
//   sky/        globe (three.js), camera & controls, landmarks, layers, gyro, VR, coordinates
//   explorer/   the 5-mode time-domain dialog (#chg)
//   panels/     share, gallery, tour, search, data releases, anomaly report, IRSA cutouts, help
//   story/      story-section interactions + the sky following the scroll
//   ui/         modals, toast, header, page-chrome motion

export function startViewer() {
  if (isEmbed) document.body.classList.add('embedded');
  onReveal(playChromeEntrance);
  exposeApi();
  initShare();

  let sky;
  try {
    sky = createSky($('#c'), sceneReady);
  } catch (err) {
    console.error('SPHEREx sky:', err);
    fail('This browser could not initialize WebGL for the 3D sky view.');
    return;
  }

  initLayers(sky);
  initHeader();
  initExplorer();
  initHelp();
  initGallery();
  initCamera(sky);
  initCard();
  initLandmarks();
  initConstellations(sky);
  initGyro();
  initTour();
  initXR(sky);
  startRenderLoop();
  initSearch();
  initRelease();
  initAnomaly();
  initIrsa();
  initScientificResources();
  initNavigation();
  initStory();
  initMicroInteractions();
  initRoutes();
}
