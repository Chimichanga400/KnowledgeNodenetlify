// ── Three.js rendering: views, models, effects ──────────────────
import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { PLANET_TYPES, ROOM_TYPES, SHIP_CLASSES, makeRng } from './data.js';
import { state, atStation, aboardCrew } from './state.js';

let renderer, scene, camera, controls;
let starfield, nebulae = [];
let viewGroup = null;           // contents of the current view
let shipGroup = null;           // the player's ark (reused across views)
let shipClassId = 'horizon';
let viewName = 'none';          // galaxy | system | combat | interior | showcase
let showcaseShip = null;
const interiorFigs = new Map(); // crewId -> { grp }
let interiorLayout = null;      // { cls, roomPos: Map(roomKey -> Vector3) }
const effects = [];             // transient fx { obj, ttl, life, tick }
const enemies = new Map();      // id -> { group, orbit }
let clickHandler = null;
let camGoal = null;             // { pos, target } lerp goal
let elapsed = 0;

// ── Canvas textures ──
function glowTexture(hex, inner = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const col = new THREE.Color(hex);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(255,255,255,${inner})`);
  grad.addColorStop(0.25, `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.8)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function labelTexture(text, color = '#cfe8f5') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 26px "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 6;
  g.fillStyle = color;
  g.fillText(text, 128, 40);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function planetTexture(seed, type) {
  const rng = makeRng(seed);
  const def = PLANET_TYPES[type];
  const base = new THREE.Color(def.color);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, 256, 128);
  // Noise blobs in lighter/darker shades of the base color
  for (let i = 0; i < 90; i++) {
    const shade = base.clone().offsetHSL((rng() - 0.5) * 0.06, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.22);
    g.fillStyle = `#${shade.getHexString()}`;
    g.globalAlpha = 0.25 + rng() * 0.4;
    const x = rng() * 256, y = rng() * 128, r = 4 + rng() * 22;
    g.beginPath(); g.ellipse(x, y, r * (1 + rng()), r * 0.6, rng() * Math.PI, 0, Math.PI * 2); g.fill();
    if (x < 40) { g.beginPath(); g.ellipse(x + 256, y, r, r * 0.6, 0, 0, Math.PI * 2); g.fill(); }
  }
  // Polar caps for cold / habitable worlds
  if (type === 'ice' || type === 'terran' || type === 'ocean') {
    g.globalAlpha = 0.85; g.fillStyle = '#eaf6fb';
    g.fillRect(0, 0, 256, 8 + rng() * 8);
    g.fillRect(0, 128 - (8 + rng() * 8), 256, 20);
  }
  // Gas giant bands
  if (type === 'gas') {
    for (let y = 0; y < 128; y += 6 + rng() * 10) {
      const shade = base.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.25);
      g.globalAlpha = 0.5; g.fillStyle = `#${shade.getHexString()}`;
      g.fillRect(0, y, 256, 4 + rng() * 8);
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── Init ──
export function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02060c);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);
  camera.position.set(0, 20, 42);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 260;

  scene.add(new THREE.AmbientLight(0x3a4b60, 0.9));
  scene.add(new THREE.HemisphereLight(0x9fc3e0, 0x1a2233, 1.2));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  sun.position.set(60, 40, 30);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6fa8ff, 0.8);
  fill.position.set(-40, -20, -50);
  scene.add(fill);

  buildStarfield();
  shipGroup = buildShip(shipClassId);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Click (ignore drags) → raycast into current view
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let downX = 0, downY = 0;
  canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
  canvas.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6 || !clickHandler || !viewGroup) return;
    ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.y = -(e.clientY / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(viewGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) { clickHandler(o.userData.pick); return; }
    }
  });
}

function buildStarfield() {
  const geo = new THREE.BufferGeometry();
  const N = 2600;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(900 + Math.random() * 800);
    pos.set([v.x, v.y, v.z], i * 3);
    const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.15, Math.random() * 0.5, 0.55 + Math.random() * 0.4);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  starfield = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: false, depthWrite: false }));
  scene.add(starfield);

  // Nebula backdrops
  [[0x1c3aff, -700, 200, -900, 900], [0x8a2be2, 800, -100, -700, 700], [0xff5566, -300, -350, 800, 600]].forEach(([hex, x, y, z, s]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(hex, 0.25), transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(s);
    scene.add(sp);
    nebulae.push(sp);
  });
}

// ── Player ships ──
function engineFlare(x, y, z, hex = 0x37e5ff, scale = 1.6) {
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(hex), transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flare.position.set(x, y, z);
  flare.scale.setScalar(scale);
  flare.name = 'engineflare';
  return flare;
}

