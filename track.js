// ============================================================
// ARM FOLLOW · track.js
// Settings, and turning the webcam (or the demo people, or the computer
// partner) into two people:
//   P1 owns the body (walks it, uses its own arms)
//   P2 possesses one or both of its arms
// Each person is a smoothed skeleton in metres, in "A space":
//   x = metres to the right on screen (like a mirror)
//   y = metres up
//   z = metres away from the camera (stepping toward your camera makes z smaller)
// A space points the same way as the virtual room seen from behind the body,
// so stepping toward your camera walks the body forward into the room.
// ============================================================

const SET = {
  // ---- tracking ----
  source: 'mediapipe',   // 'mediapipe' (webcam) | 'demo' (two made-up people, only when you choose it)
  mirror: true, smooth: 0.5, solo: false,
  mpSplit: true,         // 1 space: look for one person in each half of the picture
  mpModel: 'lite',       // 'lite' | 'full'
  fov: 65,               // webcam field of view, for the distance estimate
  hands: 'pose',         // 'pose' (4 points per hand, from the body model) | 'hand' (21 points, the hand model)
  comp: 'off',           // computer partner: 'off' | 'P2' (you are P1) | 'P1' (you are P2)
  compDelay: 0.3, compSpeed: 0.5,
  // ---- spaces ----
  spaces: 2,             // 2 (one person per laptop, the main setup) | 1 (both in one camera)
  // ---- who owns what ----
  own: 'R',              // 'R' | 'L' | 'both' | 'custom'
  ownL: 1, ownR: 2,      // custom: who drives each arm
  // ---- follow rule ----
  tol: 0.5,              // metres of drift before the arm is left behind
  turnTol: 60,           // degrees of facing differently before the arm is left behind
  lifeless: 'fall',      // 'fall' (falls off, lies on the floor) | 'limp' (hangs dead on the shoulder)
  puppetFall: true,      // falls loose at elbow and wrist, swings, bounces once (off: a stiff, mechanical drop)
  curl: true,            // fingers curl when lifeless, twitch back on return
  lyingFollow: true,     // lying arm still follows P2, sluggishly and late
  twitch: true,          // small twitches when P2 moves a lot
  lag: 0.6,              // how late the lying arm follows (s)
  lyingStrength: 0.35,   // how strongly the lying arm follows
  returnStyle: 'strings',// 'strings' (jerky, dangling, a little too slow) | 'glide' (smooth, mechanical)
  returnTime: 1.4,       // seconds the strings take
  overshoot: true,       // snaps into the shoulder with a small overshoot
  strings: true,         // show the strings while lifeless or being pulled back
  // ---- picking up ----
  holders: 'any',        // 'any' hand | 'possessed' hands only
  grip: 'squeeze',       // 'squeeze' | 'palm' (palm facing) | 'touch' (just touching) | 'dwell'
  touch: 0.08,           // how close a palm has to be to count as touching (m)
  holdTime: 2,           // seconds above the waist to finish
  areaW: 2.0, areaD: 1.4,
  spawnLR: true,         // new cubes appear mostly to the left and right (on the other side from you)// real floor you can walk, where new cubes may appear (m)
  // ---- view ----
  view: 'behind',        // 'behind' | 'first' | 'orbit'
  camLock: 'forward',    // the view: 'forward' (never turns) | 'cube' (keeps the cube ahead) | 'turn' (turns with the body, slowly)
  turnMax: 180,
  examine: 'high',       // near the cube the camera moves in to examine: 'high' (from above) | 'side' | 'front' (looking back at you) | 'off'
  examineDist: 1.3,      // how close to the cube (m, in the room) before it starts moving in
  xray: true,            // near the cube the body fades so your arms and the cube show through          // how far the body itself may turn, left or right (180 = no limit)
  gain: 2,               // virtual metres per real metre
  ghost: false,          // a ring on the floor where P2 is, relative to the body
  // ---- debug ----
  hud: true, pip: true,   // pip: the live camera with the skeletons on it, always on to start
  // ---- floor (calibration, floor.js) ----
  calUse: 'both',        // the measured floor sets: 'both' | 'gain' (walk gain only) | 'cubes' (where cubes appear only)
  roomFit: 'mapped',     // 2 spaces, rooms of different sizes: 'mapped' (each maps onto the other) | 'smaller' (both use the smaller)
  edgeWarn: true, edgeDist: 0.3
};

