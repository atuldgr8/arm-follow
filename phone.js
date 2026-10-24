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

const PHONE = { ws: null, ix: null, msg: null, fresh: false, img: null, url: null, f: {}, seen: 0 };
function phoneOn() { return SET.source === 'mediapipe' && SET.tracker === 'iphone'; }
function phoneURL() { let a = (SET.phoneIP || '').trim().replace(/^\w+:\/\//, '').replace(/\/.*$/, ''); return a ? (a.includes(':') ? a : a + ':8443') : ''; }

function startPhone() {
  stopPhone();
  let a = phoneURL();
  if (!a) { TRK.status = 'iPhone: type the address the Body Stream app shows, then Connect'; return; }
  TRK.status = 'iPhone: connecting to ' + a + ' …';
  let ws;
  try { ws = new WebSocket('wss://' + a); } catch (e) { TRK.status = 'iPhone: ' + (e.message || e); return; }
  PHONE.ws = ws; ws.binaryType = 'blob';
  ws.onopen = () => { if (PHONE.ws === ws) TRK.status = 'iPhone: connected, waiting for a body'; };
  ws.onerror = () => {
    if (PHONE.ws !== ws) return;
    TRK.status = 'iPhone: could not connect to ' + a + '. Once per laptop: open https://' + a + ' in a new tab, choose Advanced → Proceed, then press Connect again. Same Wi-Fi as the phone?';
  };
  ws.onclose = () => { if (PHONE.ws === ws) { PHONE.ws = null; if (!/could not connect/.test(TRK.status)) TRK.status = 'iPhone: disconnected (press Connect)'; } };
  ws.onmessage = e => {
    if (PHONE.ws !== ws) return;
    if (typeof e.data !== 'string') {   // the picture, for the camera view
      let url = URL.createObjectURL(e.data), im = new Image();
      im.onload = () => { if (PHONE.url) URL.revokeObjectURL(PHONE.url); PHONE.url = url; PHONE.img = im; };
      im.onerror = () => URL.revokeObjectURL(url);
      im.src = url; return;
    }
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.n) { PHONE.ix = {}; m.n.forEach((n, i) => { PHONE.ix[n] = i; }); }
    PHONE.msg = m; PHONE.fresh = true;
  };
}
function stopPhone() {
  if (PHONE.ws) { let w = PHONE.ws; PHONE.ws = null; try { w.close(); } catch (e) {} }
  PHONE.msg = null; PHONE.fresh = false; PHONE.img = null; PHONE.f = {};
  if (PHONE.url) { URL.revokeObjectURL(PHONE.url); PHONE.url = null; }
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
