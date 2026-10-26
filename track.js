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
  // ---- the game (Bubble Pop: bubbles.js, from prototypes/bubble-pop-build.md) ----
  game: 'carry',         // 'carry' (carry the cube to the other plinth) | 'bubbles' (Bubble Pop)
  bubbleN: 8,            // bubbles in a round
  roundS: 60,            // seconds in a round
  legSplit: false,       // P2 gets one leg; the body walks only when both step the same way (hurdle walk)
  legP2: 'R',            // which leg P2 gets when they're split
  jumpBoost: true,       // both jumping together = twice as high
  sharedOnly: false,     // some high bubbles need the shared jump (needs the legs split and the boost)
  drift: false,          // bubbles drift slowly
  jumpThr: 0.07,         // a hop counts once hips and shoulders rise this far together (m)
  sound: true,           // pops, landings and the timer, on this laptop
  bodyFall: 'whole',     // legs split, walking apart: the whole body falls. 'whole' (collapses on the spot) | 'side' (tips over P2's side) | 'off'
  bubFollow: true,
  bubXray: true,         // Bubble Pop: the body is see-through (arms a little less), so you can see bubbles behind it       // Bubble Pop: the follow rule as in carrying the cube (walk apart and P2's arm falls off; a lifeless hand can't pop)
  // ---- tracking ----
  source: 'mediapipe',   // 'mediapipe' (webcam) | 'demo' (two made-up people, only when you choose it)
  tracker: 'webcam',     // 'webcam' (MediaPipe) | 'iphone' (the Body Stream app: Apple body tracking, real depth)
  phoneIP: '',
  headLook: true,        // first person (and Arms only from your eyes) looks wherever your head points
  pipDepth: true,        // iPhone ultra-wide + LiDAR: outline the depth zone and ring the measured joints in the camera view           // the address the Body Stream app shows
  mirror: true, smooth: 1.0, solo: false,   // smooth 1.0: Atul's pick after testing (25 Oct)
  reach: 'picture',      // reaching toward the camera: 'picture' (from how short the arm looks) | 'model' (the body model's own depth guess)
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
  lag: 0.25,             // how late the lying arm follows (s)
  stillZone: 0.025,      // where you stand: wobbles smaller than this (m; 1.6× in depth) are ignored, so standing still stays still (0 = off)
  lyingStrength: 0.7,    // how strongly the lying arm follows
  returnStyle: 'strings',// 'strings' (jerky, dangling, a little too slow) | 'glide' (smooth, mechanical)
  returnTime: 1.4,       // seconds the strings take
  overshoot: true,       // snaps into the shoulder with a small overshoot
  strings: true,         // show the strings while lifeless or being pulled back
  // ---- picking up ----
  holders: 'any',        // 'any' hand | 'possessed' hands only
  grip: 'touch',         // 'squeeze' | 'palm' (palm facing) | 'touch' (just touching) | 'dwell'
  assist: 0.85,          // near the cube, hands are drawn onto its sides (0 = off)
  edgeBuffer: 0.45,      // new cubes stand at least this far (m) inside your measured floor, so your reach stays in the camera
  touch: 0.08,           // how close a palm has to be to count as touching (m)
  armsOnly: false,       // ARMS ONLY: the body stays put, no falling off, no tasks: just your arms (and P2's), to feel the tracking
  armsView: 'first',     // arms only, the view: 'first' (from your eyes, looking at your hands) | 'mirror' (facing you) | 'side'
  warmup: false,         // an optional warm-up first: lift one cube above the waist and hold it; then the game (carry it to the other plinth)
  cheat: true,           // cheat mode (all helpers on) or regular (all off); see CHEAT in ui.js
  reachLock: true,       // near the cube (and near the plinth while holding it), your place in the room holds still: only a real step away lets go
  solid: true,           // you can't walk through the cube or the plinths
  seeThroughCube: true,  // the held cube turns see-through, so you can see where to set it down
  fpNear: true,          // the view switches to first person near the cube, and again near the plinth to set it down on
  thread: true,          // a thread from the fallen arm to the body's shoulder
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
  ghost: 'auto',         // where P2 is in the room (a shadow ring, on a thread from the shoulder): 'auto' (while the arm is off) | 'always' | 'off'
  depthDrift: 0.5,       // how much stepping toward/away from the camera counts in the drift (leaning in to reach looks like a step)
  netSmooth: 60,         // P2's laptop: how far behind (ms) it shows P1's world, so it moves smoothly instead of in jumps
  // ---- debug ----
  tiltFix: true,         // measure the camera's tilt (laptop lid, a camera mounted high) and stand the body upright
  bendHold: true,        // while you bend, your place on the floor holds still (bending can't move your feet)
  gestures: true,        // T-pose: start, then finish, measuring the floor (walking it)
  quickHands: false,     // elbows, wrists and hands are smoothed less, so they keep up with fast moves
  hud: true, pip: true, pipRaw: false,   // pipRaw: the raw detection faintly under the smoothed skeleton   // pip: the live camera with the skeletons on it, always on to start
  // ---- floor (calibration, floor.js) ----
  calUse: 'both',        // the measured floor sets: 'both' | 'gain' (walk gain only) | 'cubes' (where cubes appear only)
  roomFit: 'mapped',     // 2 spaces, rooms of different sizes: 'mapped' (each maps onto the other) | 'smaller' (both use the smaller)
  edgeWarn: true, edgeDist: 0.3,
  floorFrom: 'walked'    // the floor comes from: 'walked' (walking to its edges) | 'drawn' (its corners clicked on the camera picture, floordraw.js)
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
// SMOOTHING, as in the main build (V13.1): every point is filtered in the camera picture (pixels),
// once per camera frame, with the One Euro filter; then the body glides from where it was drawn to
// the newest position over one camera interval, so it moves at the screen's rate.
// The feel slider: 0 = most responsive, 0.5 = the main build's default, 1 = smoothest.
function feelPx() { let s = SET.smooth; return { minC: 4 * Math.pow(0.0625, s), beta: 0.02 * Math.pow(0.1, s), glide: Math.min(1, 0.3 + 1.4 * s) }; }
// for the computer partner and anything else still smoothed in metres
function feel() { let s = SET.smooth; return { minC: 4 * Math.pow(0.0625, s), beta: 2 * Math.pow(0.1, s) }; }
// where you stand: much calmer than the limbs (distance is the noisiest guess, and the walk gain multiplies it)
function feelRoot() { let s = SET.smooth; return { minC: 1.2 * Math.pow(0.15, s), beta: 1.5 * Math.pow(0.2, s) }; }
function handK() { return Math.min(1, 0.85 * Math.pow(0.3, SET.smooth)); }   // smoothing for palm directions