// ---------------- small vector helpers (plain objects) ----------------
const V = (x, y, z) => ({ x, y, z });
const vadd = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const vsub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const vmul = (a, k) => V(a.x * k, a.y * k, a.z * k);
const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const vcross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const vlen = a => Math.hypot(a.x, a.y, a.z);
const vnorm = a => { let l = vlen(a); return l > 1e-6 ? vmul(a, 1 / l) : V(0, -1, 0); };
const vmid = (a, b) => V((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
const vlerp = (a, b, k) => V(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------- One Euro filter ----------------
class OneEuro {
  constructor() { this.x = null; this.dx = 0; this.t = 0; }
  static a(dt, c) { return 1 / (1 + 1 / (2 * Math.PI * c * dt)); }
  filter(v, t, minC, beta) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    let dt = Math.max(0.001, t - this.t); this.t = t;
    this.dx += OneEuro.a(dt, 1) * ((v - this.x) / dt - this.dx);
    this.x += OneEuro.a(dt, minC + beta * Math.abs(this.dx)) * (v - this.x);
    return this.x;
  }
}
function feel() { let s = SET.smooth; return { minC: 4 * Math.pow(0.0625, s), beta: 2 * Math.pow(0.1, s) }; }
function handK() { return 0.6 * Math.pow(0.25, SET.smooth); }   // smoothing for palm directions

// =====================================================================
// PEOPLE: slot 1 = P1 (body owner), slot 2 = P2 (the arm)
// =====================================================================
const JN = ['pelvis', 'neck', 'head', 'shL', 'elL', 'wrL', 'inL', 'piL', 'thL', 'shR', 'elR', 'wrR', 'inR', 'piR', 'thR',
  'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR'];
const TRK = { status: 'demo people', hz: 0, hzFrames: 0, hzStart: 0, dropouts: 0, since: performance.now() };
const people = { 1: null, 2: null };
const LOST_MS = 600;

// the palm from the body model's four hand points (wrist, index, pinky, thumb)
// palm normal: for a right hand, (wrist→fingers) × (index→pinky); the left hand is the mirror of that
function handFromPose(j, side, chir) {
  let wr = j['wr' + side], ix = j['in' + side], pk = j['pi' + side];
  if (!wr || !ix || !pk) return null;
  let u = vsub(vmid(ix, pk), wr), v = vsub(pk, ix);
  let n = vmul(vcross(u, v), (side === 'R' ? 1 : -1) * chir);
  return { n: vnorm(n), f: vnorm(u), open: null, src: 'pose' };
}

// one person into a slot. raw: { j: {name: V}, hands: {L, R} (hand model, optional), chir, lm }
function setPerson(id, key, raw, now, smoothIt) {
  let p = people[id];
  if (!p || (key && p.key && p.key !== key)) p = people[id] = { id, key, f: {}, j: null, hands: { L: null, R: null }, lastSeen: 0, lost: false, home: null, yaw: 0, vel: V(0, 0, 0) };
  p.key = key; p.chir = raw.chir === undefined ? 1 : raw.chir; p.lm = raw.lm || null;
  if (raw.img) { p.img = raw.img; p.size = raw.size; p.ankY = raw.ankY; p.dist = raw.dist; }
  let t = now / 1000, fz = feel(), j = {};
  for (let n of JN) {
    let q = raw.j[n]; if (!q) continue;
    if (!smoothIt) { j[n] = q; continue; }
    let f = p.f[n] || (p.f[n] = [new OneEuro(), new OneEuro(), new OneEuro()]);
    j[n] = V(f[0].filter(q.x, t, fz.minC, fz.beta), f[1].filter(q.y, t, fz.minC, fz.beta), f[2].filter(q.z, t, fz.minC, fz.beta));
  }
  if (p.j && p.lastSeen) {
    let dt = Math.max(0.005, (now - p.lastSeen) / 1000);
    p.vel = vlerp(p.vel, vmul(vsub(j.pelvis, p.j.pelvis), 1 / dt), 0.35);
  }
  p.j = j;
  // palms: from the hand model when it found this hand, else from the body model's hand points
  let k = smoothIt ? handK() : 1;
  for (let s of ['L', 'R']) {
    let h = (raw.hands && raw.hands[s]) || handFromPose(j, s, p.chir);
    if (!h) { p.hands[s] = null; continue; }
    let o = p.hands[s];
    if (!o || o.src !== h.src) p.hands[s] = { n: h.n, f: h.f, open: h.open, src: h.src };
    else {
      o.n = vnorm(vlerp(o.n, h.n, k)); o.f = vnorm(vlerp(o.f, h.f, k));
      o.open = h.open === null ? null : (o.open === null ? h.open : o.open + (h.open - o.open) * k);
    }
  }
  // which way the person faces: the shoulder and hip lines (0 = facing the camera, + = turned to their right)
  let r = vadd(vsub(j.shR, j.shL), vsub(j.hipR, j.hipL));
  let yaw = Math.atan2(r.z, r.x) * 180 / Math.PI;
  // always turn the short way round; and a jump of more than 120° in one frame is MediaPipe
  // swapping your left and right side (when you're side-on), not a real turn, so it's ignored
  let step = wrap180(yaw - p.yaw);
  if (!p.yawSeen) { p.yaw = yaw; p.yawSeen = true; }
  else if (!smoothIt || Math.abs(step) < 120) p.yaw = wrap180(p.yaw + step * (smoothIt ? 0.25 : 1));
  if (!p.home) p.home = { x: j.pelvis.x, z: j.pelvis.z };
  p.lastSeen = now; p.lost = false;
}
function agePeople(now) {
  for (let k of [1, 2]) {
    let p = people[k]; if (!p) continue;
    if (!p.lost && now - p.lastSeen > LOST_MS) { p.lost = true; TRK.dropouts++; logEvent('dropout', { slot: k }); }
    if (now - p.lastSeen > 4000) people[k] = null;
  }
}
function live(k) { let p = people[k]; return p && p.j && !p.lost ? p : null; }
// P2 as the game sees it (solo test: you are both)
function live2() { return SET.solo ? live(1) : live(2); }
// a fresh start: everyone's start spot is where they stand now
function rehome() { for (let k of [1, 2]) { if (people[k]) people[k].home = null; } DEMO.reset = true; }

// =====================================================================
// WEBCAM: MediaPipe pose (and the hand model, when chosen)
// =====================================================================
const MP = { video: null, stream: null, lm: null, halves: null, crop: null, hands: null, last: -1, running: false, found: [], handsFound: [], tick: 0 };
const MP_HALVES = [{ x0: 0, w: 0.6 }, { x0: 0.4, w: 0.6 }];
const MP_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
async function startMediaPipe(deviceId) {
  stopMediaPipe();
  TRK.status = 'MediaPipe: loading...';
  try {
    let waited = 0;
    while (!window.mediaPipeLoaded) {
      if (window.mediaPipeError) throw new Error('MediaPipe did not load (' + window.mediaPipeError + ')');
      await new Promise(r => setTimeout(r, 50)); waited += 50;
      if (waited > 20000) throw new Error('MediaPipe took too long to load');
    }
    MP.stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    MP.video = document.createElement('video'); MP.video.playsInline = true; MP.video.muted = true; MP.video.srcObject = MP.stream; await MP.video.play();
    let fs = await FilesetResolver.forVisionTasks(MP_URL);
    let model = SET.mpModel === 'full' ? 'pose_landmarker_full/float16/1/pose_landmarker_full.task' : 'pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
    let make = (d, n) => PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/' + model, delegate: d },
      runningMode: 'VIDEO', numPoses: n, minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.3 });
    let either = async (mk, n) => { try { return await mk('GPU', n); } catch (e) { return await mk('CPU', n); } };
    let split = SET.mpSplit && SET.spaces === 1 && SET.comp === 'off';
    if (split) {
      MP.halves = [await either(make, 2), await either(make, 2)];   // 2 per half, so a passer-by can't take your place
      MP.crop = MP_HALVES.map(() => { let c = document.createElement('canvas'); return { c, ctx: c.getContext('2d') }; });
    } else MP.lm = await either(make, SET.spaces === 1 && SET.comp === 'off' ? 3 : 2);   // a spare, so we can choose who to follow
    if (SET.hands === 'hand') {
      let mkH = (d, n) => HandLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: d },
        runningMode: 'VIDEO', numHands: n, minHandDetectionConfidence: 0.3, minHandPresenceConfidence: 0.3, minTrackingConfidence: 0.3 });
      MP.hands = await either(mkH, SET.spaces === 1 && SET.comp === 'off' ? 4 : 2);
    }
    MP.running = true; TRK.status = 'MediaPipe: running';
  } catch (e) { TRK.status = 'MediaPipe error: ' + (e.message || e); }
}
function stopMediaPipe() {
  MP.running = false;
  if (MP.stream) { MP.stream.getTracks().forEach(t => t.stop()); MP.stream = null; }
  for (let k of ['lm', 'hands']) { if (MP[k]) { try { MP[k].close(); } catch (e) {} MP[k] = null; } }
  if (MP.halves) { for (let h of MP.halves) { try { h.close(); } catch (e) {} } MP.halves = null; }
  MP.found = []; MP.handsFound = [];
}
// MediaPipe pose: 0 nose, 7/8 ears, 11/12 shoulders, 13/14 elbows, 15/16 wrists, 17/18 pinkies,
// 19/20 index fingers, 21/22 thumbs, 23/24 hips, 25/26 knees, 27/28 ankles (left = the person's own left)
const MPJ = { shL: 11, elL: 13, wrL: 15, piL: 17, inL: 19, thL: 21, shR: 12, elR: 14, wrR: 16, piR: 18, inR: 20, thR: 22,
  hipL: 23, knL: 25, anL: 27, hipR: 24, knR: 26, anR: 28 };
