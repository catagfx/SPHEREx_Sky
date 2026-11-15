import gsap from 'gsap';
import { $ } from '../dom';
import { prefersReducedMotion as reduce } from '../../core/env';
import { ABOUT } from '../../data';
import { zoomBack } from './camera';
import { playNarration, stopAllNarration, pauseAllNarration, resumeAllNarration, isAudioPlaying } from '../audio/narration';

// The small info card (#card) shown for a landmark, a tour stop, "About SPHEREx" or a sensor message.

const card = () => $('#card');

export function showCard(title, text, audioSrc, narrationText) {
  stopAllNarration();
  const el = card();
  if (!el) return;

  const h2 = el.querySelector('h2');
  const p = el.querySelector('p');
  if (h2) h2.textContent = title || '';
  if (p) p.textContent = text || '';

  // Ensure audio control button exists in card
  let audioBtn = el.querySelector('#cardAudioBtn');
  if (!audioBtn) {
    audioBtn = document.createElement('button');
    audioBtn.id = 'cardAudioBtn';
    audioBtn.className = 'b';
    audioBtn.style.marginRight = '8px';
    const closeBtn = el.querySelector('#x');
    if (closeBtn && closeBtn.parentNode) {
      closeBtn.parentNode.insertBefore(audioBtn, closeBtn);
    } else {
      el.appendChild(audioBtn);
    }
  }

  function setAudioBtnState(state) {
    if (!audioBtn) return;
    audioBtn.setAttribute('data-state', state);
    audioBtn.textContent = state === 'playing' ? 'Pause narration' : state === 'paused' ? 'Resume narration' : 'Play narration';
  }

  audioBtn.onclick = (e) => {
    e.stopPropagation();
    if (isAudioPlaying()) {
      pauseAllNarration();
      setAudioBtnState('paused');
    } else if (audioBtn.getAttribute('data-state') === 'paused') {
      resumeAllNarration();
      setAudioBtnState('playing');
    } else {
      const ok = playNarration({
        src: audioSrc,
        text: narrationText || text,
        onEnd: () => setAudioBtnState('idle'),
      });
      setAudioBtnState(ok ? 'playing' : 'idle');
    }
  };

  el.hidden = false;
  if (!reduce) gsap.fromTo(el, { opacity: 0, scale: 0.92, y: 16 }, { opacity: 1, scale: 1, y: 0, duration: 0.32, ease: 'back.out(1.4)' });

  // Auto-play audio when landmark card opens if audio source or narration is present
  if (audioSrc || narrationText) {
    audioBtn.style.display = 'inline-block';
    const ok = playNarration({
      src: audioSrc,
      text: narrationText || text,
      onEnd: () => setAudioBtnState('idle'),
    });
    setAudioBtnState(ok ? 'playing' : 'idle');
  } else {
    audioBtn.style.display = 'none';
  }
}

/** Fade the card out, then ease the camera back out if it had zoomed in. */
export function hideCard() {
  stopAllNarration();
  const el = card();
  if (!reduce && !el.hidden) {
    gsap.to(el, {
      opacity: 0, scale: 0.94, y: 10, duration: 0.2, ease: 'power2.in',
      onComplete() { el.hidden = true; zoomBack(); },
    });
  } else {
    el.hidden = true;
    zoomBack();
  }
}

/** Hide at once, no camera move (a dialog is opening over it). */
export function hideCardNow() {
  stopAllNarration();
  card().hidden = true;
}

export function initCard() {
  $('#x').onclick = hideCard;
  $('#about').onclick = () => showCard(ABOUT[0], ABOUT[1]);
}
