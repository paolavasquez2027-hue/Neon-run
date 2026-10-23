'use strict';

/* ============================================================
   ANIMAL KART 3D · script.js
   Carrera de carritos en3 carriles-línea con4 animales.
   El jugador elige un animal; los3 rivales son IA.
   Controles:  ← → / A D  cambiar de carril
               ESPACIO    saltar + impulsar (boost)
   Objetivo: llegar primero a la meta esquivando rocas,
   bambúes y manchas de aceite.
============================================================ */

import * as THREE from 'three';

window.__panda3dReady = true;

/* ================= Constantes ================= */

const STAGE_W = 960, STAGE_H = 540;

const LANES_X = [-3.6, -1.2, 1.2, 3.6];   //4 carriles
const FINISH_DIST = 700;                   // longitud de la pista (unidades)

const CAMERA_BACK = 7.8, CAMERA_Y = 4.3, LOOK_AHEAD = 9;

const PLAYER_CRUISE = 16;     // velocidad base del jugador (sin tocar teclas)
const MAX_SPEED = 22;         // con ↑ acelerando
const BRAKE_SPEED = 6;        // con ↓ frenando
const BOOST_SPEED = 21.5, BOOST_TIME = 0.65, BOOST_COOLDOWN = 1.0;  // impulsos de la IA
const SLOW_SPEED = 4, SLOW_TIME = 1.2;   // choque: frenada fuerte temporal
const AI_MIN = 15.2, AI_MAX = 18.2;

const GRAVITY = 40, JUMP_V = 12;          // altura máx. salto ≈ 1.8
const SPAWN_AHEAD = 150;                   // distancia a la que se generan obstáculos

const HALF_W = 0.5, HALF_D = 0.7;          // semitamaños del carrito
const COIN_Y = 0.85;                        // altura a la que flotan las monedas
const COIN_COLLECT_W = 0.98, COIN_COLLECT_D = 1.05;  // alcance de recogida
const COIN_SCORE = 5;                       // puntos por moneda

const SCENERY_SPAN = 360, CLOUD_SPAN = 320, HILL_SPAN = 420, DASH_SPAN = 120;

/* ================= Utilidades ================= */

const $ = id => document.getElementById(id);
const rnd  = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function load(key, fallback){
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
  catch(_){ return fallback; }
}
function save(key, value){
  try { localStorage.setItem(key, String(value)); } catch(_){}
}

/* ================= Audio (WebAudio) ================= */

let muted = load('kart.muted', '0') === '1';

const audio = {
  ctx: null,
  unlock(){
    if (!this.ctx){
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(_){ this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  tone(f1, f2, dur, type, vol){
    if (muted || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(f1, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
      gain.gain.setValueAtTime(vol || 0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    } catch(_){}
  },
  beep(f){ this.tone(f, f, 0.16, 'square', 0.09); },
  go(){ this.tone(660, 1320, 0.4, 'square', 0.1); },
  jump(){ this.tone(360, 720, 0.14, 'square', 0.06); },
  boost(){ this.tone(300, 900, 0.3, 'sawtooth', 0.07); },
  lane(){ this.tone(500, 640, 0.06, 'sine', 0.04); },
  crash(){ this.tone(220, 50, 0.4, 'sawtooth', 0.12); },
  coin(){ this.tone(880, 1760, 0.1, 'square', 0.06); },
  click(){ this.tone(560, 900, 0.08, 'square', 0.05); },
  finish(){ [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone(f, f, 0.22, 'triangle', 0.11), i * 150)); },
  lose(){ [440, 392, 330].forEach((f, i) =>
      setTimeout(() => this.tone(f, f, 0.25, 'triangle', 0.09), i * 180)); }
};

/* ================= Elementos de interfaz ================= */

const stage = $('stage');
const sceneWrap = $('sceneWrap');
const hud = $('hud');
const raceProgress = $('raceProgress');
const rankBadge = $('rankBadge');
const timeValue = $('timeValue');
const speedPill = $('speedPill');
const speedValue = $('speedValue');
const coinPill = $('coinPill');
const coinValue = $('coinValue');
const rpFill = $('rpFill');
const rpMarks = $('rpMarks');
const rpYou = $('rpYou');
const hint = $('hint');
const flash = $('flash');
const confettiBox = $('confetti');
const soundBtn = $('soundBtn');
const countdown = $('countdown');
const countNum = $('countNum');
const menuScreen = $('menuScreen');
const winScreen = $('winScreen');
const resultScreen = $('resultScreen');
const charGrid = $('charGrid');
const playBtn = $('playBtn');
const startRecord = $('startRecord');
const loadError = $('loadError');

const winTime = $('winTime');
const winCoins = $('winCoins');
const winChar = $('winChar');
const resultPlace = $('resultPlace');
const resultTime = $('resultTime');
const resultCoins = $('resultCoins');
const resultChar = $('resultChar');
const resultEmoji = $('resultEmoji');
const resultTitle = $('resultTitle');
const resultText = $('resultText');

/* ================= Personajes ================= */

const CHAR_META = {
  panda:  { name:'Panda',   emoji:'🐼', body:0xfaf7f0, accent:0x2b2b31, kart:0xff5d8f, kartDark:0xbf3a66 },
  turtle: { name:'Tortuga', emoji:'🐢', body:0x54b04a, accent:0x2f7a3a, kart:0x22b8c8, kartDark:0x127a86 },
  lion:   { name:'León',    emoji:'🦁', body:0xe8b45a, accent:0xb9701f, kart:0x8b5cff, kartDark:0x5a32c0 },
  fox:    { name:'Zorro',   emoji:'🦊', body:0xe8702a, accent:0xfff4ea, kart:0xffd63d, kartDark:0xc79a1a }
};
const CHAR_IDS = ['panda', 'turtle', 'lion', 'fox'];

let selectedChar = null;

/* ================= Estado ================= */

let mode = 'menu';              // menu | countdown | playing | finished
let raceTime = 0, countT = 0, countStep = -1;
let racers = [];
let player = null;
let obstacles = [];
let coins = [];
let coinCount = 0, coinScore = 0;
let nextSpawnDist = 40;
let keyUp = false, keyDown = false;   // ↑ acelerar · ↓ frenar
let bestTime = Number(load('kart.bestTime', 0)) || 0;
let bestRank = Number(load('kart.bestRank', 0)) || 0;
let camShake = 0, camX = 0;
let hintShown = false;

/* ================= Escena3D ================= */

let renderer = null, scene = null, camera = null;

try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(STAGE_W, STAGE_H);
  sceneWrap.appendChild(renderer.domElement);
} catch(_){ renderer = null; }

if (renderer){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffe4c0);
  scene.fog = new THREE.Fog(0xffe4c0, 55, 150);

  camera = new THREE.PerspectiveCamera(60, STAGE_W / STAGE_H, 0.1, 400);
  camera.position.set(0, 5, 12);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8b48a, 1.0));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
  sun.position.set(6, 14, 8);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xcfe8ff, 0.45);
  fill.position.set(-6, 9, -6);
  scene.add(fill);
}

