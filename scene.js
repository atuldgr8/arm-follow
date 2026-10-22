// ============================================================
// ARM FOLLOW · scene.js
// Draws a SNAP (see sim.js) with three.js: the room, the plinth and cube, the
// mannequin (P1's body, the possessed arm in P2's colour, a lifeless arm grey),
// hands with fingers that curl, the puppet strings, and the three views.
// Kept to plain parts (room, body, objects) so it can move to VR later.
// ============================================================

const COL = { body: 0xd9dcdf, p2: 0xff9a4a, dead: 0x6a6e74, cube: 0xe6be6a, plinth: 0x3b4048, floor: 0x2a2d33, wall: 0x24272c, bg: 0x15171b };
const SC = { exam: 0, renderer: null, scene: null, camera: null, controls: null, view: null, camPos: new V3(0, 1.8, 3), camLook: new V3(0, 1, 0), camYaw: 0, parts: {}, shown: null };

function sceneInit(container) {
  let renderer = SC.renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  let scene = SC.scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, 9, 18);
  SC.camera = new THREE.PerspectiveCamera(55, 1, 0.04, 60);
  SC.controls = new OrbitControls(SC.camera, renderer.domElement);
  SC.controls.enableDamping = true; SC.controls.enabled = false; SC.controls.maxPolarAngle = Math.PI * 0.495;

  scene.add(new THREE.HemisphereLight(0xe4ebf2, 0x2c3036, 0.9));
  let sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2.5, 6, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 20 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // ---- the room ----
  let mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  let floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.zFront - ROOM.zBack), mat(COL.floor));
  floor.rotation.x = -Math.PI / 2; floor.position.z = (ROOM.zFront + ROOM.zBack) / 2; floor.receiveShadow = true; scene.add(floor);
  let grid = new THREE.GridHelper(9, 18, 0x3d424a, 0x33373e); grid.position.y = 0.002; scene.add(grid);
  let wallH = 2.8, wm = mat(COL.wall);
  let back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, wallH), wm); back.position.set(0, wallH / 2, ROOM.zBack); back.receiveShadow = true; scene.add(back);
  for (let s of [-1, 1]) {
    let w = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.zFront - ROOM.zBack, wallH), wm);
    w.rotation.y = -s * Math.PI / 2; w.position.set(s * ROOM.x, wallH / 2, (ROOM.zFront + ROOM.zBack) / 2); w.receiveShadow = true; scene.add(w);
  }
  let startRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.31, 40), new THREE.MeshBasicMaterial({ color: 0x5b626c }));
  startRing.rotation.x = -Math.PI / 2; startRing.position.set(START.x, 0.004, START.z); scene.add(startRing);

  // ---- plinth and cube ----
  let plinth = SC.parts.plinth = new THREE.Mesh(new THREE.BoxGeometry(PLINTH.w, PLINTH.h, PLINTH.w), mat(COL.plinth));
  plinth.castShadow = true; plinth.receiveShadow = true; scene.add(plinth);
  let cube = SC.parts.cube = new THREE.Mesh(new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE), new THREE.MeshStandardMaterial({ color: COL.cube, roughness: 0.6, emissive: 0x000000 }));
  cube.castShadow = true; cube.receiveShadow = true;
  cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), new THREE.LineBasicMaterial({ color: 0x8a6a2a })));
  scene.add(cube);

  // ---- the mannequin ----
  SC.parts.bodyMat = new THREE.MeshStandardMaterial({ color: COL.body, roughness: 0.55 });
  let B = SC.parts.body = new THREE.Group(); scene.add(B);
  let mk = (geo, m) => { let o = new THREE.Mesh(geo, m || SC.parts.bodyMat); o.castShadow = true; o.receiveShadow = true; B.add(o); return o; };
  SC.parts.cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  SC.parts.sph = new THREE.SphereGeometry(1, 18, 12);
  SC.parts.torso = mk(new THREE.CapsuleGeometry(0.13, 0.32, 6, 16));
  SC.parts.pelvis = mk(SC.parts.sph);
  SC.parts.neck = mk(SC.parts.cyl);
  SC.parts.head = mk(SC.parts.sph);
  SC.parts.legs = {};
  for (let s of ['L', 'R']) {
    SC.parts.legs[s] = { thigh: mk(SC.parts.cyl), shin: mk(SC.parts.cyl), knee: mk(SC.parts.sph), foot: mk(new THREE.BoxGeometry(0.1, 0.07, 0.24)) };
  }
  SC.parts.arms = {};
  for (let s of ['L', 'R']) {
    let m = new THREE.MeshStandardMaterial({ color: COL.body, roughness: 0.55 }), g = new THREE.Group(); scene.add(g);
    let am = geo => { let o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    let fingers = [];
    for (let f = 0; f < 5; f++) { fingers.push([am(SC.parts.cyl), am(SC.parts.cyl), am(SC.parts.sph)]); }
    SC.parts.arms[s] = { g, m, sh: am(SC.parts.sph), upper: am(SC.parts.cyl), elbow: am(SC.parts.sph), fore: am(SC.parts.cyl), wrist: am(SC.parts.sph),
      palm: am(new THREE.BoxGeometry(0.078, 0.088, 0.028)), fingers, col: new THREE.Color(COL.body) };
  }
  // puppet strings: thin lines from the arm upward
  let sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 2 * 3 * 2), 3));
  SC.parts.strings = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xd8dde3, transparent: true, opacity: 0.55 }));
  SC.parts.strings.frustumCulled = false; scene.add(SC.parts.strings);
  // P2's place, relative to the body (optional)
  let gr = SC.parts.ghost = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.22, 36), new THREE.MeshBasicMaterial({ color: COL.p2, transparent: true, opacity: 0.6 }));
  gr.rotation.x = -Math.PI / 2; gr.visible = false; scene.add(gr);
  // your measured floor: an outline on the floor, and grid walls that fade in near its edges (like a VR boundary)
  let cv = document.createElement('canvas'); cv.width = cv.height = 64;
  let cx = cv.getContext('2d'); cx.strokeStyle = 'rgba(160,220,255,1)'; cx.lineWidth = 3; cx.strokeRect(0, 0, 64, 64);
  SC.parts.chapTex = new THREE.CanvasTexture(cv);
  SC.parts.chap = [0, 1, 2, 3].map(() => {
    let t = SC.parts.chapTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
    let m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, color: 0x7fd3ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m); return m;
  });
  let og = new THREE.BufferGeometry().setFromPoints([new V3(), new V3(), new V3(), new V3(), new V3()]);
  SC.parts.outline = new THREE.Line(og, new THREE.LineBasicMaterial({ color: 0x5aa9d6, transparent: true, opacity: 0.5 }));
  SC.parts.outline.visible = false; scene.add(SC.parts.outline);
  window.addEventListener('resize', sceneResize);
  sceneResize();
}
function sceneResize() {
  let c = SC.renderer.domElement.parentElement; if (!c) return;
  let w = c.clientWidth, h = c.clientHeight;
  SC.renderer.setSize(w, h); SC.camera.aspect = w / Math.max(1, h); SC.camera.updateProjectionMatrix();
}

