import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as CANNON from 'cannon-es';

// ── Dark / light mode colours ─────────────────────────────────────────────────
const mq = window.matchMedia('(prefers-color-scheme: dark)');
let isDark = mq.matches;
const BG     = () => isDark ? '#000000' : '#ffffff';
const STROKE = () => isDark ? '#ffffff' : '#000000';

// ── Constants ─────────────────────────────────────────────────────────────────
const R      = 1;
const FLAT_Y = -(R * 0.88);
const FLAT_R = Math.sqrt(R * R - FLAT_Y * FLAT_Y);
const REST_Y = -FLAT_Y;
const THICK  = 18;
const GND_Y  = 0;
function toWorld(t) { return t * 0.008; }

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('bowl-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

// ── Scene + Camera ────────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
camera.position.set(0, 4.68, 6.38);
camera.lookAt(0, 0.4, 0);

// ── Outline shader (back-face expansion) ─────────────────────────────────────
const outlineVert = /* glsl */`
  uniform float uThickness;
  void main() {
    vec3 pos = position + normal * uThickness;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;
const outlineFrag = /* glsl */`
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, 1.0);
    #include <colorspace_fragment>
  }
`;

// ── Bowl geometry — lower hemisphere, bottom clamped flat ─────────────────────
const bowlGeo = (() => {
  const geo = new THREE.SphereGeometry(R, 80, 40, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < FLAT_Y) pos.setY(i, FLAT_Y);
  }
  pos.needsUpdate = true;
  const w = mergeVertices(geo);
  w.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
  w.computeVertexNormals();
  return w;
})();

const bowlGroup = new THREE.Group();
scene.add(bowlGroup);

const outlineMat = new THREE.ShaderMaterial({
  uniforms: { uThickness: { value: toWorld(THICK) }, uColor: { value: new THREE.Color(STROKE()) } },
  vertexShader: outlineVert, fragmentShader: outlineFrag, side: THREE.BackSide,
});
bowlGroup.add(new THREE.Mesh(bowlGeo, outlineMat));

const fillMat = new THREE.MeshBasicMaterial({ color: BG(), side: THREE.DoubleSide });
bowlGroup.add(new THREE.Mesh(bowlGeo, fillMat));

const capMat  = new THREE.MeshBasicMaterial({ color: BG(), side: THREE.DoubleSide });
const capMesh = new THREE.Mesh(new THREE.CircleGeometry(FLAT_R, 72), capMat);
capMesh.rotation.x = -Math.PI / 2;
capMesh.position.y  = FLAT_Y;
bowlGroup.add(capMesh);

function makeTorus() {
  const tube = toWorld(THICK) * 0.6;
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(R + toWorld(THICK) - tube, tube, 16, 128),
    new THREE.MeshBasicMaterial({ color: STROKE(), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  );
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}
let rimMesh = makeTorus();
bowlGroup.add(rimMesh);

// ── Ground (invisible — physics only) ────────────────────────────────────────
const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
);
groundMesh.rotation.x = -Math.PI / 2;
scene.add(groundMesh);

// ── Physics ───────────────────────────────────────────────────────────────────
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 12;

const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(new CANNON.Plane());
const gq = new CANNON.Quaternion();
gq.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
groundBody.quaternion.copy(gq);
world.addBody(groundBody);

const bowlPhysMat = new CANNON.Material('bowl');
const wallPhysMat = new CANNON.Material('wall');
world.addContactMaterial(new CANNON.ContactMaterial(bowlPhysMat, wallPhysMat, {
  restitution: 0.50,
  friction:    0.10,
}));

const bowlBody = new CANNON.Body({ mass: 0.8, linearDamping: 0.15, angularDamping: 0.82, material: bowlPhysMat });
bowlBody.addShape(new CANNON.Cylinder(R, FLAT_R, -FLAT_Y, 18), new CANNON.Vec3(0, FLAT_Y / 2, 0));
bowlBody.position.set(0, GND_Y + REST_Y, 0);
world.addBody(bowlBody);

// ── Invisible boundary walls ──────────────────────────────────────────────────
// Positions and normals are derived from the camera frustum each resize so walls
// follow perspective and the bowl bounces exactly at the visible screen edges.
function makeWallBody() {
  const body = new CANNON.Body({ mass: 0, material: wallPhysMat });
  body.addShape(new CANNON.Plane());
  world.addBody(body);
  return body;
}
const leftWall  = makeWallBody();
const rightWall = makeWallBody();
const backWall  = makeWallBody();

// ── Drag to throw ─────────────────────────────────────────────────────────────
const dragRay     = new THREE.Raycaster();
const dragPlane   = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragCurrent = new THREE.Vector3();
const dragHistory = [];
let isDragging = false, dragMoved = false;

function canvasNDC(e) {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}
function mouseToGround(e) {
  dragRay.setFromCamera(canvasNDC(e), camera);
  dragPlane.constant = -(GND_Y + REST_Y);
  const hit = new THREE.Vector3();
  return dragRay.ray.intersectPlane(dragPlane, hit);
}

canvas.addEventListener('mousedown', e => {
  const hit = mouseToGround(e); if (!hit) return;
  isDragging = true; dragMoved = false; dragHistory.length = 0;
  dragCurrent.set(bowlBody.position.x, GND_Y + REST_Y, bowlBody.position.z);
  dragHistory.push({ x: hit.x, z: hit.z, t: performance.now() });
  canvas.classList.add('dragging');
});
window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  const hit = mouseToGround(e); if (!hit) return;
  dragMoved = true;
  dragCurrent.set(hit.x, GND_Y + REST_Y, hit.z);
  dragHistory.push({ x: hit.x, z: hit.z, t: performance.now() });
  if (dragHistory.length > 6) dragHistory.shift();
});
window.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging = false; canvas.classList.remove('dragging');
  if (dragMoved && dragHistory.length >= 2) {
    const a = dragHistory[0], b = dragHistory[dragHistory.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt > 0) {
      let vx = (b.x - a.x) / dt, vz = (b.z - a.z) / dt;
      const spd = Math.hypot(vx, vz), cap = 18;
      if (spd > cap) { vx *= cap / spd; vz *= cap / spd; }
      bowlBody.wakeUp(); bowlBody.velocity.set(vx, 0, vz);
    }
  }
});
canvas.addEventListener('click', () => {
  if (dragMoved) return;
  bowlBody.wakeUp(); bowlBody.velocity.set(0, 5.5, 0);
  bowlBody.angularVelocity.setZero(); bowlBody.quaternion.set(0, 0, 0, 1);
});
canvas.addEventListener('dblclick', () => {
  bowlBody.wakeUp(); bowlBody.velocity.set(0, 4, 0);
  bowlBody.angularVelocity.set((Math.random() - .5) * 14, (Math.random() - .5) * 8, (Math.random() - .5) * 14);
});

// ── Hide canvas until the bowl drops ─────────────────────────────────────────
canvas.style.opacity = '0';

// ── Drop-and-spin entry animation ─────────────────────────────────────────────
let dropTimer = null, resetCooldown = false;
function webDropAndSpin() {
  canvas.style.transition = 'opacity 0.3s ease';
  canvas.style.opacity = '1';
  bowlBody.wakeUp(); bowlBody.velocity.setZero(); bowlBody.angularVelocity.setZero();
  bowlBody.force.setZero(); bowlBody.torque.setZero();
  bowlBody.quaternion.set(0, 0, 0, 1); bowlBody.position.set(0, GND_Y + 5.5, 0);
  let fired = false;
  const poll = () => {
    if (fired) return;
    if (bowlBody.position.y < GND_Y + REST_Y + 0.25 && Math.abs(bowlBody.velocity.y) < 1.0) {
      fired = true; bowlBody.wakeUp(); bowlBody.velocity.setZero();
      for (let i = 0; i < 6; i++) setTimeout(() => { bowlBody.wakeUp(); bowlBody.angularVelocity.set(1.5, 18, 0); }, i * 10);
    } else { dropTimer = setTimeout(poll, 50); }
  };
  dropTimer = setTimeout(poll, 500);
}

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (isDragging) {
    bowlBody.velocity.setZero(); bowlBody.angularVelocity.setZero();
    bowlBody.position.set(dragCurrent.x, GND_Y + REST_Y, dragCurrent.z);
  } else if (!resetCooldown) {
    if (Math.abs(bowlBody.position.x) > 14 || Math.abs(bowlBody.position.z) > 14 || bowlBody.position.y < GND_Y - 4) {
      resetCooldown = true; setTimeout(() => { resetCooldown = false; }, 2500); webDropAndSpin();
    }
  }
  world.step(1 / 60, dt, 3);
  bowlGroup.position.copy(bowlBody.position);
  bowlGroup.quaternion.copy(bowlBody.quaternion);
  renderer.render(scene, camera);
}());

// ── Resize + wall placement ───────────────────────────────────────────────────
const wallRay     = new THREE.Raycaster();
const wallGndPl   = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(GND_Y + REST_Y));
const wallFrustum = new THREE.Frustum();
const wallVPM     = new THREE.Matrix4();
const wallDefN    = new THREE.Vector3(0, 0, 1); // Cannon Plane default local normal

// Returns the frustum plane's XZ-projected normal (drops Y so the wall stays
// vertical regardless of camera tilt, then renormalizes).
function frustumXZNormal(planeIdx) {
  const n = wallFrustum.planes[planeIdx].normal.clone();
  n.y = 0;
  return n.normalize();
}

function updateWalls() {
  // Rebuild frustum from current camera
  wallVPM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  wallFrustum.setFromProjectionMatrix(wallVPM);

  const hit = new THREE.Vector3();

  // Three.js frustum plane layout (setFromProjectionMatrix):
  //   planes[0] = right plane  (inward normal has −X component)
  //   planes[1] = left plane   (inward normal has +X component)
  //   planes[3] = top plane    (used for back wall)

  // Left wall — frustum planes[1], normal faces inward (+X side)
  const leftN = frustumXZNormal(1);
  wallRay.setFromCamera(new THREE.Vector2(-1, 0), camera);
  if (wallRay.ray.intersectPlane(wallGndPl, hit)) {
    leftWall.position.set(hit.x, 0, hit.z);
    const tq = new THREE.Quaternion().setFromUnitVectors(wallDefN, leftN);
    leftWall.quaternion.set(tq.x, tq.y, tq.z, tq.w);
  }

  // Right wall — frustum planes[0], normal faces inward (−X side)
  const rightN = frustumXZNormal(0);
  wallRay.setFromCamera(new THREE.Vector2(1, 0), camera);
  if (wallRay.ray.intersectPlane(wallGndPl, hit)) {
    rightWall.position.set(hit.x, 0, hit.z);
    const tq = new THREE.Quaternion().setFromUnitVectors(wallDefN, rightN);
    rightWall.quaternion.set(tq.x, tq.y, tq.z, tq.w);
  }

  // Back wall — vertical plane at top-of-screen ground edge, normal toward camera (+Z)
  wallRay.setFromCamera(new THREE.Vector2(0, 1), camera);
  if (wallRay.ray.intersectPlane(wallGndPl, hit)) {
    backWall.position.set(0, 0, hit.z);
    backWall.quaternion.set(0, 0, 0, 1); // identity → default normal (0,0,1) faces camera
  }
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  updateWalls();
}
new ResizeObserver(resize).observe(canvas);
resize();

// ── React to dark/light mode changes ─────────────────────────────────────────
function applyColors() {
  fillMat.color.set(BG()); capMat.color.set(BG());
  outlineMat.uniforms.uColor.value.set(STROKE());
  rimMesh.material.color.set(STROKE());
}
mq.addEventListener('change', e => { isDark = e.matches; applyColors(); });

// ── Start: wait for Download button to appear, then drop ─────────────────────
let bowlStarted = false;
function startBowl() {
  if (bowlStarted) return;
  bowlStarted = true;
  webDropAndSpin();
}

const buttonsEl = document.querySelector('.buttons');
if (buttonsEl && !buttonsEl.classList.contains('is-visible')) {
  const mo = new MutationObserver(() => {
    if (buttonsEl.classList.contains('is-visible')) { mo.disconnect(); startBowl(); }
  });
  mo.observe(buttonsEl, { attributes: true, attributeFilter: ['class'] });
} else {
  startBowl();
}