// =====================================================================
// PEOPLE: slot 1 = P1 (body owner), slot 2 = P2 (the arm)
// =====================================================================
const JN = ['pelvis', 'neck', 'head', 'nose', 'shL', 'elL', 'wrL', 'inL', 'piL', 'thL', 'shR', 'elR', 'wrR', 'inR', 'piR', 'thR',
  'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR'];
const TRK = { status: 'demo people', hz: 0, hzFrames: 0, hzStart: 0, dropouts: 0, since: performance.now() };
const people = { 1: null, 2: null };
const LOST_MS = 600, NET_LOST_MS = 1500;   // P2 over the link may pause a moment without being gone

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
  // jumping (Bubble Pop): how far hips and shoulders have risen together (m), and the lowest it was in the
  // last 0.4 s, so a quick hop counts and standing up slowly doesn't (whatever the camera's frame rate)
  if (raw.up !== undefined) {
    p.up = raw.up; let H = p.upHist || (p.upHist = []);
    H.push([now, raw.up]); while (H.length > 1 && now - H[0][0] > 400) H.shift();
    p.upMin = H.reduce((m, e) => Math.min(m, e[1]), raw.up);
  }
  if (raw.ankY !== undefined) p.ankY = raw.ankY;
  if (raw.img) { p.img = raw.img; p.size = raw.size; p.ankY = raw.ankY; p.dist = raw.dist; p.distT = raw.distT; p.lmS = raw.lmS; }
  let t = now / 1000, fz = feel(), j = {}, glide = smoothIt === 'glide';
  if (smoothIt === true) {
    for (let n of JN) {
      let q = raw.j[n]; if (!q) continue;
      let f = p.f[n] || (p.f[n] = [new OneEuro(), new OneEuro(), new OneEuro()]);
      j[n] = V(f[0].filter(q.x, t, fz.minC, fz.beta), f[1].filter(q.y, t, fz.minC, fz.beta), f[2].filter(q.z, t, fz.minC, fz.beta));
    }
  } else { for (let n of JN) { if (raw.j[n]) j[n] = raw.j[n]; } }
  let last = p.jTo || p.j;
  if (last && p.lastSeen) {
    let dt = Math.max(0.005, (now - p.lastSeen) / 1000);
    p.vel = vlerp(p.vel, vmul(vsub(j.pelvis, last.pelvis), 1 / dt), 0.35);
  }
  if (glide) {
    // glide from where it's drawn now to the newest position, over about one camera interval
    let interval = p.lastSeen ? Math.min(150, Math.max(16, now - p.lastSeen)) : 0;
    // (the main build's V13.1 fix) the glide is timed from the frame the body was last DRAWN, not from
    // now: when a new camera picture arrives every screen frame (normal on a real laptop), timing it from
    // now restarted it at 0% every frame and the body stayed frozen where it was first seen
    p.jFrom = p.j ? Object.assign({}, p.j) : j; p.jTo = j; p.gDur = interval * feelPx().glide;
    p.gT0 = p.shownT !== undefined && p.shownT < now ? p.shownT : now - 16;
    if (!p.j) p.j = j;
  } else { p.jTo = null; p.j = j; }
  // palms: from the hand model when it found this hand, else from the body model's hand points
  let k = smoothIt === true ? handK() : glide ? Math.min(1, handK() * 1.6) : 1;
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
  else if (!smoothIt || Math.abs(step) < 120) p.yaw = wrap180(p.yaw + step * (smoothIt ? 0.35 : 1));
  if (!p.home) p.home = { x: j.pelvis.x, z: j.pelvis.z };
  p.lastSeen = now; p.lost = false;
}
// each screen frame: the webcam people glide toward their newest position
function glidePeople(now) {
  for (let k of [1, 2]) {
    let p = people[k]; if (!p || !p.jTo) continue;
    let u = p.gDur > 0 ? clamp((now - p.gT0) / p.gDur, 0, 1) : 1, j = {};
    for (let n in p.jTo) { let a = p.jFrom[n], b = p.jTo[n]; j[n] = a ? vlerp(a, b, u) : b; }
    p.j = j; p.shownT = now;
  }
}
function agePeople(now) {
  for (let k of [1, 2]) {
    let p = people[k]; if (!p) continue;
    if (!p.lost && now - p.lastSeen > (p.key === 'net' ? NET_LOST_MS : LOST_MS)) { p.lost = true; TRK.dropouts++; logEvent('dropout', { slot: k }); }
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
async function startMediaPipe(deviceId, fromPhone) {
  stopMediaPipe();
  TRK.status = 'MediaPipe: loading...';
  try {
    let waited = 0;
    while (!window.mediaPipeLoaded) {
      if (window.mediaPipeError) throw new Error('MediaPipe did not load (' + window.mediaPipeError + ')');
      await new Promise(r => setTimeout(r, 50)); waited += 50;
      if (waited > 20000) throw new Error('MediaPipe took too long to load');
    }
    if (fromPhone) {
      // the iPhone's ultra-wide pictures arrive over Wi-Fi (phone.js) and are drawn onto this canvas, which MediaPipe reads
      MP.video = document.createElement('canvas'); MP.video.width = 960; MP.video.height = 540; MP.fromPhone = true;
      startPhone(PHONE_WANT[SET.tracker] || 'camera');
    } else {
      MP.fromPhone = false;
      MP.stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      MP.video = document.createElement('video'); MP.video.playsInline = true; MP.video.muted = true; MP.video.srcObject = MP.stream; await MP.video.play();
      // the field of view, from the camera's name (floordraw.js): C920 ≈ 70°, C270 ≈ 49°, others 70°
      if (typeof setWebcamFov === 'function') { let tr = MP.stream.getVideoTracks()[0]; setWebcamFov(tr && tr.label); }
    }
    let fs = await FilesetResolver.forVisionTasks(MP_URL);
    let model = SET.mpModel === 'full' ? 'pose_landmarker_full/float16/1/pose_landmarker_full.task' : 'pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
    let make = (d, n) => PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/' + model, delegate: d },
      runningMode: 'VIDEO', numPoses: n, minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.3 });
    let either = async (mk, n) => { try { let r = await mk('GPU', n); MP.delegate = 'GPU'; return r; } catch (e) { MP.delegate = 'CPU (GPU failed)'; return await mk('CPU', n); } };
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
    if (SET.tracker === 'webdepth' && !fromPhone) {
      // webcam + iPhone depth: a light second body model reads the phone's pictures, to line the two cameras up (phone.js)
      MP.phoneLm = await either((d, n) => PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: d },
        runningMode: 'VIDEO', numPoses: n, minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.3 }), 1);
      alignReset();
      startPhone('depth');
    }
    MP.running = true; TRK.status = 'MediaPipe: running';
  } catch (e) { TRK.status = 'MediaPipe error: ' + (e.message || e); }
}
function stopMediaPipe() {
  MP.running = false;
  if (MP.stream) { MP.stream.getTracks().forEach(t => t.stop()); MP.stream = null; }
  for (let k of ['lm', 'hands', 'phoneLm']) { if (MP[k]) { try { MP[k].close(); } catch (e) {} MP[k] = null; } }
  if (MP.halves) { for (let h of MP.halves) { try { h.close(); } catch (e) {} } MP.halves = null; }
  MP.found = []; MP.handsFound = []; MP.fromPhone = false;
  if (typeof stopPhone === 'function') stopPhone();
}
// MediaPipe pose: 0 nose, 7/8 ears, 11/12 shoulders, 13/14 elbows, 15/16 wrists, 17/18 pinkies,
// 19/20 index fingers, 21/22 thumbs, 23/24 hips, 25/26 knees, 27/28 ankles (left = the person's own left)
const MPJ = { shL: 11, elL: 13, wrL: 15, piL: 17, inL: 19, thL: 21, shR: 12, elR: 14, wrR: 16, piR: 18, inR: 20, thR: 22,
  hipL: 23, knL: 25, anL: 27, hipR: 24, knR: 26, anR: 28 };