// ---------------- helpers ----------------
const Y_UP = new V3(0, 1, 0);
const fromArr = a => new V3(a[0], a[1], a[2]);
function seg(m, a, b, r) {
  let d = b.clone().sub(a), len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  if (len > 1e-5) m.quaternion.setFromUnitVectors(Y_UP, d.divideScalar(len));
  m.scale.set(r, Math.max(0.001, len), r);
}
function ball(m, p, r) { m.position.copy(p); m.scale.setScalar(r); }
const basisQ = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

// ---------------- draw one frame ----------------
function sceneRender(S, dt) {
  let P = SC.parts;
  P.body.visible = !!(S && S.ok);
  for (let s of ['L', 'R']) { P.arms[s].g.visible = !!(S && S.ok); }
  if (!S || !S.ok) { P.strings.visible = false; cameraStep(null, dt); SC.renderer.render(SC.scene, SC.camera); return; }
  let b = {}; for (let k in S.body) { b[k] = fromArr(S.body[k]); }

  // torso: a capsule from pelvis to neck, as wide as the shoulders
  let X = b.shR.clone().sub(b.shL), sw = X.length(); X.normalize();
  let Yv = b.neck.clone().sub(b.pelvis); let tl = Yv.length(); Yv.addScaledVector(X, -Yv.dot(X)).normalize();
  let Z = new V3().crossVectors(X, Yv), q = basisQ(X, Yv, Z);
  P.torso.position.copy(b.pelvis).lerp(b.neck, 0.55); P.torso.quaternion.copy(q);
  P.torso.scale.set(clamp(sw / 0.32, 0.85, 1.3), (tl + 0.04) / 0.58, 0.72);
  P.pelvis.position.copy(b.hipL).lerp(b.hipR, 0.5).addScaledVector(Yv, 0.04); P.pelvis.quaternion.copy(q); P.pelvis.scale.set(0.16, 0.11, 0.11);
  let headC = b.head.clone().addScaledVector(Yv, 0.03);
  seg(P.neck, b.neck, headC, 0.045);
  ball(P.head, headC, 0.1); P.head.scale.set(0.092, 0.112, 0.102);
  let first = SET.view === 'first';
  P.head.visible = !first; P.neck.visible = !first;
  // legs and feet
  let fwd = new V3(Math.sin(S.yaw * Math.PI / 180), 0, -Math.cos(S.yaw * Math.PI / 180));
  for (let s of ['L', 'R']) {
    let L = P.legs[s];
    seg(L.thigh, b['hip' + s], b['kn' + s], 0.07); seg(L.shin, b['kn' + s], b['an' + s], 0.055); ball(L.knee, b['kn' + s], 0.06);
    L.foot.position.copy(b['an' + s]).addScaledVector(fwd, 0.06).setY(Math.max(0.035, b['an' + s].y - 0.04));
    L.foot.rotation.set(0, -S.yaw * Math.PI / 180, 0);
  }

  // arms: shoulder ball, upper arm, elbow, forearm, wrist, palm, fingers
  let lines = P.strings.geometry.attributes.position.array, li = 0, anyString = false, t = performance.now() / 1000;
  for (let s of ['L', 'R']) {
    let A = S.arms[s], G = P.arms[s], pts = A.pts.map(fromArr);
    let alive = A.owner === 2 ? COL.p2 : COL.body;
    G.col.set(COL.dead).lerp(new THREE.Color(alive), clamp(A.life, 0, 1));
    G.m.color.copy(G.col);
    ball(G.sh, pts[0], 0.062); seg(G.upper, pts[0], pts[1], 0.05); ball(G.elbow, pts[1], 0.05);
    seg(G.fore, pts[1], pts[2], 0.042); ball(G.wrist, pts[2], 0.036);
    drawHand(G, s, pts[2], fromArr(A.f), fromArr(A.n), A.curl);
    // strings while lifeless or being pulled back
    let lifeless = A.owner === 2 && A.state !== 'attached' && A.state !== 'snapping';
    if (S.strings && lifeless) {
      anyString = true;
      for (let i of [0, 2]) {
        let p = pts[i], top = new V3(p.x + Math.sin(t * 0.7 + i) * 0.05, 4.2, p.z + Math.cos(t * 0.6 + i) * 0.05);
        lines.set([p.x, p.y, p.z, top.x, top.y, top.z], li); li += 6;
      }
    }
  }
  for (; li < lines.length; li++) { lines[li] = 0; }
  P.strings.geometry.attributes.position.needsUpdate = true;
  P.strings.visible = anyString;

  // plinth and cube
  P.plinth.position.set(S.plinth[0], PLINTH.h / 2, S.plinth[1]);
  P.cube.position.copy(fromArr(S.cube.c)); P.cube.rotation.set(0, S.cube.yaw, 0);
  let pop = S.cube.appear > 0 ? 1 - S.cube.appear : 1;
  P.cube.scale.setScalar(Math.max(0.01, S.cube.s * (0.6 + 0.4 * smooth01(pop))));
  P.cube.material.emissive.setRGB(0.35 * S.hud.flash + 0.12 * S.hud.hold, 0.28 * S.hud.flash + 0.1 * S.hud.hold, 0.05 * S.hud.flash);
  // ghost
  P.ghost.visible = !!S.ghost;
  if (S.ghost) P.ghost.position.set(S.ghost[0], 0.006, S.ghost[1]);

  drawFloorEdges(S.chap);
  // see-through body while examining: the torso, head, hips and legs fade; the arms stay solid
  let fade = SET.xray ? 1 - 0.7 * smooth01(SC.exam) : 1, bm = SC.parts.bodyMat;
  if (Math.abs(bm.opacity - fade) > 0.005) { bm.opacity = fade; let t = fade < 0.99; if (bm.transparent !== t) { bm.transparent = t; bm.depthWrite = !t; bm.needsUpdate = true; } }
  cameraStep(S, dt, b);
  // P1's laptop records its camera, so P2's laptop can show the same view
  if (!isGuest()) {
    let dir = new V3(); SC.camera.getWorldDirection(dir);
    S.cam = { p: a3(SC.camera.position), l: a3(SC.camera.position.clone().add(dir)), fov: SC.camera.fov, exam: r3(SC.exam) };
  }
  SC.renderer.render(SC.scene, SC.camera);
}
function drawFloorEdges(ch) {
  let P = SC.parts;
  P.outline.visible = !!ch;
  for (let w of P.chap) { w.visible = false; }
  if (!ch) return;
  let [x0, z0, x1, z1] = ch.r, H = 2.4;
  let pos = P.outline.geometry.attributes.position;
  [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].forEach(([x, z], i) => pos.setXYZ(i, x, 0.012, z));
  pos.needsUpdate = true;
  // ahead (toward your camera), behind, left, right
  let walls = [[(x0 + x1) / 2, z0, x1 - x0, 0], [(x0 + x1) / 2, z1, x1 - x0, 0], [x0, (z0 + z1) / 2, z1 - z0, Math.PI / 2], [x1, (z0 + z1) / 2, z1 - z0, Math.PI / 2]];
  walls.forEach(([x, z, len, rot], i) => {
    let m = P.chap[i], op = ch.op[i];
    if (op <= 0.01) return;
    m.visible = true; m.position.set(x, H / 2, z); m.rotation.set(0, rot, 0); m.scale.set(Math.max(0.1, len), H, 1);
    m.material.map.repeat.set(Math.max(1, len / 0.3), H / 0.3); m.material.opacity = 0.85 * op;
  });
}

