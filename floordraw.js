// ============================================================
// ARM FOLLOW · floordraw.js
// DRAW THE FLOOR on the camera picture: a second way to measure the floor (the first is
// walking to its edges, floor.js). Click the four corners of the play area on a big camera
// view (tape on the floor helps), drag any corner to fix it.
//
// Its real size is guessed, no tape measure needed: while someone stands in the area, the app
// already knows roughly how far away they are (from their body's size and shape) and sees where
// their feet are in the picture; together with the lens's field of view and the camera's tilt that
// says how high the camera is, and from that how big the drawn area really is on the floor.
// If you measured it, type the real size and that wins.
//
// The result is a floor like the walked one (CAL.rect, in this camera's metres), plus where the
// floor sits in the picture (fa, fb), so the feet can say where you stand. Each laptop draws its own.
// Floor section: "The floor comes from" switches between the walked and the drawn floor, to compare.
// ============================================================

const FD = { on: false, pts: [], drag: -1, h: null, hN: 0, hSum: 0, pic: null, box: null, est: null };
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

// the camera picture, as the corner view shows it
function fdPicture() {
  if (SET.source !== 'mediapipe') return null;
  if (MP.fromPhone) return PHONE.bmp ? { el: MP.video, w: MP.video.width, h: MP.video.height } : null;
  if (SET.tracker === 'iphone') return null;
  return MP.video && MP.video.readyState >= 2 ? { el: MP.video, w: MP.video.videoWidth, h: MP.video.videoHeight } : null;
}
const fdPitch = () => SET.tiltFix ? CAMT.pitch : 0;
// a picture point (0..1, as the camera sees it, not mirrored) → where it is on the floor (m): X to the
// camera's right, Z straight ahead along the floor. h: the camera's height. null above the horizon.
function fdFloorPoint(u, v, h, W, H) {
  let f = (W / 2) / Math.tan(SET.fov * Math.PI / 360), p = fdPitch();
  let rx = (u - 0.5) * W / f, ry = (v - 0.5) * H / f;
  let yw = ry * Math.cos(p) + Math.sin(p), zw = -ry * Math.sin(p) + Math.cos(p);
  if (yw < 0.01) return null;
  let t = h / yw; return { X: t * rx, Z: t * zw };
}
// HOW HIGH IS THE CAMERA: from the person standing in view (how far away they are, and how far below the
// middle of the picture their ankles are). Averaged over the time the drawing view is open.
function fdSampleHeight(W, H) {
  for (let k of calSlots()) {
    let p = live(k), M = MPF[k], lm = p && (p.lmS || p.lm); if (!lm || !M || !M.d) continue;
    let ok = q => q && (q.visibility === undefined || q.visibility > 0.6) && q.y < 0.98;
    if (!ok(lm[27]) || !ok(lm[28])) continue;
    let f = (W / 2) / Math.tan(SET.fov * Math.PI / 360), v = (lm[27].y + lm[28].y) / 2;
    let a = fdPitch() + Math.atan((v - 0.5) * H / f);   // the ankles' angle below level
    if (a < 0.05) continue;
    let h = 0.08 + M.d * Math.tan(a);                     // ankles sit about 8 cm above the floor
    if (h > 0.3 && h < 3.5) { FD.hSum += h; FD.hN++; }
  }
  FD.h = FD.hN > 10 ? FD.hSum / FD.hN : null;
}
// the four corners on the floor, the area's size, and the floor rectangle in this camera's metres
function fdEstimate(W, H) {
  if (FD.pts.length < 4) return null;
  let h = FD.h || 1.0, Fp = FD.pts.map(q => fdFloorPoint(q.u, q.v, h, W, H));
  if (Fp.some(q => !q)) return { bad: 'A corner is above the horizon: click on the floor' };
  let byZ = Fp.map((q, i) => ({ q, i })).sort((a, b) => a.q.Z - b.q.Z), near = byZ.slice(0, 2).map(e => e.q), far = byZ.slice(2).map(e => e.q);
  let byX = Fp.slice().sort((a, b) => a.X - b.X), left = byX.slice(0, 2), right = byX.slice(2);
  let len = (a, b) => Math.hypot(a.X - b.X, a.Z - b.Z);
  let w = (len(near[0], near[1]) + len(far[0], far[1])) / 2, d = (len(left[0], left[1]) + len(right[0], right[1])) / 2;
  let X0 = (left[0].X + left[1].X) / 2, X1 = (right[0].X + right[1].X) / 2, Z0 = (near[0].Z + near[1].Z) / 2, Z1 = (far[0].Z + far[1].Z) / 2;
  return { w, d, h, rough: !FD.h, X0, X1, Z0, Z1, Fp };
}
function fdOpen() {
  if (!fdPicture()) { toast(SET.tracker === 'iphone' ? 'Drawing the floor needs a camera picture: pick a webcam or an iPhone camera input' : 'No camera picture yet'); return; }
  if (CAL.active) calibrate();
  FD.on = true; FD.drag = -1; FD.hN = 0; FD.hSum = 0; FD.h = null;
  FD.pts = CAL.drawn && CAL.drawn.quad ? CAL.drawn.quad.map(q => ({ u: q[0], v: q[1] })) : [];
  let r = CAL.drawn && CAL.drawn.real; $('fd-w').value = r ? r.w : ''; $('fd-d').value = r ? r.d : '';
  $('fdraw').style.display = 'flex'; logEvent('draw floor', { what: 'open' });
}
function fdClose() { FD.on = false; $('fdraw').style.display = 'none'; }
function fdUse() {
  let pic = fdPicture(); if (!pic) return;
  let e = fdEstimate(pic.w, pic.h);
  if (!e || e.bad) { toast(e ? e.bad : 'Click all four corners first'); return; }
  // measured size typed in? scale the guess to it (side to side and front to back separately)
  let rw = parseFloat($('fd-w').value), rd = parseFloat($('fd-d').value);
  let kx = rw > 0.3 ? rw / e.w : 1, kz = rd > 0.3 ? rd / e.d : (rw > 0.3 ? kx : 1);
  if (!(rw > 0.3) && rd > 0.3) kx = kz;
  let sx = SET.mirror ? -1 : 1, xs = [e.X0 * kx * sx, e.X1 * kx * sx];
  let rect = { x0: Math.min(...xs), x1: Math.max(...xs), z0: e.Z0 * kz, z1: e.Z1 * kz, v: 2, drawn: true, quad: FD.pts.map(q => [r4(q.u), r4(q.v)]),
    est: { w: r3(e.w), d: r3(e.d), camH: r3(e.h), rough: e.rough }, real: rw > 0.3 || rd > 0.3 ? { w: rw > 0.3 ? rw : null, d: rd > 0.3 ? rd : null } : null };
  if (rectW(rect) < 0.5 || rectD(rect) < 0.5) { toast('Too small (under 50 cm one way): floor not changed'); return; }
  // where the floor sits in the picture, for the feet: ankles' height in the picture = fa + fb / distance
  let hC = e.h * kz, f = (pic.w / 2) / Math.tan(SET.fov * Math.PI / 360), p = fdPitch(), S = [];
  for (let i = 0; i < 40; i++) {
    let Z = Math.max(0.7, rect.z0 - 0.5) + (rect.z1 + 1 - Math.max(0.7, rect.z0 - 0.5)) * i / 39;
    let a = Math.atan((hC - 0.08) / Z) - p; S.push([1 / Z, 0.5 + f * Math.tan(a) / pic.h]);
  }
  let fit = fitFloor(S); if (fit) { rect.fa = fit.a; rect.fb = fit.b; }
  CAL.drawn = rect; CAL.rect = rect; SET.floorFrom = 'drawn'; CAL.skipped = false;
  try { localStorage.setItem('armfollow.floorDrawn', JSON.stringify(rect)); localStorage.setItem('armfollow.floorFrom', 'drawn'); } catch (x) {}
  logEvent('draw floor', { w: r3(rectW(rect)), d: r3(rectD(rect)), camH: r3(hC), measured: !!rect.real });
  toast('Floor: ' + rectW(rect).toFixed(1) + ' × ' + rectD(rect).toFixed(1) + ' m (drawn)');
  fdClose();
  if (!isGuest() && RUN.phase === 'play') restartWorld();
  updatePanel();
}
const r4 = x => Math.round(x * 10000) / 10000;

