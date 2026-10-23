// ============================================================
// TRACKING LAB · lab.js
// One input (webcam body, webcam hands, Kinect, a recording, or a test motion),
// every smoothing method run side by side on exactly the same samples.
// You see: the skeleton (the method you pick) over the camera, the raw one faintly,
// and for one chosen point, its x, y and depth over the last few seconds, each method
// as its own line. Numbers per method: shake (how much it trembles) and lag (how late it is).
// Each point is a list of numbers: [x px, y px, X mm, Y mm, Z mm] (picture position, then 3D).
// ============================================================

const $ = id => document.getElementById(id);
const L = {
  src: 'test', camId: '', model: 'lite', kip: '127.0.0.1', mirror: true,
  show: 'euro', ghost: true, stream: 'pose', point: 16, secs: 5, running: true,
  W: 1280, H: 720,
};
// the body model's points (MediaPipe) and the ones worth graphing
const POSE_BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [15, 19], [16, 20], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12]];
const POSE_PTS = { 0: 'nose', 11: 'left shoulder', 12: 'right shoulder', 13: 'left elbow', 14: 'right elbow', 15: 'left wrist', 16: 'right wrist', 19: 'left index', 20: 'right index', 23: 'left hip', 24: 'right hip', 27: 'left ankle', 28: 'right ankle' };
const HAND_BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const HAND_PTS = { 0: 'wrist', 4: 'thumb tip', 8: 'index tip', 12: 'middle tip', 20: 'little tip', 9: 'middle knuckle' };
const K_BONES = [[3, 2], [2, 20], [20, 1], [1, 0], [20, 4], [4, 5], [5, 6], [6, 7], [7, 21], [20, 8], [8, 9], [9, 10], [10, 11], [11, 23], [0, 12], [12, 13], [13, 14], [0, 16], [16, 17], [17, 18]];
const K_PTS = { 3: 'head', 20: 'spine (shoulders)', 0: 'spine (base)', 5: 'left elbow', 6: 'left wrist', 7: 'left hand', 21: 'left hand tip', 9: 'right elbow', 10: 'right wrist', 11: 'right hand', 23: 'right hand tip', 14: 'left ankle', 18: 'right ankle' };
const STREAMS = {
  pose: { name: 'Body (webcam)', bones: POSE_BONES, pts: POSE_PTS, def: 16 },
  hand0: { name: 'Hand 1 (webcam)', bones: HAND_BONES, pts: HAND_PTS, def: 8 },
  hand1: { name: 'Hand 2 (webcam)', bones: HAND_BONES, pts: HAND_PTS, def: 8 },
  kinect: { name: 'Body (Kinect)', bones: K_BONES, pts: K_PTS, def: 11 },
  test: { name: 'Test motion', bones: [[0, 1]], pts: { 0: 'moving point', 1: 'still point' }, def: 0 },
};

// ---------------- per stream: the latest frame, every method's output, and history ----------------
const ST = {};   // id → { raw: [pts], out: {method: [pts]}, f: {method: [[filters per coord]]}, hist: [{t, raw, out, truth}] , t }
function resetStreams() { for (let k in ST) delete ST[k]; }
function feed(id, t, pts, truth) {
  let s = ST[id] || (ST[id] = { f: {}, hist: [], out: {} });
  s.t = t; s.raw = pts;
  for (let m of METHODS) {
    let F = s.f[m.id] || (s.f[m.id] = []);
    s.out[m.id] = pts.map((p, i) => {
      if (!p) return null;
      let fi = F[i] || (F[i] = p.c.map(() => m.make(m.params)));
      return { c: p.c.map((v, k) => (fi[k] || (fi[k] = m.make(m.params))).filter(v, t / 1000)), v: p.v };
    });
  }
  s.hist.push({ t, raw: pts, out: Object.assign({}, s.out), truth });
  while (s.hist.length && t - s.hist[0].t > 12000) s.hist.shift();
}
function resetFilters() { for (let k in ST) { ST[k].f = {}; } }

