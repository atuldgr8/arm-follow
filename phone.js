// ============================================================
// ARM FOLLOW · phone.js
// An iPhone as the tracker, instead of the webcam. The Body Stream app (iphone/ in this repo)
// runs Apple's body tracking (ARKit, helped by the LiDAR on Pro iPhones) and sends the skeleton
// over Wi-Fi: real metres, real depth, already standing upright (the phone knows which way is down).
// So none of the webcam's guessing (how far away, which way an arm points, camera tilt) is needed.
// It also sends a small picture, for the camera view in the corner.
//
// The app's coordinates: x = metres to the camera's right, y = metres up, z = metres in front of
// the camera (along the floor). Same directions as the webcam's, so everything after this is shared.
// ============================================================

const PHONE = { ws: null, ix: null, msg: null, fresh: false, img: null, url: null, f: {}, seen: 0, want: 'body', bmp: null, bmpN: 0, decoding: false, cam: null, depth: null };
function phoneOn() { return SET.source === 'mediapipe' && SET.tracker === 'iphone'; }
function phoneURL() { let a = (SET.phoneIP || '').trim().replace(/^\w+:\/\//, '').replace(/\/.*$/, ''); return a ? (a.includes(':') ? a : a + ':8443') : ''; }
const PHONE_WANT = { iphone: 'body', phonecam: 'camera', phonedepth: 'depth', webdepth: 'depth' };   // Arm Follow's tracker → the phone's mode

// want: 'body' (Apple's body tracking, the skeleton comes over), 'camera' (the ultra-wide pictures come over and
// MediaPipe runs on them here, like a wireless webcam) or 'depth' (the same, plus the LiDAR's depth map for the
// middle of the picture). The phone switches when asked.
function startPhone(want) {
  stopPhone();
  PHONE.want = want || 'body';
  let a = phoneURL();
  if (!a) { TRK.status = 'iPhone: type the address the Body Stream app shows, then Connect'; PHONE.state = 'idle'; return; }
  TRK.status = 'iPhone: connecting to ' + a + ' …';
  let ws;
  try { ws = new WebSocket('wss://' + a); } catch (e) { TRK.status = 'iPhone: ' + (e.message || e); return; }
  let pictures = PHONE.want !== 'body';
  PHONE.ws = ws; ws.binaryType = pictures ? 'arraybuffer' : 'blob'; PHONE.state = 'connecting';
  let ask = () => { try { ws.send(JSON.stringify({ want: PHONE.want })); } catch (x) {} };
  ws.onopen = () => { if (PHONE.ws !== ws) return; PHONE.state = 'open'; ask(); TRK.status = pictures ? 'iPhone camera: connected, waiting for pictures' : 'iPhone: connected, waiting for a body'; };
  ws.onerror = () => {
    if (PHONE.ws !== ws) return;
    PHONE.state = 'failed';
    TRK.status = 'iPhone: could not connect to ' + a + '. Once per laptop: open https://' + a + ' in a new tab, choose Advanced → Proceed, then press Connect again. Same Wi-Fi as the phone?';
  };
  ws.onclose = () => { if (PHONE.ws === ws) { PHONE.ws = null; if (PHONE.state !== 'failed') PHONE.state = 'closed'; if (!/could not connect/.test(TRK.status)) TRK.status = 'iPhone: disconnected (press Connect)'; } };
  ws.onmessage = e => {
    if (PHONE.ws !== ws) return;
    PHONE.lastMsg = performance.now();
    if (typeof e.data !== 'string' && pictures) {
      let buf = e.data, u8 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
      if (u8[0] === 68 && u8[1] === 80 && u8[2] === 84 && u8[3] === 72) {   // "DPTH": a depth map
        let dv = new DataView(buf), w = dv.getUint16(4, true), h = dv.getUint16(6, true);
        if (buf.byteLength >= 8 + w * h * 2) PHONE.depth = { w, h, data: new Uint16Array(buf.slice(8, 8 + w * h * 2)), t: performance.now() };
        return;
      }
      if (PHONE.decoding) return;   // a picture for MediaPipe: the newest only
      PHONE.decoding = true;
      createImageBitmap(new Blob([buf], { type: 'image/jpeg' })).then(b => { if (PHONE.bmp && PHONE.bmp.close) PHONE.bmp.close(); PHONE.bmp = b; PHONE.bmpN++; PHONE.decoding = false; }).catch(() => { PHONE.decoding = false; });
      return;
    }
    if (typeof e.data !== 'string') {   // body mode: the picture, for the camera view
      let url = URL.createObjectURL(e.data), im = new Image();
      im.onload = () => { if (PHONE.url) URL.revokeObjectURL(PHONE.url); PHONE.url = url; PHONE.img = im; };
      im.onerror = () => URL.revokeObjectURL(url);
      im.src = url; return;
    }
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.mode === 'camera' || m.mode === 'depth') {
      PHONE.cam = m;
      if (m.mode !== PHONE.want) { ask(); return; }   // the phone is in another mode: ask again
      if (m.problem) TRK.status = 'iPhone: ' + m.problem;
      // the lens's real field of view, so distances are judged right
      let hf = m.hfov || m.fov;   // across the picture as sent (an upright phone turns its picture a quarter)
      // (webcam + depth: the fov stays the webcam's)
      if (hf && SET.tracker !== 'webdepth' && Math.abs(SET.fov - Math.round(hf)) >= 1) { SET.fov = Math.round(hf); let el = document.getElementById('fov'); if (el) { el.value = SET.fov; el.dispatchEvent(new Event('input')); } }
      return;
    }
    if (pictures) { if (!PHONE.asked || performance.now() - PHONE.asked > 1000) { PHONE.asked = performance.now(); ask(); } return; }   // still in body mode: ask again
    if (m.n) { PHONE.ix = {}; m.n.forEach((n, i) => { PHONE.ix[n] = i; }); }
    PHONE.msg = m; PHONE.fresh = true;
  };
}
function stopPhone() {
  if (PHONE.ws) { let w = PHONE.ws; PHONE.ws = null; try { w.close(); } catch (e) {} }
  PHONE.state = 'idle';
  PHONE.msg = null; PHONE.fresh = false; PHONE.img = null; PHONE.f = {}; PHONE.depth = null; PHONE.cam = null;
  if (PHONE.bmp && PHONE.bmp.close) PHONE.bmp.close(); PHONE.bmp = null; PHONE.decoding = false;
  if (PHONE.url) { URL.revokeObjectURL(PHONE.url); PHONE.url = null; }
}

// ---------------- LiDAR depth for MediaPipe's joints (tracker: iPhone ultra-wide + depth) ----------------
// The depth map covers the middle of the ultra-wide picture (the LiDAR sees about as wide as the main lens).
// Both lenses sit about a centimetre apart and look the same way, so a picture point maps to the depth map
// by the two lenses' fields of view alone.
function depthZone() {   // where the depth map sits in the picture: { x0, x1, y0, y1 } in 0..1, or null
  let D = PHONE.depth, cm = PHONE.cam; if (!D || !cm) return null;
  let fx, fy;
  if (cm.zx) { fx = cm.zx; fy = cm.zy; }   // the phone works it out, whichever way it's held
  else if (cm.fov && cm.dfov) { fx = Math.tan(cm.dfov * Math.PI / 360) / Math.tan(cm.fov * Math.PI / 360); fy = fx * (D.h / D.w) / ((cm.H || 540) / (cm.W || 960)); }
  else return null;
  return { x0: 0.5 - fx / 2, x1: 0.5 + fx / 2, y0: 0.5 - fy / 2, y1: 0.5 + fy / 2 };
}
// metres along the camera's axis at picture point (u, v), or 0 (outside the zone, or no reading).
// A thin limb can let the background through, so of the 5×5 points around it, the nearer quarter is used.
function depthAt(u, v) {
  let D = PHONE.depth, Z = depthZone(); if (!Z) return 0;
  let dx = (u - Z.x0) / (Z.x1 - Z.x0), dy = (v - Z.y0) / (Z.y1 - Z.y0);
  if (dx < 0.02 || dx > 0.98 || dy < 0.02 || dy > 0.98) return 0;
  let cx = Math.round(dx * (D.w - 1)), cy = Math.round(dy * (D.h - 1)), vals = [];
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    if (x < 0 || y < 0 || x >= D.w || y >= D.h) continue;
    let mm = D.data[y * D.w + x]; if (mm > 250 && mm < 6000) vals.push(mm);
  }
  if (vals.length < 5) return 0;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length * 0.25)] / 1000;
}
// the LiDAR sees the skin or clothes in front of a joint: torso joints sit about 9 cm behind it, limbs about 3.5
const DEPTH_IN = i => (i === 11 || i === 12 || i === 23 || i === 24) ? 0.09 : i === 0 ? 0.08 : 0.035;
// MediaPipe's joints with real distances where the depth map has them. Returns { wl, T, meas } (wl: hip-centred
// metres, as MediaPipe's own; T: the hips' place from the camera; meas: which joints were measured) or null.
function fuseDepth(c) {
  let cm = PHONE.cam, web = SET.tracker === 'webdepth';
  if (!PHONE.depth || !cm || performance.now() - PHONE.depth.t > 400) return null;
  if (web && !alignReady()) return null;   // webcam + depth: until the two cameras are lined up, the webcam guesses as usual
  // half the view across and up-down, as slopes (from the phone, which knows which way it's held; or the webcam's)
  let tx, ty;
  if (web) { let wt = webTan(); tx = wt.tx; ty = wt.ty; }
  else { tx = cm.tx || Math.tan(cm.fov * Math.PI / 360); ty = cm.ty || tx * (cm.H || 540) / (cm.W || 960); }
  let P = c.lm.map((q, i) => {
    if (!q || (q.visibility !== undefined && q.visibility < 0.5)) return null;
    let pu = web ? alignMap(q.x, q.y) : { u: q.x, v: q.y };
    let z = depthAt(pu.u, pu.v); if (!z) return null;
    z += DEPTH_IN(i);
    return { x: (q.x - 0.5) * 2 * tx * z, y: (q.y - 0.5) * 2 * ty * z, z };
  });
  if (!P[23] || !P[24]) return null;   // the hips must be measured, or nothing is placed by depth
  let H = { x: (P[23].x + P[24].x) / 2, y: (P[23].y + P[24].y) / 2, z: (P[23].z + P[24].z) / 2 };
  return { wl: c.wl.map((w, i) => P[i] ? { x: P[i].x - H.x, y: P[i].y - H.y, z: P[i].z - H.z } : w), T: H, meas: P.map(p => !!p) };
}

