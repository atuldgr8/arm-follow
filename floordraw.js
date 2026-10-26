// ============================================================
// ARM FOLLOW · floordraw.js
// DRAW THE FLOOR from inside the camera's view: a second way to measure the floor (the first is
// walking to its edges, floor.js).
//
// Open it (Draw it / Draw the floor on the camera) and a big camera picture fills the stage.
// Walk to a corner of your play area and hold a T-POSE for a second: a corner is added where you
// stand (between your feet). Walk to the next corner, T-pose, and so on for all four. Then drag any
// corner to fix it, or click to add one by hand. Use this floor (Enter); Esc cancels.
//
// ITS REAL SIZE, worked out from walking it: the whole time the view is open, the app notes how far
// away you look (your body's size and shape) against how low your feet are in the picture. Walking to
// corners near and far gives the straight-line fit between the two (the same one the feet use for
// where you stand), and that turns each corner in the picture into metres on the floor. If you didn't
// walk toward and away from the camera enough for that, each corner is placed where you were tracked
// when you marked it. A typed size (if you measured) always wins.
//
// The result is a floor like the walked one (CAL.rect, in this camera's metres), plus where the floor
// sits in the picture (fa, fb) for the feet. Each laptop draws its own. Floor → "The floor comes from"
// switches between the walked and the drawn floor, to compare.
// ============================================================

const FD = { on: false, pts: [], at: [], drag: -1, samples: [], pic: null, box: null, est: null, tp: { since: 0, armed: true, k: 0 } };
// the drawn floor is kept beside the walked one; CAL.rect is whichever is in use
CAL.walked = CAL.rect;
try { let s = localStorage.getItem('armfollow.floorDrawn'); if (s) { let r = JSON.parse(s); if (r && r.drawn) CAL.drawn = r; } } catch (e) {}
try { let f = localStorage.getItem('armfollow.floorFrom'); if (f === 'drawn' || f === 'walked') SET.floorFrom = f; } catch (e) {}
if (SET.floorFrom === 'drawn') CAL.rect = CAL.drawn || null;
function useFloorFrom(kind) {
  SET.floorFrom = kind;
  try { localStorage.setItem('armfollow.floorFrom', kind); } catch (e) {}
  CAL.rect = (kind === 'drawn' ? CAL.drawn : CAL.walked) || null;
  if (!isGuest() && RUN.phase === 'play') restartWorld();
  updatePanel();
}
const r4 = x => Math.round(x * 10000) / 10000;

// the camera picture, as the corner view shows it
function fdPicture() {
  if (SET.source !== 'mediapipe') return null;
  if (MP.fromPhone) return PHONE.bmp ? { el: MP.video, w: MP.video.width, h: MP.video.height } : null;
  // iPhone body tracking (LiDAR): the small picture the phone sends alongside the skeleton
  if (SET.tracker === 'iphone') return PHONE.img ? { el: PHONE.img, w: PHONE.img.naturalWidth, h: PHONE.img.naturalHeight } : null;
  return MP.video && MP.video.readyState >= 2 ? { el: MP.video, w: MP.video.videoWidth, h: MP.video.videoHeight } : null;
}
// the person drawing: the first one in this laptop's camera
function fdPerson() { for (let k of calSlots()) { let p = live(k); if (p && (p.lmS || p.lm)) return p; } return null; }
const fdVis = q => q && (q.visibility === undefined || q.visibility > 0.6);
function fdFeet(p) {
  let lm = p.lmS || p.lm; if (!lm || !fdVis(lm[27]) || !fdVis(lm[28])) return null;
  let u = (lm[27].x + lm[28].x) / 2, v = Math.max(lm[27].y, lm[28].y);
  return v < 0.985 && v > 0.02 ? { u, v } : null;
}
// T-POSE: both wrists and elbows out to the sides at about shoulder height, held for a second
function fdTpose(p) {
  let lm = p.lmS || p.lm; if (!lm) return false;
  if (![11, 12, 13, 14, 15, 16, 23, 24].every(i => fdVis(lm[i]))) return false;
  let shY = (lm[11].y + lm[12].y) / 2, torso = Math.abs((lm[23].y + lm[24].y) / 2 - shY), shW = Math.abs(lm[11].x - lm[12].x);
  if (torso < 0.03) return false;
  let level = i => Math.abs(lm[i].y - shY) < torso * 0.35;
  let out = (w, s) => Math.abs(lm[w].x - lm[s].x) > Math.max(shW * 0.9, torso * 0.6);
  return level(13) && level(14) && level(15) && level(16) && out(15, 11) && out(16, 12);
}

