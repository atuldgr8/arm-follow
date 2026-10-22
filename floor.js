// ============================================================
// ARM FOLLOW · floor.js
// Measuring the real floor you can walk (calibration), and fitting the room to it:
//   - the walk gain can stretch your floor to fill the virtual room
//   - cubes can appear only where your real steps can reach
//   - 2 spaces with rooms of different sizes: each room maps onto the other,
//     or both people use the smaller room
//   - a warning (and a VR-style grid wall) when you get near your real edge
// Each laptop measures its own floor, in its own camera's metres (A space).
// ============================================================

const VR = { cx: 0, cz: -1.0, w: 7, d: 6 };   // the part of the virtual room the body walks in
const CAL = { active: false, live: null, rect: null, other: null, samples: [], skipped: false };
try { let s = localStorage.getItem('armfollow.floor'); if (s) CAL.rect = JSON.parse(s); } catch (e) {}
const rectW = r => r.x1 - r.x0, rectD = r => r.z1 - r.z0;

// the people standing in this laptop's room
function calSlots() {
  if (SET.comp === 'P2' && SET.source === 'mediapipe') return [1];
  if (SET.comp === 'P1' && SET.source === 'mediapipe') return [2];
  if (SET.spaces === 2 && NET.connected) return [NET.myId];
  return [1, 2];
}
// press once to start measuring, walk to every edge, press again to finish.
// Each laptop measures its own floor (P2 measures P2's).
function calibrate() {
  if (!CAL.active) { CAL.active = true; CAL.live = null; CAL.samples = []; CAL.skipped = false; logEvent('calibrate', { what: 'start' }); updatePanel(); return; }
  CAL.active = false;
  let r = CAL.live;
  if (!r || rectW(r) < 0.5 || rectD(r) < 0.5) { toast('Too small (under 50 cm in one direction): floor not changed'); updatePanel(); return; }
  CAL.rect = { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 };
  // where the floor is in the camera picture (feet height in the picture against distance), for the camera view's floor outline
  let fit = fitFloor(CAL.samples); if (fit) { CAL.rect.fa = fit.a; CAL.rect.fb = fit.b; }
  try { localStorage.setItem('armfollow.floor', JSON.stringify(CAL.rect)); } catch (e) {}
  logEvent('calibrate', { w: +rectW(r).toFixed(2), d: +rectD(r).toFixed(2) });
  toast('Floor: ' + rectW(r).toFixed(1) + ' × ' + rectD(r).toFixed(1) + ' m');
  if (!isGuest() && RUN.phase === 'play') restartWorld();
  updatePanel();
}
// skip measuring: keep the saved floor if there is one, else use the sliders
function skipFloor() { CAL.active = false; CAL.skipped = true; updatePanel(); }
function forgetFloor() {
  CAL.rect = null; CAL.active = false; CAL.skipped = false;
  try { localStorage.removeItem('armfollow.floor'); } catch (e) {}
  if (!isGuest() && RUN.phase === 'play') restartWorld();
  updatePanel();
}
function calTick() {
  if (!CAL.active) return;
  for (let k of calSlots()) {
    let p = live(k); if (!p) continue;
    let x = p.j.pelvis.x, z = p.j.pelvis.z, r = CAL.live;
    CAL.live = r ? { x0: Math.min(r.x0, x), x1: Math.max(r.x1, x), z0: Math.min(r.z0, z), z1: Math.max(r.z1, z) } : { x0: x, x1: x, z0: z, z1: z };
    if (p.ankY && p.dist && CAL.samples.length < 3000) CAL.samples.push([1 / p.dist, p.ankY]);
  }
}
// a straight-line fit: feet height in the picture = a + b / distance
function fitFloor(S) {
  if (!S || S.length < 30) return null;
  let n = S.length, sx = 0, sy = 0, sxx = 0, sxy = 0, lo = 9, hi = -9;
  for (let [x, y] of S) { sx += x; sy += y; sxx += x * x; sxy += x * y; lo = Math.min(lo, x); hi = Math.max(hi, x); }
  if (hi - lo < 0.04) return null;   // walked too little toward or away from the camera to tell
  let b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  return b > 0 ? { a, b } : null;
}
// a floor point (this laptop's camera metres) → where it is in the camera picture (0..1)
function floorToPicture(r, x, z) {
  if (!r || r.fa === undefined || z < 0.3) return null;
  let tanH = Math.tan(SET.fov * Math.PI / 360), lat = x * (SET.mirror ? -1 : 1);
  return { x: 0.5 + lat / (2 * z * tanH), y: r.fa + r.fb / z };
}
function calStepDone() { return !CAL.active && (!!CAL.rect || CAL.skipped); }

// the walk to the centre before it begins: each person's centre is the middle of the floor they use
function centreOf(slot) { let u = usable(slot); return u ? { x: (u.x0 + u.x1) / 2, z: (u.z0 + u.z1) / 2 } : null; }
function centreDist(slot) { let p = live(slot), c = centreOf(slot); return p && c ? Math.hypot(p.j.pelvis.x - c.x, p.j.pelvis.z - c.z) : null; }
// where P2 stands, shown in the room (both centres land on the same spot in the room)
function p2InRoom() {
  let p = live2(), c = centreOf(2); if (!p || !c) return null;
  let g = effGain(), k = p2Scale();
  return { x: VR.cx + g * k.x * (p.j.pelvis.x - c.x), z: VR.cz + g * k.z * (p.j.pelvis.z - c.z) };
}