function mpTick(now) {
  if (!MP.running || !MP.video) return;
  if (MP.fromPhone) {   // a new picture from the iPhone? draw it onto the canvas MediaPipe reads
    if (!PHONE.bmp || PHONE.bmpN === MP.last) return;
    MP.last = PHONE.bmpN;
    if (MP.video.width !== PHONE.bmp.width || MP.video.height !== PHONE.bmp.height) { MP.video.width = PHONE.bmp.width; MP.video.height = PHONE.bmp.height; }
    MP.video.getContext('2d').drawImage(PHONE.bmp, 0, 0);
  } else {
    if (MP.video.readyState < 2 || MP.video.currentTime === MP.last) return;
    MP.last = MP.video.currentTime;
  }
  let W = MP.video.videoWidth || MP.video.width, H = MP.video.videoHeight || MP.video.height, tanH = Math.tan(SET.fov * Math.PI / 360), fpx = (W / 2) / tanH;
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
  processFound(found, now, W, H);
  if (MP.phoneLm) alignTick(now, found);   // webcam + iPhone depth: keep the two cameras lined up
}
// everything after the body model: who is who, filtering, and building each followed person in metres
function processFound(found, now, W, H) {
  let tanH = Math.tan(SET.fov * Math.PI / 360), fpx = (W / 2) / tanH;
  // the log keeps the last 20 s of what the camera's body model saw, so a test can be replayed exactly
  if (typeof LOG !== 'undefined') {
    let r4 = v => Math.round(v * 10000) / 10000;
    LOG.cam.push({ t: Math.round(now), W, H, f: found.map(({ lm, wl }) => ({ lm: lm.map(q => [r4(q.x), r4(q.y), r4(q.visibility || 0)]), wl: wl.map(q => [r4(q.x), r4(q.y), r4(q.z)]) })) });
    while (LOG.cam.length && now - LOG.cam[0].t > 20000) LOG.cam.shift();
  }
  MP.found = found.map(f => f.lm);
  let sx = SET.mirror ? -1 : 1, chir = SET.mirror ? 1 : -1, list = [];
  // first, just enough to tell people apart (size and place in the picture)
  for (let { lm, wl } of found) {
    let sImg = vmid(lm[11], lm[12]), hImg = vmid(lm[23], lm[24]);
    // a body upside down (shoulders below the hips) is the body model misreading a deep bend or a head
    // leaving the top of the picture, never a real pose here: skip that frame instead of flinging the body
    let sWy = (wl[11].y + wl[12].y) / 2, hWy = (wl[23].y + wl[24].y) / 2;
    if (sWy > hWy || sImg.y > hImg.y) { TRK.flipped = (TRK.flipped || 0) + 1; continue; }
    let torsoPx = Math.max(20, Math.hypot((sImg.x - hImg.x) * W, (sImg.y - hImg.y) * H));
    list.push({ key: null, lm, wl, chir, hands: {}, size: torsoPx / H, img: { x: hImg.x, y: hImg.y } });
  }
  matchHands(list, sx, chir);
  // then the followed people: filtered in the picture, and built into metres
  let picked = pickPeople(list, now);
  for (let k in picked) { let c = picked[k]; setPerson(+k, null, buildPerson(+k, c, now, W, H, fpx, tanH, sx), now, 'glide'); }
  TRK.status = 'MediaPipe' + (MP.delegate ? ' on ' + MP.delegate : '') + ': ' + list.length + ' tracked' + (MP.hands ? ' · ' + MP.handsFound.length + ' hands' : '');
}