// ---------------- WEBCAM + iPHONE DEPTH (tracker: webdepth) ----------------
// The webcam finds the body (MediaPipe, where it is strongest); the iPhone, standing right beside the
// webcam and facing the same way, measures how far away each joint is (its LiDAR). To know which spot in
// the phone's picture a webcam point is, the two are LINED UP AUTOMATICALLY: a second, light body model
// reads the phone's own pictures a few times a second, and the same joints seen by both cameras are fitted
// with a straight line per direction (scale and offset in viewing angle), forgetting old frames slowly. No
// clicking, no markers: stand where both can see you for a few seconds. Until then the webcam guesses as usual.
const ALIGN = { x: null, y: null, w: 0, last: 0, can: null };
const ALIGN_J = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
function alignReset() { ALIGN.x = [0, 0, 0, 0, 0]; ALIGN.y = [0, 0, 0, 0, 0]; ALIGN.w = 0; ALIGN.last = 0; }
alignReset();
function webTan() {
  let v = MP.video, W = (v && (v.videoWidth || v.width)) || 1280, H = (v && (v.videoHeight || v.height)) || 720;
  let tx = Math.tan(SET.fov * Math.PI / 360); return { tx, ty: tx * H / W };
}
function alignReady() { return ALIGN.w > 12; }
// the fitted line: phone picture coordinate = A × (webcam viewing slope) + B. Before enough data (and as a
// gentle pull when you stand still in one place), the lenses' fields of view say A, and B is the middle.
function alignLine(S, prior) {
  let [w, sx, sy, sxx, sxy] = S, lam = 0.05;
  if (w < 1) return { A: prior, B: 0.5 };
  let cxx = sxx - sx * sx / w, cxy = sxy - sx * sy / w;
  let A = (cxy + lam * prior) / (cxx + lam), B = (sy - A * sx) / w;
  if (!(A > prior * 0.5 && A < prior * 2)) A = prior;
  return { A, B };
}
function alignLines() {
  let cm = PHONE.cam || {}, ptx = cm.tx || Math.tan((cm.fov || 106) * Math.PI / 360), pty = cm.ty || ptx * 0.5625;
  return { X: alignLine(ALIGN.x, 1 / (2 * ptx)), Y: alignLine(ALIGN.y, 1 / (2 * pty)) };
}
function alignMap(u, v) {
  let t = webTan(), L = alignLines();
  return { u: L.X.A * (u - 0.5) * 2 * t.tx + L.X.B, v: L.Y.A * (v - 0.5) * 2 * t.ty + L.Y.B };
}
function alignInv(u, v) {   // a phone picture point → where it is in the webcam's picture
  let t = webTan(), L = alignLines();
  return { u: 0.5 + (u - L.X.B) / L.X.A / (2 * t.tx), v: 0.5 + (v - L.Y.B) / L.Y.A / (2 * t.ty) };
}
// a few times a second: the body model on the phone's picture, matched joint by joint with the webcam's
function alignTick(now, webFound) {
  if (SET.tracker !== 'webdepth' || !MP.phoneLm || !PHONE.bmp || PHONE.bmpN === ALIGN.bmpN || now - ALIGN.last < 220) return;
  ALIGN.last = now; ALIGN.bmpN = PHONE.bmpN;
  if (webFound.length !== 1) return;   // one person in view of the webcam, or we can't be sure who is who
  let c = ALIGN.can || (ALIGN.can = document.createElement('canvas'));
  if (c.width !== PHONE.bmp.width || c.height !== PHONE.bmp.height) { c.width = PHONE.bmp.width; c.height = PHONE.bmp.height; }
  c.getContext('2d').drawImage(PHONE.bmp, 0, 0);
  let r; try { r = MP.phoneLm.detectForVideo(c, now); } catch (e) { return; }
  let pl = r.landmarks && r.landmarks[0], wl = webFound[0].lm; if (!pl || !wl) return;
  let t = webTan(), k = 0.98;   // older frames fade out (half gone in about 10 s)
  for (let i = 0; i < 5; i++) { ALIGN.x[i] *= k; ALIGN.y[i] *= k; }
  ALIGN.w *= k;
  let ok = q => q && (q.visibility === undefined || q.visibility > 0.7) && q.x > 0.02 && q.x < 0.98 && q.y > 0.02 && q.y < 0.98;
  for (let i of ALIGN_J) {
    let a = wl[i], b = pl[i]; if (!ok(a) || !ok(b)) continue;
    let sx = (a.x - 0.5) * 2 * t.tx, sy = (a.y - 0.5) * 2 * t.ty;
    for (let [S, x, y] of [[ALIGN.x, sx, b.x], [ALIGN.y, sy, b.y]]) { S[0] += 1; S[1] += x; S[2] += y; S[3] += x * x; S[4] += x * y; }
    ALIGN.w += 1;
  }
}
// what the iPhone part is doing, in words (under the Connect button)
function depthStatus() {
  if (!PHONE.ws) return TRK.status;
  if (!PHONE.depth) return 'iPhone: connected, waiting for depth (is the phone in Camera + depth mode?)';
  if (!alignReady()) return 'Lining up the two cameras… stand where both can see all of you';
  let M = MPF[1] || MPF[2], n = M && M.meas ? M.meas.filter(Boolean).length : 0;
  return 'Lined up ✓ · LiDAR measures ' + n + ' of 33 joints' + (n && M.meas[23] && M.meas[24] ? ' · where you stand: measured' : ' · hips outside the LiDAR zone');
}

