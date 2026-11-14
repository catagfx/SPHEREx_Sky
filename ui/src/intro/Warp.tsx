import { useEffect, useRef } from 'react';

// Shared, mutable animation state: GSAP tweens `warp` (0 = calm star points,
// 1 = hyperspace streaks) and `fade`; the shader reads it every frame. `speed` 0 = still stars (calm mode).
export interface WarpState { warp: number; fade: number; speed: number }

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

// GLSL: polar star-field. Each angular cell hosts one star flying outward;
// its tail stretches with `uWarp`, giving a hyperspace-to-calm deceleration.
// (No smoothstep with reversed edges: undefined behaviour on some drivers.)
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uT;
uniform float uWarp;
uniform float uFade;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  vec3 col = vec3(0.0);

  for(int i = 0; i < 5; i++){
    float fi = float(i);
    float cells = 46.0 + fi * 34.0;
    float ang = a / 6.2831853 * cells;
    float id = floor(ang);
    float f = fract(ang) - 0.5;
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

  // soft nebula glow + vignette
  float glow = exp(-r * 2.4);
  col += vec3(0.03, 0.06, 0.13) * glow * 1.2;
  col *= 1.0 - smoothstep(0.2, 1.25, r);
  gl_FragColor = vec4(clamp(col * uFade, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('Warp shader:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

export default function Warp({ state, onUnsupported }: { state: WarpState; onUnsupported: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false }) as WebGLRenderingContext | null;
    if (!gl) { onUnsupported(); return; }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) { onUnsupported(); return; }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { onUnsupported(); return; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uT = gl.getUniformLocation(prog, 'uT');
    const uWarp = gl.getUniformLocation(prog, 'uWarp');
    const uFade = gl.getUniformLocation(prog, 'uFade');

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    let raf = 0;
    let last = performance.now();
    let t = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      resize();
      // time runs faster while warping, so streaks decelerate smoothly into calm
      t += dt * (0.12 + state.warp * 1.6) * state.speed;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uT, t);
      gl.uniform1f(uWarp, state.warp);
      gl.uniform1f(uFade, state.fade);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    };
  }, [state, onUnsupported]);

  return <canvas ref={ref} className="intro-warp" aria-hidden="true" />;
}