function mpTick(now) {
  if (!MP.running || !MP.video || MP.video.readyState < 2 || MP.video.currentTime === MP.last) return;
  MP.last = MP.video.currentTime;
  let W = MP.video.videoWidth, H = MP.video.videoHeight, tanH = Math.tan(SET.fov * Math.PI / 360), fpx = (W / 2) / tanH;
  let found = [];
  if (MP.halves) {
    MP_HALVES.forEach((h, k) => {
      let cr = MP.crop[k], cw = Math.round(W * h.w);
      if (cr.c.width !== cw || cr.c.height !== H) { cr.c.width = cw; cr.c.height = H; }
      cr.ctx.drawImage(MP.video, Math.round(W * h.x0), 0, cw, H, 0, 0, cw, H);
      let r = MP.halves[k].detectForVideo(cr.c, now);
      (r.landmarks || []).forEach((lm, i) => {
        let wl = r.worldLandmarks && r.worldLandmarks[i]; if (!wl) return;
        found.push({ lm: lm.map(q => ({ x: h.x0 + q.x * h.w, y: q.y, z: q.z })), wl });
      });
    });
    // someone standing in the overlap can be found by both halves: keep them once
    if (found.length === 2 && Math.abs((found[0].lm[23].x + found[0].lm[24].x) - (found[1].lm[23].x + found[1].lm[24].x)) / 2 < 0.08) found.pop();
  } else {
    let r = MP.lm.detectForVideo(MP.video, now);
    (r.landmarks || []).forEach((lm, i) => { let wl = r.worldLandmarks && r.worldLandmarks[i]; if (wl) found.push({ lm, wl }); });
  }
  // the hand model runs every other frame (it is heavy); its last result is kept for a moment
  if (MP.hands && (MP.tick++ % 2 === 0)) {
    let r = MP.hands.detectForVideo(MP.video, now);
    MP.handsFound = (r.landmarks || []).map((lm, i) => ({ lm, wl: r.worldLandmarks[i], t: now }));
  }
  MP.handsFound = MP.handsFound.filter(h => now - h.t < 250);
  MP.found = found.map(f => f.lm);
  let sx = SET.mirror ? -1 : 1, chir = SET.mirror ? 1 : -1, list = [];
  for (let { lm, wl } of found) {
    // how far away: real torso length (metres) against its size in the picture
    let sImg = vmid(lm[11], lm[12]), hImg = vmid(lm[23], lm[24]);
    let torsoPx = Math.max(20, Math.hypot((sImg.x - hImg.x) * W, (sImg.y - hImg.y) * H));
    let sW = vmid(wl[11], wl[12]), hW = vmid(wl[23], wl[24]);
    let torsoM = clamp(Math.hypot(sW.x - hW.x, sW.y - hW.y), 0.35, 0.7);
    let d = clamp(fpx * torsoM / torsoPx, 0.8, 8);
    let lat = (hImg.x - 0.5) * 2 * d * tanH;
    let pel = V(sx * lat, 0.95, d);
    let A = w => V(pel.x + sx * (w.x - hW.x), pel.y - (w.y - hW.y), pel.z + (w.z - hW.z));
    let j = { pelvis: pel };
    for (let n in MPJ) { j[n] = A(wl[MPJ[n]]); }
    j.neck = vmid(j.shL, j.shR); j.head = vmid(A(wl[7]), A(wl[8]));
    list.push({ key: null, j, chir, lm, hands: {}, size: torsoPx / H, img: { x: hImg.x, y: hImg.y }, ankY: Math.max(lm[27].y, lm[28].y), dist: d });   // size: torso height as a share of the picture
  }
  matchHands(list, sx, chir);
  ingest(list, now);
  TRK.status = 'MediaPipe: ' + list.length + ' tracked' + (MP.hands ? ' · ' + MP.handsFound.length + ' hands' : '');
}
// give each hand the hand model found to the nearest wrist the body model found
function matchHands(list, sx, chir) {
  if (!MP.hands || !MP.handsFound.length) return;
  let pairs = [];
  MP.handsFound.forEach((h, hi) => {
    list.forEach((p, pi) => {
      for (let [s, idx] of [['L', 15], ['R', 16]]) {
        let w = p.lm[idx]; if (!w) continue;
        let d = Math.hypot(h.lm[0].x - w.x, h.lm[0].y - w.y);
        if (d < 0.1) pairs.push({ d, hi, pi, s });
      }
    });
  });
  pairs.sort((a, b) => a.d - b.d);
  let usedH = new Set(), usedS = new Set();
  for (let q of pairs) {
    let key = q.pi + q.s; if (usedH.has(q.hi) || usedS.has(key)) continue;
    usedH.add(q.hi); usedS.add(key);
    list[q.pi].hands[q.s] = handFromModel(MP.handsFound[q.hi].wl, q.s, sx, chir);
  }
}
// palm normal, finger direction and how open the hand is, from the hand model's 21 points
function handFromModel(wl, side, sx, chir) {
  let a = i => V(sx * wl[i].x, -wl[i].y, wl[i].z);
  let u = vsub(a(9), a(0)), v = vsub(a(17), a(5));
  let n = vmul(vcross(u, v), (side === 'R' ? 1 : -1) * chir);
  let open = 0;
  for (let [pip, tip] of [[6, 8], [10, 12], [14, 16], [18, 20]]) {
    let ratio = vlen(vsub(a(tip), a(0))) / Math.max(0.01, vlen(vsub(a(pip), a(0))));
    open += clamp((ratio - 0.85) / 0.55, 0, 1) / 4;
  }
  return { n: vnorm(n), f: vnorm(u), open, src: 'hand' };
}
function cameraList() { return navigator.mediaDevices.enumerateDevices().then(d => d.filter(x => x.kind === 'videoinput')).catch(() => []); }