/* ---------- Materiales / geometrías compartidas ---------- */

const _matCache = new Map();
function mat(color, opts){
  const key = color + '|' + (opts ? JSON.stringify(opts) : '');
  if (_matCache.has(key)) return _matCache.get(key);
  const m = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  _matCache.set(key, m);
  return m;
}
function basic(color){ return mat(color, {}); }
function glow(color, emissive){ return new THREE.MeshLambertMaterial({ color, emissive }); }

const GEO = {
  wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14),
  spark: new THREE.OctahedronGeometry(0.12),
  blob:  new THREE.CircleGeometry(1, 18)
};

/* ================= Pista y entorno ================= */

const scenery = [], clouds = [], hills = [], dashes = [];

function buildTrack(){
  if (!scene) return;
  const total = FINISH_DIST + 260;
  const midZ = -(FINISH_DIST / 2) + 30;

  // césped
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, total + 200), basic(0x8fce5e));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, 0, midZ);
  scene.add(grass);

  // asfalto (10 de ancho para4 carriles)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(10.4, total), basic(0x6b6f78));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, midZ);
  scene.add(road);

  // bordes
  for (const sx of [-5.3, 5.3]){
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, total), basic(0xf3ede0));
    curb.position.set(sx, 0.08, midZ);
    scene.add(curb);
  }

  // líneas divisorias de carril (continuas)
  for (const dx of [-2.4, 0, 2.4]){
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, total), basic(0xf6f0e2));
    line.position.set(dx, 0.04, midZ);
    scene.add(line);
  }

  // líneas de meta (cuadros) mediante pool reciclado de dashboards
  const dashGeo = new THREE.BoxGeometry(0.16, 0.02, 1.4);
  for (const dx of [-2.4, 0, 2.4]){
    for (let i = 0; i < 30; i++){
      const d = new THREE.Mesh(dashGeo, basic(0xffffff));
      d.position.set(dx, 0.05, 20 - i * 4);
      scene.add(d);
      dashes.push(d);
    }
  }

  // puerta de salida
  buildGate(2, false);
  // puerta de meta (cuadros)
  buildGate(-FINISH_DIST, true);

  buildScenery();
  buildCloudsHills();
}

function buildGate(z, isFinish){
  const g = new THREE.Group();
  const col = isFinish ? 0x2b2b31 : 0xff8a3d;
  for (const sx of [-5.6, 5.6]){
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 6, 10), mat(col));
    post.position.set(sx, 3, 0);
    g.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), basic(0xffd63d));
    cap.position.set(sx, 6.1, 0);
    g.add(cap);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.7, 0.5), mat(col));
  beam.position.set(0, 5.7, 0);
  g.add(beam);
  if (isFinish){
    // banda cuadriculada
    for (let i = 0; i < 12; i++){
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.7, 0.52),
        basic(i % 2 ? 0xffffff : 0x2b2b31));
      c.position.set(-5.3 + i * 0.96, 4.9, 0);
      g.add(c);
    }
  } else {
    const banner = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 0.3), basic(0xffd63d));
    banner.position.set(0, 4.9, 0);
    g.add(banner);
  }
  g.position.z = z;
  scene.add(g);
}

function makeBambooGrove(){
  const g = new THREE.Group();
  const n = 2 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++){
    const h = rnd(3, 5.2);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, h, 7),
      mat(Math.random() < 0.5 ? 0x6fbf43 : 0x4f9c30));
    s.position.set(rnd(-0.9, 0.9), h / 2, rnd(-0.9, 0.9));
    s.rotation.z = rnd(-0.06, 0.06);
    g.add(s);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1, 5), basic(0x8ed657));
    leaf.position.set(s.position.x, h + 0.25, s.position.z);
    leaf.rotation.z = rnd(-0.5, 0.5);
    g.add(leaf);
  }
  return g;
}
function makeTree(){
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.3, 7), mat(0xa5713f));
  trunk.position.y = 0.65; g.add(trunk);
  const n = 2 + (Math.random() * 2 | 0);
  for (let i = 0; i < n; i++){
    const f = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.8, 1.2), 10, 8),
      mat(Math.random() < 0.5 ? 0x93cf6e : 0x7cbd58));
    f.position.set(rnd(-0.5, 0.5), 1.7 + i * 0.6, rnd(-0.5, 0.5));
    g.add(f);
  }
  return g;
}
function makeBush(){
  const g = new THREE.Group();
  for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++){
    const b = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.5, 0.85), 9, 7),
      mat(Math.random() < 0.5 ? 0x93cf6e : 0x7cbd58));
    b.position.set(rnd(-0.7, 0.7), rnd(0.3, 0.5), rnd(-0.6, 0.6));
    g.add(b);
  }
  return g;
}
function makeRockDeco(){
  const r = rnd(0.6, 1.1);
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(0xa7adb5, { flatShading:true }));
  m.scale.y = 0.7; m.position.y = r * 0.45;
  m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
  const g = new THREE.Group(); g.add(m);
  return g;
}

function buildScenery(){
  for (const side of [-1, 1]){
    for (let i = 0; i < 22; i++){
      const kind = Math.random();
      const g = kind < 0.36 ? makeBambooGrove() : kind < 0.66 ? makeTree()
              : kind < 0.86 ? makeBush() : makeRockDeco();
      g.position.set(side * rnd(8, 18), 0, 20 - i * (SCENERY_SPAN / 22) - rnd(0, 6));
      scene.add(g);
      scenery.push(g);
    }
  }
}

