import './core/globals';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Story from './story/Story';
import Intro, { skipIntro } from './intro/Intro';
import { isEmbed } from './core/env';
import { initSmoothScroll } from './core/smooth-scroll';
import { syncSearchWidth } from './core/header';
import { startViewer } from './viewer';

// Boot, in order:
//   1. the Story Tour page (React), rendered synchronously so every element exists
//   2. the intro over it (skipped in embeds, with ?intro=0 and on deep links)
//   3. smooth scrolling, the header search width
//   4. the viewer (3D sky + tools, ui/src/viewer/), which binds to all of the above by element id

// If anything in the React layer throws, never leave the user behind the dark cover.
function bailOut(err: unknown): void {
  console.error('SPHEREx UI failed, showing the page without the intro:', err);
  document.getElementById('ui-boot')?.remove();
  document.body.classList.remove('ui-intro');
}

try {
  const mount = document.getElementById('storyContainer');
  if (mount) {
    const root = createRoot(mount);
    flushSync(() => root.render(<Story />));
  }
} catch (err) {
  bailOut(err);
}

const deepLink = /(^|[?&#])(target|ra|dec|fov|mode)=/.test(location.search + location.hash);
try {
  if (isEmbed || deepLink || new URLSearchParams(location.search).get('intro') === '0') {
    skipIntro();
  } else {
    const host = document.createElement('div');
    host.id = 'ui-intro-root';
    document.body.appendChild(host);
    const introRoot = createRoot(host);
    const unmount = () => { introRoot.unmount(); host.remove(); };
    flushSync(() => introRoot.render(<Intro onDone={unmount} />));
  }
} catch (err) {
  bailOut(err);
}

initSmoothScroll();
try { syncSearchWidth(); } catch (err) { console.warn('header sync:', err); }

startViewer();
