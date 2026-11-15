import * as THREE from 'three';

// VR intro — the exact same beat as the web intro (Warp.tsx + Intro.tsx):
//   1. 1-second black beat (matches #ui-boot handover on the web)
//   2. the same GLSL warp shader renders on a large plane in front of the viewer, decelerating uWarp 1 → 0
//   3. SPHEREx SKY is TYPED letter-by-letter in Exo 2 (same font, same animation as #introType)
//   4. VR MODE appears beneath, as a steady sub-label (this is the new line the user asked for)
//   5. everything fades out, caller swaps in the VR UI
// The SPHEREx sky sphere behind us is hidden by the caller while this runs, so the warp shader is the
// only thing visible — same as when #ui-boot / #load own the page on the web.

const WARP_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// ===== 360° adaptation of ui/src/intro/Warp.tsx FRAG =====
// Applied to the INSIDE of a sphere around the viewer. Each fragment has a 3D unit direction `vDir`.
// We convert it to the shader's 2D polar coordinates via a stereographic projection centred on uForward
// (the user's gaze). That way looking any direction the warp pattern is radiating from the centre of
// the view, exactly like the web intro — but the pattern surrounds the user in all directions at once.
// Everything else (cell count, tail formula, warm/cool tint, central glow) is the original web shader.
const WARP_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uT;
uniform float uWarp;
uniform float uFade;
uniform vec3 uForward;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(){
  // Stereographic projection from the viewer's gaze (-uForward is the north pole). For a direction
  // close to uForward the projected radius is small (centre of the pattern); directly opposite, it goes
  // to infinity, so we scale into our shader's 0..1.35 range and clamp.
  vec3 d = normalize(vDir);
  float cosA = clamp(dot(d, uForward), -0.999, 0.999);
  // tangent-plane basis: pick a stable "up" (world +Y) perpendicular to uForward
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(worldUp, uForward));
  vec3 up = cross(uForward, right);
  // project d onto the tangent plane at uForward
  vec3 proj = d - uForward * cosA;
  float x = dot(proj, right);
  float y = dot(proj, up);
  float ang = atan(y, x);
  // radial: half-angle stereographic (0 at centre, 1 at 90°, ∞ at the far pole). Rescale to match Warp.
  float halfA = acos(cosA) * 0.5;
  float r = tan(halfA) * 0.9;

  vec3 col = vec3(0.0);

  for(int i = 0; i < 5; i++){
    float fi = float(i);
    float cells = 46.0 + fi * 34.0;
    float cellAng = ang / 6.2831853 * cells;
    float id = floor(cellAng);
    float f = fract(cellAng) - 0.5;
    float h = hash(vec2(id, fi + 1.7));
    float h2 = hash(vec2(id + 9.1, fi + 3.3));
    float on = step(0.52, h2);

    float z = fract(h + uT * (0.05 + fi * 0.018));
    float rho = z * z * 1.35;
    float len = 0.012 + uWarp * (0.05 + 0.55 * z);
    float along = rho - r;
    float tail = (1.0 - smoothstep(0.0, len, along)) * step(0.0, along);
    float across = abs(f) * (r * 6.2831853 / cells);
    float thick = 0.0009 + 0.0011 * z;
    float core = 1.0 - smoothstep(0.0, thick, across);
    float bright = tail * core * (0.35 + z * 1.6) * on;

    vec3 tint = mix(vec3(0.72, 0.87, 1.0), vec3(1.0, 0.78, 0.55), step(0.82, h));
    col += tint * bright;
  }

  float glow = exp(-r * 2.4);
  col += vec3(0.03, 0.06, 0.13) * glow * 1.2;
  // no outer vignette — in 360° we let the pattern extend softly toward the back of the sphere
  gl_FragColor = vec4(clamp(col * uFade, 0.0, 1.0), 1.0);
}`;

const TITLE_TEXT = 'SPHEREx SKY';
const TITLE_LETTERS = Array.from(TITLE_TEXT);
const TYPE_STEP_S = 0.13;                // seconds per typed letter (identical to Intro.tsx TYPE_STEP)
const BLACK_HOLD_S = 1.0;                // 1-second black beat before the shader starts (user request)
const WARP_PHASE_S = 2.4;                // seconds spent decelerating uWarp 1 → 0.05 (same as Intro.tsx entrance)
const TITLE_HOLD_S = 1.6;                // title holds complete
const FADE_OUT_S = 0.8;                  // final fade to the VR UI
const TOTAL_S = BLACK_HOLD_S + WARP_PHASE_S + (TITLE_LETTERS.length * TYPE_STEP_S) + TITLE_HOLD_S + FADE_OUT_S;

function makeTitleCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 768;
  return { canvas, ctx: canvas.getContext('2d') };
}

/** Helper — draw one line of Exo 2 white text with 0.1em letter-spacing, optionally stopping after `visible` letters. */
function drawLine(ctx, canvas, text, y, fontSize, visibleChars, caretOn) {
  ctx.font = `600 ${fontSize}px "Exo 2", "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(143, 211, 255, 0.35)';
  ctx.shadowBlur = 90;
  ctx.fillStyle = '#ffffff';
  const spacing = 0.1 * fontSize;
  const chars = Array.from(text);
  let fullWidth = 0;
  for (const c of chars) fullWidth += ctx.measureText(c).width + spacing;
  fullWidth -= spacing;
  let x = (canvas.width - fullWidth) / 2;
  const n = visibleChars === undefined ? chars.length : Math.max(0, Math.min(chars.length, visibleChars));
  for (let i = 0; i < n; i++) {
    ctx.fillText(chars[i], x, y);
    x += ctx.measureText(chars[i]).width + spacing;
  }
  if (caretOn && n < chars.length) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 6, y - fontSize * 0.42, Math.round(fontSize * 0.05), fontSize * 0.84);
  }
}