// Apple's joint names → this prototype's (first name found wins)
const PH_J = { pelvis: ['hips_joint'], head: ['head_joint'], neck: ['neck_1_joint'] };
for (let [s, side] of [['L', 'left'], ['R', 'right']]) {
  Object.assign(PH_J, {
    ['sh' + s]: [side + '_arm_joint', side + '_shoulder_1_joint'], ['el' + s]: [side + '_forearm_joint'], ['wr' + s]: [side + '_hand_joint'],
    ['in' + s]: [side + '_handIndexStart_joint', side + '_handIndex_1_joint', side + '_handMidStart_joint'],
    ['pi' + s]: [side + '_handPinkyStart_joint', side + '_handPinky_1_joint'],
    ['th' + s]: [side + '_handThumbStart_joint', side + '_handThumb_1_joint'],
    ['hip' + s]: [side + '_upLeg_joint'], ['kn' + s]: [side + '_leg_joint'], ['an' + s]: [side + '_foot_joint'],
  });
}
// the same joints as the webcam's 33 points, so the camera view, gestures and stats work unchanged
const PH_MP = [[0, 'head'], [7, 'head'], [8, 'head'], [11, 'shL'], [12, 'shR'], [13, 'elL'], [14, 'elR'], [15, 'wrL'], [16, 'wrR'],
  [17, 'piL'], [18, 'piR'], [19, 'inL'], [20, 'inR'], [21, 'thL'], [22, 'thR'], [23, 'hipL'], [24, 'hipR'], [25, 'knL'], [26, 'knR'], [27, 'anL'], [28, 'anR']];