function buildShip(classId) {
  const grp = {
    horizon: buildArk, nighthawk: buildCorvette, atlas: buildHauler, vanguard: buildCruiser,
  }[classId || 'horizon']();
  grp.userData.pick = { kind: 'ship' };
  return grp;
}

export function setShipClass(classId) {
  shipClassId = classId;
  const parent = shipGroup && shipGroup.parent;
  if (parent) parent.remove(shipGroup);
  shipGroup = buildShip(classId);
  if (parent) parent.add(shipGroup);
}

// The classic ring-habitat ark
function buildArk() {
  const grp = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xaebfd1, metalness: 0.4, roughness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x5d7089, metalness: 0.45, roughness: 0.55 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x37e5ff });

  // Main spine
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 8, 10), hullMat);
  spine.rotation.z = Math.PI / 2;
  grp.add(spine);
  // Bow
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.2, 10), hullMat);
  bow.rotation.z = -Math.PI / 2; bow.position.x = 5.1;
  grp.add(bow);
  // Habitat ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.42, 10, 36), darkMat);
  ring.rotation.y = Math.PI / 2; ring.position.x = 0.6;
  ring.name = 'habring';
  grp.add(ring);
  // Ring spokes (rotate with the ring around the ship's long axis)
  for (let i = 0; i < 2; i++) {
    const holder = new THREE.Group();
    holder.position.x = 0.6;
    holder.rotation.x = (i / 2) * Math.PI;
    holder.name = 'spoke';
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 6), darkMat);
    holder.add(sp);
    grp.add(holder);
  }
  // Command tower
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.7), hullMat);
  tower.position.set(2.6, 0.85, 0);
  grp.add(tower);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), glowMat);
  bridge.position.set(3.1, 1.1, 0);
  grp.add(bridge);
  // Engine block + nacelles
  const engBlock = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 2.6), darkMat);
  engBlock.position.x = -4.2;
  grp.add(engBlock);
  [-1, 1].forEach((side) => {
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.4, 8), hullMat);
    nac.rotation.z = Math.PI / 2;
    nac.position.set(-4.4, 0, side * 1.7);
    grp.add(nac);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.1, 0.7, 8), glowMat);
    exhaust.rotation.z = Math.PI / 2;
    exhaust.position.set(-5.7, 0, side * 1.7);
    grp.add(exhaust);
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(0x37e5ff), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    flare.position.set(-6.1, 0, side * 1.7);
    flare.scale.setScalar(1.6);
    flare.name = 'engineflare';
    grp.add(flare);
  });
  grp.userData.pick = { kind: 'ship' };
  return grp;
}

// Matte-black angular stealth corvette (twin railguns, swept wings)
function buildCorvette() {
  const grp = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x4a525e, metalness: 0.55, roughness: 0.4 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x343c48, metalness: 0.6, roughness: 0.48 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x37e5ff });
  const orange = new THREE.MeshBasicMaterial({ color: 0xff8c3a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.0, 2.6), black);
  grp.add(body);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 1.2), panel);
  spine.position.y = 0.7;
  grp.add(spine);
  // Flat diamond nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.35, 3.4, 4), black);
  nose.rotation.z = -Math.PI / 2;
  nose.rotation.x = Math.PI / 4;
  nose.scale.y = 1; nose.scale.z = 0.38;
  nose.position.set(4.7, 0, 0);
  grp.add(nose);
  // Cockpit slit
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.7), cyan);
  cockpit.position.set(2.4, 0.62, 0);
  grp.add(cockpit);
  // Swept wings with orange tip lights
  [-1, 1].forEach((s) => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 2.1), panel);
    wing.position.set(-1.6, 0, s * 2.1);
    wing.rotation.y = s * 0.55;
    grp.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.22), orange);
    tip.position.set(-2.7, 0, s * 3.15);
    grp.add(tip);
    // Forward railguns
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 6), panel);
    gun.rotation.z = Math.PI / 2;
    gun.position.set(3.4, -0.25, s * 1.05);
    grp.add(gun);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.4, 6), orange);
    muzzle.rotation.z = Math.PI / 2;
    muzzle.position.set(5.6, -0.25, s * 1.05);
    grp.add(muzzle);
    // Engines
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.16, 0.6, 8), cyan);
    exhaust.rotation.z = Math.PI / 2;
    exhaust.position.set(-3.4, 0, s * 0.75);
    grp.add(exhaust);
    grp.add(engineFlare(-3.9, 0, s * 0.75, 0x37e5ff, 1.3));
  });
  return grp;
}