// ---------------- webcam (MediaPipe) ----------------
const MP = { video: null, stream: null, pose: null, hands: null, last: -1, delegate: '' };
async function startWebcam() {
  stopWebcam();
  setStatus('Loading MediaPipe…');
  try {
    let t0 = performance.now();
    while (!window.mpLoaded) { if (window.mpError) throw new Error(window.mpError); if (performance.now() - t0 > 20000) throw new Error('MediaPipe took too long'); await new Promise(r => setTimeout(r, 50)); }
    MP.stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: L.camId ? { exact: L.camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    MP.video = document.createElement('video'); MP.video.playsInline = true; MP.video.muted = true; MP.video.srcObject = MP.stream; await MP.video.play();
    let fs = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
    let either = async mk => { try { let r = await mk('GPU'); MP.delegate = 'GPU'; return r; } catch (e) { MP.delegate = 'CPU (GPU failed)'; return await mk('CPU'); } };
    if (L.src === 'pose' || L.src === 'both') MP.pose = await either(d => PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_' + L.model + '/float16/1/pose_landmarker_' + L.model + '.task', delegate: d }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.3 }));
    if (L.src === 'hands' || L.src === 'both') MP.hands = await either(d => HandLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: d }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.3 }));
    setStatus('Webcam running · MediaPipe on ' + MP.delegate);
  } catch (e) { setStatus('Webcam: ' + (e.message || e)); }
}
function stopWebcam() {
  if (MP.stream) MP.stream.getTracks().forEach(t => t.stop());
  for (let k of ['pose', 'hands']) { if (MP[k]) { try { MP[k].close(); } catch (e) {} MP[k] = null; } }
  MP.stream = null; MP.video = null; MP.last = -1;
}
function webcamTick(now) {
  let v = MP.video; if (!v || v.readyState < 2 || v.currentTime === MP.last) return;
  MP.last = v.currentTime; L.W = v.videoWidth; L.H = v.videoHeight;
  let frame = { t: now, s: {} };
  if (MP.pose) {
    let r = MP.pose.detectForVideo(v, now);
    if (r.landmarks && r.landmarks[0]) frame.s.pose = r.landmarks[0].map((q, i) => { let w = r.worldLandmarks[0][i]; return { c: [q.x * L.W, q.y * L.H, w.x * 1000, w.y * 1000, w.z * 1000], v: q.visibility }; });
  }
  if (MP.hands) {
    let r = MP.hands.detectForVideo(v, now);
    // keep hands in steady slots: the one more to the left in the picture is hand 1
    let hs = (r.landmarks || []).map((lm, i) => ({ lm, wl: r.worldLandmarks[i] })).sort((a, b) => a.lm[0].x - b.lm[0].x);
    hs.forEach((h, i) => { frame.s['hand' + i] = h.lm.map((q, k) => ({ c: [q.x * L.W, q.y * L.H, h.wl[k].x * 1000, h.wl[k].y * 1000, h.wl[k].z * 1000], v: 1 })); });
  }
  ingest(frame);
}

// ---------------- Kinect (Kinectron 0.4, Kinect v2) ----------------
let kinectron = null;
function connectKinect() {
  if (typeof Kinectron === 'undefined') { setStatus('kinectron-client.js did not load'); return; }
  try {
    kinectron = new Kinectron(L.kip); kinectron.setKinectType('windows'); kinectron.makeConnection();
    kinectron.startTrackedBodies(b => {
      if (!b || !b.joints) return;
      L.W = 512; L.H = 424;
      ingest({ t: performance.now(), s: { kinect: b.joints.map(j => ({ c: [j.depthX * 512, j.depthY * 424, j.cameraX * 1000, -j.cameraY * 1000, j.cameraZ * 1000], v: j.trackingState === 2 ? 1 : 0.4 })) } });
    });
    setStatus('Kinect: connecting to ' + L.kip + '… (the Kinectron app must be running with body tracking on)');
  } catch (e) { setStatus('Kinect: ' + (e.message || e)); }
}

// ---------------- test motion: a known path plus webcam-like shake, so every method can be checked against the truth ----------------
const TEST = { t0: 0, noise: 3 };
function testTick(now) {
  if (now - (TEST.last || 0) < 33) return; TEST.last = now;
  L.W = 1280; L.H = 720;
  let t = (now - TEST.t0) / 1000, cyc = t % 8, x, y;
  // 0–2 s: still; 2–4 s: a slow figure-eight; 4–5 s: still; 5–7 s: fast swipes; 7–8 s: still
  let g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15 * TEST.noise;
  if (cyc < 2 || (cyc >= 4 && cyc < 5) || cyc >= 7) { x = 640; y = 360; }
  else if (cyc < 4) { let a = (cyc - 2) * Math.PI; x = 640 + 220 * Math.sin(a); y = 360 + 110 * Math.sin(2 * a); }
  else { let a = (cyc - 5) * Math.PI * 2; x = 640 + 300 * Math.sin(a); y = 360 + 40 * Math.sin(a * 3); }
  let truth = [{ c: [x, y, x, y, 0] }, { c: [640, 560, 640, 560, 0] }];
  ingest({ t: now, s: { test: [{ c: [x + g(), y + g(), x + g(), y + g(), g()], v: 1 }, { c: [640 + g(), 560 + g(), 640 + g(), 560 + g(), g()], v: 1 }] }, truth: { test: truth } });
}