function phoneTick(now) {
  if (!PHONE.fresh) return;
  PHONE.fresh = false;
  let m = PHONE.msg, ix = PHONE.ix;
  TRK.hzFrames++;
  if (now - TRK.hzStart > 1000) { TRK.hz = TRK.hzFrames * 1000 / (now - TRK.hzStart); TRK.hzFrames = 0; TRK.hzStart = now; }
  if (!m || !m.p || !ix) { MP.found = []; if (PHONE.ws) TRK.status = 'iPhone: connected, nobody in view (stand 2–4 m in front of the phone)'; return; }
  let at = name => { let i = ix[name]; return i === undefined || m.p.length < i * 3 + 3 ? null : i; };
  let pick = n => { for (let name of PH_J[n]) { let i = at(name); if (i !== null) return i; } return null; };
  let sx = SET.mirror ? -1 : 1, t = now / 1000, fz = feelPx();
  let ih = pick('pelvis'); if (ih === null) return;
  let yH = m.p[ih * 3 + 1], j = {}, lm = new Array(33).fill(null);
  for (let n in PH_J) {
    let i = pick(n); if (i === null) continue;
    let x = m.p[i * 3], y = m.p[i * 3 + 1], z = m.p[i * 3 + 2];
    // already steady (the phone smooths it); a light filter in millimetres takes off what's left
    let f = PHONE.f[n] || (PHONE.f[n] = [new OneEuro(), new OneEuro(), new OneEuro()]);
    let mc = fz.minC * 2, b = fz.beta;
    x = f[0].filter(x * 1000, t, mc, b) / 1000; y = f[1].filter(y * 1000, t, mc, b) / 1000; z = f[2].filter(z * 1000, t, mc, b) / 1000;
    j[n] = V(sx * x, 0.95 + (y - yH), z);
    if (m.u && m.u.length >= i * 2 + 2) {
      for (let [k, nn] of PH_MP) { if (nn === n) lm[k] = { x: m.u[i * 2], y: m.u[i * 2 + 1], z: 0, visibility: 1 }; }
    }
  }
  if (!j.shL || !j.shR || !j.hipL || !j.hipR) return;
  if (!j.neck) j.neck = vmid(j.shL, j.shR);
  if (!j.head) j.head = vadd(j.neck, V(0, 0.2, 0));
  // which slot this phone fills: as with the webcam (computer partner, 2 spaces, or P1)
  let slot = SET.comp !== 'off' ? (SET.comp === 'P2' ? 1 : 2) : SET.spaces === 2 ? NET.myId : 1;
  let ok = lm[0] && lm[11] && lm[12] && lm[23] && lm[24];
  MP.found = ok ? [lm] : [];
  let H = m.H || 1440, W = m.W || 1920;
  let img = ok ? { x: (lm[23].x + lm[24].x) / 2, y: (lm[23].y + lm[24].y) / 2 } : { x: 0.5, y: 0.5 };
  let size = ok ? Math.hypot(((lm[11].x + lm[12].x) - (lm[23].x + lm[24].x)) / 2 * W, ((lm[11].y + lm[12].y) - (lm[23].y + lm[24].y)) / 2 * H) / H : 0.3;
  setPerson(slot, null, { j, chir: SET.mirror ? 1 : -1, lm: ok ? lm : null, lmS: ok ? lm : null, hands: {}, img, size, dist: j.pelvis.z, distT: j.pelvis.z }, now, 'glide');
  if (ok) gestureTick(slot, lm, now);
  PHONE.seen = now;
  TRK.status = 'iPhone: tracking · ' + j.pelvis.z.toFixed(2) + ' m away';
}