// Long segmented industrial hauler with big glowing engine pods
function buildHauler() {
  const grp = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x7d8794, metalness: 0.5, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a5462, metalness: 0.55, roughness: 0.6 });
  const blue = new THREE.MeshBasicMaterial({ color: 0x4db8ff });
  const orange = new THREE.MeshBasicMaterial({ color: 0xff8c3a });

  // Central spine
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 11, 8), dark);
  spine.rotation.z = Math.PI / 2;
  grp.add(spine);
  // Cargo segments
  for (let i = 0; i < 4; i++) {
    const x = 2.8 - i * 2.4;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2, 2.8), frame);
    seg.position.x = x;
    grp.add(seg);
    // Greebles + accent lights
    const g1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), dark);
    g1.position.set(x + 0.5, 1.3, (i % 2 ? 0.7 : -0.7));
    grp.add(g1);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.3), i % 2 ? orange : blue);
    lamp.position.set(x, 0.3, 1.45);
    grp.add(lamp);
  }
  // Command head with glowing window strip
  const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 2.2), frame);
  head.position.x = 5.4;
  grp.add(head);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 1.7), blue);
  windows.position.set(6.5, 0.35, 0);
  grp.add(windows);
  // Antenna masts
  [4.9, 5.8].forEach((x, i) => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), dark);
    mast.position.set(x, 1.6, i ? 0.6 : -0.5);
    grp.add(mast);
  });
  // Rear engine block + three big pods with glowing discs
  const block = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 3.2), dark);
  block.position.x = -5.2;
  grp.add(block);
  [[-0.05, 1.25], [-0.05, -1.25], [1.15, 0]].forEach(([y, z]) => {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 2.4, 12), frame);
    pod.rotation.z = Math.PI / 2;
    pod.position.set(-5.6, y, z);
    grp.add(pod);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16), blue);
    disc.rotation.y = -Math.PI / 2;
    disc.position.set(-6.85, y, z);
    grp.add(disc);
    grp.add(engineFlare(-7.3, y, z, 0x4db8ff, 2.2));
  });
  return grp;
}

// Broad wedge assault cruiser with side turret pods
function buildCruiser() {
  const grp = new THREE.Group();
  const plate = new THREE.MeshStandardMaterial({ color: 0x8a94a4, metalness: 0.5, roughness: 0.48 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3f4a5c, metalness: 0.55, roughness: 0.55 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x37e5ff });

  const body = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.3, 4.4), plate);
  grp.add(body);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.6, 2.8), dark);
  deck.position.y = 0.9;
  grp.add(deck);
  // Wedge bow
  const bow = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.6, 4), plate);
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.x = Math.PI / 4;
  bow.scale.z = 0.32;
  bow.position.set(5.3, 0, 0);
  grp.add(bow);
  // Bridge tower
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.1), plate);
  tower.position.set(0.4, 1.7, 0);
  grp.add(tower);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.9), cyan);
  bridge.position.set(1.0, 1.85, 0);
  grp.add(bridge);
  // Side turret pods with twin barrels
  [-1, 1].forEach((s) => {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 10), dark);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(1.6, 0.4, s * 2.6);
    grp.add(pod);
    [0.18, -0.18].forEach((dy) => {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), plate);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(2.9, 0.4 + dy, s * 2.6);
      grp.add(barrel);
    });
    // Engines
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.2, 0.7, 8), cyan);
    exhaust.rotation.z = Math.PI / 2;
    exhaust.position.set(-3.9, 0, s * 1.3);
    grp.add(exhaust);
    grp.add(engineFlare(-4.4, 0, s * 1.3, 0x37e5ff, 1.7));
  });
  grp.add(engineFlare(-4.4, 0.6, 0, 0x37e5ff, 1.4));
  const centerExhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.18, 0.7, 8), cyan);
  centerExhaust.rotation.z = Math.PI / 2;
  centerExhaust.position.set(-3.9, 0.6, 0);
  grp.add(centerExhaust);
  return grp;
}

// ── View management ──
function clearView() {
  if (viewGroup) {
    viewGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    scene.remove(viewGroup);
  }
  viewGroup = new THREE.Group();
  scene.add(viewGroup);
  enemies.clear();
  interiorFigs.clear();
  interiorLayout = null;
  showcaseShip = null;
  effects.forEach((e) => scene.remove(e.obj));
  effects.length = 0;
  if (shipGroup.parent) shipGroup.parent.remove(shipGroup);
}

function goCamera(pos, target, maxDist = 260) {
  camGoal = { pos: pos.clone(), target: target.clone() };
  controls.maxDistance = maxDist;
}

export function setClickHandler(fn) { clickHandler = fn; }