// ---------------- a frame arrives (from any input); recording keeps the raw frames ----------------
const REC = { on: false, frames: [], t0: 0 };
function ingest(fr) {
  for (let id in fr.s) feed(id, fr.t, fr.s[id], fr.truth && fr.truth[id]);
  if (REC.on) { REC.frames.push({ t: Math.round(fr.t - REC.t0), W: L.W, H: L.H, s: Object.fromEntries(Object.entries(fr.s).map(([k, pts]) => [k, pts.map(p => p ? p.c.map(v => Math.round(v * 10) / 10).concat([Math.round((p.v || 0) * 100) / 100]) : null)])) }); }
  L.lastFrame = fr.t;
  L.rateN = (L.rateN || 0) + 1;
}

// ---------------- replay: a lab recording, or an Arm Follow log's last 20 s ----------------
const REP = { frames: null, i: 0, t0: 0, name: '' };
function loadFile(file) {
  let rd = new FileReader();
  rd.onload = () => {
    try {
      let d = JSON.parse(rd.result), frames = null;
      if (d.lab && d.frames) frames = d.frames;
      else if (d.cam) frames = d.cam.map(fr => ({ t: fr.t - d.cam[0].t, W: fr.W, H: fr.H, s: fr.f[0] ? { pose: fr.f[0].lm.map((a, i) => [a[0] * fr.W, a[1] * fr.H, fr.f[0].wl[i][0] * 1000, fr.f[0].wl[i][1] * 1000, fr.f[0].wl[i][2] * 1000, a[2]]) } : {} }));
      if (!frames || !frames.length) throw new Error('no tracking frames in that file');
      Object.assign(REP, { frames, i: 0, t0: performance.now(), name: file.name });
      L.src = 'replay'; $('src').value = 'replay'; stopWebcam(); resetStreams();
      let first = frames.find(f => Object.keys(f.s).length); L.stream = first ? (first.s.pose ? 'pose' : Object.keys(first.s)[0]) : 'pose'; L.point = STREAMS[L.stream].def;
      updatePanel();
      setStatus('Replaying ' + file.name + ' (' + frames.length + ' frames, ' + ((frames[frames.length - 1].t) / 1000).toFixed(1) + ' s, loops)');
    } catch (e) { setStatus('Could not read that file: ' + e.message); }
  };
  rd.readAsText(file);
}
function replayTick(now) {
  if (!REP.frames) return;
  let el = now - REP.t0;
  if (REP.i >= REP.frames.length) { REP.i = 0; REP.t0 = now; el = 0; resetStreams(); }
  while (REP.i < REP.frames.length && REP.frames[REP.i].t <= el) {
    let f = REP.frames[REP.i++]; L.W = f.W || 1280; L.H = f.H || 720;
    let s = {}; for (let k in f.s) { s[k] = f.s[k].map(a => a ? { c: a.slice(0, 5), v: a[5] } : null); }
    ingest({ t: REP.t0 + f.t, s });
  }
}