// each person's measured floor (P2's comes over the link in 2 spaces)
function rectOf(slot) {
  if (SET.spaces === 2 && NET.connected) return slot === NET.myId ? CAL.rect : CAL.other;
  return CAL.rect;
}
// the part of it they can use: all of it, or (smaller room) the smaller room's size, centred
function usable(slot) {
  let r = rectOf(slot); if (!r) return null;
  if (SET.spaces === 2 && SET.roomFit === 'smaller') {
    let o = rectOf(3 - slot);
    if (o) {
      let w = Math.min(rectW(r), rectW(o)), d = Math.min(rectD(r), rectD(o)), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
    }
  }
  return r;
}
// walk gain: set by the measured floor (so it fills the virtual room), or the slider
function effGain() {
  let u = usable(1);
  if (u && SET.calUse !== 'cubes') return clamp(Math.min(VR.w / rectW(u), VR.d / rectD(u)), 1, 4);
  return SET.gain;
}
// rooms of different sizes, mapped onto each other: P2's steps are scaled into P1's room
function p2Scale() {
  if (SET.spaces !== 2 || SET.roomFit !== 'mapped') return { x: 1, z: 1 };
  let a = rectOf(1), b = rectOf(2);
  if (!a || !b || a === b) return { x: 1, z: 1 };
  return { x: rectW(a) / rectW(b), z: rectD(a) / rectD(b) };
}
// P1's real floor ⇄ the room
function virtOf(x, z) {
  let u = usable(1), g = effGain();
  if (u) return { x: VR.cx + g * (x - (u.x0 + u.x1) / 2), z: VR.cz + g * (z - (u.z0 + u.z1) / 2) };
  let p = live(1), h = p && p.home ? p.home : { x: 0, z: 2.8 };
  return { x: START.x + g * (x - h.x), z: START.z + g * (z - h.z) };
}
function realOf(v) {
  let u = usable(1), g = effGain();
  if (u) return { x: (u.x0 + u.x1) / 2 + (v.x - VR.cx) / g, z: (u.z0 + u.z1) / 2 + (v.z - VR.cz) / g };
  let p = live(1), h = p && p.home ? p.home : { x: 0, z: 2.8 };
  return { x: h.x + (v.x - START.x) / g, z: h.z + (v.z - START.z) / g };
}
// a new cube somewhere the body can actually reach (the first one at the far end of your floor)
function spawnInFloor(first) {
  // keep in from the edges by a reach (SET.edgeBuffer), so stretching out for the cube stays in the camera
  let u = usable(1), ins = Math.max(0.05, Math.min(SET.edgeBuffer, rectW(usable(1)) / 2 - 0.05, rectD(usable(1)) / 2 - 0.05)), best = null, bestD = -1;
  if (SET.spawnLR) {
    // mostly left and right: the far side from where P1 stands now, near the middle front to back
    let p = live(1), cx = (u.x0 + u.x1) / 2, cz = (u.z0 + u.z1) / 2, side = first || !p ? (Math.random() < 0.5 ? -1 : 1) : (p.j.pelvis.x > cx ? -1 : 1);
    for (let k = 0; k < 60; k++) {
      let x = cx + side * (rectW(u) / 2 - ins) * rand(0.75, 1), z = clamp(cz + rand(-0.2, 0.2) * rectD(u), u.z0 + ins, u.z1 - ins);
      let st = virtOf(x, z), c = new V3(st.x, 0, st.z - 0.47);
      if (Math.abs(c.x) <= ROOM.x - 0.6 && c.z >= ROOM.zBack + 0.6) return c;
    }
  }
  for (let k = 0; k < 160; k++) {
    let x = first ? (u.x0 + u.x1) / 2 : rand(u.x0 + ins, u.x1 - ins), z = first ? u.z0 + ins : rand(u.z0 + ins, u.z1 - ins);
    let st = virtOf(x, z), c = new V3(st.x, 0, st.z - 0.47);
    if (Math.abs(c.x) > ROOM.x - 0.6 || c.z < ROOM.zBack + 0.6) continue;
    if (first) return c;
    let d = Math.hypot(c.x - AV.root.x, c.z - AV.root.z);
    if (d >= 1.2 && d <= 3.2) return c;
    if (d > bestD) { bestD = d; best = c; }
  }
  return best;
}
// how far each person is from their edges (ahead = toward the camera)
function edgeInfo(slot) {
  let p = live(slot), u = usable(slot); if (!p || !u) return null;
  let x = p.j.pelvis.x, z = p.j.pelvis.z;
  return { ahead: z - u.z0, behind: u.z1 - z, left: x - u.x0, right: u.x1 - x };
}
function edgeText() {
  if (!SET.edgeWarn) return '';
  let slots = calSlots(), out = [];
  for (let k of slots) {
    let e = edgeInfo(k); if (!e) continue;
    let near = Object.entries(e).filter(([, d]) => d < SET.edgeDist).sort((a, b) => a[1] - b[1]).map(([w]) => w);
    if (near.length) out.push((slots.length > 1 ? 'P' + k + ': ' : '') + 'edge ' + near.join(' + '));
  }
  return out.join(' · ');
}
// the grid walls (like a VR boundary) shown in the room for P1's floor
function chapSnap() {
  let u = usable(1); if (!u) return null;
  let a = virtOf(u.x0, u.z0), b = virtOf(u.x1, u.z1), e = edgeInfo(1), op = [0, 0, 0, 0];
  if (e && SET.edgeWarn) op = [e.ahead, e.behind, e.left, e.right].map(d => r3(clamp(1 - d / SET.edgeDist, 0, 1)));
  return { r: [r3(a.x), r3(a.z), r3(b.x), r3(b.z)], op };
}