// Galaxy map: star sprites + labels
export function showGalaxy(systems, currentId, reachableFuel) {
  clearView();
  viewName = 'galaxy';
  systems.forEach((s) => {
    const star = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(s.starColor), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    star.position.set(s.x, s.y, s.z);
    star.scale.setScalar(s.id === currentId ? 7 : 5);
    star.userData.pick = { kind: 'star', id: s.id };
    viewGroup.add(star);

    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture(s.name, s.visited ? '#cfe8f5' : '#6d8496'),
      transparent: true, depthWrite: false,
    }));
    label.position.set(s.x, s.y - 3.4, s.z);
    label.scale.set(13, 3.2, 1);
    viewGroup.add(label);

    if (s.id === currentId) {
      const ringGeo = new THREE.RingGeometry(3.4, 3.7, 40);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0x37e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, s.y, s.z);
      ring.name = 'homering';
      viewGroup.add(ring);
    }
    // Danger tint halo for hostile regions
    if (s.danger >= 2 && !s.cleared) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(0xff5566, 0.15), transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.position.set(s.x, s.y, s.z);
      halo.scale.setScalar(11);
      viewGroup.add(halo);
    }
  });
  const cur = systems[currentId];
  goCamera(
    new THREE.Vector3(cur.x, cur.y + 62, cur.z + 66),
    new THREE.Vector3(cur.x, cur.y, cur.z),
    400,
  );
}

// System view: star + orbiting planets + the ark
const sysPlanets = [];
export function showSystem(sys, selectedIndex) {
  clearView();
  viewName = 'system';
  sysPlanets.length = 0;

  const star = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 24, 24),
    new THREE.MeshBasicMaterial({ color: sys.starColor }),
  );
  viewGroup.add(star);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(sys.starColor), transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  corona.scale.setScalar(16);
  viewGroup.add(corona);

  sys.planets.forEach((p, i) => {
    const orbitR = 10 + i * 7.5;
    const holder = new THREE.Group();
    holder.rotation.y = (p.seed % 628) / 100;
    const size = p.size * (p.type === 'gas' ? 1.9 : 1.15);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 26, 26),
      new THREE.MeshStandardMaterial({ map: planetTexture(p.seed, p.type), roughness: 0.9, metalness: 0 }),
    );
    mesh.position.x = orbitR;
    mesh.userData.pick = { kind: 'planet', index: i };
    holder.add(mesh);
    // Atmosphere glow for worlds with air
    if (p.habitability > 25 || p.type === 'gas') {
      const atm = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(PLANET_TYPES[p.type].color, 0.2), transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      atm.scale.setScalar(size * 3.4);
      atm.position.x = orbitR;
      holder.add(atm);
    }
    // Ring for gas giants
    if (p.type === 'gas' && p.seed % 2 === 0) {
      const rg = new THREE.Mesh(
        new THREE.RingGeometry(size * 1.35, size * 2.1, 40),
        new THREE.MeshBasicMaterial({ color: 0xbfae8f, side: THREE.DoubleSide, transparent: true, opacity: 0.4 }),
      );
      rg.rotation.x = Math.PI / 2.4;
      rg.position.x = orbitR;
      holder.add(rg);
    }
    // Orbit line
    const line = new THREE.Mesh(
      new THREE.RingGeometry(orbitR - 0.04, orbitR + 0.04, 90),
      new THREE.MeshBasicMaterial({ color: 0x37e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.12 }),
    );
    line.rotation.x = -Math.PI / 2;
    viewGroup.add(line);
    // Outpost beacon
    if (p.outpost) {
      const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(0x5dff9d), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      beacon.scale.setScalar(1.6);
      beacon.position.set(orbitR, size + 1.1, 0);
      beacon.name = 'beacon';
      holder.add(beacon);
    }
    viewGroup.add(holder);
    sysPlanets.push({ holder, mesh, speed: 0.05 / (1 + i * 0.7), index: i });
  });

  focusPlanet(selectedIndex);
}

export function focusPlanet(index) {
  shipGroup.parent && shipGroup.parent.remove(shipGroup);
  viewGroup.add(shipGroup);
  shipGroup.scale.setScalar(0.55);
  const entry = sysPlanets[index];
  if (!entry) {
    shipGroup.position.set(0, 3, 18);
    goCamera(new THREE.Vector3(0, 16, 40), new THREE.Vector3(0, 0, 0));
    return;
  }
  const wp = new THREE.Vector3();
  entry.mesh.getWorldPosition(wp);
  const size = entry.mesh.geometry.parameters.radius;
  shipGroup.position.copy(wp).add(new THREE.Vector3(size + 4, size * 0.6 + 1, size + 3));
  shipGroup.rotation.y = -0.6;
  goCamera(
    wp.clone().add(new THREE.Vector3(size * 2 + 8, size + 4, size * 2 + 9)),
    wp.clone(),
  );
  // Freeze orbits while inspecting so the camera target stays put
  sysPlanets.forEach((sp) => { sp.frozen = true; });
}

