import * as THREE from 'three';
import { SKY_STARS, SKY_DUST } from '../../data';

// The 360° sky: an inverted sphere textured with the two SPHEREx all-sky layers (stars & galaxies, dust & gas),
// blended in a shader, plus the optional galactic coordinate grid.

/** Direction toward galactic longitude l / latitude b (degrees), scaled to radius r, in the globe's frame. */
export function dir(l, b, r) {
  const f = 0.5 - ((((l + 180) % 360) + 360) % 360 - 180) / 360;
  const p = 2 * Math.PI * f;
  const B = (b * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(p) * Math.cos(B), Math.sin(B), Math.sin(p) * Math.cos(B)).multiplyScalar(r || 1);
}

const VERTEX_SHADER = 'varying vec2 vUv; varying vec3 vPos; void main(){ vUv=uv; vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';

// split < 1.5: compare divider at x = split (left stars, right dust); otherwise a screen blend of both layers.
// cmpOn > 0.5 (VR): the divider is a plane through the viewer instead, with normal cmpN (in the sky's own frame).
const FRAGMENT_SHADER = `varying vec2 vUv;
varying vec3 vPos;
uniform sampler2D a, g;
uniform float split, mixA, mixG, cmpOn;
uniform vec3 cmpN;
uniform vec2 res;
void main(){
  vec3 s = texture2D(a, vUv).rgb, d = texture2D(g, vUv).rgb, c;
  if(cmpOn > 0.5){ c = dot(normalize(vPos), cmpN) < 0. ? s : d; }
  else if(split < 1.5){ c = gl_FragCoord.x / res.x < split ? s : d; }
  else { c = vec3(1.) - (vec3(1.) - clamp(s * mixA, 0., 1.)) * (vec3(1.) - clamp(d * mixG, 0., 1.)); }
  gl_FragColor = vec4(c, 1.);
}`;

/**
 * Builds the renderer and scene on `canvas`. Throws when WebGL is unavailable.
 * `onTexturesLoaded` runs once both sky layers are in (the intro waits for it).
 */
export function createSky(canvas, onTexturesLoaded) {
  const ren = new THREE.WebGLRenderer({ canvas, antialias: true });
  ren.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

  let loaded = 0;
  const texture = (url) => {
    const t = new THREE.TextureLoader().load(url, () => {
      if (++loaded === 2) onTexturesLoaded();
    });
    t.anisotropy = ren.capabilities.getMaxAnisotropy();
    return t;
  };

  // a = stars & galaxies, g = dust & gas; mixA / mixG = layer brightness; res = drawing buffer size
  const uniforms = {
    a: { value: texture(SKY_STARS) },
    g: { value: texture(SKY_DUST) },
    mixA: { value: 0.4 },
    mixG: { value: 1.2 },
    split: { value: 2 },
    cmpOn: { value: 0 },
    cmpN: { value: new THREE.Vector3(1, 0, 0) },
    res: { value: new THREE.Vector2(1, 1) },
  };

  const world = new THREE.Group();
  scene.add(world);
  const sphere = new THREE.SphereGeometry(500, 64, 40);
  sphere.scale(-1, 1, 1);
  world.add(new THREE.Mesh(sphere, new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER })));

  const grid = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.35 });
  const line = (pts) => grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  for (let l = 0; l < 360; l += 30) {
    const pts = [];
    for (let b = -90; b <= 90; b += 5) pts.push(dir(l, b, 480));
    line(pts);
  }
  for (let b = -60; b <= 60; b += 30) {
    const pts = [];
    for (let l = 0; l <= 360; l += 5) pts.push(dir(l, b, 480));
    line(pts);
  }
  grid.visible = false;
  world.add(grid);

  return { ren, scene, cam, world, grid, uniforms };
}