/** Paint SPHEREx SKY (typewriter) + VR MODE (steady, same font/size/colour) when `showVRMode`. */
function drawTitle(ctx, canvas, lettersVisible, showVRMode, caretOn) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fontSize = 140;              // was 180
  drawLine(ctx, canvas, TITLE_TEXT, 300, fontSize, lettersVisible, caretOn);
  if (showVRMode) drawLine(ctx, canvas, 'VR MODE', 470, fontSize);     // 170 px gap instead of 320
}

export function createVRIntro() {
  const group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 50;

  // --- Opaque dark dome around the user — same background colour as #ui-boot / #load on the web. ---
  const bgMat = new THREE.MeshBasicMaterial({
    color: 0x05070f,
    side: THREE.BackSide,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  const bgMesh = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 14), bgMat);
  bgMesh.renderOrder = 48;
  group.add(bgMesh);

  // --- The Warp.tsx shader on a full 360° sphere around the viewer. BackSide so it is visible from
  // the inside, inside the opaque dome we already added. Each frame we pass `uForward` so the
  // stereographic pattern recentres on wherever the user is currently looking.
  const uniforms = {
    uT: { value: 0 },
    uWarp: { value: 1.0 },
    uFade: { value: 0 },
    uForward: { value: new THREE.Vector3(0, 0, -1) },
  };
  const warpMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WARP_VERT,
    fragmentShader: WARP_FRAG,
    transparent: true,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  // 15 m radius sphere, slightly smaller than the opaque dome (20 m) so draw order puts the shader on top.
  const warpMesh = new THREE.Mesh(new THREE.SphereGeometry(15, 48, 32), warpMat);
  warpMesh.renderOrder = 60;
  group.add(warpMesh);

  // --- Title plane (SPHEREx SKY + VR MODE) ---
  const { canvas: titleCanvas, ctx: titleCtx } = makeTitleCanvas();
  const titleTex = new THREE.CanvasTexture(titleCanvas);
  titleTex.minFilter = THREE.LinearFilter;
  titleTex.magFilter = THREE.LinearFilter;
  const titleMat = new THREE.MeshBasicMaterial({
    map: titleTex,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });
  const titleW = 2.0;
  // canvas aspect 2:1 (1536×768) → plane 2.0 × 1.0 m, with the two lines sitting close together.
  const titlePlane = new THREE.Mesh(new THREE.PlaneGeometry(titleW, titleW * (titleCanvas.height / titleCanvas.width)), titleMat);
  titlePlane.renderOrder = 80;
  group.add(titlePlane);

  let t0 = 0;
  let playing = false;
  let onDone = null;
  let lastDrawn = -1;
  let lastVRMode = false;

  /** Show the opaque black dome immediately — no shader yet. Used during the 1 s wait. */
  function preShow() {
    group.visible = true;
    bgMat.opacity = 1;
    uniforms.uFade.value = 0;
    uniforms.uWarp.value = 1.0;
    titleMat.opacity = 0;
    drawTitle(titleCtx, titleCanvas, 0, false, false);
    titleTex.needsUpdate = true;
    lastDrawn = 0;
    lastVRMode = false;
  }

  function play(cb) {
    group.visible = true;
    t0 = performance.now();
    playing = true;
    onDone = cb || null;
    bgMat.opacity = 1;
    uniforms.uFade.value = 0;
    uniforms.uWarp.value = 1.0;
    uniforms.uT.value = 0;
    titleMat.opacity = 0;
    lastDrawn = 0;
    lastVRMode = false;
  }

  function step(camera) {
    if (!playing) return;
    const now = performance.now();
    const elapsed = (now - t0) / 1000;        // seconds
    if (elapsed >= TOTAL_S) {
      playing = false;
      group.visible = false;
      const cb = onDone; onDone = null;
      if (cb) cb();
      return;
    }

    // Keep the whole scene centred on the viewer. The 360° shader sphere surrounds the user, while
    // the title plane sits 2m in front of their current gaze.
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    group.position.copy(camPos);
    const camQuat = new THREE.Quaternion();
    camera.getWorldQuaternion(camQuat);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
    uniforms.uForward.value.copy(forward).normalize();
    titlePlane.position.copy(forward.clone().multiplyScalar(2.0));
    titlePlane.lookAt(0, titlePlane.position.y, 0);

    // ---- Phase timing (same shape as Intro.tsx) ----
    //   0 .. BLACK_HOLD_S                       — pure black (1 second)
    //   BLACK_HOLD_S .. BLACK_HOLD_S+0.9        — shader fades IN under warp 1.0
    //   next 1.5 s                              — uWarp eases 1.0 → 0.05 (deceleration)
    //   then letters typewrite, VR MODE appears, title holds, final fade-out
    const t = elapsed;

    if (t < BLACK_HOLD_S) {
      // Black beat: the shader is off, the dome stays opaque, nothing else.
      bgMat.opacity = 1;
      uniforms.uFade.value = 0;
      titleMat.opacity = 0;
      return;
    }

    const afterBlack = t - BLACK_HOLD_S;
    const warpEnd = WARP_PHASE_S;                        // 2.4 s of warp
    const fadeInDur = 0.9;                               // shader fade-in while warp 1.0
    const warpDecel = warpEnd - fadeInDur;               // remaining 1.5 s for deceleration

    // shader fade-in (web: tl.to(warp, { fade: 1, duration: 0.9 }))
    if (afterBlack <= fadeInDur) {
      uniforms.uFade.value = afterBlack / fadeInDur;
      uniforms.uWarp.value = 1.0;
      // the dome stays full black so the fade-in reads against a flat colour, like #load does on the web
      bgMat.opacity = 1;
    } else if (afterBlack <= warpEnd) {
      uniforms.uFade.value = 1;
      // decelerate: uWarp eases 1.0 → 0.05 with a cubic ease-out (same as `power3.out`)
      const k = (afterBlack - fadeInDur) / warpDecel;
      const ease = 1 - Math.pow(1 - k, 3);
      uniforms.uWarp.value = 1.0 + (0.05 - 1.0) * ease;
      bgMat.opacity = 1;
    } else {
      // warp done → the title phase begins; the shader stays visible at calm but gently dims out
      uniforms.uFade.value = 1;
      uniforms.uWarp.value = 0.05;
      bgMat.opacity = 1;
    }

    // advance the shader's own time (matches `t += dt * (0.12 + warp * 1.6)` from Warp.tsx)
    uniforms.uT.value += (0.016 * (0.12 + uniforms.uWarp.value * 1.6));

    // ---- Title typewriter ----
    const titlePhaseStart = BLACK_HOLD_S + warpEnd;      // when the first letter appears
    const titlePhaseT = t - titlePhaseStart;
    if (titlePhaseT >= 0) {
      const lettersVisible = Math.min(TITLE_LETTERS.length, Math.floor(titlePhaseT / TYPE_STEP_S) + 1);
      const typingDone = lettersVisible >= TITLE_LETTERS.length;
      const vrMode = typingDone && (titlePhaseT > (TITLE_LETTERS.length * TYPE_STEP_S) + 0.15);
      const caretOn = !typingDone && (Math.floor(titlePhaseT / 0.5) % 2 === 0);

      // redraw only when something changed
      if (lettersVisible !== lastDrawn || vrMode !== lastVRMode) {
        drawTitle(titleCtx, titleCanvas, lettersVisible, vrMode, caretOn);
        titleTex.needsUpdate = true;
        lastDrawn = lettersVisible;
        lastVRMode = vrMode;
      } else {
        // caret blink: cheap enough to redraw each frame while typing
        if (!typingDone) {
          drawTitle(titleCtx, titleCanvas, lettersVisible, false, caretOn);
          titleTex.needsUpdate = true;
        }
      }

      // title opacity: fade in over 0.3 s once typing starts
      titleMat.opacity = Math.min(1, titlePhaseT / 0.3);
    }

    // ---- Final fade-out (last FADE_OUT_S seconds): everything to black ----
    const fadeOutStart = TOTAL_S - FADE_OUT_S;
    if (t > fadeOutStart) {
      const k = (t - fadeOutStart) / FADE_OUT_S;
      uniforms.uFade.value = Math.max(0, 1 - k);
      titleMat.opacity = Math.max(0, titleMat.opacity * (1 - k));
      bgMat.opacity = Math.max(0, 1 - k);
    }
  }

  function dispose() {
    warpMesh.geometry.dispose();
    warpMat.dispose();
    bgMesh.geometry.dispose();
    bgMat.dispose();
    titleTex.dispose();
    titleMat.dispose();
    titlePlane.geometry.dispose();
  }

  return { group, play, preShow, step, dispose, get playing() { return playing; } };
}