// ---------------- from the picture to metres on the floor ----------------
// the fit: feet height in the picture = fa + fb / distance (floor.js's fitFloor), from walking it
function fdFit() { return fitFloor(FD.samples); }
// a picture point (as the camera sees it) → this camera's metres (A space: x as shown, z away)
function fdToFloor(q, fit) {
  if (!fit || q.v - fit.a < 0.005) return null;
  let z = fit.b / (q.v - fit.a), tanH = Math.tan(SET.fov * Math.PI / 360);
  return { x: (SET.mirror ? -1 : 1) * (q.u - 0.5) * 2 * z * tanH, z };
}
// the four corners in metres, their edges, and the floor rectangle
function fdEstimate() {
  if (FD.pts.length < 4) return null;
  let fit = fdFit(), F = fit ? FD.pts.map(q => fdToFloor(q, fit)) : null, how = 'walked';
  // iPhone body tracking: where you stood at each T-posed corner is real LiDAR metres, the best there is
  if (SET.tracker === 'iphone' && FD.at.length === 4 && FD.at.every(a => a)) { F = FD.at.map(a => ({ x: a.x, z: a.z })); how = 'measured'; }
  if (!F || F.some(q => !q || q.z < 0.3 || q.z > 12)) {
    // not enough walking toward/away to fit: where you were tracked when you marked each corner
    F = FD.at.map(a => a ? { x: a.x, z: a.z } : null); how = 'tracked';
    if (F.some(q => !q)) return { bad: 'Walk toward and away from the camera a little, or mark every corner with a T-pose (clicked corners need that fit)' };
  }
  let len = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  let byZ = F.slice().sort((a, b) => a.z - b.z), byX = F.slice().sort((a, b) => a.x - b.x);
  let w = (len(byZ[0], byZ[1]) + len(byZ[2], byZ[3])) / 2, d = (len(byX[0], byX[1]) + len(byX[2], byX[3])) / 2;
  let x0 = (byX[0].x + byX[1].x) / 2, x1 = (byX[2].x + byX[3].x) / 2, z0 = (byZ[0].z + byZ[1].z) / 2, z1 = (byZ[2].z + byZ[3].z) / 2;
  return { F, w, d, x0, x1, z0, z1, fit, how };
}