// Combat arena: ark centre, enemies swarm around
export function showCombat() {
  clearView();
  viewName = 'combat';
  viewGroup.add(shipGroup);
  shipGroup.position.set(0, 0, 0);
  shipGroup.rotation.set(0, 0, 0);
  shipGroup.scale.setScalar(1);
  goCamera(new THREE.Vector3(10, 9, 20), new THREE.Vector3(0, 0, 0), 80);
}

// ── Ship-selection showcase: one rotating ship, front and centre ──
export function showShowcase(classId) {
  clearView();
  viewName = 'showcase';
  showcaseShip = buildShip(classId);
  showcaseShip.position.set(0, 0, 0);
  viewGroup.add(showcaseShip);
  goCamera(new THREE.Vector3(3, 4.5, 15), new THREE.Vector3(0, 0, 0), 60);
}

// ── Interior deck plan ──
const ROOM_SIZE = 6, ROOM_GAP = 0.8;

function slotPosition(cls, slot) {
  const col = slot % cls.cols, row = Math.floor(slot / cls.cols);
  return new THREE.Vector3(
    -(col - (cls.cols - 1) / 2) * (ROOM_SIZE + ROOM_GAP),
    0,
    (row - (cls.rows - 1) / 2) * (ROOM_SIZE + ROOM_GAP),
  );
}

function roomTile(pos, hex, label, pickData, solid = true) {
  const tile = new THREE.Group();
  tile.position.copy(pos);
  const col = new THREE.Color(hex);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_SIZE - 0.5, 0.3, ROOM_SIZE - 0.5),
    solid
      ? new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.35), metalness: 0.3, roughness: 0.7 })
      : new THREE.MeshStandardMaterial({ color: 0x22303f, transparent: true, opacity: 0.35, metalness: 0.2, roughness: 0.8 }),
  );
  floor.userData.pick = pickData;
  tile.add(floor);
  // Low walls
  if (solid) {
    const wallMat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.8), metalness: 0.4, roughness: 0.5 });
    const L = ROOM_SIZE - 0.5;
    [[0, -L / 2], [0, L / 2]].forEach(([x, z]) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(L, 0.9, 0.18), wallMat);
      w.position.set(x, 0.55, z);
      w.userData.pick = pickData;
      tile.add(w);
    });
    [[-L / 2, 0], [L / 2, 0]].forEach(([x, z]) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, L), wallMat);
      w.position.set(x, 0.55, z);
      w.userData.pick = pickData;
      tile.add(w);
    });
  } else {
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(ROOM_SIZE - 0.5, 0.32, ROOM_SIZE - 0.5)),
      new THREE.LineBasicMaterial({ color: 0x37e5ff, transparent: true, opacity: 0.35 }),
    );
    tile.add(edge);
  }
  const lbl = new THREE.Sprite(new THREE.SpriteMaterial({
    map: labelTexture(label, solid ? '#cfe8f5' : '#59788e'), transparent: true, depthWrite: false,
  }));
  lbl.position.y = 2.3;
  lbl.scale.set(9, 2.25, 1);
  tile.add(lbl);
  return tile;
}