function buildCloudsHills(){
  for (let i = 0; i < 12; i++){
    const g = new THREE.Group();
    const n = 3 + (Math.random() * 3 | 0);
    for (let j = 0; j < n; j++){
      const s = new THREE.Mesh(new THREE.SphereGeometry(rnd(1.8, 3.4), 10, 8), basic(0xffffff));
      s.position.set(j * rnd(2.2, 3.4) - n, rnd(-0.5, 0.5), rnd(-1, 1));
      s.scale.y = 0.55; g.add(s);
    }
    g.position.set(rnd(-80, 80), rnd(18, 34), 30 - i * (CLOUD_SPAN / 12));
    scene.add(g); clouds.push(g);
  }
  for (let i = 0; i < 10; i++){
    const r = rnd(10, 20);
    const h = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat(0x9fd477));
    const side = i % 2 ? 1 : -1;
    h.position.set(side * rnd(22, 50), -r * 0.62, 40 - i * (HILL_SPAN / 10));
    scene.add(h); hills.push(h);
  }
}

/* ================= Carritos y animales (miran hacia -Z, adelante) ================= */

function addEyes(head, z, spread, y, size){
  for (const s of [-1, 1]){
    const white = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), basic(0xffffff));
    white.position.set(spread * s, y, z);
    head.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 8, 6), basic(0x1a1a14));
    pupil.position.set(spread * s, y, z - size * 0.7);
    head.add(pupil);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(size * 0.22, 6, 5), basic(0xffffff));
    shine.position.set(spread * s + size * 0.25, y + size * 0.3, z - size * 0.85);
    head.add(shine);
  }
}

/* Cabeza de animal, cara mirando hacia -Z (adelante) */
function buildAnimalHead(id, head){
  if (id === 'panda'){
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), basic(0xfaf7f0));
    head.add(skull);
    for (const s of [-1, 1]){                      // orejas negras
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), basic(0x2b2b31));
      ear.position.set(0.17 * s, 0.24, 0.02);
      head.add(ear);
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), basic(0x2b2b31));
      patch.scale.set(0.8, 1.15, 0.6);
      patch.position.set(0.12 * s, 0.02, -0.22);
      patch.rotation.z = 0.4 * s;
      head.add(patch);
    }
    addEyes(head, -0.255, 0.115, 0.03, 0.05);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), basic(0x2b2b31));
    nose.scale.set(1.2, 0.85, 0.9); nose.position.set(0, -0.05, -0.29);
    head.add(nose);
  } else if (id === 'turtle'){
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), basic(0x54b04a));
    head.add(skull);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), basic(0x6cc75e));
    snout.position.set(0, -0.04, -0.2); head.add(snout);
    addEyes(head, -0.2, 0.12, 0.08, 0.065);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), basic(0x2f5a2a));
    nose.position.set(0, -0.03, -0.32); head.add(nose);
  } else if (id === 'lion'){
    const mane = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.14, 8, 16), basic(0xb9701f));
    head.add(mane);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), basic(0xe8b45a));
    head.add(skull);
    for (const s of [-1, 1]){
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), basic(0xd08a2a));
      ear.position.set(0.16 * s, 0.2, 0.03); head.add(ear);
    }
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), basic(0xf6dfa8));
    muzzle.position.set(0, -0.06, -0.2); head.add(muzzle);
    addEyes(head, -0.22, 0.11, 0.06, 0.055);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), basic(0x6a3a12));
    nose.position.set(0, -0.02, -0.28); head.add(nose);
  } else {                                          // zorro
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), basic(0xe8702a));
    head.add(skull);
    for (const s of [-1, 1]){                      // orejas puntiagudas
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 6), basic(0xd45a1e));
      ear.position.set(0.16 * s, 0.26, 0.02);
      ear.rotation.z = -0.2 * s;
      head.add(ear);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), basic(0xfff4ea));
      cheek.position.set(0.16 * s, -0.06, -0.12); head.add(cheek);
    }
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), basic(0xfff4ea));
    muzzle.scale.set(1, 0.85, 1.1);
    muzzle.position.set(0, -0.06, -0.2); head.add(muzzle);
    addEyes(head, -0.22, 0.1, 0.06, 0.055);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), basic(0x2a1a12));
    nose.position.set(0, -0.05, -0.34); head.add(nose);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 8), basic(0xe8702a));
    tail.position.set(0, 0.05, 0.55); tail.rotation.x = -1.1;   // cola hacia atrás (+Z)
    head.parent.add(tail);
  }
}

function buildDriver(id){
  const meta = CHAR_META[id];
  const g = new THREE.Group();
  const bodyMat = mat(meta.body);
  const accMat = mat(meta.accent);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.33, 18, 14), bodyMat);
  torso.scale.set(1, 0.95, 0.9); torso.position.y = 0;
  g.add(torso);

  // brazos hacia el volante (adelante, -Z)
  for (const s of [-1, 1]){
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.26, 4, 8), accMat);
    arm.position.set(0.24 * s, 0.05, -0.16);
    arm.rotation.x = 1.15;
    g.add(arm);
  }

  // detalles traseros visibles desde la cámara (atrás)
  if (id === 'panda'){
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bodyMat);
    tail.position.set(0, 0.05, 0.32); g.add(tail);
  } else if (id === 'turtle'){
    // caparazón en la espalda
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI*2, 0, Math.PI/2), mat(0x2f7a3a));
    shell.position.set(0, 0.02, 0.08); shell.scale.set(1, 0.9, 1.05);
    g.add(shell);
    for (let i = 0; i < 5; i++){
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 6), basic(0x245c2c));
      const a = rnd(0, 6.28), rr = rnd(0, 0.22);
      dot.position.set(Math.cos(a)*rr, 0.24 + rnd(0,0.1), 0.08 + Math.sin(a)*rr);
      dot.rotation.x = -Math.PI/2.2;
      g.add(dot);
    }
  } else if (id === 'fox'){
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 8), bodyMat);
    tail.position.set(0, 0.1, 0.5); tail.rotation.x = -1.2; g.add(tail);
  }

  const head = new THREE.Group();
  head.position.set(0, 0.42, 0);
  g.add(head);
  buildAnimalHead(id, head);

  return { group: g, head };
}