// ---------------- the drawing view (a big camera picture over the stage) ----------------
function fdBox() {   // where the picture sits on the canvas
  let c = $('fd-canvas'), pic = FD.pic; if (!pic) return null;
  let W = c.width, H = c.height, s = Math.min(W / pic.w, H / pic.h);
  return { x: (W - pic.w * s) / 2, y: (H - pic.h * s) / 2, w: pic.w * s, h: pic.h * s };
}
// canvas point ⇄ picture point (0..1, as the camera sees it: the view is mirrored like the corner view)
function fdToPic(px, py) { let b = FD.box; let u = (px - b.x) / b.w, v = (py - b.y) / b.h; return { u: SET.mirror ? 1 - u : u, v }; }
function fdToCan(q) { let b = FD.box; return { x: b.x + (SET.mirror ? 1 - q.u : q.u) * b.w, y: b.y + q.v * b.h }; }
function fdTick() {
  if (!FD.on) return;
  let c = $('fd-canvas'), host = $('fdraw'), pic = fdPicture(); FD.pic = pic;
  let cw = host.clientWidth, ch = Math.max(200, host.clientHeight - $('fd-top').offsetHeight - $('fd-bot').offsetHeight - 20);
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  let x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
  if (!pic) { x.fillStyle = '#1a1a1a'; x.font = '14px monospace'; x.fillText('No camera picture', 20, 30); return; }
  FD.box = fdBox(); let b = FD.box;
  x.save(); if (SET.mirror) { x.translate(b.x * 2 + b.w, 0); x.scale(-1, 1); } x.drawImage(pic.el, b.x, b.y, b.w, b.h); x.restore();
  fdSampleHeight(pic.w, pic.h);
  // the people's ankles, so you can see the height guess has someone to go on
  for (let k of calSlots()) {
    let p = live(k), lm = p && (p.lmS || p.lm); if (!lm) continue;
    for (let i of [27, 28]) { let q = lm[i]; if (!q) continue; let P = fdToCan({ u: q.x, v: q.y }); x.strokeStyle = 'rgba(48,209,88,0.95)'; x.lineWidth = 2; x.beginPath(); x.arc(P.x, P.y, 7, 0, 7); x.stroke(); }
  }
  let e = fdEstimate(pic.w, pic.h); FD.est = e;
  let P = FD.pts.map(fdToCan);
  if (P.length) {
    x.fillStyle = 'rgba(255,176,32,0.18)'; x.strokeStyle = 'rgba(255,176,32,1)'; x.lineWidth = 3;
    x.beginPath(); P.forEach((q, i) => i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)); if (P.length === 4) { x.closePath(); x.fill(); } x.stroke();
    // each edge's length on the floor (the guess)
    if (e && !e.bad) {
      x.font = 'bold 13px monospace'; x.textAlign = 'center';
      for (let i = 0; i < 4; i++) {
        let a = P[i], c2 = P[(i + 1) % 4], A = e.Fp[i], B = e.Fp[(i + 1) % 4], L = Math.hypot(A.X - B.X, A.Z - B.Z);
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
  // the words under the picture
  let say = FD.pts.length < 4 ? 'Click corner ' + (FD.pts.length + 1) + ' of 4 on the floor.' : e && e.bad ? e.bad : 'Drag a corner to fix it.';
  let hs = FD.h ? 'Camera ≈ ' + FD.h.toFixed(2) + ' m up (from the person in view) ✓' : 'Stand somewhere in the picture with your feet in view, so it can judge the camera’s height (for now it guesses 1 m)';
  $('fd-say').textContent = say;
  $('fd-est').innerHTML = (e && !e.bad ? 'The area is about <b>' + e.w.toFixed(1) + ' × ' + e.d.toFixed(1) + ' m</b> (across × front to back)' + (e.rough ? ', a rough guess' : '') + '. ' : '') + hs;
  $('fd-use').disabled = !(e && !e.bad);
}
function fdSetup() {
  let c = $('fd-canvas'), at = ev => { let r = c.getBoundingClientRect(); return { x: (ev.clientX - r.left) * c.width / r.width, y: (ev.clientY - r.top) * c.height / r.height }; };
  c.addEventListener('pointerdown', ev => {
    if (!FD.box) return; let m = at(ev), P = FD.pts.map(fdToCan);
    let hit = P.findIndex(q => Math.hypot(q.x - m.x, q.y - m.y) < 16);
    if (hit >= 0) { FD.drag = hit; c.setPointerCapture(ev.pointerId); return; }
    let b = FD.box; if (m.x < b.x || m.y < b.y || m.x > b.x + b.w || m.y > b.y + b.h) return;
    if (FD.pts.length < 4) { FD.pts.push(fdToPic(m.x, m.y)); }
  });
  c.addEventListener('pointermove', ev => {
    if (FD.drag < 0 || !FD.box) return; let m = at(ev), b = FD.box;
    FD.pts[FD.drag] = fdToPic(clamp(m.x, b.x, b.x + b.w), clamp(m.y, b.y, b.y + b.h));
  });
  let up = () => { FD.drag = -1; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  $('fd-clear').onclick = () => { FD.pts = []; };
  $('fd-cancel').onclick = fdClose; $('fd-use').onclick = fdUse;
  window.addEventListener('keydown', ev => { if (!FD.on) return; if (ev.key === 'Escape') { fdClose(); ev.stopPropagation(); } else if (ev.key === 'Enter') { fdUse(); ev.stopPropagation(); } }, true);
}
