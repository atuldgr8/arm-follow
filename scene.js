// ============================================================
// ARM FOLLOW · scene.js
// Draws a SNAP (see sim.js) with three.js: the room, the plinth and cube, the
// mannequin (P1's body, the possessed arm in P2's colour, a lifeless arm grey),
// hands with fingers that curl, the puppet strings, and the three views.
// Kept to plain parts (room, body, objects) so it can move to VR later.
// ============================================================

// a plain white room; only the content is in colour (the cube, P2's arm, the rings)
const COL = { body: 0xd8d8d4, p2: 0xff5a1f, dead: 0x8a8a86, cube: 0x2f5bff, plinth: 0xffffff, floor: 0xf1f1ee, wall: 0xf7f7f5, bg: 0xf7f7f5 };
const SC = { exam: 0, fp: 0, renderer: null, scene: null, camera: null, controls: null, view: null, camPos: new V3(0, 1.8, 3), camLook: new V3(0, 1, 0), camYaw: 0, parts: {}, shown: null };

function sceneInit(container) {
  let renderer = SC.renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  let scene = SC.scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, 12, 30);
  SC.camera = new THREE.PerspectiveCamera(55, 1, 0.04, 60);
  SC.controls = new OrbitControls(SC.camera, renderer.domElement);
  SC.controls.enableDamping = true; SC.controls.enabled = false; SC.controls.maxPolarAngle = Math.PI * 0.495;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xf0f0ec, 1.6)); scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  let sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(4, 6.5, 6.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 20 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // ---- the room ----
  let mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  let floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.zFront - ROOM.zBack), mat(COL.floor));
  floor.rotation.x = -Math.PI / 2; floor.position.z = (ROOM.zFront + ROOM.zBack) / 2; floor.receiveShadow = true; scene.add(floor);
  // faint floor joints
  let grid = new THREE.GridHelper(9, 9, 0xe2e2de, 0xe2e2de); grid.position.y = 0.002; scene.add(grid);
  // white walls
  let wall = (w, h, x, z, ry) => { let m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(COL.wall)); m.position.set(x, h / 2, z); m.rotation.y = ry || 0; m.receiveShadow = true; scene.add(m); return m; };
  let depth = ROOM.zFront - ROOM.zBack, mid = (ROOM.zFront + ROOM.zBack) / 2;
  wall(ROOM.x * 2, 3, 0, ROOM.zBack);
  wall(depth, 3, -ROOM.x, mid, Math.PI / 2);
  wall(depth, 3, ROOM.x, mid, -Math.PI / 2);
  let startRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.31, 40), new THREE.MeshBasicMaterial({ color: 0xcfcfca }));
  startRing.rotation.x = -Math.PI / 2; startRing.position.set(START.x, 0.004, START.z); scene.add(startRing);

  // ---- plinth and cube ----
  let plinth = SC.parts.plinth = new THREE.Mesh(new THREE.BoxGeometry(PLINTH.w, PLINTH.h, PLINTH.w), mat(COL.plinth));
  plinth.castShadow = true; plinth.receiveShadow = true; scene.add(plinth);
  // level 2: the plinth to carry it to, its top marked in the cube's blue
  let tgt = SC.parts.target = new THREE.Mesh(new THREE.BoxGeometry(PLINTH.w, PLINTH.h, PLINTH.w), mat(COL.plinth));
  tgt.castShadow = true; tgt.receiveShadow = true; tgt.visible = false; scene.add(tgt);
  let top = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.235, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: COL.cube, transparent: true, opacity: 0.9 }));
  top.rotation.x = -Math.PI / 2; top.position.y = PLINTH.h / 2 + 0.003; tgt.add(top); SC.parts.targetTop = top;
  let cube = SC.parts.cube = new THREE.Mesh(new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE), new THREE.MeshStandardMaterial({ color: COL.cube, roughness: 0.7, emissive: 0x000000 }));
  cube.castShadow = true; cube.receiveShadow = true;
  cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), new THREE.LineBasicMaterial({ color: 0x1a36b8 })));
  scene.add(cube);

  // ---- the mannequin ----
  SC.parts.bodyMat = new THREE.MeshStandardMaterial({ color: COL.body, roughness: 0.7 });
  let B = SC.parts.body = new THREE.Group(); scene.add(B);
  let mk = (geo, m) => { let o = new THREE.Mesh(geo, m || SC.parts.bodyMat); o.castShadow = true; o.receiveShadow = true; B.add(o); return o; };
  SC.parts.cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  SC.parts.sph = new THREE.SphereGeometry(1, 18, 12);
  SC.parts.torso = mk(new THREE.CapsuleGeometry(0.13, 0.32, 6, 16));
  SC.parts.pelvis = mk(SC.parts.sph);
  SC.parts.neck = mk(SC.parts.cyl);
  SC.parts.head = mk(SC.parts.sph);
  SC.parts.legs = {}; SC.parts.legMat = {};
  for (let s of ['L', 'R']) {
    // each leg has its own colour, so a leg P2 owns (Bubble Pop, legs split) shows in P2's colour
    let lm = SC.parts.legMat[s] = new THREE.MeshStandardMaterial({ color: COL.body, roughness: 0.7 });
    SC.parts.legs[s] = { thigh: mk(SC.parts.cyl, lm), shin: mk(SC.parts.cyl, lm), knee: mk(SC.parts.sph, lm), foot: mk(new THREE.BoxGeometry(0.1, 0.07, 0.24), lm) };
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
  SC.parts.strings = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.45 }));
  SC.parts.strings.frustumCulled = false; scene.add(SC.parts.strings);
  // P2's place, relative to the body (optional)
  // soft shadows on the floor: one under the body, and P2's (where P2 is in the room) while the arm is off.
  // A thread runs from the fallen arm to the body's shoulder.
  let sc = document.createElement('canvas'); sc.width = sc.height = 128;
  let sx2 = sc.getContext('2d'), gd = sx2.createRadialGradient(64, 64, 4, 64, 64, 62);
  gd.addColorStop(0, 'rgba(0,0,0,0.55)'); gd.addColorStop(0.55, 'rgba(0,0,0,0.28)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
  sx2.fillStyle = gd; sx2.fillRect(0, 0, 128, 128);
  let shTex = new THREE.CanvasTexture(sc);
  let blob = () => { let m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.55), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; scene.add(m); return m; };
  SC.parts.bodyShadow = blob();
  let gr = SC.parts.ghost = blob(); gr.visible = false;
  let tg = new THREE.BufferGeometry(), TN = 32;
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TN * 3), 3));
  SC.parts.gThread = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.55 }));
  SC.parts.gThread.frustumCulled = false; SC.parts.gThread.visible = false; scene.add(SC.parts.gThread);
  // your measured floor: an outline on the floor, and grid walls that fade in near its edges (like a VR boundary)
  let cv = document.createElement('canvas'); cv.width = cv.height = 64;
  let cx = cv.getContext('2d'); cx.strokeStyle = 'rgba(160,220,255,1)'; cx.lineWidth = 3; cx.strokeRect(0, 0, 64, 64);
  SC.parts.chapTex = new THREE.CanvasTexture(cv);
  SC.parts.chap = [0, 1, 2, 3].map(() => {
    let t = SC.parts.chapTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
    let m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, color: 0x2f5bff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m); return m;
  });
  let og = new THREE.BufferGeometry().setFromPoints([new V3(), new V3(), new V3(), new V3(), new V3()]);
  SC.parts.outline = new THREE.Line(og, new THREE.LineBasicMaterial({ color: 0x2f5bff, transparent: true, opacity: 0.6 }));
  SC.parts.outline.visible = false; scene.add(SC.parts.outline);
  // the walk to the centre: a ring on the floor, and a marker for where P2 is
  SC.parts.ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 48), new THREE.MeshBasicMaterial({ color: 0x12a150, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  SC.parts.ring.rotation.x = -Math.PI / 2; SC.parts.ring.visible = false; scene.add(SC.parts.ring);
  SC.parts.p2dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), new THREE.MeshBasicMaterial({ color: COL.p2, transparent: true, opacity: 0.9 }));
  SC.parts.p2dot.rotation.x = -Math.PI / 2; SC.parts.p2dot.visible = false; scene.add(SC.parts.p2dot);
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
  SC.lastSnap = S;
  if (typeof bubbleRender === 'function') bubbleRender(S, dt);   // Bubble Pop (bubbles.js)
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
  let first = SET.view === 'first' || (S.armsOnly && S.armsView === 'first');
  let hideHead = first || SC.fp > 0.08;   // first person (or the first-person cut near the cube): no head in the way
  P.head.visible = !hideHead; P.neck.visible = !hideHead;
  // legs and feet
  let fwd = new V3(Math.sin(S.yaw * Math.PI / 180), 0, -Math.cos(S.yaw * Math.PI / 180));
  for (let s of ['L', 'R']) {
    let L = P.legs[s];
    P.legMat[s].color.setHex(S.legs && S.legs[s] === 2 ? COL.p2 : COL.body);
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
    let ao = S.bub && SET.bubXray && !S.armsOnly ? 0.75 : 1;   // Bubble Pop: see-through arms (a little)
    if (G.m.opacity !== ao) { G.m.opacity = ao; G.m.transparent = ao < 1; G.m.depthWrite = ao >= 1; G.m.needsUpdate = true; }

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
  let noCube = S.armsOnly || !!S.bub;   // arms only: nothing to pick up; Bubble Pop: bubbles instead
  P.plinth.visible = !noCube; P.cube.visible = !noCube;
  P.target.visible = !!S.target && !noCube;
  if (S.target) { P.target.position.set(S.target[0], PLINTH.h / 2, S.target[1]); P.targetTop.material.opacity = 0.55 + 0.4 * Math.sin(performance.now() / 300) ** 2; }
  P.cube.position.copy(fromArr(S.cube.c)); P.cube.rotation.set(0, S.cube.yaw, 0);
  let pop = S.cube.appear > 0 ? 1 - S.cube.appear : 1;
  P.cube.scale.setScalar(Math.max(0.01, S.cube.s * (0.6 + 0.4 * smooth01(pop))));
  { let m = P.cube.material, op = SET.seeThroughCube && S.cube.held ? 0.35 : 1;
    if (Math.abs(m.opacity - op) > 0.01) { m.opacity += (op - m.opacity) * 0.2; let t = m.opacity < 0.99; if (m.transparent !== t) { m.transparent = t; m.depthWrite = !t; m.needsUpdate = true; } } }
  P.cube.material.emissive.setRGB(0.35 * S.hud.flash + 0.12 * S.hud.hold, 0.28 * S.hud.flash + 0.1 * S.hud.hold, 0.05 * S.hud.flash);
  // soft shadows: under the body, and P2's while the arm is off (walk yours under the body)
  P.bodyShadow.position.set(b.pelvis.x, 0.004, b.pelvis.z); P.bodyShadow.rotation.z = -S.yaw * Math.PI / 180;
  let G = S.ghost && S.ghost.p ? S.ghost : null;
  P.ghost.visible = !!G;
  if (G) { P.ghost.position.set(G.p[0], 0.005, G.p[1]); P.ghost.material.opacity = 0.8 + 0.2 * Math.sin(performance.now() / 400); }
  // the thread: from the fallen arm's shoulder end to the body's shoulder, sagging on the floor between
  let fallen = ['L', 'R'].find(s2 => S.arms[s2].owner === 2 && ['falling', 'lying'].includes(S.arms[s2].state));
  P.gThread.visible = !!(S.thread && fallen);
  if (P.gThread.visible) {
    let from = fromArr(S.arms[fallen].pts[0]), to = b['sh' + fallen].clone(), arr = P.gThread.geometry.attributes.position.array, TN = arr.length / 3;
    let span = from.distanceTo(to), sag = Math.min(1.2, 0.1 + span * 0.35);
    for (let i = 0; i < TN; i++) {
      let u = i / (TN - 1), q = from.clone().lerp(to, u);
      q.y = Math.max(0.01, q.y - sag * 4 * u * (1 - u));
      arr[i * 3] = q.x; arr[i * 3 + 1] = q.y; arr[i * 3 + 2] = q.z;
    }
    P.gThread.geometry.attributes.position.needsUpdate = true;
  }

  drawFloorEdges(S.chap);
  let ce = S.centre, P2 = SC.parts;
  P2.ring.visible = !!ce; P2.p2dot.visible = !!(ce && ce.p2);
  if (ce) {
    let pulse = 1 + 0.06 * Math.sin(performance.now() / 250);
    P2.ring.position.set(ce.ring[0], 0.01, ce.ring[1]); P2.ring.scale.setScalar(pulse);
    P2.ring.material.color.setHex(ce.ok1 && ce.ok2 ? 0x12a150 : 0x5fe0b0);
    if (ce.p2) P2.p2dot.position.set(ce.p2[0], 0.015, ce.p2[1]);
  }
  // see-through body while examining: the torso, head, hips and legs fade; the arms stay solid
  // and while the view cuts to first person, the body fades so the camera doesn't pass through a solid torso
  let fade = Math.min(SET.xray ? 1 - 0.7 * smooth01(SC.exam) : 1, 1 - 0.65 * clamp(SC.fp * 4, 0, 1)), bm = SC.parts.bodyMat;
  if (S.bub && SET.bubXray && !S.armsOnly) fade = Math.min(fade, 0.3);   // Bubble Pop: see the bubbles through the body
  for (let m of [bm, SC.parts.legMat.L, SC.parts.legMat.R]) {
    if (Math.abs(m.opacity - fade) > 0.005) { m.opacity = fade; let t = fade < 0.99; if (m.transparent !== t) { m.transparent = t; m.depthWrite = !t; m.needsUpdate = true; } }
  }
  cameraStep(S, dt, b);
  // P1's laptop records its camera, so P2's laptop can show the same view
  if (!isGuest()) {
    let dir = new V3(); SC.camera.getWorldDirection(dir);
    S.cam = { p: a3(SC.camera.position), l: a3(SC.camera.position.clone().add(dir)), fov: r3(SC.camera.fov), exam: r3(SC.exam), fp: r3(SC.fp) };
  }
  // Bubble Pop: a small shake when the body lands (heavier for a jump together). Each laptop shakes its own view.
  let shook = null;
  if (SC.shake > 0.01 && SET.view !== 'orbit') {
    shook = new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.035 * SC.shake);
    SC.camera.position.add(shook); SC.shake *= Math.max(0, 1 - dt * 5);
  }
  SC.renderer.render(SC.scene, SC.camera);
  if (shook) SC.camera.position.sub(shook);
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
    SC.camPos.copy(fromArr(S.cam.p)); SC.camLook.copy(fromArr(S.cam.l));   // already played back smoothly (net.js)
    if (cam.fov !== S.cam.fov) { cam.fov = S.cam.fov; cam.updateProjectionMatrix(); }
    cam.position.copy(SC.camPos); cam.lookAt(SC.camLook); SC.exam = S.cam.exam || 0; SC.fp = S.cam.fp || 0; return;
  }
  // which way the view faces: never turns, keeps the cube ahead, or turns with the body (slowly)
  let yawT = 0;
  if (SET.camLock === 'turn') yawT = S.yaw * Math.PI / 180;
  else if (SET.camLock === 'cube') { let dx = S.cube.c[0] - b.pelvis.x, dz = S.cube.c[2] - b.pelvis.z; if (Math.hypot(dx, dz) > 0.3) yawT = Math.atan2(dx, -dz); else yawT = SC.camYaw; }
  let dy = yawT - SC.camYaw; while (dy > Math.PI) { dy -= 2 * Math.PI; } while (dy < -Math.PI) { dy += 2 * Math.PI; }
  SC.camYaw += dy * Math.min(1, dt * 1.5);
  let fwd = new V3(Math.sin(SC.camYaw), 0, -Math.cos(SC.camYaw)), right = new V3(Math.cos(SC.camYaw), 0, Math.sin(SC.camYaw));
  // the camera follows a calmed copy of the body's place, so the body's wobble isn't magnified
  let rawRoot = b.pelvis.clone().setY(0);
  if (!SC.rootS || SC.rootS.distanceTo(rawRoot) > 2) SC.rootS = rawRoot.clone();
  SC.rootS.lerp(rawRoot, Math.min(1, dt * 3));
  let root = SC.rootS.clone();
  // ARMS ONLY: a steady view of the arms (from the eyes, facing you like a mirror, or from the side)
  if (S.armsOnly && SET.view !== 'orbit') {
    let head = b.head.clone(), chest = b.neck.clone().add(new V3(0, -0.2, 0)), wantA, lookA, fovA = 70;
    if (SET.armsView === 'first') { wantA = head.clone().add(new V3(0, 0.04, -0.08)); lookA = chest.clone().add(new V3(0, -0.15, -0.9)); fovA = 85; }
    else if (SET.armsView === 'mirror') { wantA = chest.clone().add(new V3(0, 0.25, -1.9)); lookA = chest.clone(); fovA = 60; }
    else { wantA = chest.clone().add(new V3(1.9, 0.25, -0.35)); lookA = chest.clone().add(new V3(0, 0, -0.2)); fovA = 60; }
    if (!SC.armsS || SC.armsS.distanceTo(wantA) > 1.5) { SC.armsS = wantA.clone(); SC.armsL = lookA.clone(); }
    SC.armsS.lerp(wantA, Math.min(1, dt * 4)); SC.armsL.lerp(lookA, Math.min(1, dt * 4));
    if (Math.abs(cam.fov - fovA) > 0.05) { cam.fov = fovA; cam.updateProjectionMatrix(); }
    SC.camPos.copy(SC.armsS); SC.camLook.copy(SC.armsL); SC.fp = 0; SC.exam = 0;
    cam.position.copy(SC.camPos); cam.lookAt(SC.camLook); return;
  }
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
  let bubM = !!S.bub;   // Bubble Pop: a little further back and looking higher, so bubbles overhead and on the floor both show
  let want = root.clone().addScaledVector(fwd, bubM ? -2.7 : -2.3).addScaledVector(right, 0.75).add(new V3(0, bubM ? 2.05 : 2.15, 0));
  let look = root.clone().addScaledVector(fwd, 1.6).addScaledVector(right, -0.1).add(new V3(0, bubM ? 1.2 : 0.75, 0));
  // near the cube (or holding it) the camera moves in to examine, so you can see where your hands are
  let c = fromArr(S.cube.c), d = Math.hypot(c.x - root.x, c.z - root.z);
  let eT = SET.examine === 'off' || SET.fpNear || bubM ? 0 : S.cube.held ? 1 : clamp((SET.examineDist - d) / 0.5, 0, 1);
  SC.exam += (eT - SC.exam) * Math.min(1, dt * 2.5);
  if (!SC.cubeS || SC.cubeS.distanceTo(c) > 1) SC.cubeS = c.clone();
  SC.cubeS.lerp(c, Math.min(1, dt * 4));
  if (SC.exam > 0.001) {
    // anchored mostly on the cube (which holds still), not the body
    let cs = SC.cubeS, mid = root.clone().lerp(cs.clone().setY(0), 0.7), posE;
    let lookE = mid.clone().setY(clamp(cs.y - 0.1, 0.6, 1.4));
    if (SET.examine === 'high') posE = mid.clone().addScaledVector(fwd, -0.8).addScaledVector(right, 0.45).setY(2.9);
    else if (SET.examine === 'side') posE = mid.clone().addScaledVector(right, 2.0).addScaledVector(fwd, -0.35).setY(1.5);
    else posE = c.clone().setY(0).addScaledVector(fwd, 1.5).addScaledVector(right, 0.35).setY(1.75);
    let e = smooth01(SC.exam);
    want.lerp(posE, e); look.lerp(lookE, e);
  }
  // FIRST PERSON near the cube, and again near the plinth to set it down on (a game-like cut, eased)
  let h = S.hud || {}, carry = h.task === 'carry';
  // sticky: it switches in at examineDist but only switches out 0.7 m further away, and never within 1.5 s
  // of switching (before, hovering near the line flipped the view back and forth)
  let nearD = !S.cube.held ? h.near : carry && S.target ? h.nearT : 0;
  let fpIn = SET.fpNear && !bubM && (nearD < SET.examineDist || (S.cube.held && !carry));
  let fpOut = !SET.fpNear || bubM || (nearD > SET.examineDist + 0.7 && !(S.cube.held && !carry));
  let tNow = performance.now();
  if (!SC.fpOn && fpIn && tNow - (SC.fpAt || 0) > 1500) { SC.fpOn = true; SC.fpAt = tNow; }
  else if (SC.fpOn && fpOut && (tNow - (SC.fpAt || 0) > 1500 || !SET.fpNear)) { SC.fpOn = false; SC.fpAt = tNow; }
  let fpWanted = !!SC.fpOn;
  SC.fp += ((fpWanted ? 1 : 0) - SC.fp) * Math.min(1, dt * 2.2);
  let f = smooth01(SC.fp);
  // the first-person eye follows a calmed copy of the head (and looks at a calmed target), so the view
  // stays steady even when tracking gets less sure close to the cube
  // v1.18.6: the eye sits on your head and looks WHERE YOUR BODY FACES (a calmed heading), tipped down
  // toward the hands. It never swings round to keep the cube centred.
  let eyeRaw = b.head.clone().add(new V3(0, 0.03, 0));
  if (!SC.eyeS || SC.eyeS.distanceTo(eyeRaw) > 1.5) SC.eyeS = eyeRaw.clone();
  SC.eyeS.lerp(eyeRaw, Math.min(1, dt * 2.5));
  let hT = (S.yaw || 0) * Math.PI / 180;
  if (SC.headY === undefined || f < 0.001) SC.headY = hT;
  let dh = hT - SC.headY; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  SC.headY += dh * Math.min(1, dt * 2);
  let hf = new V3(Math.sin(SC.headY), 0, -Math.cos(SC.headY));
  let eyeF = SC.eyeS.clone().addScaledVector(hf, 0.1);
  let lookF = eyeF.clone().addScaledVector(hf, 1).add(new V3(0, -0.55, 0));
  if (f > 0.001) { want.lerp(eyeF, f); look.lerp(lookF, f); }
  let fovT = (bubM ? 62 : 55) + 25 * f;
  if (Math.abs(cam.fov - fovT) > 0.05) { cam.fov = fovT; cam.updateProjectionMatrix(); }
  let k = Math.min(1, dt * (5 - 2.5 * SC.exam + 4 * f));   // calmer while examining; follows the calmed eye in first person
  SC.camPos.lerp(want, k); SC.camLook.lerp(look, k);
  cam.position.copy(SC.camPos); cam.lookAt(SC.camLook);
}