function buildKart(meta){
  const g = new THREE.Group();
  const bodyMat = mat(meta.kart);
  const darkMat = mat(meta.kartDark);

  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.32, 2.3), darkMat);
  hull.position.y = 0.34; g.add(hull);

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 2.0), bodyMat);
  body.position.y = 0.55; g.add(body);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.34, 0.6), bodyMat);  // adelante -Z
  nose.position.set(0, 0.52, -1.05); g.add(nose);

  // faros
  for (const s of [-1, 1]){
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glow(0xfff2c0, 0x886622));
    light.position.set(0.4 * s, 0.55, -1.28); g.add(light);
  }

  // asiento respaldo (detrás del piloto, +Z)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.16), darkMat);
  seat.position.set(0, 0.9, 0.55); g.add(seat);

  // volante (delante del piloto, -Z)
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 16), darkMat);
  wheel.position.set(0, 0.92, -0.35); wheel.rotation.x = -0.6; g.add(wheel);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), darkMat);
  column.position.set(0, 0.8, -0.45); column.rotation.x = 0.6; g.add(column);

  // alerón trasero (+Z)
  const wingPost = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), darkMat);
  wingPost.position.set(0, 0.85, 1.05); g.add(wingPost);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.35), bodyMat);
  wing.position.set(0, 0.95, 1.08); g.add(wing);

  // ruedas (pivote para girar)
  const wheels = [];
  for (const sx of [-0.78, 0.78]){
    for (const sz of [-0.72, 0.72]){
      const pivot = new THREE.Group();
      pivot.position.set(sx, 0.36, sz);
      const w = new THREE.Mesh(GEO.wheel, basic(0x24242a));
      w.rotation.z = Math.PI / 2;
      pivot.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.28, 8), basic(0xf0e6d2));
      hub.rotation.z = Math.PI / 2;
      pivot.add(hub);
      g.add(pivot);
      wheels.push(pivot);
    }
  }

  // sombra proyectada
  const blob = new THREE.Mesh(GEO.blob, new THREE.MeshBasicMaterial({ color:0x1c1208, transparent:true, opacity:0.28 }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; blob.scale.setScalar(1.1);
  g.add(blob);

  return { group: g, wheels };
}

function buildRacerMesh(id){
  const meta = CHAR_META[id];
  const root = new THREE.Group();
  const kart = buildKart(meta);
  root.add(kart.group);
  const driver = buildDriver(id);
  driver.group.position.set(0, 1.05, 0.1);
  root.add(driver.group);
  scene.add(root);
  return { root, wheels: kart.wheels, driverGroup: driver.group, head: driver.head };
}

/* ================= Obstáculos ================= */

const OB_DEFS = {
  rock:   { hw: 0.62, dz: 0.5,  yMax: 1.0,  oil:false },
  bamboo: { hw: 0.55, dz: 0.5,  yMax: 1.5,  oil:false },
  oil:    { hw: 0.85, dz: 0.9,  yMax: 0.0,  oil:true  }
};

function buildObstacleMesh(type){
  const g = new THREE.Group();
  if (type === 'rock'){
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), mat(0x99a1aa, { flatShading:true }));
    m.scale.set(1.15, 0.95, 1); m.position.y = 0.5;
    m.rotation.set(rnd(0,3), rnd(0,3), rnd(0,3));
    g.add(m);
    const m2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), mat(0x848c96, { flatShading:true }));
    m2.position.set(rnd(0.5,0.7)*(Math.random()<0.5?-1:1), 0.2, rnd(-0.3,0.3));
    g.add(m2);
  } else if (type === 'bamboo'){
    for (const [sx, sz] of [[-0.28,0.05],[0.05,-0.1],[0.3,0.08]]){
      const h = rnd(1.2, 1.5);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, h, 8),
        mat(Math.random()<0.5?0x6fbf43:0x4f9c30));
      s.position.set(sx, h/2, sz); g.add(s);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 5), basic(0x8ed657));
      leaf.position.set(sx, h+0.1, sz); leaf.rotation.z = rnd(-0.6,0.6);
      g.add(leaf);
    }
  } else {                                        // mancha de aceite (suelo)
    const oil = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 18),
      new THREE.MeshLambertMaterial({ color:0x1a1a22, emissive:0x0a0a12 }));
    oil.position.y = 0.04; oil.scale.z = 1.15;
    g.add(oil);
    const shine = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), basic(0x33333f));
    shine.position.set(0.2, 0.05, 0.1);
    g.add(shine);
  }
  return g;
}

function addObstacle(type, lane, dist){
  if (!scene) return;
  const d = OB_DEFS[type];
  const mesh = buildObstacleMesh(type);
  const x = LANES_X[lane];
  mesh.position.set(x, 0, -dist);
  scene.add(mesh);
  obstacles.push({ type, lane, x, dist, hw: d.hw, dz: d.dz, yMax: d.yMax, oil: d.oil, mesh });
}

function clearObstacles(){
  if (scene) for (const o of obstacles) scene.remove(o.mesh);
  obstacles = [];
}

/* ---------- Monedas doradas ---------- */

const COIN_GEO  = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 18);
const COIN_RIM  = new THREE.TorusGeometry(0.24, 0.035, 6, 18);
const COIN_MAT  = new THREE.MeshLambertMaterial({ color:0xffd23d, emissive:0x8a6a00 });
const COIN_RIMM = new THREE.MeshLambertMaterial({ color:0xffe066, emissive:0x9a7a00 });
const SPARK_GEO = new THREE.OctahedronGeometry(0.1, 0);
const SPARK_MAT = new THREE.MeshBasicMaterial({ color:0xffe066 });
let sparks = [];

function buildCoinMesh(){
  const g = new THREE.Group();
  const disc = new THREE.Mesh(COIN_GEO, COIN_MAT);
  disc.rotation.x = Math.PI / 2;          // cara hacia la cámara (-Z)
  g.add(disc);
  const rim = new THREE.Mesh(COIN_RIM, COIN_RIMM);
  rim.position.z = 0.05;
  g.add(rim);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color:0xffffff }));
  shine.position.set(-0.1, 0.1, 0.06);
  g.add(shine);
  return g;
}

function addCoin(lane, dist, y){
  if (!scene) return;
  const mesh = buildCoinMesh();
  const x = LANES_X[lane];
  const yy = y === undefined ? COIN_Y : y;
  mesh.position.set(x, yy, -dist);
  scene.add(mesh);
  coins.push({ lane, x, dist, y: yy, mesh, spin: rnd(0, 6) });
}

function clearCoins(){
  if (scene) for (const c of coins) scene.remove(c.mesh);
  coins = [];
  if (scene) for (const s of sparks) scene.remove(s.mesh);
  sparks = [];
}

function updateCoins(dt){
  for (const c of coins){
    c.spin += dt * 4;
    c.mesh.rotation.y = c.spin;
    c.mesh.position.y = c.y + Math.sin(c.spin * 0.8) * 0.08;
  }
}