// ---------------- open, close, use ----------------
function fdOpen() {
  if (!fdPicture()) { toast(SET.tracker === 'iphone' ? 'No picture from the iPhone yet: is Body Stream connected?' : 'No camera picture yet'); return; }
  if (CAL.active) calibrate();
  FD.on = true; FD.drag = -1; FD.samples = []; FD.tp = { since: 0, armed: true, k: 0 };
  FD.pts = CAL.drawn && CAL.drawn.quad && CAL.drawn.fov === SET.fov ? CAL.drawn.quad.map(q => ({ u: q[0], v: q[1] })) : [];
  FD.at = FD.pts.map(() => null);
  if (CAL.drawn && CAL.drawn.samples) FD.samples = CAL.drawn.samples.slice();   // redrawing: keep what walking it taught
  let r = CAL.drawn && CAL.drawn.real; $('fd-w').value = r && r.w ? r.w : ''; $('fd-d').value = r && r.d ? r.d : '';
  $('fdraw').style.display = 'flex'; logEvent('draw floor', { what: 'open' });
}
function fdClose() { FD.on = false; $('fdraw').style.display = 'none'; }
function fdUse() {
  let pic = fdPicture(), e = fdEstimate();
  if (!e || e.bad) { toast(e ? e.bad : 'Mark all four corners first'); return; }
  // measured? scale the estimate to it (across and front to back separately; one typed = both)
  let rw = parseFloat($('fd-w').value), rd = parseFloat($('fd-d').value);
  let kx = rw > 0.3 ? rw / e.w : 1, kz = rd > 0.3 ? rd / e.d : kx;
  if (!(rw > 0.3) && rd > 0.3) kx = kz;
  let cx = (e.x0 + e.x1) / 2, xs = [cx + (e.x0 - cx) * kx, cx + (e.x1 - cx) * kx];
  let rect = { x0: Math.min(...xs), x1: Math.max(...xs), z0: e.z0 * kz, z1: e.z1 * kz, v: 2, drawn: true, fov: SET.fov,
    quad: FD.pts.map(q => [r4(q.u), r4(q.v)]), samples: FD.samples.slice(-1500), how: e.how,
    est: { w: r3(e.w), d: r3(e.d) }, real: rw > 0.3 || rd > 0.3 ? { w: rw > 0.3 ? rw : null, d: rd > 0.3 ? rd : null } : null };
  if (rectW(rect) < 0.5 || rectD(rect) < 0.5) { toast('Too small (under 50 cm one way): floor not changed'); return; }
  // where the floor sits in the picture, for the feet (a typed depth rescales distances too)
  if (e.fit) { rect.fa = e.fit.a; rect.fb = e.fit.b * kz; }
  CAL.drawn = rect; CAL.rect = rect; SET.floorFrom = 'drawn'; CAL.skipped = false; CAL.confirmed = true;
  try { localStorage.setItem('armfollow.floorDrawn', JSON.stringify(rect)); localStorage.setItem('armfollow.floorFrom', 'drawn'); } catch (x) {}
  logEvent('draw floor', { w: r3(rectW(rect)), d: r3(rectD(rect)), from: e.how, measured: !!rect.real });
  toast('Floor: ' + rectW(rect).toFixed(1) + ' × ' + rectD(rect).toFixed(1) + ' m (drawn)');
  fdClose();
  if (!isGuest() && RUN.phase === 'play') restartWorld();
  updatePanel();
}