// ---------------- one followed person, from the camera picture ----------------
// where the body stands: the hips-centred 3D points P (metres; x right, y down, z away, as in the picture)
// and where each appears in the picture (u, v pixels). For a body at T, a point appears at
// u = cx + f (Px + Tx) / (Pz + Tz); rearranged, that's linear in T, so least squares over all points.
const PLACE_PTS = [0, 7, 8, 11, 12, 13, 14, 23, 24, 25, 26];
function solvePlace(lm, wl, W, H, f) {
  let A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0], n = 0, cx = W / 2, cy = H / 2;
  let add = (row, rhs, w) => { for (let i = 0; i < 3; i++) { for (let k = 0; k < 3; k++) { A[i][k] += w * row[i] * row[k]; } b[i] += w * row[i] * rhs; } };
  for (let i of PLACE_PTS) {
    let q = lm[i], P = wl[i]; if (!q || !P) continue;
    let vis = q.visibility === undefined ? 1 : q.visibility;
    if (vis < 0.5 || q.x < 0.01 || q.x > 0.99 || q.y < 0.01 || q.y > 0.99) continue;
    let u = q.x * W - cx, v = q.y * H - cy, w = vis * (i >= 11 && i <= 24 ? 2 : 1);   // shoulders and hips count double
    add([f, 0, -u], u * P.z - f * P.x, w);
    add([0, f, -v], v * P.z - f * P.y, w);
    n++;
  }
  if (n < 4) return null;
  // 3×3 solve (Cramer)
  let det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  let D = det(A); if (Math.abs(D) < 1e-9) return null;
  let col = k => A.map((r, i) => r.map((v, j) => j === k ? b[i] : v));
  return { x: det(col(0)) / D, y: det(col(1)) / D, z: det(col(2)) / D };
}
const MPF = {};   // per slot: the One Euro filters for the picture points and the 3D points, and a little memory
const QUICK = new Set([13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);   // elbows, wrists, hands
function filterPts(arr, store, t, scale, withZ, fz) {
  return arr.map((q, i) => {
    if (!q) return q;
    let f = store[i] || (store[i] = { x: new OneEuro(), y: new OneEuro(), z: new OneEuro() });
    // hands move fast: smoothed less when still, and much less when moving, so they keep up
    let mc = fz.minC, b = fz.beta;
    if (SET.quickHands && QUICK.has(i)) { mc *= 1.6; b *= 3; }
    return { x: f.x.filter(q.x * scale.x, t, mc, b) / scale.x, y: f.y.filter(q.y * scale.y, t, mc, b) / scale.y,
      z: withZ ? f.z.filter(q.z * scale.x, t, mc, b) / scale.x : q.z, visibility: q.visibility };
  });
}
// T-POSE (arms straight out to the sides, held a second): from across the room, start measuring the floor,
// walk it (the boundary grows live in the camera view), T-pose again to finish. Arms have to come down
// before it counts again. (Raising both hands is now only for getting a fallen body back up.)
const GEST = { since: 0, armed: true, k: 0, slot: 0 };
function gestureTick(slot, lm, now) {
  if (!SET.gestures || typeof RUN === 'undefined' || !calSlots().includes(slot) || (typeof FD !== 'undefined' && FD.on)) return;
  let active = CAL.active || RUN.phase === 'setup';
  let ok = q => q && (q.visibility === undefined || q.visibility > 0.5);
  let up = active && !calStepDone() || CAL.active ? (active && typeof fdTpose === 'function' && fdTpose({ lmS: lm })) : false;
  if (!up) { if (GEST.slot === slot) { GEST.since = 0; GEST.k = 0; GEST.armed = true; } return; }
  GEST.slot = slot;
  if (!GEST.armed) return;
  if (!GEST.since) GEST.since = now;
  GEST.k = clamp((now - GEST.since) / 1000, 0, 1);
  if (GEST.k >= 1) { GEST.armed = false; GEST.since = 0; GEST.k = 0; gestureAction(); }
}
function gestureAction() {
  if (CAL.active || (RUN.phase === 'setup' && !calStepDone())) { calibrate(); logEvent('gesture', { what: CAL.active ? 'start measuring' : 'finish measuring' }); if (typeof tone === 'function') tone(CAL.active ? 660 : 990, CAL.active ? 660 : 990, 0.18, 'triangle', 0.18); }
}
// the camera's tilt (radians; + = looking down), measured from people standing upright
const CAMT = { pitch: 0, n: 0 };
const rotX = (v, a) => { let c = Math.cos(a), s = Math.sin(a); return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c, visibility: v.visibility }; };
function buildPerson(slot, c, now, W, H, fpx, tanH, sx) {
  let M = MPF[slot] || (MPF[slot] = { lm: [], wl: [], d: null, arm: {} });
  // iPhone ultra-wide + LiDAR: real distances for the joints the depth map covers (phone.js)
  let DZ = SET.tracker === 'phonedepth' || SET.tracker === 'webdepth' ? fuseDepth(c) : null;
  if (DZ) c = Object.assign({}, c, { wl: DZ.wl });
  M.meas = DZ ? DZ.meas : null;
  let t = now / 1000, fz = feelPx();
  let lm = filterPts(c.lm, M.lm, t, { x: W, y: H }, false, fz);
  let wl = filterPts(c.wl, M.wl, t, { x: 1000, y: 1000 }, true, fz);   // 3D points in millimetres, as in the main build
  let sImg = vmid(lm[11], lm[12]), hImg = vmid(lm[23], lm[24]);
  let sW = vmid(wl[11], wl[12]), hW = vmid(wl[23], wl[24]);

  // CAMERA TILT. The body model's 3D points are as the camera sees them, so a tilted camera (a laptop
  // lid leaned back, a camera mounted high and angled down) shows an upright person leaning. People
  // mostly stand upright, so the average lean of a standing torso IS the camera's tilt: it's measured
  // slowly, while you're roughly upright, and taken off the body (the picture itself isn't changed, so
  // the feet and everything else are still tracked as before).
  let tv = vsub(sW, hW), tl = vlen(tv), sample = Math.atan2(-tv.z, -tv.y);
  let lean0 = Math.abs(sample - CAMT.pitch) * 180 / Math.PI;
  if (SET.tiltFix && tl > 0.25 && Math.abs(sample) < 0.8) {
    if (CAMT.n < 30) { CAMT.pitch += (sample - CAMT.pitch) / (CAMT.n + 1); CAMT.n++; }
    else if (lean0 < 15) CAMT.pitch += (sample - CAMT.pitch) * 0.01;
  }
  let pitch = SET.tiltFix ? CAMT.pitch : 0;
  let wlU = wl.map(q => rotX(q, -pitch));                // the body, stood upright
  let sU = vmid(wlU[11], wlU[12]), hU = vmid(wlU[23], wlU[24]), tvU = vsub(sU, hU);
  let lean = Math.acos(clamp(-tvU.y / Math.max(0.05, vlen(tvU)), -1, 1)) * 180 / Math.PI;   // 0 = upright

  // HOW FAR AWAY, from the upper body (no legs needed): a fallback for when the body-shape fit fails.
  let torsoPx = Math.max(8, Math.hypot((sImg.x - hImg.x) * W, (sImg.y - hImg.y) * H));
  let shPx = Math.max(8, Math.hypot((lm[11].x - lm[12].x) * W, (lm[11].y - lm[12].y) * H));
  let torsoM = Math.hypot(sW.x - hW.x, sW.y - hW.y), shM = Math.hypot(wl[11].x - wl[12].x, wl[11].y - wl[12].y);
  let dTo = fpx * clamp(torsoM, 0.1, 0.7) / torsoPx, dSh = fpx * clamp(shM, 0.08, 0.5) / shPx;
  let fwd = clamp(sW.z - hW.z, -0.6, 0.6);
  dTo -= fwd / 2; dSh -= fwd;
  let dU = clamp((dTo * torsoPx + dSh * shPx) / (torsoPx + shPx), 0.6, 8);
  let d = dU, lat = (hImg.x - 0.5) * 2 * dU * tanH, src = 'upper body';
  // BETTER, when it solves: the body model gives your body's 3D shape in metres (centred on your hips);
  // find where that shape has to stand so its picture lands exactly where the camera saw you. Every
  // visible point votes (the standard way to place a known 3D shape from one picture). With a tilted
  // camera, the distance along the floor is taken out of that.
  let T = DZ ? DZ.T : solvePlace(lm, wl, W, H, fpx);
  if (T && T.z > 0.5 && T.z < 8) { d = clamp(T.z * Math.cos(pitch) - T.y * Math.sin(pitch), 0.6, 8); lat = T.x; src = DZ ? 'LiDAR' : 'body shape'; }
  let dB = d, latB = lat;

  // FEET, a bonus when they're in the picture and the floor was measured (this version's measurement).
  // The two are kept in step, so nothing jumps when your feet come into or leave the picture.
  let r = CAL.rect, ankL = lm[27], ankR = lm[28];
  let feetSeen = [ankL, ankR].every(q => q && (q.visibility === undefined || q.visibility > 0.6) && q.y < 0.98);
  if (M.kF === undefined) M.kF = 1;
  if (!DZ && r && r.v === 2 && r.fa !== undefined && feetSeen && !CAL.active) {
    let ay = Math.max(ankL.y, ankR.y), dF = ay - r.fa > 0.01 ? r.fb / (ay - r.fa) : 0, k = dF / dB;
    if (k > 0.6 && k < 1.6) { d = dF; lat = ((ankL.x + ankR.x) / 2 - 0.5) * 2 * dF * tanH; src = 'feet'; M.kF += (k - M.kF) * 0.05; }
    else src += ' (feet disagree: measure the floor again)';
  }
  if (src !== 'feet') { d = clamp(dB * M.kF, 0.6, 8); lat = latB * M.kF; }

  // BENDING. Bending over can't move your feet, but it hides and squashes the body in the picture, and
  // the guesses about where you are go wild. So while your torso leans forward (from about 12°, fully by 27°), your place on the
  // floor holds where it was when you were last upright (eased in and out; let go after 8 s, in case).
  M.bendT = lean > 12 ? (M.bendT || 0) + (M.lastT ? t - M.lastT : 0) : 0; M.lastT = t;
  let w = SET.bendHold ? smooth01((lean - 12) / 15) * (M.bendT < 8 ? 1 : 0) : 0;   // upright reads 0–8°; a bend, 15° and up
  if (w < 0.01 || !M.hold) M.hold = { d: M.d !== null && M.d !== undefined ? M.d : d, lat: M.latS !== undefined ? M.latS : lat };
  let dIn = d + (M.hold.d - d) * w, latIn = lat + (M.hold.lat - lat) * w;
  if (w >= 0.01) src += ' · bending, held';

  // a calm filter on where you stand (it's multiplied by the walk gain, so its wobble would be too)
  let fr = feelRoot();
  M.fd = M.fd || new OneEuro(); M.fl = M.fl || new OneEuro();
  let dS = M.fd.filter(dIn, t, fr.minC, fr.beta), latS = M.fl.filter(latIn, t, fr.minC * 1.5, fr.beta);
  M.d = dS; M.latS = latS; M.src = src; M.dU = dU; M.T = T; M.raw = d; M.lean = lean; M.pitch = pitch;
  // JUMPING (Bubble Pop): how far the hips AND the shoulders have risen together above where they
  // usually are, in metres, from the raw picture (so it's quick). The baseline settles to where you
  // usually stand, slowly when you crouch, hardly at all while you're up.
  {
    let rl = c.lm, okv = i => rl[i] && (rl[i].visibility === undefined || rl[i].visibility > 0.5);
    if ([11, 12, 23, 24].every(okv)) {
      let hy = (rl[23].y + rl[24].y) / 2, sy = (rl[11].y + rl[12].y) / 2, mpp = dS / fpx * H;   // metres per picture height
      let J = M.jb || (M.jb = { h: hy, s: sy, t: t, up: 0 });
      let rise = Math.min((J.h - hy) * mpp, (J.s - sy) * mpp), dtJ = clamp(t - J.t, 0, 0.2);
      J.t = t; J.up = Math.max(0, rise);
      let k = Math.min(1, dtJ * (rise > 0.03 ? 0.05 : rise < -0.03 ? 0.3 : 1.5));
      J.h += (hy - J.h) * k; J.s += (sy - J.s) * k;
    } else if (M.jb) M.jb.up = 0;
  }
  // STANDING STILL STAYS STILL. Even smoothed, the guess of where you stand wanders 1–2 cm (more in depth),
  // and the walk gain doubles it. A soft dead zone: wobbles smaller than the zone are ignored; a real step
  // pushes the body along (it trails the step by the zone's width, then catches up as you settle).
  // Wider for depth, which the camera guesses worst.
  let zone = SET.stillZone;
  if (M.shown === undefined || zone <= 0) M.shown = { d: dS, lat: latS };
  else {
    let soft = (cur, tgt, z) => { let e = tgt - cur, a = Math.abs(e); return a <= z ? cur : cur + e * (1 - z / a); };
    M.shown.d = soft(M.shown.d, dS, zone * 1.6); M.shown.lat = soft(M.shown.lat, latS, zone);
  }
  let pel = V(sx * M.shown.lat, 0.95, M.shown.d);
  sW = sU; hW = hU; let wlC = wl; wl = wlU;   // from here on, the upright body
  let A = w => V(pel.x + sx * (w.x - hW.x), pel.y - (w.y - hW.y), pel.z + (w.z - hW.z));
  let j = { pelvis: pel };
  for (let n in MPJ) { j[n] = A(wl[MPJ[n]]); }

  // ARMS from the picture, where MediaPipe is strongest: the direction you see, plus how far it points
  // at the camera (an arm pointing at you looks short; knowing its real length says how short).
  // A hand that leaves the picture keeps its last direction for a moment instead of flailing.
  let mPx = dS / fpx;
  for (let s of ['L', 'R']) {
    let mem = M.arm[s] || (M.arm[s] = {});
    let wr = lm[MPJ['wr' + s]], el = lm[MPJ['el' + s]];
    let lost = [wr, el].some(q => !q || (q.visibility !== undefined && q.visibility < 0.3) || q.y < 0.01 || q.y > 0.995 || q.x < 0.005 || q.x > 0.995);
    if (lost && mem.rel && now - mem.t < 900) {
      for (let c2 of ['el', 'wr', 'in', 'pi', 'th']) { j[c2 + s] = vadd(j['sh' + s], mem.rel[c2]); }
      continue;
    }
    if (SET.reach === 'picture') {
      for (let [a, b] of [['sh', 'el'], ['el', 'wr']]) {
        let ia = MPJ[a + s], ib = MPJ[b + s];
        if (DZ && DZ.meas[ia] && DZ.meas[ib]) continue;   // both ends measured by the LiDAR: already real
        let px = (lm[ib].x - lm[ia].x) * W * mPx, py = (lm[ib].y - lm[ia].y) * H * mPx;
        let wv = vsub(wlC[ib], wlC[ia]), pic = Math.hypot(px, py);
        // HOW MUCH IT POINTS AT THE CAMERA, from how short it looks (the standard single-camera way,
        // Taylor 2000): your arm's real length is the longest it has looked lately (it creeps back down
        // slowly, in case that was a misread), and the shorter it looks now, the more it points at you.
        // An arm that looks nearly full length counts as flat, so a hanging arm doesn't wobble forward.
        let Lk = 'L' + b, Lm = mem[Lk] === undefined ? Math.max(pic, vlen(wv)) : mem[Lk];
        Lm += (pic - Lm) * (pic > Lm ? 0.1 : 0.003); Lm = clamp(Lm, 0.18, 0.45); mem[Lk] = Lm;
        let r = Math.min(1, pic / Lm), dz = Lm * Math.sqrt(1 - r * r) * smooth01((0.97 - r) / 0.12);
        // toward or away from the camera? The picture can't say, so the body model's 3D guess decides. But
        // for an arm hanging or held sideways that guess hovers around zero, and a hard either/or made the
        // elbow and hand flip ~25 cm forward and back every frame or two (v1.9–v1.12, the jumping hands).
        // So it's a dimmer, not a switch: clearly forward = full depth forward, unsure = little depth.
        let toward = clamp(wv.z / 0.08, -1, 1);
        // depth is the camera's weakest guess, so it gets its own, calmer smoothing (in mm); side to side
        // and up and down stay as quick as the picture
        let zf = mem['z' + b] || (mem['z' + b] = new OneEuro());
        let zc = zf.filter(toward * dz * 1000, t, fz.minC * 0.5, fz.beta) / 1000;
        // NOT turned by the camera tilt (v1.12.2): an arm hanging beside you looks straight down in the
        // picture however the camera is tilted, just like your torso. Turning it made every arm lean ~20°
        // forward at rest, because the "tilt" is mostly the body model's own habit of reading upright as leaning.
        let cv = { x: px, y: py, z: zc };
        if (window.ARMDBG) ARMDBG.push([s + b, +pic.toFixed(3), +Lm.toFixed(3), +wv.z.toFixed(3), +dz.toFixed(3), +zc.toFixed(3), +dS.toFixed(2)]);
        let nb = V(j[a + s].x + sx * cv.x, j[a + s].y - cv.y, j[a + s].z + cv.z), shift = vsub(nb, j[b + s]);
        j[b + s] = nb;
        for (let c2 of (b === 'el' ? ['wr', 'in', 'pi', 'th'] : ['in', 'pi', 'th'])) { j[c2 + s] = vadd(j[c2 + s], shift); }
      }
    }
    // half-seen (hidden behind you, blurred): the body model is guessing, so the arm only moves part of
    // the way toward the guess; fully seen, it follows completely
    let vis = Math.min(wr.visibility === undefined ? 1 : wr.visibility, el.visibility === undefined ? 1 : el.visibility);
    let trust = clamp((vis - 0.3) / 0.4, 0, 1);
    if (!lost && mem.rel && now - mem.t < 900 && trust < 1) {
      for (let c2 of ['el', 'wr', 'in', 'pi', 'th']) { j[c2 + s] = vadd(j['sh' + s], vlerp(mem.rel[c2], vsub(j[c2 + s], j['sh' + s]), 0.15 + 0.85 * trust)); }
    }
    if (!lost) { mem.rel = {}; for (let c2 of ['el', 'wr', 'in', 'pi', 'th']) { mem.rel[c2] = vsub(j[c2 + s], j['sh' + s]); } mem.t = now; }
  }
  j.neck = vmid(j.shL, j.shR); j.head = vmid(A(wl[7]), A(wl[8])); j.nose = A(wl[0]);   // nose vs ears: which way the head points
  gestureTick(slot, lm, now);
  return { key: null, j, chir: c.chir, lm: c.lm, lmS: lm, hands: c.hands, size: c.size, img: c.img, ankY: Math.max(lm[27].y, lm[28].y), dist: dS, distT: dB, up: M.jb ? M.jb.up : 0 };
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
function pickPeople(list, now) {
  TRK.hzFrames++;
  if (now - TRK.hzStart > 1000) { TRK.hz = TRK.hzFrames * 1000 / (now - TRK.hzStart); TRK.hzFrames = 0; TRK.hzStart = now; }
  if (!list.length) return {};
  // which slots this camera fills: you (computer partner), this laptop's person (2 spaces), or both (1 space)
  let slots = SET.comp !== 'off' ? [SET.comp === 'P2' ? 1 : 2] : SET.spaces === 2 ? [NET.myId] : [1, 2];
  let pick = LOCK.on ? pickLocked(list, slots, now) : pickBiggest(list, slots), out = {};
  for (let k of slots) { if (pick[k]) out[k] = pick[k]; }
  return out;
}

// WHO IS FOLLOWED. Before START: the biggest person in the picture (in 1 space the two
// biggest, P1 on screen left). At START that choice is locked: from then on each slot
// only follows the body nearest where its person was, of about the same size, so other
// people walking through the picture are ignored.
const LOCK = { on: false, slots: {} };
function pickBiggest(list, slots) {
  // screen left/right, as shown (mirrored or not)
  let sx = SET.mirror ? -1 : 1, scr = c => sx * (c.img.x - 0.5);
  let big = list.slice().sort((a, b) => b.size - a.size), out = {};
  if (slots.length === 1) { out[slots[0]] = big[0]; return out; }
  if (big.length >= 2) { let two = big.slice(0, 2).sort((a, b) => scr(a) - scr(b)); out[1] = two[0]; out[2] = two[1]; return out; }
  let p = big[0], best = null, bd = 0.15;
  for (let k of [1, 2]) {
    let s = people[k]; if (!s || !s.img) continue;
    let d = Math.hypot(s.img.x - p.img.x, s.img.y - p.img.y); if (d < bd) { bd = d; best = k; }
  }
  out[best || (scr(p) < 0 ? 1 : 2)] = p;
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
      if (r < 0.4 || r > 2.5 || d >= reach) return;   // generous: leaning in to reach makes the torso look much shorter
      reach = d; best = i;
    });
    // only one person in this camera and one slot to fill: it's them
    if (best < 0 && slots.length === 1 && list.length === 1) best = 0;
    if (best < 0) { LOCK.miss = LOCK.miss || {}; LOCK.miss[k] = now; continue; }
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
function makePerson(px, pz, walkPhase, walkAmt, arms, lift) {
  let j = {}, bob = Math.abs(Math.sin(walkPhase)) * 0.02 * walkAmt;
  j.pelvis = V(px, 0.95 + bob, pz);
  j.hipL = V(px - 0.1, 0.93 + bob, pz); j.hipR = V(px + 0.1, 0.93 + bob, pz);
  j.shL = V(px - 0.19, 1.42 + bob, pz); j.shR = V(px + 0.19, 1.42 + bob, pz);
  j.neck = vmid(j.shL, j.shR); j.head = V(px, 1.62 + bob, pz + 0.01); j.nose = V(px, 1.6 + bob, pz - 0.09);
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
  if (lift) for (let n in j) { j[n] = V(j[n].x, j[n].y + lift, j[n].z); }   // a demo jump
  return { j, chir: 1, lm: null, up: lift || 0 };
}
// two-bone arm: where the elbow goes for a wrist target (elbow points down and out)
function elbowFor(sh, wr, sg) {
  let T = vsub(wr, sh), d = clamp(vlen(T), 0.12, 0.565), t = vmul(T, 1 / Math.max(1e-4, vlen(T)));
  let a = 0.30, b = 0.27, cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  let pole = V(sg * 0.35, -1, 0.15); pole = vnorm(vsub(pole, vmul(t, vdot(pole, t))));
  return vadd(sh, vadd(vmul(t, a * cosA), vmul(pole, a * sinA)));
}