function spawnSparkle(x, y, z){
  if (!scene) return;
  for (let i = 0; i < 7; i++){
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT);
    m.position.set(x, y, z);
    scene.add(m);
    sparks.push({ mesh:m, vx:rnd(-2.2, 2.2), vy:rnd(0.5, 3), vz:rnd(-2.2, 2.2), life:0.45 });
  }
}

function updateSparks(dt){
  if (!scene) return;
  for (let i = sparks.length - 1; i >= 0; i--){
    const s = sparks[i];
    s.life -= dt;
    if (s.life <= 0){ scene.remove(s.mesh); sparks.splice(i, 1); continue; }
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    s.vy -= 7 * dt;
    s.mesh.scale.setScalar(0.4 + s.life * 1.6);
  }
}

function collectCoins(r){
  if (!r.isPlayer || !scene) return;
  for (let i = coins.length - 1; i >= 0; i--){
    const c = coins[i];
    if (Math.abs(c.x - r.x) > COIN_COLLECT_W) continue;
    if (Math.abs(c.dist - r.dist) > COIN_COLLECT_D) continue;
    coins.splice(i, 1);
    scene.remove(c.mesh);
    coinCount++;
    coinScore += COIN_SCORE;
    audio.coin();
    coinPill.classList.remove('pop'); void coinPill.offsetWidth; coinPill.classList.add('pop');
    floater('🪙 +' + COIN_SCORE);
    spawnSparkle(c.x, c.y, c.dist);
  }
}

function spawnRow(d){
  const order = [0,1,2,3].sort(() => Math.random() - 0.5);
  const n = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0); //1-3 obstáculos
  const obstacleLanes = order.slice(0, n);
  const freeLanes = order.slice(n);
  for (let i = 0; i < n; i++){
    const r = Math.random();
    const type = r < 0.4 ? 'rock' : r < 0.72 ? 'bamboo' : 'oil';
    addObstacle(type, obstacleLanes[i], d + rnd(-1.2, 1.2));
  }
  // monedas en un carril libre (camino seguro)
  if (freeLanes.length){
    const lane = freeLanes[(Math.random() * freeLanes.length) | 0];
    const count = 3 + ((Math.random() * 3) | 0);
    const off = rnd(-1, 1);
    for (let i = 0; i < count; i++) addCoin(lane, d + off + (i - (count - 1) / 2) * 2.1, COIN_Y);
  }
  // a veces una moneda arriesgada justo después de un obstáculo
  if (Math.random() < 0.5 && obstacleLanes.length){
    const lane = obstacleLanes[(Math.random() * obstacleLanes.length) | 0];
    addCoin(lane, d + rnd(3.5, 6), COIN_Y);
  }
}

/* ================= Corredores ================= */

function makeRacer(id, isPlayer, lane){
  const mesh = buildRacerMesh(id);
  const r = {
    id, animal: id, isPlayer, lane,
    x: LANES_X[lane], targetX: LANES_X[lane],
    dist: isPlayer ? 0 : rnd(-1, -4),
    cruise: isPlayer ? PLAYER_CRUISE : rnd(AI_MIN, AI_MAX),
    speed: 0,
    jumpY: 0, vy: 0, airborne: false,
    boostT: 0, boostCd: 0, slowT: 0, spinT: 0,
    bank: 0, animT: rnd(0, 6),
    finished: false, place: 0,
    mesh
  };
  r.baseCruise = r.cruise;   // fijo para la banda elástica de la IA
  return r;
}

function nearestObstacleAhead(lane, from, to){
  let best = null;
  for (const o of obstacles){
    if (o.lane !== lane) continue;
    if (o.dist < from || o.dist > to) continue;
    if (!best || o.dist < best.dist) best = o;
  }
  return best;
}
function laneClear(lane, from, to){
  for (const o of obstacles){
    if (o.lane !== lane) continue;
    if (o.dist > from && o.dist < to) return false;
  }
  return true;
}

/* ================= Flujo de carrera ================= */

function showScreen(el){
  for (const s of [menuScreen, winScreen, resultScreen]) s.classList.toggle('is-visible', s === el);
}
function hideScreens(){ showScreen(null); }

function updateRecord(){
  let txt = '';
  if (bestTime > 0) txt = '🏆 Récord: ' + bestTime.toFixed(1).replace('.', ',') + ' s';
  if (bestRank > 0 && bestRank > 1) txt += (txt ? ' · ' : '') + '🥇 Mejor lugar: ' + bestRank + 'º';
  startRecord.textContent = txt;
}

function createRacers(){
  racers = [];
  clearObstacles();
  clearCoins();
  coinCount = 0; coinScore = 0;
  // jugador en carril1; rivales en0,2,3
  player = makeRacer(selectedChar, true, 1);
  racers.push(player);
  const rivals = CHAR_IDS.filter(c => c !== selectedChar);
  const rivalLanes = [0, 2, 3];
  rivals.forEach((id, i) => racers.push(makeRacer(id, false, rivalLanes[i])));
  // coloca mallas
  for (const r of racers){
    r.mesh.root.position.set(r.x, 0, -r.dist);
  }
  nextSpawnDist = 45;
}

function startCountdown(){
  audio.unlock(); audio.click();
  createRacers();
  mode = 'countdown';
  countT = 0; countStep = -1;
  hideScreens();
  hud.hidden = false;
  raceProgress.hidden = false;
  hint.classList.remove('hidden');
  hintShown = false;
  buildProgressMarks();
}

function beginRace(){
  mode = 'playing';
  raceTime = 0;
  keyUp = false; keyDown = false;
  for (const r of racers) r.speed = r.cruise * 0.7;
  countdown.hidden = true;
  countdown.classList.remove('go');
  audio.go();
}

function endRace(){
  mode = 'finished';
  // lugar del jugador =1 + rivales por delante
  let place = 1;
  for (const r of racers){
    if (r !== player && r.dist > player.dist) place++;
  }
  player.place = place;
  const t = raceTime;
  hint.classList.add('hidden');
  if (place === 1){
    audio.finish();
    spawnConfetti();
    setTimeout(spawnConfetti, 600);
    if (!bestTime || t < bestTime){ bestTime = t; save('kart.bestTime', bestTime); }
    bestRank = 1; save('kart.bestRank', 1);
    winTime.textContent = t.toFixed(1).replace('.', ',') + ' s';
    winCoins.textContent = coinCount;
    winChar.textContent = CHAR_META[selectedChar].emoji;
    setTimeout(() => { if (mode === 'finished') showScreen(winScreen); }, 700);
  } else {
    audio.lose();
    if (!bestRank || place < bestRank){ bestRank = place; save('kart.bestRank', bestRank); }
    resultPlace.textContent = place + 'º';
    resultTime.textContent = t.toFixed(1).replace('.', ',') + ' s';
    resultCoins.textContent = coinCount;
    resultChar.textContent = CHAR_META[selectedChar].emoji;
    resultEmoji.textContent = place === 2 ? '🥈' : place === 3 ? '🥉' : '🏁';
    resultTitle.textContent = '¡Terminaste ' + place + 'º!';
    resultText.textContent = place === 2 ? '¡Estuviste a un pelo de ganar!'
      : place === 3 ? '¡Buen intento, la próxima será!'
      : '¡Esta vez no fue! Sigue practicando.';
    setTimeout(() => { if (mode === 'finished') showScreen(resultScreen); }, 700);
  }
  updateRecord();
}