// a whole frame of people from the webcam
function ingest(list, now) {
  TRK.hzFrames++;
  if (now - TRK.hzStart > 1000) { TRK.hz = TRK.hzFrames * 1000 / (now - TRK.hzStart); TRK.hzFrames = 0; TRK.hzStart = now; }
  if (!list.length) return;
  // which slots this camera fills: you (computer partner), this laptop's person (2 spaces), or both (1 space)
  let slots = SET.comp !== 'off' ? [SET.comp === 'P2' ? 1 : 2] : SET.spaces === 2 ? [NET.myId] : [1, 2];
  let pick = LOCK.on ? pickLocked(list, slots, now) : pickBiggest(list, slots);
  for (let k of slots) { if (pick[k]) setPerson(k, null, pick[k], now, true); }
}

// WHO IS FOLLOWED. Before START: the biggest person in the picture (in 1 space the two
// biggest, P1 on screen left). At START that choice is locked: from then on each slot
// only follows the body nearest where its person was, of about the same size, so other
// people walking through the picture are ignored.
const LOCK = { on: false, slots: {} };
function pickBiggest(list, slots) {
  let big = list.slice().sort((a, b) => b.size - a.size), out = {};
  if (slots.length === 1) { out[slots[0]] = big[0]; return out; }
  if (big.length >= 2) { let two = big.slice(0, 2).sort((a, b) => a.j.pelvis.x - b.j.pelvis.x); out[1] = two[0]; out[2] = two[1]; return out; }
  let p = big[0], best = null, bd = 0.5;
  for (let k of [1, 2]) {
    let s = people[k]; if (!s || !s.j) continue;
    let d = Math.hypot(s.j.pelvis.x - p.j.pelvis.x, s.j.pelvis.z - p.j.pelvis.z); if (d < bd) { bd = d; best = k; }
  }
  out[best || (p.j.pelvis.x < 0 ? 1 : 2)] = p;
  return out;
}
function pickLocked(list, slots, now) {
  let out = {}, used = new Set();
  for (let k of slots) {
    let L = LOCK.slots[k];
    // nobody was there at START: take the biggest unclaimed person now, and lock onto them
    if (!L) {
      let free = list.map((c, i) => i).filter(i => !used.has(i)).sort((a, b) => list[b].size - list[a].size);
      if (!free.length) continue;
      let c = list[free[0]]; used.add(free[0]); out[k] = c;
      LOCK.slots[k] = { x: c.img.x, y: c.img.y, size: c.size, t: now };
      continue;
    }
    let reach = now - L.t > 1500 ? 0.6 : 0.25, best = -1;   // gone a while: look wider for them
    list.forEach((c, i) => {
      if (used.has(i)) return;
      let r = c.size / L.size, d = Math.hypot(c.img.x - L.x, c.img.y - L.y);
      if (r < 0.6 || r > 1.65 || d >= reach) return;
      reach = d; best = i;
    });
    if (best < 0) continue;
    let c = list[best]; used.add(best); out[k] = c;
    L.x = c.img.x; L.y = c.img.y; L.size += (c.size - L.size) * 0.1; L.t = now;
  }
  return out;
}
// lock whoever is being followed right now (webcam only; the demo and computer people need no lock)
function lockPeople() {
  LOCK.slots = {};
  for (let k of [1, 2]) { let p = people[k]; if (p && p.img && p.key !== 'computer') LOCK.slots[k] = { x: p.img.x, y: p.img.y, size: p.size, t: performance.now() }; }
  LOCK.on = SET.source === 'mediapipe';
  logEvent('lock', { slots: Object.keys(LOCK.slots).join(',') });
}
function unlockPeople() { LOCK.on = false; LOCK.slots = {}; }