// a hand: palm, four fingers and a thumb. curl 0 = open, 1 = curled.
const FINGERS = [{ off: 0.027, l: [0.042, 0.033] }, { off: 0.009, l: [0.046, 0.036] }, { off: -0.009, l: [0.043, 0.034] }, { off: -0.027, l: [0.034, 0.027] }];
function drawHand(G, side, W, f, n, curl) {
  f.normalize(); n.addScaledVector(f, -n.dot(f)).normalize();
  let sv = new V3().crossVectors(f, n);              // across the palm
  let thumbSide = sv.clone().multiplyScalar(side === 'R' ? 1 : -1);
  G.palm.position.copy(W).addScaledVector(f, 0.045);
  G.palm.quaternion.copy(basisQ(sv, f, n));
  let bend = (a) => f.clone().multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a));
  FINGERS.forEach((F, i) => {
    let base = W.clone().addScaledVector(f, 0.088).addScaledVector(thumbSide, F.off);
    let a1 = curl * 1.35, a2 = a1 + curl * 1.55;
    let k1 = base.clone().addScaledVector(bend(a1), F.l[0]), k2 = k1.clone().addScaledVector(bend(a2), F.l[1]);
    let [s1, s2, tip] = G.fingers[i];
    seg(s1, base, k1, 0.0105); seg(s2, k1, k2, 0.0095); ball(tip, k2, 0.0095);
  });
  // thumb: from the index side of the palm, folding across it when curled
  let tb = W.clone().addScaledVector(f, 0.022).addScaledVector(thumbSide, 0.036).addScaledVector(n, 0.006);
  let d1 = f.clone().multiplyScalar(0.55).addScaledVector(thumbSide, 0.75).addScaledVector(n, 0.25).normalize();
  let dc = f.clone().multiplyScalar(0.55).addScaledVector(thumbSide, -0.45).addScaledVector(n, 0.7).normalize();
  d1.lerp(dc, curl * 0.85).normalize();
  let k1 = tb.clone().addScaledVector(d1, 0.04), k2 = k1.clone().addScaledVector(d1.clone().lerp(dc, 0.3 + curl * 0.5).normalize(), 0.032);
  let [t1, t2, tt] = G.fingers[4];
  seg(t1, tb, k1, 0.012); seg(t2, k1, k2, 0.0105); ball(tt, k2, 0.0105);
}