/* ---------- HUD ---------- */

function buildProgressMarks(){
  rpMarks.innerHTML = '';
  for (const r of racers){
    const el = document.createElement('span');
    el.className = 'rp-mark' + (r.isPlayer ? ' you' : '');
    el.textContent = CHAR_META[r.id].emoji;
    el.style.left = '0%';
    rpMarks.appendChild(el);
    r.markEl = el;
  }
}

function updateHud(){
  // lugar
  const sorted = [...racers].sort((a, b) => b.dist - a.dist);
  const place = sorted.indexOf(player) + 1;
  rankBadge.innerHTML = place + '<span>º</span>';
  rankBadge.className = 'rank-badge p' + place;
  timeValue.textContent = raceTime.toFixed(1).replace('.', ',');

  // velocidad (control manual con ↑ acelerar / ↓ frenar)
  speedValue.textContent = Math.round(player.speed);
  let spClass = '';
  if (player.slowT > 0 || keyDown) spClass = ' brake';
  else if (keyUp) spClass = ' accel';
  speedPill.className = 'speed-pill' + spClass;

  // monedas recogidas
  coinValue.textContent = coinCount;

  // progreso
  const pct = clamp(player.dist / FINISH_DIST * 100, 0, 100);
  rpFill.style.width = pct + '%';
  rpYou.style.left = pct + '%';
  for (const r of racers){
    if (!r.markEl) continue;
    const p = clamp(r.dist / FINISH_DIST * 100, 0, 100);
    r.markEl.style.left = p + '%';
  }
}

/* ---------- confeti / flotadores ---------- */

function floater(text){
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  stage.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once:true });
}
function spawnConfetti(){
  const colors = ['#ff5d8f', '#ffd63d', '#4fae2e', '#22b8c8', '#8b5cff', '#ff8a3d'];
  for (let i = 0; i < 55; i++){
    const el = document.createElement('span');
    el.className = 'confetti-piece';
    el.style.left = rnd(0, 100).toFixed(1) + '%';
    el.style.background = colors[(Math.random() * colors.length) | 0];
    el.style.setProperty('--fall', rnd(1.8, 3.4).toFixed(2) + 's');
    el.style.setProperty('--delay', rnd(0, 0.9).toFixed(2) + 's');
    el.style.setProperty('--drift', Math.round(rnd(-90, 90)) + 'px');
    el.style.setProperty('--spin', Math.round(rnd(-540, 540)) + 'deg');
    confettiBox.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once:true });
  }
}

/* ================= Acciones del jugador ================= */

function moveLeft(){ if (mode === 'playing' && player.lane > 0){ player.lane--; player.targetX = LANES_X[player.lane]; audio.lane(); hideHint(); } }
function moveRight(){ if (mode === 'playing' && player.lane < 3){ player.lane++; player.targetX = LANES_X[player.lane]; audio.lane(); hideHint(); } }

function jumpPlayer(){
  if (mode !== 'playing') return;
  hideHint();
  if (!player.airborne){
    player.airborne = true;
    player.vy = JUMP_V;
    audio.jump();
  }
}

function hideHint(){
  if (!hintShown){ hintShown = true; hint.classList.add('hidden'); }
}

function hitRacer(r){
  if (r.slowT > 0) return;
  r.slowT = SLOW_TIME;
  r.spinT = SLOW_TIME * 0.9;
  r.boostT = 0;
  r.speed = Math.max(SLOW_SPEED, r.speed * 0.3);   // pérdida de velocidad inmediata
  if (r.isPlayer){
    flash.classList.remove('show'); void flash.offsetWidth; flash.classList.add('show');
    stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
    camShake = 1;
    floater('¡Choque! 🌀');
  }
  audio.crash();
}

/* ================= Actualización ================= */

function updateRacer(r, dt){
  // velocidad según estados (el jugador controla con ↑ acelerar / ↓ frenar)
  let target = r.cruise;
  if (r.slowT > 0) target = SLOW_SPEED;
  else if (r.isPlayer){
    if (keyDown) target = BRAKE_SPEED;
    else if (keyUp) target = MAX_SPEED;
  }
  else if (r.boostT > 0) target = BOOST_SPEED;
  r.speed += (target - r.speed) * Math.min(1, dt * 7.5);

  r.dist += r.speed * dt;

  // carril
  r.x += (r.targetX - r.x) * Math.min(1, dt * 10);

  // salto
  if (r.airborne){
    r.vy -= GRAVITY * dt;
    r.jumpY += r.vy * dt;
    if (r.jumpY <= 0 && r.vy < 0){ r.jumpY = 0; r.vy = 0; r.airborne = false; }
  }

  // temporizadores
  if (r.boostT > 0) r.boostT -= dt;
  if (r.boostCd > 0) r.boostCd -= dt;
  if (r.slowT > 0) r.slowT -= dt;
  if (r.spinT > 0) r.spinT -= dt;

  // posición en el mundo
  r.mesh.root.position.set(r.x, r.jumpY, -r.dist);

  // animación
  r.animT += dt * (4 + r.speed * 0.3);
  const spin = r.spinT > 0 ? (r.spinT / SLOW_TIME) * Math.PI * 2 : 0;
  const targetBank = clamp((r.targetX - r.x) * -0.25, -0.3, 0.3);
  r.bank += (targetBank - r.bank) * Math.min(1, dt * 9);
  r.mesh.root.rotation.y = spin;
  r.mesh.root.rotation.z = r.bank;
  const bob = r.airborne ? 0 : Math.abs(Math.sin(r.animT * 2)) * 0.05;
  r.mesh.root.position.y = r.jumpY + bob;

  // ruedas
  const wr = r.speed * dt * 2.4;
  for (const w of r.mesh.wheels) w.rotation.x += wr;

  // giro del volante al cambiar de carril
  if (r.mesh.driverGroup) r.mesh.driverGroup.rotation.z = -r.bank * 0.5;
}