export function showInterior() {
  clearView();
  viewName = 'interior';
  const cls = SHIP_CLASSES[state.ship.classId];
  interiorLayout = { cls, roomPos: new Map() };

  const width = cls.cols * (ROOM_SIZE + ROOM_GAP) + ROOM_SIZE * 2 + 10;
  const depth = Math.max(cls.rows * (ROOM_SIZE + ROOM_GAP) + 5, ROOM_SIZE + 5);
  // Hull deck plate
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.6, depth),
    new THREE.MeshStandardMaterial({ color: 0x131c28, metalness: 0.4, roughness: 0.75 }),
  );
  deck.position.y = -0.45;
  viewGroup.add(deck);
  // Tapered bow / stern hints
  const bowHint = new THREE.Mesh(new THREE.ConeGeometry(depth / 2.6, 6, 4),
    new THREE.MeshStandardMaterial({ color: 0x0e1520, metalness: 0.4, roughness: 0.8 }));
  bowHint.rotation.z = -Math.PI / 2;
  bowHint.rotation.x = Math.PI / 4;
  bowHint.scale.y = 0.15;
  bowHint.position.set(width / 2 + 2.4, -0.45, 0);
  viewGroup.add(bowHint);

  const gridHalf = (cls.cols - 1) / 2 * (ROOM_SIZE + ROOM_GAP);
  const bridgePos = new THREE.Vector3(gridHalf + ROOM_SIZE + 1.5, 0, 0);
  const enginePos = new THREE.Vector3(-(gridHalf + ROOM_SIZE + 1.5), 0, 0);

  // Fixed rooms
  const bridgeDef = ROOM_TYPES.bridge;
  viewGroup.add(roomTile(bridgePos, bridgeDef.color, `${bridgeDef.icon} Bridge`, { kind: 'room', id: 'bridge' }));
  interiorLayout.roomPos.set('bridge', bridgePos);
  const engDef = ROOM_TYPES.engine;
  viewGroup.add(roomTile(enginePos, engDef.color, `${engDef.icon} Engine Room`, { kind: 'room', id: 'engine' }));
  interiorLayout.roomPos.set('engine', enginePos);

  // Built rooms + empty slots
  const usedSlots = new Set(state.ship.rooms.map((r) => r.slot));
  state.ship.rooms.forEach((r) => {
    const def = ROOM_TYPES[r.type];
    const pos = slotPosition(cls, r.slot);
    viewGroup.add(roomTile(pos, def.color, `${def.icon} ${def.label}`, { kind: 'room', id: r.id }));
    interiorLayout.roomPos.set(r.id, pos);
  });
  for (let s = 0; s < cls.cols * cls.rows; s++) {
    if (usedSlots.has(s)) continue;
    viewGroup.add(roomTile(slotPosition(cls, s), 0x2a3a4c, '+ build', { kind: 'slot', slot: s }, false));
  }

  // Alarm glows over rooms tied to damaged systems (opacity driven per-frame)
  const alarmSpots = { engines: enginePos };
  const firstOf = (type) => state.ship.rooms.find((r) => r.type === type);
  const gun = firstOf('gunnery'); if (gun) alarmSpots.weapons = interiorLayout.roomPos.get(gun.id);
  const cap = firstOf('shieldcap'); alarmSpots.shields = cap ? interiorLayout.roomPos.get(cap.id) : bridgePos;
  const med = firstOf('medbay'); alarmSpots.life = med ? interiorLayout.roomPos.get(med.id) : bridgePos;
  Object.entries(alarmSpots).forEach(([sys, pos]) => {
    if (!pos) return;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(0xff3344, 0.4), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.position.set(pos.x, 1.6, pos.z);
    glow.scale.setScalar(7);
    glow.name = 'alarm:' + sys;
    viewGroup.add(glow);
  });

  const camDist = Math.max(width * 0.8, 30);
  goCamera(new THREE.Vector3(0, camDist, camDist * 0.5), new THREE.Vector3(0, 0, 0), camDist * 2.2);
  syncFigures();
}

const ROLE_COLORS = {
  Pilot: 0x37e5ff, Engineer: 0xffb84d, Soldier: 0xff5566,
  Scientist: 0x6b9fff, Botanist: 0x5dff9d, Medic: 0xf0f4f8,
};

function buildFigure(crew) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 0.6, 3, 8),
    new THREE.MeshStandardMaterial({ color: ROLE_COLORS[crew.role] || 0xcccccc, metalness: 0.2, roughness: 0.6 }),
  );
  body.position.y = 0.75;
  grp.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8cdb0, roughness: 0.8 }),
  );
  head.position.y = 1.45;
  grp.add(head);
  grp.traverse((o) => { o.userData.pick = { kind: 'crewfig', id: crew.id }; });
  return grp;
}

// Where should this crew member stand? (roomKey + slot index within room)
function figureTarget(c, idx) {
  const L = interiorLayout;
  const rooms = (type) => state.ship.rooms.filter((r) => r.type === type);
  let pos = null;
  const inRooms = (type) => {
    const rs = rooms(type);
    if (!rs.length) return null;
    const room = rs[Math.min(Math.floor(idx / 2), rs.length - 1)];
    return L.roomPos.get(room.id);
  };
  const st = c.station;
  if (st === 'helm') pos = L.roomPos.get('bridge');
  else if (st === 'gunnery') pos = inRooms('gunnery');
  else if (st === 'medbay') pos = inRooms('medbay');
  else if (st === 'hydro') pos = inRooms('hydro');
  else if (st === 'repair:engines') pos = L.roomPos.get('engine');
  else if (st === 'repair:weapons') pos = inRooms('gunnery') || L.roomPos.get('engine');
  else if (st === 'repair:shields') pos = inRooms('shieldcap') || L.roomPos.get('engine');
  else if (st === 'repair:life') pos = inRooms('medbay') || L.roomPos.get('engine');
  else pos = inRooms('quarters'); // idle
  if (pos) {
    const dx = (idx % 2 ? 1.15 : -1.15);
    const dz = (Math.floor(idx / 2) % 2 ? 1.1 : -1.1);
    return new THREE.Vector3(pos.x + dx, 0, pos.z + dz);
  }
  // No room: loiter in the central corridor
  return new THREE.Vector3(-4 + idx * 2.1, 0, 0);
}