// ---------------- numbers: shake and lag, for one point ----------------
// shake: how much it trembles while the point is (nearly) still: the frame-to-frame change in speed,
// counted only where a calm version of the raw line says it isn't really moving
// lag: how many ms later than the raw signal it follows the same path (best match within 0–400 ms)
function metrics(s, idx, coordSet) {
  let H = s.hist.filter(h => h.t > s.t - 4000), out = {};
  if (H.length < 20) return null;
  // where is the point still? a calm (±150 ms) version of the raw line, moving under 60 units a second
  let calm = H.map((h, i) => { let sx = 0, sy = 0, c = 0; for (let j = 0; j < H.length; j++) { if (Math.abs(H[j].t - h.t) <= 150 && H[j].raw[idx]) { sx += H[j].raw[idx].c[coordSet[0]]; sy += H[j].raw[idx].c[coordSet[coordSet.length - 1]]; c++; } } return c ? [sx / c, sy / c] : null; });
  let still = H.map((h, i) => { if (i < 1 || !calm[i] || !calm[i - 1]) return false; let dt = (h.t - H[i - 1].t) / 1000; return Math.hypot(calm[i][0] - calm[i - 1][0], calm[i][1] - calm[i - 1][1]) / Math.max(0.001, dt) < 60; });
  for (let m of METHODS) {
    let series = H.map(h => h.out[m.id] && h.out[m.id][idx] ? h.out[m.id][idx].c : null);
    let sh = 0, n = 0;
    for (let i = 2; i < series.length; i++) {
      let a = series[i - 2], b = series[i - 1], c = series[i]; if (!a || !b || !c || !still[i]) continue;
      let d2 = 0; for (let k of coordSet) { d2 += (c[k] - 2 * b[k] + a[k]) ** 2; } sh += Math.sqrt(d2); n++;
    }
    // lag: shift the method's line back in time until it best matches the raw line
    let raw = H.map(h => h.raw[idx] ? h.raw[idx].c : null), best = 0, bestE = Infinity, dt = (H[H.length - 1].t - H[0].t) / Math.max(1, H.length - 1);
    let motion = 0; for (let i = 1; i < raw.length; i++) { if (raw[i] && raw[i - 1]) motion += Math.abs(raw[i][coordSet[0]] - raw[i - 1][coordSet[0]]); }
    for (let sft = 0; sft <= Math.round(400 / dt); sft++) {
      let e = 0, c = 0;
      for (let i = sft; i < series.length; i++) { let a = series[i], b = raw[i - sft]; if (!a || !b) continue; for (let k of coordSet) { e += (a[k] - b[k]) ** 2; } c++; }
      if (c && e / c < bestE) { bestE = e / c; best = sft; }
    }
    // error against the truth (test motion only)
    let te = null;
    if (H[0].truth) { let e = 0, c = 0; for (let i = 0; i < H.length; i++) { let a = series[i], tr = H[i].truth && H[i].truth[idx]; if (!a || !tr) continue; e += Math.hypot(a[0] - tr.c[0], a[1] - tr.c[1]); c++; } te = c ? e / c : null; }
    out[m.id] = { shake: n ? sh / n : null, lag: motion > 30 ? best * dt : null, err: te };
  }
  return out;
}