function updateAI(r, dt){
  // banda elástica suave: quien va por detrás del jugador aprieta un poco
  const gap = player ? player.dist - r.dist : 0;
  r.cruise = r.baseCruise + clamp(gap * 0.06, -2.5, 3.5);
  // decide lane/jump para esquivar
  const look = nearestObstacleAhead(r.lane, r.dist + 0.5, r.dist + 26);
  if (look){
    const gap = look.dist - r.dist;
    const reactDist = r.speed * 0.5;
    if (gap < reactDist && gap > 0){
      const roll = Math.random();
      // buscar carriles libres adyacentes
      const options = [];
      if (r.lane > 0 && laneClear(r.lane - 1, r.dist - 1, r.dist + 7)) options.push(r.lane - 1);
      if (r.lane < 3 && laneClear(r.lane + 1, r.dist - 1, r.dist + 7)) options.push(r.lane + 1);
      if (options.length && roll < 0.7){
        r.lane = options[(Math.random() * options.length) | 0];
        r.targetX = LANES_X[r.lane];
      } else if (!r.airborne && roll < 0.95){
        r.vy = JUMP_V; r.airborne = true;    // salto (incluye aceite)
      }
      // el5% restante no reacciona → choca a veces
    }
  }
  // impulsos ocasionales
  if (r.boostCd <= 0 && Math.random() < dt * 0.35){
    r.boostT = BOOST_TIME * 0.8;
    r.boostCd = BOOST_COOLDOWN + BOOST_TIME;
  }
}

function checkCollisions(){
  for (const r of racers){
    if (r.slowT > 0) continue;
    for (const o of obstacles){
      if (Math.abs(o.x - r.x) > o.hw + HALF_W) continue;
      if (Math.abs(o.dist - r.dist) > o.dz + HALF_D) continue;
      if (o.oil){
        if (r.jumpY < 0.5) { hitRacer(r); break; }
      } else {
        if (r.jumpY < o.yMax) { hitRacer(r); break; }
      }
    }
  }
}

function recycleWorld(){
  // elimina obstáculos muy por detrás
  let back = Infinity;
  for (const r of racers) back = Math.min(back, r.dist);
  for (let i = obstacles.length - 1; i >= 0; i--){
    if (obstacles[i].dist < back - 25){
      scene.remove(obstacles[i].mesh);
      obstacles.splice(i, 1);
    }
  }
  for (let i = coins.length - 1; i >= 0; i--){
    if (coins[i].dist < back - 25){
      scene.remove(coins[i].mesh);
      coins.splice(i, 1);
    }
  }
  // genera por delante del líder
  let leader = -Infinity;
  for (const r of racers) leader = Math.max(leader, r.dist);
  while (nextSpawnDist < leader + SPAWN_AHEAD && nextSpawnDist < FINISH_DIST - 6){
    spawnRow(nextSpawnDist);
    nextSpawnDist += rnd(15, 26);
  }

  // recicla escenario según la cámara
  const camZ = -player.dist + CAMERA_BACK;
  for (const s of scenery){ if (s.position.z > camZ + 25) s.position.z -= SCENERY_SPAN; }
  for (const d of dashes){ d.position.z += (mode === 'playing' ? player.speed : 12) * dtCache; if (d.position.z > camZ + 20) d.position.z -= DASH_SPAN; }
  for (const c of clouds){ if (c.position.z > camZ + 30) c.position.z -= CLOUD_SPAN; }
  for (const h of hills){ if (h.position.z > camZ + 40) h.position.z -= HILL_SPAN; }
}
let dtCache = 1 / 60;

function updateCamera(dt, t){
  if (!camera) return;
  if (mode === 'menu'){
    // órbita mostrando la parrilla de salida (se ve la cara de los animales)
    const a = t * 0.35;
    camera.position.set(Math.sin(a) * 11, 4.6 + Math.sin(t * 0.5) * 0.4, 3 + Math.cos(a) * 11);
    camera.lookAt(0, 1.1, -1.5);
    return;
  }
  // detrás y algo arriba del jugador, mirando hacia la meta (-Z)
  const p = player;
  camX += (p.x * 0.55 - camX) * Math.min(1, dt * 5);
  const sx = (Math.random() - 0.5) * camShake * 0.5;
  const sy = (Math.random() - 0.5) * camShake * 0.4;
  camera.position.set(camX + sx, CAMERA_Y + p.jumpY * 0.35 + sy, -p.dist + CAMERA_BACK);
  camera.lookAt(p.x * 0.7 + sx, 1.4 + p.jumpY * 0.4, -p.dist - LOOK_AHEAD);
  const fov = 60 + clamp((p.speed - 16) * 0.6, -3, 7);
  if (Math.abs(fov - camera.fov) > 0.1){ camera.fov = fov; camera.updateProjectionMatrix(); }
  camShake = Math.max(0, camShake - dt * 2.2);
}

function update(dt, t){
  dtCache = dt;
  if (mode === 'countdown'){
    countT += dt;
    const step = Math.floor(countT / 0.8);
    if (step !== countStep){
      countStep = step;
      if (step < 3){
        countNum.textContent = String(3 - step);
        countdown.hidden = false;
        audio.beep(440 + step * 60);
      } else if (step === 3){
        countdown.classList.add('go');
        countNum.textContent = '¡Ya!';
        countdown.hidden = false;
        beginRace();
      }
    }
    for (const r of racers) updateRacer(r, dt);   // ruedas giran en la salida
  } else if (mode === 'playing'){
    raceTime += dt;
    for (const r of racers){
      if (!r.isPlayer) updateAI(r, dt);
      updateRacer(r, dt);
    }
    checkCollisions();
    collectCoins(player);
    updateCoins(dt);
    updateSparks(dt);
    recycleWorld();
    updateHud();
    if (player.dist >= FINISH_DIST){ player.dist = FINISH_DIST; endRace(); }
  } else if (mode === 'finished'){
    for (const r of racers) updateRacer(r, dt);   // frenado suave
    updateCoins(dt);
    updateSparks(dt);
    recycleWorld();
  } else { // menú
    for (const r of racers){ r.animT += dt; }
  }
  updateCamera(dt, t);
}

/* ================= Entrada ================= */