// ---------------- views ----------------
function setView(v) {
  SET.view = v;
  SC.controls.enabled = v === 'orbit';
  if (v === 'orbit') { SC.controls.target.copy(SC.camLook); SC.controls.update(); }
}
function cameraStep(S, dt, b) {
  let cam = SC.camera;
  if (!S || !S.ok) { cam.position.set(0, 2.2, 4.2); cam.lookAt(0, 0.9, -1); return; }
  // P2's laptop shows exactly what P1's camera shows
  if (isGuest() && S.cam) {
    SC.controls.enabled = false;
    let k = Math.min(1, dt * 12);
    SC.camPos.lerp(fromArr(S.cam.p), k); SC.camLook.lerp(fromArr(S.cam.l), k);
    if (cam.fov !== S.cam.fov) { cam.fov = S.cam.fov; cam.updateProjectionMatrix(); }
    cam.position.copy(SC.camPos); cam.lookAt(SC.camLook); SC.exam = S.cam.exam || 0; return;
  }
  // which way the view faces: never turns, keeps the cube ahead, or turns with the body (slowly)
  let yawT = 0;
  if (SET.camLock === 'turn') yawT = S.yaw * Math.PI / 180;
  else if (SET.camLock === 'cube') { let dx = S.cube.c[0] - b.pelvis.x, dz = S.cube.c[2] - b.pelvis.z; if (Math.hypot(dx, dz) > 0.3) yawT = Math.atan2(dx, -dz); else yawT = SC.camYaw; }
  let dy = yawT - SC.camYaw; while (dy > Math.PI) { dy -= 2 * Math.PI; } while (dy < -Math.PI) { dy += 2 * Math.PI; }
  SC.camYaw += dy * Math.min(1, dt * 1.5);
  let fwd = new V3(Math.sin(SC.camYaw), 0, -Math.cos(SC.camYaw)), right = new V3(Math.cos(SC.camYaw), 0, Math.sin(SC.camYaw));
  let root = b.pelvis.clone().setY(0);
  if (SET.view === 'orbit') {
    SC.controls.target.lerp(root.clone().setY(1.0), Math.min(1, dt * 3));
    SC.controls.update(); return;
  }
  let fov = SET.view === 'first' ? 80 : 55;
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  if (SET.view === 'first') {
    let eye = b.head.clone().addScaledVector(fwd, 0.09).add(new V3(0, 0.02, 0));
    cam.position.copy(eye);
    cam.lookAt(eye.clone().addScaledVector(fwd, 1).add(new V3(0, -0.32, 0)));
    SC.camPos.copy(cam.position); SC.camLook.copy(eye).addScaledVector(fwd, 1);
    return;
  }
  // behind the body, over the right shoulder
  let want = root.clone().addScaledVector(fwd, -2.3).addScaledVector(right, 0.75).add(new V3(0, 2.15, 0));
  let look = root.clone().addScaledVector(fwd, 1.6).addScaledVector(right, -0.1).add(new V3(0, 0.75, 0));
  // near the cube (or holding it) the camera moves in to examine, so you can see where your hands are
  let c = fromArr(S.cube.c), d = Math.hypot(c.x - root.x, c.z - root.z);
  let eT = SET.examine === 'off' ? 0 : S.cube.held ? 1 : clamp((SET.examineDist - d) / 0.5, 0, 1);
  SC.exam += (eT - SC.exam) * Math.min(1, dt * 2.5);
  if (SC.exam > 0.001) {
    let mid = root.clone().lerp(c.clone().setY(0), 0.5), posE;
    let lookE = mid.clone().setY(clamp(c.y - 0.1, 0.6, 1.4));
    if (SET.examine === 'high') posE = mid.clone().addScaledVector(fwd, -0.8).addScaledVector(right, 0.45).setY(2.9);
    else if (SET.examine === 'side') posE = mid.clone().addScaledVector(right, 2.0).addScaledVector(fwd, -0.35).setY(1.5);
    else posE = c.clone().setY(0).addScaledVector(fwd, 1.5).addScaledVector(right, 0.35).setY(1.75);
    let e = smooth01(SC.exam);
    want.lerp(posE, e); look.lerp(lookE, e);
  }
  let k = Math.min(1, dt * 5);
  SC.camPos.lerp(want, k); SC.camLook.lerp(look, k);
  cam.position.copy(SC.camPos); cam.lookAt(SC.camLook);
}