// ---------------- the drawing view (a big camera picture over the stage) ----------------
function fdBox() {
  let c = $('fd-canvas'), pic = FD.pic; if (!pic) return null;
  let W = c.width, H = c.height, s = Math.min(W / pic.w, H / pic.h);
  return { x: (W - pic.w * s) / 2, y: (H - pic.h * s) / 2, w: pic.w * s, h: pic.h * s };
}
// canvas point ⇄ picture point (0..1, as the camera sees it: the view is mirrored like the corner view)
function fdToPic(px, py) { let b = FD.box; let u = (px - b.x) / b.w, v = (py - b.y) / b.h; return { u: SET.mirror ? 1 - u : u, v }; }
function fdToCan(q) { let b = FD.box; return { x: b.x + (SET.mirror ? 1 - q.u : q.u) * b.w, y: b.y + q.v * b.h }; }
function fdTick() {
  if (!FD.on) return;
  let c = $('fd-canvas'), host = $('fdraw'), pic = fdPicture(), now = performance.now(); FD.pic = pic;
  let cw = host.clientWidth - 36, ch = Math.max(200, host.clientHeight - $('fd-top').offsetHeight - $('fd-bot').offsetHeight - 40);
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  let x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
  if (!pic) { x.fillStyle = '#fff'; x.font = '14px monospace'; x.fillText('No camera picture', 20, 30); return; }
  FD.box = fdBox(); let b = FD.box;
  x.save(); if (SET.mirror) { x.translate(b.x * 2 + b.w, 0); x.scale(-1, 1); } x.drawImage(pic.el, b.x, b.y, b.w, b.h); x.restore();
  // walking it: note how far away you look against how low your feet are (for the fit)
  let p = fdPerson(), ft = p && fdFeet(p), dd = p && (p.distT || p.dist);
  if (ft && dd && FD.samples.length < 4000) FD.samples.push([1 / dd, ft.v]);
  // the T-pose adds a corner where you stand
  let cue = 'Walk to a corner of your play area and hold a T-pose', cueSub = 'arms straight out to the sides, for a second';
  if (FD.pts.length >= 4) { cue = 'All four corners marked'; cueSub = 'drag a corner to fix it, then Use this floor (Enter)'; }
  else if (!p) { cue = 'Step into the picture'; cueSub = 'all of you, feet included'; }
  else if (!ft) { cue = 'Your feet aren’t in the picture'; cueSub = 'step back until they are'; }
  else cue = 'Corner ' + (FD.pts.length + 1) + ' of 4 · T-pose where you stand';
  let tp = p && ft && FD.pts.length < 4 && fdTpose(p);
  if (!tp) { FD.tp.since = 0; FD.tp.k = 0; if (p && !fdTpose(p)) FD.tp.armed = true; }
  else if (FD.tp.armed) {
    if (!FD.tp.since) FD.tp.since = now;
    FD.tp.k = clamp((now - FD.tp.since) / 1000, 0, 1);
    if (FD.tp.k >= 1) {
      FD.pts.push({ u: ft.u, v: ft.v }); FD.at.push(p.j && p.j.pelvis ? { x: p.j.pelvis.x, z: p.j.pelvis.z } : null);
      FD.tp = { since: 0, armed: false, k: 0 }; logEvent('draw floor', { corner: FD.pts.length });
      if (typeof tone === 'function') tone(660 + 110 * FD.pts.length, 660 + 110 * FD.pts.length, 0.15, 'triangle', 0.18);
    }
  }
  $('fd-cue').textContent = cue; $('fd-cuesub').textContent = cueSub; $('fd-bar').style.width = (FD.tp.k * 100) + '%';
  // where your feet are now
  if (ft) { let P = fdToCan(ft); x.strokeStyle = tp ? 'rgba(255,214,0,1)' : 'rgba(48,209,88,0.95)'; x.lineWidth = 3; x.beginPath(); x.ellipse(P.x, P.y, 26, 9, 0, 0, 7); x.stroke(); }
  let e = fdEstimate(); FD.est = e;
  let P = FD.pts.map(fdToCan);
  if (P.length) {
    x.fillStyle = 'rgba(255,176,32,0.18)'; x.strokeStyle = 'rgba(255,176,32,1)'; x.lineWidth = 3;
    x.beginPath(); P.forEach((q, i) => i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)); if (P.length === 4) { x.closePath(); x.fill(); } x.stroke();
    if (e && !e.bad) {
      x.font = 'bold 13px monospace'; x.textAlign = 'center';
      for (let i = 0; i < 4; i++) {
        let a = P[i], c2 = P[(i + 1) % 4], A = e.F[i], B = e.F[(i + 1) % 4], L = Math.hypot(A.x - B.x, A.z - B.z);
        let mx = (a.x + c2.x) / 2, my = (a.y + c2.y) / 2, t = '≈ ' + L.toFixed(1) + ' m', tw = x.measureText(t).width + 12;
        x.fillStyle = 'rgba(255,255,255,0.92)'; x.fillRect(mx - tw / 2, my - 11, tw, 20); x.fillStyle = '#1a1a1a'; x.fillText(t, mx, my + 4);
      }
      x.textAlign = 'left';
    }
    P.forEach((q, i) => {
      x.fillStyle = FD.drag === i ? '#1a1a1a' : '#fff'; x.strokeStyle = '#1a1a1a'; x.lineWidth = 2;
      x.beginPath(); x.arc(q.x, q.y, 11, 0, 7); x.fill(); x.stroke();
      x.fillStyle = FD.drag === i ? '#fff' : '#1a1a1a'; x.font = 'bold 12px monospace'; x.textAlign = 'center'; x.fillText(String(i + 1), q.x, q.y + 4); x.textAlign = 'left';
    });
  }
  let fit = fdFit();
  $('fd-say').textContent = FD.pts.length < 4 ? 'Or click corners by hand. Drag any corner to fix it.' : e && e.bad ? e.bad : 'Drag a corner to fix it.';
  $('fd-est').innerHTML = (e && !e.bad ? 'The area is about <b>' + e.w.toFixed(1) + ' × ' + e.d.toFixed(1) + ' m</b> (across × front to back), ' + (e.how === 'measured' ? 'measured by the iPhone’s LiDAR where you stood ✓' : e.how === 'walked' ? 'from walking it ✓' : 'from where you were tracked at each corner (rougher)') + '. ' : '')
    + (fit ? '' : 'Walk toward and away from the camera a bit while you mark corners: that’s what it measures the size from.');
  $('fd-use').disabled = !(e && !e.bad);
}
function fdSetup() {
  let c = $('fd-canvas'), at = ev => { let r = c.getBoundingClientRect(); return { x: (ev.clientX - r.left) * c.width / r.width, y: (ev.clientY - r.top) * c.height / r.height }; };
  c.addEventListener('pointerdown', ev => {
    if (!FD.box) return; let m = at(ev), P = FD.pts.map(fdToCan);
    let hit = P.findIndex(q => Math.hypot(q.x - m.x, q.y - m.y) < 16);
    if (hit >= 0) { FD.drag = hit; c.setPointerCapture(ev.pointerId); return; }
    let b = FD.box; if (m.x < b.x || m.y < b.y || m.x > b.x + b.w || m.y > b.y + b.h) return;
    if (FD.pts.length < 4) { FD.pts.push(fdToPic(m.x, m.y)); FD.at.push(null); }
  });
  c.addEventListener('pointermove', ev => {
    if (FD.drag < 0 || !FD.box) return; let m = at(ev), b = FD.box;
    FD.pts[FD.drag] = fdToPic(clamp(m.x, b.x, b.x + b.w), clamp(m.y, b.y, b.y + b.h)); FD.at[FD.drag] = null;   // moved by hand: placed from the fit
  });
  let up = () => { FD.drag = -1; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  $('fd-clear').onclick = () => { FD.pts = []; FD.at = []; };
  $('fd-undo').onclick = () => { FD.pts.pop(); FD.at.pop(); };
  $('fd-cancel').onclick = fdClose; $('fd-use').onclick = fdUse;
  window.addEventListener('keydown', ev => { if (!FD.on) return; if (ev.key === 'Escape') { fdClose(); ev.stopPropagation(); } else if (ev.key === 'Enter' && document.activeElement.tagName !== 'INPUT') { fdUse(); ev.stopPropagation(); } }, true);
}

// ---------------- the webcam's field of view, from its name ----------------
// Logitech C920 ≈ 70° across, C270 ≈ 49°; anything else (a laptop's own camera) 70°.
// The iPhone's camera inputs set their own (phone.js).
function fovFromName(label) {
  let l = (label || '').toLowerCase();
  if (/c92[02]|c930|brio/.test(l)) return 70;
  if (/c270|c310/.test(l)) return 49;
  return 70;
}
function setWebcamFov(label) {
  let f = fovFromName(label); SET.fov = f; SET.fovFrom = label || 'unknown camera';
  let el = $('fov'); if (el) { el.value = f; el.dispatchEvent(new Event('input')); }
  if (typeof updatePanel === 'function') updatePanel();
}