function syncFigures() {
  if (viewName !== 'interior' || !interiorLayout) return;
  const aboard = aboardCrew();
  // Remove figures for crew no longer aboard
  for (const [id, fig] of interiorFigs) {
    if (!aboard.some((c) => c.id === id)) {
      viewGroup.remove(fig.grp);
      interiorFigs.delete(id);
    }
  }
  // Group by station to compute per-station indices
  const byStation = {};
  aboard.forEach((c) => { (byStation[c.station] ||= []).push(c); });
  Object.values(byStation).forEach((list) => {
    list.forEach((c, idx) => {
      let fig = interiorFigs.get(c.id);
      if (!fig) {
        fig = { grp: buildFigure(c), target: null };
        fig.grp.position.copy(interiorLayout.roomPos.get('bridge')).setY(0);
        interiorFigs.set(c.id, fig);
        viewGroup.add(fig.grp);
      }
      fig.target = figureTarget(c, idx);
      fig.bob = c.id * 1.7;
    });
  });
}
export const refreshInterior = () => { if (viewName === 'interior') showInterior(); };
export const isInterior = () => viewName === 'interior';

function buildAlien() {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b3a47, metalness: 0.5, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.8, 5), mat);
  body.rotation.x = Math.PI / 2;
  grp.add(body);
  [-1, 1].forEach((s) => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.5), mat);
    wing.position.set(s * 0.75, 0, 0.25);
    wing.rotation.z = s * 0.35;
    grp.add(wing);
  });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5566 }));
  eye.position.z = 0.75;
  grp.add(eye);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(0xff5566), transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(1.5);
  glow.position.z = -0.8;
  grp.add(glow);
  return grp;
}

export function addEnemy(id) {
  const grp = buildAlien();
  grp.userData.pick = { kind: 'enemy', id };
  const orbit = {
    r: 9 + Math.random() * 6,
    h: (Math.random() - 0.5) * 7,
    a: Math.random() * Math.PI * 2,
    speed: (0.25 + Math.random() * 0.35) * (Math.random() < 0.5 ? 1 : -1),
    bob: Math.random() * Math.PI * 2,
  };
  enemies.set(id, { group: grp, orbit });
  viewGroup.add(grp);
  return grp;
}

export function enemyPosition(id) {
  const e = enemies.get(id);
  return e ? e.group.position.clone() : new THREE.Vector3();
}

export function removeEnemy(id) {
  const e = enemies.get(id);
  if (!e) return;
  explosion(e.group.position.clone(), 1.6);
  viewGroup.remove(e.group);
  enemies.delete(id);
}

export function markTarget(id) {
  enemies.forEach((e, eid) => {
    const old = e.group.getObjectByName('targetring');
    if (old) e.group.remove(old);
    if (eid === id) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.1, 1.25, 30),
        new THREE.MeshBasicMaterial({ color: 0xff5566, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
      );
      ring.name = 'targetring';
      e.group.add(ring);
    }
  });
}

// ── Effects ──
export function laser(from, to, hex = 0x37e5ff) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(0.05, 0.05, len, 5);
  const mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(geo, mat);
  beam.position.copy(from).add(dir.multiplyScalar(0.5));
  beam.lookAt(to);
  beam.rotateX(Math.PI / 2);
  scene.add(beam);
  effects.push({ obj: beam, ttl: 0.14, life: 0.14, tick: (fx, k) => { fx.obj.material.opacity = k; } });
  // impact spark
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(hex), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  spark.position.copy(to);
  spark.scale.setScalar(1.4);
  scene.add(spark);
  effects.push({ obj: spark, ttl: 0.22, life: 0.22, tick: (fx, k) => { fx.obj.material.opacity = k; fx.obj.scale.setScalar(1.4 + (1 - k) * 1.2); } });
}