// DEMO PEOPLE WALK ONTO THE RING: each starts off to one side and walks to their own spot (P2 a moment later)
function demoToRing(now, dt, which) {
  if (!DEMO.ring) DEMO.ring = { 1: { x: 0.9, z: 3.5, walk: 0, wait: 0.3 }, 2: { x: -0.8, z: 3.6, walk: 0, wait: 1.3 } };
  DEMO.reset = true;   // when play begins, the usual demo starts fresh
  let out = {};
  for (let k of [1, 2]) {
    let D = DEMO.ring[k], c = centreOf(k), moving = 0;
    D.wait -= dt;
    if (c && D.wait <= 0) { let dx = c.x - D.x, dz = c.z - D.z, d = Math.hypot(dx, dz), st = 0.6 * dt; if (d > 0.02) { D.x += dx / d * Math.min(st, d); D.z += dz / d * Math.min(st, d); moving = 1; } }
    D.walk += dt * 7 * moving;
    out[k] = makePerson(D.x, D.z, D.walk, moving, null);
  }
  return which ? out[which] : out;
}
// The demo: P1 walks to the cube; P2 follows, but sometimes gets distracted and is left
// behind (the arm falls), then hurries to catch up (it comes back). Together they lift.
const DEMO = { reset: true, t: 0, p1: null, p2: null };
function demoPeople(now, dt, which) {
  if (typeof RUN !== 'undefined' && (RUN.phase === 'centre' || RUN.phase === 'countdown')) return demoToRing(now, dt, which);
  if (typeof isBubbles === 'function' && isBubbles()) return demoBubbles(now, dt, which);   // bubbles.js
  if (DEMO.reset || !DEMO.p1 || DEMO.bub) {
    DEMO.reset = false; DEMO.bub = false;
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
      if (taskMode() === 'carry' && CUBE.held && A.t > 1.4) {
        // level 2: keep the hands as they are (relative to the body) and walk them over to the other plinth
        A.hUp = TASK.handTargets(1, 1); A.hDown = TASK.handTargets(1, 0.03); A.hApart = TASK.handTargets(1, 0.03, 0.25);
        A.phase = 'carry'; A.t = 0;
      }
      if (TASK.score !== DEMO.score) { DEMO.score = TASK.score; A.phase = 'let go'; A.t = 0; }
      if (!CUBE.held && A.t > 1.5) { A.phase = 'reach'; A.t = 0; }
    } else if (A.phase === 'carry') {
      reachHands = A.hUp;
      let tr = realOf(TARGET.p.clone().add(new V3(0, 0, 0.47))), dx = tr.x - A.x, dz = tr.z - A.z, d = Math.hypot(dx, dz), step = 0.4 * dt;
      if (d > 0.02) { A.x += dx / d * Math.min(step, d); A.z += dz / d * Math.min(step, d); moving = 1; }
      else { A.phase = 'place'; A.t = 0; }
      if (!CUBE.held && A.t > 0.5) { A.phase = 'walk'; A.t = 0; }   // dropped it: go back for it
    } else if (A.phase === 'place') {
      let k = Math.min(1, A.t / 0.9), mixH = (a, b, u) => ({ L: { wr: vlerp(a.L.wr, b.L.wr, u), n: a.L.n, f: a.L.f }, R: { wr: vlerp(a.R.wr, b.R.wr, u), n: a.R.n, f: a.R.f } });
      reachHands = A.t < 1.0 ? mixH(A.hUp, A.hDown, k) : mixH(A.hDown, A.hApart, Math.min(1, (A.t - 1.0) / 0.4));
      if (TASK.score !== DEMO.score || A.t > 3) { DEMO.score = TASK.score; A.phase = 'walk'; A.t = 0; A.trip++; }
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
  COMP.hist.push({ t: now, j: me.j, hands: me.hands, home: me.home, up: me.up || 0 });
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
  setPerson(2, 'computer', { j, hands, chir: me.chir, lm: null, up: late.up }, now, false);
}

// ---------------- sources ----------------
let demoLast = 0;
function setSource(src, deviceId) {
  SET.source = src;
  people[1] = null; people[2] = null; DEMO.reset = true; DEMO.ring = null; COMP.hist = []; COMP.x = null;
  if (typeof FOLLOW !== 'undefined') { FOLLOW.state = 'vacant'; FOLLOW.ref1 = null; }   // tracking restarts: the arm re-attaches fresh (it used to drop)
  if (src === 'mediapipe' && SET.tracker === 'iphone') { stopMediaPipe(); startPhone('body'); }
  else if (src === 'mediapipe' && (SET.tracker === 'phonecam' || SET.tracker === 'phonedepth')) { stopPhone(); startMediaPipe(null, true); }
  else if (src === 'mediapipe') { stopPhone(); startMediaPipe(deviceId); }
  else { stopMediaPipe(); stopPhone(); TRK.status = 'demo people'; }
}
function trackTick(now, dt) {
  if (SET.source === 'mediapipe') { try { if (SET.tracker === 'iphone') phoneTick(now); else mpTick(now); } catch (e) { TRK.status = 'MediaPipe error: ' + e.message; } compTick(now, dt); }
  else if (now - demoLast > 30) {
    let ddt = Math.min(0.1, (now - (demoLast || now)) / 1000); demoLast = now;
    let ppl = demoPeople(now, ddt);
    let linked = SET.spaces === 2 && NET.connected;
    for (let k of [1, 2]) { if (!linked || k === NET.myId) setPerson(k, 'demo' + k, ppl[k], now, false); }
    TRK.hzFrames++;
    if (now - TRK.hzStart > 1000) { TRK.hz = TRK.hzFrames * 1000 / (now - TRK.hzStart); TRK.hzFrames = 0; TRK.hzStart = now; }
  }
  glidePeople(now);
  agePeople(now);
}