// =====================================================================
// MADE-UP PEOPLE: the demo, and the computer partner
// =====================================================================
// a standing person in A space. arms: { L|R: { wr (wrist, A space), n, f } } or null = hanging
function makePerson(px, pz, walkPhase, walkAmt, arms) {
  let j = {}, bob = Math.abs(Math.sin(walkPhase)) * 0.02 * walkAmt;
  j.pelvis = V(px, 0.95 + bob, pz);
  j.hipL = V(px - 0.1, 0.93 + bob, pz); j.hipR = V(px + 0.1, 0.93 + bob, pz);
  j.shL = V(px - 0.19, 1.42 + bob, pz); j.shR = V(px + 0.19, 1.42 + bob, pz);
  j.neck = vmid(j.shL, j.shR); j.head = V(px, 1.62 + bob, pz + 0.01);
  for (let [s, sg] of [['L', -1], ['R', 1]]) {
    let sw = Math.sin(walkPhase + (s === 'L' ? 0 : Math.PI)) * 0.22 * walkAmt;
    let hip = j['hip' + s];
    j['kn' + s] = V(hip.x, 0.52 + Math.max(0, sw) * 0.2, pz - sw * 0.5);
    j['an' + s] = V(hip.x, 0.09 + Math.max(0, sw) * 0.1, pz - sw);
    let sh = j['sh' + s], a = arms && arms[s];
    let wr, n, f;
    if (a) { wr = a.wr; n = a.n; f = a.f; }
    else {
      let swing = -Math.sin(walkPhase + (s === 'L' ? 0 : Math.PI)) * 0.12 * walkAmt;
      wr = V(sh.x + sg * 0.05, sh.y - 0.56, sh.z - swing); n = V(-sg, 0, 0); f = V(0, -1, 0);
    }
    let el = elbowFor(sh, wr, sg);
    j['el' + s] = el; j['wr' + s] = wr;
    // hand points such that the palm normal comes out as n (see handFromPose)
    let v = vmul(vcross(n, f), (s === 'R' ? 1 : -1) * 0.06), tip = vadd(wr, vmul(f, 0.08));
    j['in' + s] = vsub(tip, vmul(v, 0.5)); j['pi' + s] = vadd(tip, vmul(v, 0.5)); j['th' + s] = vsub(j['in' + s], vmul(f, 0.04));
  }
  return { j, chir: 1, lm: null };
}
// two-bone arm: where the elbow goes for a wrist target (elbow points down and out)
function elbowFor(sh, wr, sg) {
  let T = vsub(wr, sh), d = clamp(vlen(T), 0.12, 0.565), t = vmul(T, 1 / Math.max(1e-4, vlen(T)));
  let a = 0.30, b = 0.27, cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  let pole = V(sg * 0.35, -1, 0.15); pole = vnorm(vsub(pole, vmul(t, vdot(pole, t))));
  return vadd(sh, vadd(vmul(t, a * cosA), vmul(pole, a * sinA)));
}