// ---------------- drawing ----------------
let cv, cx, gv, gx;
function frame(now) {
  requestAnimationFrame(frame);
  if (L.src === 'pose' || L.src === 'hands' || L.src === 'both') webcamTick(now);
  else if (L.src === 'test') testTick(now);
  else if (L.src === 'replay') replayTick(now);
  if (now - (L.rateT || 0) > 1000) { L.rate = (L.rateN || 0) * 1000 / (now - (L.rateT || now)); L.rateN = 0; L.rateT = now; }
  drawView(); drawGraphs(); if ((L.tick = (L.tick || 0) + 1) % 10 === 0) drawNumbers();
}
function fit(c, W, H) { let s = Math.min(c.width / W, c.height / H); return { s, ox: (c.width - W * s) / 2, oy: (c.height - H * s) / 2 }; }
function drawView() {
  let c = cv, x = cx; x.fillStyle = '#ecece8'; x.fillRect(0, 0, c.width, c.height);
  let F = fit(c, L.W, L.H), mir = L.mirror && L.src !== 'test';
  let P = q => ({ x: F.ox + (mir ? L.W - q[0] : q[0]) * F.s, y: F.oy + q[1] * F.s });
  if (MP.video && (L.src === 'pose' || L.src === 'hands' || L.src === 'both')) {
    x.save(); if (mir) { x.translate(F.ox + L.W * F.s, F.oy); x.scale(-1, 1); x.drawImage(MP.video, 0, 0, L.W * F.s, L.H * F.s); } else x.drawImage(MP.video, F.ox, F.oy, L.W * F.s, L.H * F.s); x.restore();
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(F.ox, F.oy, L.W * F.s, L.H * F.s);
  } else { x.fillStyle = '#fff'; x.fillRect(F.ox, F.oy, L.W * F.s, L.H * F.s); }
  let m = METHODS.find(q => q.id === L.show) || METHODS[0];
  for (let id in ST) {
    let s = ST[id], def = STREAMS[id]; if (!s.raw || performance.now() - s.t > 600) continue;
    if (L.ghost && m.id !== 'raw') bones(x, s.raw, def.bones, P, 'rgba(26,26,26,0.35)', 1.5);
    bones(x, s.out[m.id], def.bones, P, m.col, 3.5);
    // the graphed point
    if (id === L.stream && s.out[m.id][L.point]) { let p = P(s.out[m.id][L.point].c); x.strokeStyle = '#1a1a1a'; x.lineWidth = 2; x.beginPath(); x.arc(p.x, p.y, 11, 0, 7); x.stroke(); }
    if (id === 'test' && s.hist.length && s.hist[s.hist.length - 1].truth) {   // the true path, dashed
      x.setLineDash([4, 4]); x.strokeStyle = 'rgba(26,26,26,0.5)'; x.lineWidth = 1; x.beginPath();
      s.hist.slice(-90).forEach((h, i) => { let p = P(h.truth[0].c); i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); }); x.stroke(); x.setLineDash([]);
    }
  }
  x.fillStyle = '#1a1a1a'; x.font = '12px "DM Mono", monospace';
  x.fillText('skeleton: ' + m.name + (L.ghost && m.id !== 'raw' ? '  ·  raw faintly' : '') + '  ·  ' + (L.rate || 0).toFixed(0) + ' frames/s', 14, c.height - 12);
}
function bones(x, pts, B, P, col, w) {
  if (!pts) return;
  x.strokeStyle = col; x.fillStyle = col; x.lineWidth = w; x.lineCap = 'round';
  for (let [a, b] of B) { if (pts[a] && pts[b]) { let p = P(pts[a].c), q = P(pts[b].c); x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.stroke(); } }
  for (let p0 of pts) { if (p0) { let p = P(p0.c); x.beginPath(); x.arc(p.x, p.y, w * 0.9, 0, 7); x.fill(); } }
}
// three graphs (x, y, depth) of the chosen point: every method as its own line, the last few seconds
function drawGraphs() {
  let c = gv, x = gx; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  let s = ST[L.stream]; let labels = ['x · left–right (px)', 'y · up–down (px)', 'depth (mm)'], coords = [0, 1, 4];
  let gh = c.height / 3, now = s ? s.t : 0, span = L.secs * 1000;
  for (let gi = 0; gi < 3; gi++) {
    let y0 = gi * gh; x.strokeStyle = '#e4e4e0'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, y0 + gh - 0.5); x.lineTo(c.width, y0 + gh - 0.5); x.stroke();
    x.fillStyle = 'rgba(26,26,26,0.55)'; x.font = '11px "DM Mono", monospace'; x.fillText(labels[gi], 10, y0 + 16);
    if (!s || !s.hist.length) continue;
    let H = s.hist.filter(h => h.t > now - span), k = coords[gi];
    // vertical range from the raw line (with a little margin; at least 20 units so a still point's shake shows true size)
    let lo = Infinity, hi = -Infinity;
    for (let h of H) { let p = h.raw[L.point]; if (p) { lo = Math.min(lo, p.c[k]); hi = Math.max(hi, p.c[k]); } }
    if (!isFinite(lo)) continue;
    let mid = (lo + hi) / 2, half = Math.max(10, (hi - lo) / 2) * 1.15;
    let X = t => c.width - (now - t) / span * c.width, Y = v => y0 + gh / 2 - (v - mid) / half * (gh / 2 - 8);
    if (H[0].truth) { x.setLineDash([3, 3]); line(x, H, h => h.truth && h.truth[L.point] ? h.truth[L.point].c[k] : null, X, Y, 'rgba(26,26,26,0.6)', 1); x.setLineDash([]); }
    for (let m of METHODS) { if (m.on) line(x, H, h => h.out[m.id] && h.out[m.id][L.point] ? h.out[m.id][L.point].c[k] : null, X, Y, m.col, m.id === 'raw' ? 1.2 : 2); }
  }
}
function line(x, H, get, X, Y, col, w) {
  x.strokeStyle = col; x.lineWidth = w; x.beginPath(); let started = false;
  for (let h of H) { let v = get(h); if (v === null || v === undefined) { started = false; continue; } let px = X(h.t), py = Y(v); started ? x.lineTo(px, py) : x.moveTo(px, py); started = true; }
  x.stroke();
}
function drawNumbers() {
  let s = ST[L.stream], M = s ? metrics(s, L.point, [0, 1]) : null, Md = s ? metrics(s, L.point, [4]) : null;
  let f = (v, d) => v === null || v === undefined ? '–' : v.toFixed(d);
  let rows = METHODS.filter(m => m.on).map(m => `<tr><td><span class="sw2" style="background:${m.col}"></span>${m.name}</td><td>${M ? f(M[m.id].shake, 2) : '–'}</td><td>${Md ? f(Md[m.id].shake, 1) : '–'}</td><td>${M ? f(M[m.id].lag, 0) : '–'}</td>${L.src === 'test' ? `<td>${M ? f(M[m.id].err, 1) : '–'}</td>` : ''}</tr>`).join('');
  $('numbers').innerHTML = `<table><tr><th></th><th>shake px (still)</th><th>shake depth mm</th><th>lag ms</th>${L.src === 'test' ? '<th>off by px</th>' : ''}</tr>${rows}</table>
    <div class="note">For the circled point, over the last 4 s. Shake: lower is steadier (best measured standing still). Lag: lower is quicker (needs movement to measure).${L.src === 'test' ? ' Off by: average distance from the true path (dashed).' : ''}</div>`;
}

