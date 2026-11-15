// Universal speech / audio player with automatic fallback to pre-rendered MP3 voiceovers.
// Uses Web Audio API (AudioContext) for robust, unblocked audio in both Desktop Web and Meta Quest WebXR.

let audioCtx = null;
const audioBufferCache = new Map();
let currentSource = null;
let currentGain = null;
let currentAudio = null;
let currentOnEnd = null;
let isPaused = false;
let pauseOffset = 0;
let playStartTime = 0;
let activeBuffer = null;
let activeUrl = null;
let activeText = null;

export function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function unlockAudioContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  ['click', 'pointerdown', 'touchstart', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, unlockAudioContext, { capture: true, passive: true });
  });
}

export function isAudioPlaying() {
  if (currentSource && !isPaused) return true;
  if (currentAudio && !currentAudio.paused && !currentAudio.ended) return true;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return speechSynthesis.speaking && !speechSynthesis.paused;
  }
  return false;
}

export function stopAllNarration() {
  isPaused = false;
  pauseOffset = 0;
  activeBuffer = null;
  activeUrl = null;
  activeText = null;

  if (currentSource) {
    try {
      currentSource.onended = null;
      currentSource.stop();
      currentSource.disconnect();
    } catch (_) {}
    currentSource = null;
  }
  if (currentGain) {
    try { currentGain.disconnect(); } catch (_) {}
    currentGain = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (_) {}
    currentAudio = null;
  }
  if (currentOnEnd) {
    const cb = currentOnEnd;
    currentOnEnd = null;
    try { cb(); } catch (_) {}
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      speechSynthesis.cancel();
    } catch (_) {}
  }
}

export function pauseAllNarration() {
  if (currentSource && !isPaused && audioCtx && activeBuffer) {
    pauseOffset = (audioCtx.currentTime - playStartTime) % activeBuffer.duration;
    isPaused = true;
    try {
      currentSource.onended = null;
      currentSource.stop();
      currentSource.disconnect();
    } catch (_) {}
    currentSource = null;
    return;
  }
  if (currentAudio && !currentAudio.paused) {
    try { currentAudio.pause(); } catch (_) {}
    return;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window && speechSynthesis.speaking) {
    try { speechSynthesis.pause(); } catch (_) {}
  }
}

export function resumeAllNarration() {
  if (isPaused && activeBuffer && audioCtx) {
    isPaused = false;
    startBufferPlayback(activeBuffer, pauseOffset, currentOnEnd);
    return;
  }
  if (currentAudio && currentAudio.paused) {
    try { currentAudio.play(); } catch (_) {}
    return;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window && speechSynthesis.paused) {
    try { speechSynthesis.resume(); } catch (_) {}
  }
}

function startBufferPlayback(buffer, offset = 0, onFinish = null) {
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    source.connect(gain);
    gain.connect(ctx.destination);

    currentSource = source;
    currentGain = gain;
    activeBuffer = buffer;
    playStartTime = ctx.currentTime - offset;

    source.onended = () => {
      if (currentSource === source && !isPaused) {
        currentSource = null;
        activeBuffer = null;
        isPaused = false;
        pauseOffset = 0;
        const cb = currentOnEnd;
        currentOnEnd = null;
        if (cb) cb();
        if (onFinish && cb !== onFinish) onFinish();
      }
    };

    source.start(0, Math.max(0, offset));
    return true;
  } catch (err) {
    console.warn('[Narration] Buffer playback failed:', err);
    return false;
  }
}

/**
 * Plays narration using pre-rendered MP3 via Web Audio API (or HTML5 Audio fallback),
 * or falls back to Web Speech API speechSynthesis on desktop / iOS / Android.
 *
 * @param {Object} options
 * @param {string} [options.src] - Path to mp3, e.g. 'assets/audio/landmarks/0.mp3'
 * @param {string} [options.text] - Fallback text for speechSynthesis
 * @param {Function} [options.onEnd] - Callback when audio finishes
 */
export function playNarration({ src, text, onEnd }) {
  stopAllNarration();
  unlockAudioContext();

  activeUrl = src || null;
  activeText = text || null;
  currentOnEnd = onEnd || null;

  const handleEnd = () => {
    isPaused = false;
    pauseOffset = 0;
    activeBuffer = null;
    const cb = currentOnEnd;
    currentOnEnd = null;
    if (cb) cb();
    if (onEnd && cb !== onEnd) onEnd();
  };

  // 1. Try Web Audio API with pre-rendered MP3
  if (src) {
    const ctx = getAudioContext();
    if (ctx) {
      if (audioBufferCache.has(src)) {
        const buf = audioBufferCache.get(src);
        const ok = startBufferPlayback(buf, 0, handleEnd);
        if (ok) return true;
      }

      fetch(src)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((arrBuf) => ctx.decodeAudioData(arrBuf))
        .then((decodedBuf) => {
          audioBufferCache.set(src, decodedBuf);
          if (activeUrl === src) {
            startBufferPlayback(decodedBuf, 0, handleEnd);
          }
        })
        .catch((fetchErr) => {
          console.warn('[Narration] Web Audio load failed, falling back to HTML5 Audio / TTS:', src, fetchErr);
          if (activeUrl === src) {
            playHtml5AudioFallback(src, text, handleEnd);
          }
        });
      return true;
    }

    // 2. Fallback to HTML5 Audio
    return playHtml5AudioFallback(src, text, handleEnd);
  }

  // 3. Fallback to SpeechSynthesis
  if (text) {
    return speakTTS(text, handleEnd);
  }

  return false;
}

function playHtml5AudioFallback(src, text, handleEnd) {
  try {
    const audio = new Audio(src);
    currentAudio = audio;
    audio.onended = () => {
      currentAudio = null;
      handleEnd();
    };
    audio.onerror = (e) => {
      console.warn('[Narration] HTML5 Audio error, trying TTS:', src, e);
      currentAudio = null;
      if (text) speakTTS(text, handleEnd);
      else handleEnd();
    };
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.catch((err) => {
        console.warn('[Narration] HTML5 audio play rejected:', err);
        currentAudio = null;
        if (text) speakTTS(text, handleEnd);
        else handleEnd();
      });
    }
    return true;
  } catch (err) {
    console.warn('[Narration] Audio creation error:', err);
    if (text) return speakTTS(text, handleEnd);
    return false;
  }
}

function speakTTS(text, onEnd) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
    if (onEnd) onEnd();
    return false;
  }

  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1.0;
    u.pitch = 1.05;

    const voices = speechSynthesis.getVoices();
    if (voices && voices.length) {
      const femaleRe = /zira|hazel|samantha|allison|ava|susan|karen|moira|tessa|victoria|serena|eva|catherine|fiona|female|woman/i;
      const v = voices.find((x) => /^en/i.test(x.lang) && femaleRe.test(x.name)) ||
                voices.find((x) => /^en/i.test(x.lang) && /google/i.test(x.name)) ||
                voices.find((x) => /^en/i.test(x.lang)) ||
                voices[0];
      if (v) u.voice = v;
    }

    u.onend = () => { if (onEnd) onEnd(); };
    u.onerror = (e) => {
      console.warn('[TTS] SpeechSynthesis error:', e);
      if (onEnd) onEnd();
    };
    speechSynthesis.speak(u);
    return true;
  } catch (err) {
    console.warn('[TTS] Exception in speakTTS:', err);
    if (onEnd) onEnd();
    return false;
  }
}