// The demo: P1 walks to the cube; P2 follows, but sometimes gets distracted and is left
// behind (the arm falls), then hurries to catch up (it comes back). Together they lift.
const DEMO = { reset: true, t: 0, p1: null, p2: null };
function demoPeople(now, dt, which) {
  if (DEMO.reset || !DEMO.p1) {
    DEMO.reset = false;
    DEMO.p1 = { x: 0, z: 2.8, home: { x: 0, z: 2.8 }, phase: 'walk', t: 0, walk: 0, hands: null, trip: 0 };
    let x2 = SET.spaces === 1 ? 0.9 : 0;
    DEMO.p2 = { x: x2, z: 2.8, home: { x: x2, z: 2.8 }, hist: [], t: 0, distracted: 0, walk: 0 };
    DEMO.score = TASK.score;
  }
  let A = DEMO.p1, B = DEMO.p2, out = {};
  // ---------- P1 ----------
  A.t += dt;
  let stand = TASK.standPoint ? TASK.standPoint() : null;   // where the body should stand to reach the cube (world)
  let reachHands = null, moving = 0;
  if (stand) {
    // world → this person's real floor position
    let gr = TASK.realStand(), gx = gr.x, gz = gr.z;
    if (A.phase === 'walk') {
      let dx = gx - A.x, dz = gz - A.z, d = Math.hypot(dx, dz), step = 0.55 * dt;
      if (d > 0.02) { A.x += dx / d * Math.min(step, d); A.z += dz / d * Math.min(step, d); moving = 1; }
      else { A.phase = 'reach'; A.t = 0; }
    } else if (A.phase === 'reach') {
      reachHands = TASK.handTargets(Math.min(1, A.t / 1.0), 0);
      if (CUBE.held && A.t > 1.2) { A.phase = 'lift'; A.t = 0; }
      if (A.t > 9) { A.phase = 'walk'; A.t = 0; }   // give up and try again
    } else if (A.phase === 'lift') {
      reachHands = TASK.handTargets(1, Math.min(1, A.t / 1.4));
      if (TASK.score !== DEMO.score) { DEMO.score = TASK.score; A.phase = 'let go'; A.t = 0; }
      if (!CUBE.held && A.t > 1.5) { A.phase = 'reach'; A.t = 0; }
    } else if (A.phase === 'let go') {
      reachHands = TASK.handTargets(1 - Math.min(1, A.t / 0.6), 1, 0.2 * Math.min(1, A.t / 0.4));
      if (A.t > 0.9) { A.phase = 'walk'; A.t = 0; A.trip++; }
    }
  }
  A.walk += dt * 7 * moving;
  let toA = h => h ? { wr: vadd(V(A.x, 0.95, A.z), h.wr), n: h.n, f: h.f } : null;   // pelvis-relative → this person
  let armsA = reachHands ? { L: toA(reachHands.L), R: toA(reachHands.R) } : null;
  out[1] = makePerson(A.x, A.z, A.walk, moving, armsA);
  // ---------- P2 ----------
  // follows P1's movement a little late; every other trip it gets distracted for a while
  B.hist.push({ t: now, x: A.x - A.home.x, z: A.z - A.home.z, hands: reachHands });
  while (B.hist.length > 2 && now - B.hist[1].t > 250) B.hist.shift();
  let late = B.hist[0];
  if (A.phase === 'walk' && A.t > 0.7 && A.t < 0.8 && A.trip % 2 === 0 && !B.distracted ) B.distracted = 2.4;
  let tx = B.home.x + late.x, tz = B.home.z + late.z, bmove = 0;
  if (B.distracted > 0) B.distracted -= dt;
  else {
    let dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz), sp = (FOLLOW.state === 'apart' ? 1.1 : 0.8) * dt;
    if (d > 0.01) { B.x += dx / d * Math.min(sp, d); B.z += dz / d * Math.min(sp, d); bmove = 1; }
  }
  B.walk += dt * 7 * bmove;
  // while distracted it waves its arm a little (so the lying arm has something to follow)
  let toB = h => h ? { wr: vadd(V(B.x, 0.95, B.z), h.wr), n: h.n, f: h.f } : null;
  let armsB = late.hands ? { L: toB(late.hands.L), R: toB(late.hands.R) } : null;
  if (B.distracted > 0) {
    let w = now / 1000, s = 'R';
    armsB = { L: null, R: { wr: V(B.x + 0.25 + Math.sin(w * 3) * 0.12, 1.25 + Math.sin(w * 5) * 0.12, B.z - 0.25), n: V(0, 0, -1), f: V(0, 1, 0) } };
    if (SET.own === 'L' || (SET.own === 'custom' && SET.ownL === 2 && SET.ownR !== 2)) { s = 'L'; armsB = { R: null, L: { wr: V(B.x - 0.25 + Math.sin(w * 3) * 0.12, 1.25 + Math.sin(w * 5) * 0.12, B.z - 0.25), n: V(0, 0, -1), f: V(0, 1, 0) } }; }
  }
  out[2] = makePerson(B.x, B.z, B.walk, bmove, armsB);
  return which ? out[which] : out;
}

