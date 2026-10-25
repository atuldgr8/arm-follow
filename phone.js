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
const PHONE_WANT = { iphone: 'body', phonecam: 'camera', phonedepth: 'depth' };   // Arm Follow's tracker → the phone's mode

// want: 'body' (Apple's body tracking, the skeleton comes over), 'camera' (the ultra-wide pictures come over and
// MediaPipe runs on them here, like a wireless webcam) or 'depth' (the same, plus the LiDAR's depth map for the
// middle of the picture). The phone switches when asked.
function startPhone(want) {
  stopPhone();
  PHONE.want = want || 'body';
  let a = phoneURL();
  if (!a) { TRK.status = 'iPhone: type the address the Body Stream app shows, then Connect'; return; }
  TRK.status = 'iPhone: connecting to ' + a + ' …';
  let ws;
  try { ws = new WebSocket('wss://' + a); } catch (e) { TRK.status = 'iPhone: ' + (e.message || e); return; }
  let pictures = PHONE.want !== 'body';
  PHONE.ws = ws; ws.binaryType = pictures ? 'arraybuffer' : 'blob';
  let ask = () => { try { ws.send(JSON.stringify({ want: PHONE.want })); } catch (x) {} };
  ws.onopen = () => { if (PHONE.ws !== ws) return; ask(); TRK.status = pictures ? 'iPhone camera: connected, waiting for pictures' : 'iPhone: connected, waiting for a body'; };
  ws.onerror = () => {
    if (PHONE.ws !== ws) return;
    TRK.status = 'iPhone: could not connect to ' + a + '. Once per laptop: open https://' + a + ' in a new tab, choose Advanced → Proceed, then press Connect again. Same Wi-Fi as the phone?';
  };
  ws.onclose = () => { if (PHONE.ws === ws) { PHONE.ws = null; if (!/could not connect/.test(TRK.status)) TRK.status = 'iPhone: disconnected (press Connect)'; } };
  ws.onmessage = e => {
    if (PHONE.ws !== ws) return;
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
      if (m.fov && Math.abs(SET.fov - Math.round(m.fov)) >= 1) { SET.fov = Math.round(m.fov); let el = document.getElementById('fov'); if (el) { el.value = SET.fov; el.dispatchEvent(new Event('input')); } }
      return;
    }
    if (pictures) { if (!PHONE.asked || performance.now() - PHONE.asked > 1000) { PHONE.asked = performance.now(); ask(); } return; }   // still in body mode: ask again
    if (m.n) { PHONE.ix = {}; m.n.forEach((n, i) => { PHONE.ix[n] = i; }); }
    PHONE.msg = m; PHONE.fresh = true;
  };
}
function stopPhone() {
  if (PHONE.ws) { let w = PHONE.ws; PHONE.ws = null; try { w.close(); } catch (e) {} }
  PHONE.msg = null; PHONE.fresh = false; PHONE.img = null; PHONE.f = {}; PHONE.depth = null; PHONE.cam = null;
  if (PHONE.bmp && PHONE.bmp.close) PHONE.bmp.close(); PHONE.bmp = null; PHONE.decoding = false;
  if (PHONE.url) { URL.revokeObjectURL(PHONE.url); PHONE.url = null; }
}

// ---------------- LiDAR depth for MediaPipe's joints (tracker: iPhone ultra-wide + depth) ----------------
// The depth map covers the middle of the ultra-wide picture (the LiDAR sees about as wide as the main lens).
// Both lenses sit about a centimetre apart and look the same way, so a picture point maps to the depth map
// by the two lenses' fields of view alone.
function depthZone() {   // where the depth map sits in the picture: { x0, x1, y0, y1 } in 0..1, or null
  let D = PHONE.depth, cm = PHONE.cam; if (!D || !cm || !cm.fov || !cm.dfov) return null;
  let fx = Math.tan(cm.dfov * Math.PI / 360) / Math.tan(cm.fov * Math.PI / 360);
  let fy = fx * (D.h / D.w) / ((cm.H || 540) / (cm.W || 960));
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
  let cm = PHONE.cam;
  if (!PHONE.depth || !cm || performance.now() - PHONE.depth.t > 400) return null;
  let tu = Math.tan(cm.fov * Math.PI / 360), asp = (cm.H || 540) / (cm.W || 960);
  let P = c.lm.map((q, i) => {
    if (!q || (q.visibility !== undefined && q.visibility < 0.5)) return null;
    let z = depthAt(q.x, q.y); if (!z) return null;
    z += DEPTH_IN(i);
    return { x: (q.x - 0.5) * 2 * tu * z, y: (q.y - 0.5) * 2 * tu * asp * z, z };
  });
  if (!P[23] || !P[24]) return null;   // the hips must be measured, or nothing is placed by depth
  let H = { x: (P[23].x + P[24].x) / 2, y: (P[23].y + P[24].y) / 2, z: (P[23].z + P[24].z) / 2 };
  return { wl: c.wl.map((w, i) => P[i] ? { x: P[i].x - H.x, y: P[i].y - H.y, z: P[i].z - H.z } : w), T: H, meas: P.map(p => !!p) };
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
