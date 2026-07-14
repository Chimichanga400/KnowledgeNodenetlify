// ── Post-processing pipeline & quality management ────────────────
//
// HDR pipeline: scene renders into a linear half-float buffer (with MSAA on
// WebGL2), UnrealBloom blooms anything brighter than the threshold (engine
// flares, lasers, suns), then OutputPass applies ACES filmic tone mapping and
// the sRGB transform in one final pass.
//
// AA choice: we use MSAA *inside* the composer's render target (WebGL2
// `samples`) rather than an SMAA/FXAA pass — it's higher quality on geometry
// edges, costs no extra full-screen pass, and needs no lookup textures.
// On mobile we drop to 2× samples and a lower pixel ratio.
import * as THREE from 'three';
import { EffectComposer } from '../lib/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/postprocessing/OutputPass.js';

export const quality = (() => {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
    || window.matchMedia('(pointer: coarse)').matches;
  return {
    mobile,
    pixelRatio: Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2),
    msaaSamples: mobile ? 2 : 4,
    shadowMapSize: mobile ? 1024 : 2048,
    bloomStrength: mobile ? 0.5 : 0.6,
    asteroidCount: mobile ? 200 : 420,
  };
})();

let composer = null;
let renderer = null;

export function initPostFX(r, scene, camera) {
  renderer = r;
  const w = window.innerWidth, h = window.innerHeight;
  const target = new THREE.WebGLRenderTarget(
    Math.round(w * quality.pixelRatio), Math.round(h * quality.pixelRatio), {
      type: THREE.HalfFloatType,
      samples: renderer.capabilities.isWebGL2 ? quality.msaaSamples : 0,
    });
  composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(quality.pixelRatio);
  composer.setSize(w, h);

  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), quality.bloomStrength, 0.5, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return composer;
}

export function resizePostFX(w, h) {
  if (composer) composer.setSize(w, h);
}

export function renderPostFX() {
  composer.render();
}

// ── Adaptive quality ──
// If the frame rate stays under ~34 fps for a few seconds, drop the pixel
// ratio once. Cheap insurance for low-end devices; never fires on capable GPUs.
let slowTime = 0;
let adapted = false;
export function adaptQuality(dt) {
  if (adapted || !composer) return;
  slowTime = dt > 0.029 ? slowTime + dt : Math.max(0, slowTime - dt * 2);
  if (slowTime > 3) {
    adapted = true;
    const pr = Math.max(1, quality.pixelRatio - 0.5);
    renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr);
    composer.setSize(window.innerWidth, window.innerHeight);
    console.info('[ArkHorizon] Lowered render resolution to keep the frame rate smooth.');
  }
}