// The computer partner, when testing alone with the webcam.
//   plays P2 (you are P1): it copies your body a little late and walks after you,
//     but no faster than its top speed, so walking briskly leaves the arm behind.
//     Its arms copy yours, late, so you can still work the possessed arm yourself.
//   plays P1 (you are P2): it walks the body to the cube by itself and reaches
//     with its own hand; you follow and bring the arm.
const COMP = { hist: [], x: null, z: null };
function compTick(now, dt) {
  if (SET.comp === 'off' || SET.source !== 'mediapipe') return;
  if (SET.comp === 'P1') { setPerson(1, 'computer', demoPeople(now, dt, 1), now, false); return; }
  let me = live(1); if (!me) return;
  COMP.hist.push({ t: now, j: me.j, hands: me.hands, home: me.home });
  while (COMP.hist.length > 2 && now - COMP.hist[1].t > SET.compDelay * 1000) COMP.hist.shift();
  let late = COMP.hist[0], home = late.home || { x: late.j.pelvis.x, z: late.j.pelvis.z };
  let off = SET.spaces === 1 ? 0.9 : 0;
  if (COMP.x === null || !people[2]) { COMP.x = home.x + off; COMP.z = home.z; }
  let tx = home.x + off + (late.j.pelvis.x - home.x), tz = late.j.pelvis.z;
  let dx = tx - COMP.x, dz = tz - COMP.z, d = Math.hypot(dx, dz), step = SET.compSpeed * dt;
  if (d > 1e-4) { COMP.x += dx / d * Math.min(step, d); COMP.z += dz / d * Math.min(step, d); }
  let sh = V(COMP.x - late.j.pelvis.x, 0, COMP.z - late.j.pelvis.z), j = {};
  for (let n of JN) { if (late.j[n]) j[n] = vadd(late.j[n], sh); }
  let hands = {};
  for (let s of ['L', 'R']) { let h = late.hands[s]; if (h) hands[s] = { n: h.n, f: h.f, open: h.open, src: h.src }; }
  setPerson(2, 'computer', { j, hands, chir: me.chir, lm: null }, now, false);
}

// ---------------- sources ----------------
let demoLast = 0;
function setSource(src, deviceId) {
  SET.source = src;
  people[1] = null; people[2] = null; DEMO.reset = true; COMP.hist = []; COMP.x = null;
  if (src === 'mediapipe') startMediaPipe(deviceId);
  else { stopMediaPipe(); TRK.status = 'demo people'; }
}
function trackTick(now, dt) {
  if (SET.source === 'mediapipe') { try { mpTick(now); } catch (e) { TRK.status = 'MediaPipe error: ' + e.message; } compTick(now, dt); }
  else if (now - demoLast > 30) {
    let ddt = Math.min(0.1, (now - (demoLast || now)) / 1000); demoLast = now;
    let ppl = demoPeople(now, ddt);
    let linked = SET.spaces === 2 && NET.connected;
    for (let k of [1, 2]) { if (!linked || k === NET.myId) setPerson(k, 'demo' + k, ppl[k], now, false); }
    TRK.hzFrames++;
    if (now - TRK.hzStart > 1000) { TRK.hz = TRK.hzFrames * 1000 / (now - TRK.hzStart); TRK.hzFrames = 0; TRK.hzStart = now; }
  }
  agePeople(now);
}