export function explosion(pos, scale = 1) {
  const N = 26;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(N * 3);
  const vel = [];
  for (let i = 0; i < N; i++) {
    p.set([pos.x, pos.y, pos.z], i * 3);
    vel.push(new THREE.Vector3().randomDirection().multiplyScalar(3 + Math.random() * 6));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffb060, size: 0.24 * scale, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(pts);
  effects.push({
    obj: pts, ttl: 0.8, life: 0.8,
    tick: (fx, k, dt) => {
      const arr = fx.obj.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        arr.setXYZ(i, arr.getX(i) + vel[i].x * dt, arr.getY(i) + vel[i].y * dt, arr.getZ(i) + vel[i].z * dt);
      }
      arr.needsUpdate = true;
      fx.obj.material.opacity = k;
    },
  });
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(0xffcf7a), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.copy(pos);
  flash.scale.setScalar(0.5);
  scene.add(flash);
  effects.push({ obj: flash, ttl: 0.3, life: 0.3, tick: (fx, k) => { fx.obj.material.opacity = k; fx.obj.scale.setScalar(0.5 + (1 - k) * 5 * scale); } });
}

export function shieldFlash() {
  const s = new THREE.Mesh(
    new THREE.SphereGeometry(7.2, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x37e5ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  s.scale.set(1.25, 0.75, 0.75);
  shipGroup.getWorldPosition(s.position);
  scene.add(s);
  effects.push({ obj: s, ttl: 0.3, life: 0.3, tick: (fx, k) => { fx.obj.material.opacity = 0.35 * k; } });
}

export function hullSpark() {
  const p = shipGroup.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3));
  explosion(p, 0.6);
}

export function shipWorldPos() {
  return shipGroup.getWorldPosition(new THREE.Vector3());
}

// ── Frame update ──
export function update(dt) {
  elapsed += dt;
  // Rotate habitat ring & spokes
  const ring = shipGroup.getObjectByName('habring');
  if (ring) ring.rotation.z += dt * 0.4;
  shipGroup.children.forEach((c) => { if (c.name === 'spoke') c.rotation.x += dt * 0.4; });
  shipGroup.children.forEach((c) => {
    if (c.name === 'engineflare') c.material.opacity = 0.65 + Math.sin(elapsed * 9 + c.position.z) * 0.25;
  });
  // Planet spin (& orbit if unfrozen)
  sysPlanets.forEach((sp) => {
    sp.mesh.rotation.y += dt * 0.15;
    if (!sp.frozen) sp.holder.rotation.y += dt * sp.speed;
  });
  // Showcase ship slowly rotates
  if (viewName === 'showcase' && showcaseShip) showcaseShip.rotation.y += dt * 0.4;
  // Interior: crew figures walk to their stations, alarms flicker
  if (viewName === 'interior' && state) {
    syncFigures();
    interiorFigs.forEach((fig) => {
      if (fig.target) fig.grp.position.lerp(fig.target, Math.min(1, dt * 2.4));
      fig.grp.position.y = Math.sin(elapsed * 2.2 + fig.bob) * 0.05;
    });
    ['engines', 'weapons', 'shields', 'life'].forEach((sys) => {
      const glow = viewGroup.getObjectByName('alarm:' + sys);
      if (!glow) return;
      const hp = state.systems[sys].hp;
      glow.material.opacity = hp < 50 ? (0.3 + Math.sin(elapsed * 6) * 0.25) * (1 - hp / 60) : 0;
    });
  }
  // Enemies orbit the ark
  enemies.forEach((e) => {
    const o = e.orbit;
    o.a += o.speed * dt;
    const target = new THREE.Vector3(Math.cos(o.a) * o.r, o.h + Math.sin(elapsed * 1.4 + o.bob) * 1.2, Math.sin(o.a) * o.r);
    e.group.position.lerp(target, 0.06);
    e.group.lookAt(shipWorldPos());
  });
  // Effects
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.ttl -= dt;
    if (fx.ttl <= 0) {
      scene.remove(fx.obj);
      if (fx.obj.geometry) fx.obj.geometry.dispose();
      if (fx.obj.material) fx.obj.material.dispose();
      effects.splice(i, 1);
    } else {
      fx.tick(fx, fx.ttl / fx.life, dt);
    }
  }
  // Pulse current-system ring on the map
  const hr = viewGroup && viewGroup.getObjectByName('homering');
  if (hr) { const k = 1 + Math.sin(elapsed * 3) * 0.12; hr.scale.set(k, k, 1); }
  const bc = viewGroup && viewGroup.getObjectByName('beacon');
  if (bc) bc.material.opacity = 0.6 + Math.sin(elapsed * 4) * 0.4;

  // Camera easing
  if (camGoal) {
    camera.position.lerp(camGoal.pos, 0.05);
    controls.target.lerp(camGoal.target, 0.08);
    if (camera.position.distanceTo(camGoal.pos) < 0.4) camGoal = null;
  }
  controls.update();
  renderer.render(scene, camera);
}