function onKey(e){
  const code = e.code;
  if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
  // ↑ y ↓ mantienen pulsados acelerar / frenar
  if (code === 'ArrowUp' || code === 'KeyW'){ keyUp = true; if (mode === 'playing') hideHint(); }
  if (code === 'ArrowDown' || code === 'KeyS'){ keyDown = true; if (mode === 'playing') hideHint(); }
  if (e.repeat) return;
  if (code === 'Enter'){
    if (mode === 'menu' && selectedChar) startCountdown();
    else if (mode === 'finished' && performance.now() - finishStamp > 700) startCountdown();
    return;
  }
  if (mode !== 'playing') return;
  if (code === 'ArrowLeft' || code === 'KeyA') moveLeft();
  else if (code === 'ArrowRight' || code === 'KeyD') moveRight();
  else if (code === 'Space') jumpPlayer();
}
function onKeyUp(e){
  const code = e.code;
  if (code === 'ArrowUp' || code === 'KeyW') keyUp = false;
  if (code === 'ArrowDown' || code === 'KeyS') keyDown = false;
}
window.addEventListener('keydown', onKey);
window.addEventListener('keyup', onKeyUp);

let finishStamp = 0;

/* gestos táctiles */
let touchStart = null;
stage.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  touchStart = { x: e.clientX, y: e.clientY };
});
stage.addEventListener('pointerup', e => {
  if (!touchStart || e.target.closest('button')){ touchStart = null; return; }
  const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
  touchStart = null;
  if (mode !== 'playing'){
    if (mode === 'menu' && selectedChar) startCountdown();
    return;
  }
  if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)){ if (dx < 0) moveLeft(); else moveRight(); }
  else jumpPlayer();
});

/* selección de personaje */
charGrid.addEventListener('click', e => {
  const card = e.target.closest('.char-card');
  if (!card) return;
  selectedChar = card.dataset.char;
  audio.unlock(); audio.click();
  for (const c of charGrid.children) c.classList.toggle('selected', c === card);
  playBtn.disabled = false;
});

playBtn.addEventListener('click', () => { if (selectedChar) startCountdown(); });
$('againBtn').addEventListener('click', () => { finishStamp = performance.now(); startCountdown(); });
$('retryBtn').addEventListener('click', () => { finishStamp = performance.now(); startCountdown(); });
$('winMenuBtn').addEventListener('click', () => { toMenu(); });
$('resultMenuBtn').addEventListener('click', () => { toMenu(); });

function toMenu(){
  mode = 'menu';
  clearObstacles();
  clearCoins();
  createMenuGrid();
  hud.hidden = true;
  raceProgress.hidden = true;
  hint.classList.remove('hidden');
  showScreen(menuScreen);
  updateRecord();
}

soundBtn.addEventListener('click', () => {
  muted = !muted;
  save('kart.muted', muted ? '1' : '0');
  soundBtn.textContent = muted ? '🔇' : '🔊';
  if (!muted){ audio.unlock(); audio.click(); }
});

document.addEventListener('visibilitychange', () => { last = performance.now(); });

/* ================= Parrilla del menú ================= */

function createMenuGrid(){
  if (scene) for (const r of racers) scene.remove(r.mesh.root);
  racers = [];
  // muestra los4 animales en la parrilla para la órbita del menú
  CHAR_IDS.forEach((id, i) => {
    const r = makeRacer(id, i === 0, i);
    r.x = LANES_X[i]; r.targetX = r.x; r.dist = -1 - i * 0.6;
    r.mesh.root.position.set(r.x, 0, -r.dist);
    racers.push(r);
  });
  player = racers[0];
}

/* ================= Bucle y arranque ================= */

let last = performance.now(), elapsed = 0;
function frame(t){
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  elapsed += dt;
  update(dt, elapsed);
  if (renderer && scene && camera) renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function fitStage(){
  const s = Math.min((innerWidth - 28) / STAGE_W, (innerHeight - 64) / STAGE_H, 1.2);
  stage.style.setProperty('--s', s.toFixed(4));
}
window.addEventListener('resize', fitStage);

buildTrack();
createMenuGrid();
fitStage();
updateRecord();
soundBtn.textContent = muted ? '🔇' : '🔊';
requestAnimationFrame(frame);

/* ================= Depuración ================= */

window.__kart = {
  select(id){ selectedChar = id; playBtn.disabled = false;
    for (const c of charGrid.children) c.classList.toggle('selected', c.dataset.char === id); },
  start(){ if (!selectedChar) selectedChar = 'panda'; startCountdown(); },
  step(dt){ update(dt || 1/60, elapsed += (dt || 1/60)); },
  left: moveLeft, right: moveRight, jump: jumpPlayer,
  /* control manual para bots de prueba: ↑ acelerar / ↓ frenar */
  up(v){ keyUp = !!v; },
  down(v){ keyDown = !!v; },
  coinCount(){ return coinCount; },
  coins(){ return coins.length; },
  coinAt(lane, dist){ addCoin(lane, dist, COIN_Y); },
  spawn(type, lane, dist){ addObstacle(type, lane, dist); },
  clear(){ clearObstacles(); clearCoins(); },
  /* información de obstáculos para bots de prueba */
  nearest(){
    if (!player) return null;
    let best = null;
    for (const o of obstacles){
      if (Math.abs(o.x - player.x) > o.hw + HALF_W) continue;
      if (o.dist < player.dist || o.dist > player.dist + 32) continue;
      if (!best || o.dist < best.dist) best = o;
    }
    return best ? { type: best.type, lane: best.lane, oil: best.oil, yMax: best.yMax,
                    gap: +(best.dist - player.dist).toFixed(1) } : null;
  },
  laneFree(lane, ahead){ return laneClear(lane, player.dist + 0.5, player.dist + ahead); },
  state(){
    const sorted = [...racers].sort((a, b) => b.dist - a.dist);
    return {
      mode,
      place: player ? sorted.indexOf(player) + 1 : 0,
      playerDist: player ? +player.dist.toFixed(1) : 0,
      playerLane: player ? player.lane : -1,
      playerSpeed: player ? +player.speed.toFixed(1) : 0,
      playerJumpY: player ? +player.jumpY.toFixed(2) : 0,
      raceTime: +raceTime.toFixed(1),
      obstacles: obstacles.length,
      coins: coins.length,
      coinCount,
      coinScore,
      keyUp, keyDown,
      racers: racers.map(r => ({ id: r.id, dist: +r.dist.toFixed(1), lane: r.lane, finished: r.finished })),
      webgl: !!renderer
    };
  }
};