// ---------------- panel ----------------
function setStatus(m) { L.status = m; let e = $('status'); if (e) e.textContent = m; }
function setSource(v) {
  L.src = v; resetStreams(); stopWebcam(); REP.frames = v === 'replay' ? REP.frames : null;
  if (v === 'pose' || v === 'hands' || v === 'both') { L.stream = v === 'hands' ? 'hand0' : 'pose'; startWebcam(); }
  else if (v === 'kinect') { L.stream = 'kinect'; setStatus('Kinect: type the Kinectron app’s IP address and press Connect'); }
  else if (v === 'test') { L.stream = 'test'; TEST.t0 = performance.now(); setStatus('Test motion: still, a slow figure-eight, still, fast swipes, still (repeats every 8 s), with webcam-like shake. The dashed line is the true path.'); }
  else if (v === 'replay') { L.stream = 'pose'; if (!REP.frames) setStatus('Load a recording: a lab recording, or an Arm Follow log (O in Arm Follow)'); }
  L.point = STREAMS[L.stream].def; updatePanel();
}
function updatePanel() {
  $('src').value = L.src;
  for (let id of ['g-cam', 'g-kinect', 'g-replay', 'g-test']) $(id).style.display = 'none';
  if (['pose', 'hands', 'both'].includes(L.src)) $('g-cam').style.display = 'block';
  if (L.src === 'kinect') $('g-kinect').style.display = 'block';
  if (L.src === 'replay') $('g-replay').style.display = 'block';
  if (L.src === 'test') $('g-test').style.display = 'block';
  // which point to graph
  let avail = Object.keys(STREAMS).filter(k => k === L.stream || ST[k]);
  $('stream').innerHTML = avail.map(k => `<option value="${k}">${STREAMS[k].name}</option>`).join(''); $('stream').value = L.stream;
  $('point').innerHTML = Object.entries(STREAMS[L.stream].pts).map(([i, n]) => `<option value="${i}">${n}</option>`).join(''); $('point').value = L.point;
  $('show').innerHTML = METHODS.map(m => `<option value="${m.id}">${m.name}</option>`).join(''); $('show').value = L.show;
  $('btn-rec').textContent = REC.on ? 'Stop + save recording' : 'Record'; $('btn-rec').classList.toggle('on', REC.on);
  $('btn-ghost').classList.toggle('on', L.ghost); $('btn-mirror').classList.toggle('on', L.mirror);
}
function buildMethods() {
  $('methods').innerHTML = METHODS.map(m => `
    <div class="m" style="--c:${m.col}">
      <label class="mh"><input type="checkbox" data-on="${m.id}" ${m.on ? 'checked' : ''}><span class="dot"></span>${m.name}<span class="tip" title="${m.info}">i</span></label>
      ${(m.sliders || []).map(([k, lab, lo, hi, st, fmt]) => `<div class="f"><label>${lab}<span class="val" id="v-${m.id}-${k}">${fmt(m.params[k])}</span></label><input type="range" data-m="${m.id}" data-k="${k}" min="${lo}" max="${hi}" step="${st}" value="${m.params[k]}"></div>`).join('')}
    </div>`).join('');
  document.querySelectorAll('[data-on]').forEach(el => el.onchange = () => { METHODS.find(m => m.id === el.dataset.on).on = el.checked; });
  document.querySelectorAll('input[data-m]').forEach(el => el.oninput = () => {
    let m = METHODS.find(q => q.id === el.dataset.m), k = el.dataset.k, sl = m.sliders.find(q => q[0] === k);
    m.params[k] = parseFloat(el.value); $('v-' + m.id + '-' + k).textContent = sl[5](m.params[k]);
    if (m.id === 'avg' || m.id === 'delay') resetFilters();   // these keep a buffer sized by their setting
  });
}
function saveRecording() {
  let d = { lab: 1, saved: new Date().toISOString(), src: L.src, frames: REC.frames };
  let a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' }));
  a.download = 'tracking-lab-' + L.src + '-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json'; document.body.appendChild(a); a.click(); a.remove();
  setStatus('Saved ' + REC.frames.length + ' frames. Load it under Input → Recording to compare every method on exactly this movement.');
}
function saveSettings() {
  let d = { lab: 'settings', saved: new Date().toISOString(), methods: METHODS.map(m => ({ id: m.id, name: m.name, on: m.on, params: m.params })) };
  navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(d, null, 1)).then(() => setStatus('Settings copied: paste them to Claude to use them in Arm Follow.'), () => setStatus(JSON.stringify(d)));
}
function setup() {
  cv = $('view'); cx = cv.getContext('2d'); gv = $('graphs'); gx = gv.getContext('2d');
  let rs = () => { for (let c of [cv, gv]) { let r = c.getBoundingClientRect(); c.width = Math.max(100, r.width * devicePixelRatio); c.height = Math.max(100, r.height * devicePixelRatio); } };
  window.addEventListener('resize', rs); rs();
  buildMethods();
  $('src').onchange = e => setSource(e.target.value);
  navigator.mediaDevices && navigator.mediaDevices.enumerateDevices().then(d => { let v = d.filter(x => x.kind === 'videoinput'); $('cam').innerHTML = v.map((c, i) => `<option value="${c.deviceId}">${c.label || 'Camera ' + (i + 1)}</option>`).join(''); }).catch(() => {});
  $('cam').onchange = e => { L.camId = e.target.value; if (['pose', 'hands', 'both'].includes(L.src)) startWebcam(); };
  $('model').onchange = e => { L.model = e.target.value; if (['pose', 'both'].includes(L.src)) startWebcam(); };
  $('kip').value = L.kip; $('btn-kc').onclick = () => { L.kip = $('kip').value.trim() || '127.0.0.1'; connectKinect(); };
  $('file').onchange = e => { if (e.target.files[0]) loadFile(e.target.files[0]); };
  $('noise').oninput = e => { TEST.noise = parseFloat(e.target.value); $('v-noise').textContent = TEST.noise.toFixed(1) + ' px'; };
  $('stream').onchange = e => { L.stream = e.target.value; L.point = STREAMS[L.stream].def; updatePanel(); };
  $('point').onchange = e => { L.point = parseInt(e.target.value); };
  $('show').onchange = e => { L.show = e.target.value; };
  $('secs').oninput = e => { L.secs = parseFloat(e.target.value); $('v-secs').textContent = L.secs + ' s'; };
  $('btn-ghost').onclick = () => { L.ghost = !L.ghost; updatePanel(); };
  $('btn-mirror').onclick = () => { L.mirror = !L.mirror; updatePanel(); };
  $('btn-rec').onclick = () => { if (REC.on) { REC.on = false; saveRecording(); } else { REC.on = true; REC.frames = []; REC.t0 = performance.now(); setStatus('Recording… press again to stop and save.'); } updatePanel(); };
  $('btn-reset').onclick = () => { resetFilters(); setStatus('Filters restarted.'); };
  $('btn-copy').onclick = saveSettings;
  // the little i's
  let box = $('tipbox');
  document.addEventListener('mouseover', e => { let t = e.target.closest('.tip'); if (!t) { box.style.opacity = 0; return; } box.textContent = t.title || t.dataset.tip; if (t.title) { t.dataset.tip = t.title; t.removeAttribute('title'); } let r = t.getBoundingClientRect(); box.style.left = Math.max(8, Math.min(innerWidth - 270, r.left - 120)) + 'px'; box.style.top = (r.bottom + 8) + 'px'; box.style.opacity = 1; });
  setSource('test');
  requestAnimationFrame(frame);
}
window.addEventListener('load', setup);
