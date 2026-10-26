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
// a floor measured before v1.10 used a different way of judging distance, so it isn't reused: measure again
try { let s = localStorage.getItem('armfollow.floor'); if (s) { let r = JSON.parse(s); if (r && r.v === 2) CAL.rect = r; else localStorage.removeItem('armfollow.floor'); } } catch (e) {}
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
  if (!CAL.active) { CAL.active = true; CAL.live = null; CAL.samples = []; CAL.pic = []; CAL.skipped = false; logEvent('calibrate', { what: 'start' }); updatePanel(); return; }
  CAL.active = false;
  let r = CAL.live;
  if (!r || rectW(r) < 0.5 || rectD(r) < 0.5) { toast('Too small (under 50 cm in one direction): floor not changed'); updatePanel(); return; }
  CAL.rect = { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, v: 2 };   // v2: measured with the upper-body distance (older floors' feet fits aren't used)
  // where the floor is in the camera picture (feet height in the picture against distance), for the camera view's floor outline
  let fit = fitFloor(CAL.samples); if (fit) { CAL.rect.fa = fit.a; CAL.rect.fb = fit.b; }
  try { localStorage.setItem('armfollow.floor', JSON.stringify(CAL.rect)); } catch (e) {}
  CAL.walked = CAL.rect; SET.floorFrom = 'walked';   // walking it switches back to the walked floor (floordraw.js keeps the drawn one)
  try { localStorage.setItem('armfollow.floorFrom', 'walked'); } catch (e) {}
  logEvent('calibrate', { w: +rectW(r).toFixed(2), d: +rectD(r).toFixed(2) });
  toast('Floor: ' + rectW(r).toFixed(1) + ' × ' + rectD(r).toFixed(1) + ' m');
  if (!isGuest() && RUN.phase === 'play') restartWorld();
  updatePanel();
}
// skip measuring: keep the saved floor if there is one, else use the sliders
function skipFloor() { CAL.active = false; CAL.skipped = true; updatePanel(); }
function forgetFloor() {
  CAL.rect = null; CAL.active = false; CAL.skipped = false;
  // forgets the floor in use (walked or drawn)
  if (SET.floorFrom === 'drawn') { CAL.drawn = null; try { localStorage.removeItem('armfollow.floorDrawn'); } catch (e) {} }
  else { CAL.walked = null; try { localStorage.removeItem('armfollow.floor'); } catch (e) {} }
  if (!isGuest() && RUN.phase === 'play') restartWorld();
  updatePanel();
}
// is the whole body in the picture, clearly? (head, shoulders, hips and both ankles, not at the picture's edge)
// Only those spots count as floor: too close to the camera (feet cut off) or too far to a side isn't usable,
// because tracking gets much worse there. Trackers without a picture skeleton (iPhone body mode) always count.
const FULL_J = [0, 11, 12, 23, 24, 27, 28];
function fullSeen(p) {
  let lm = p.lmS || p.lm; if (!lm || !lm[28]) return true;
  return FULL_J.every(i => { let q = lm[i]; return q && (q.visibility === undefined || q.visibility > 0.6) && q.x > 0.02 && q.x < 0.98 && q.y > 0.02 && q.y < 0.97; });
}
function calTick() {
  if (!CAL.active) return;
  CAL.seen = null;
  for (let k of calSlots()) {
    let p = live(k); if (!p) continue;
    let full = fullSeen(p);
    CAL.seen = CAL.seen === true ? true : full;
    if (!full) continue;   // not counted: part of the body is out of the picture
    let x = p.j.pelvis.x, z = p.j.pelvis.z, r = CAL.live;
    CAL.live = r ? { x0: Math.min(r.x0, x), x1: Math.max(r.x1, x), z0: Math.min(r.z0, z), z1: Math.max(r.z1, z) } : { x0: x, x1: x, z0: z, z1: z };
    let dd = p.distT || p.dist;
    if (p.ankY && dd && CAL.samples.length < 3000) CAL.samples.push([1 / dd, p.ankY]);
    // where your feet have been in the picture, for the trapezium drawn live in the camera view
    let lm = p.lmS || p.lm;
    if (lm && lm[27] && lm[28] && CAL.pic && CAL.pic.length < 3000) CAL.pic.push([(lm[27].x + lm[28].x) / 2, Math.max(lm[27].y, lm[28].y)]);
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
// a camera picture point (0..1, as the camera sees it) → this laptop's camera metres on the floor (inverse of the next)
function pictureToFloor(r, u, v) {
  if (!r || r.fa === undefined || v - r.fa < 0.005) return null;
  let z = r.fb / (v - r.fa), tanH = Math.tan(SET.fov * Math.PI / 360);
  return { x: (u - 0.5) * 2 * z * tanH * (SET.mirror ? -1 : 1), z };
}
// a floor point (this laptop's camera metres) → where it is in the camera picture (0..1)
function floorToPicture(r, x, z) {
  if (!r || r.fa === undefined || z < 0.3) return null;
  let tanH = Math.tan(SET.fov * Math.PI / 360), lat = x * (SET.mirror ? -1 : 1);
  return { x: 0.5 + lat / (2 * z * tanH), y: r.fa + r.fb / z };
}
function calStepDone() { return !CAL.active && (!!CAL.rect || CAL.skipped); }

// the walk to the centre before it begins: each person's centre is the middle of the floor they use
// each person's spot to walk to before it begins: the middle of the floor they use; with no measured floor,
// 2.8 m in front of their camera, centred (in one shared space, the two spots sit 90 cm apart)
function centreOf(slot) {
  let u = usable(slot), off = SET.spaces === 1 ? (slot === 1 ? -0.45 : 0.45) : 0;
  return u ? { x: (u.x0 + u.x1) / 2 + off, z: (u.z0 + u.z1) / 2 } : { x: off, z: 2.8 };
}
// the green ring in the room: where the body waits, and where it starts the game
function ringPos() { return usable(1) ? { x: VR.cx, z: VR.cz } : { x: START.x, z: START.z }; }
// where a person stands, shown in the room (both spots land on the ring)
function inRoom(slot) {
  let p = slot === 2 ? live2() : live(1), c = centreOf(slot); if (!p || !c) return null;
  let g = effGain(), k = slot === 2 ? p2Scale() : { x: 1, z: 1 }, R = ringPos();
  return { x: R.x + g * k.x * (p.j.pelvis.x - c.x), z: R.z + g * k.z * (p.j.pelvis.z - c.z) };
}
function centreDist(slot) { let p = live(slot), c = centreOf(slot); return p && c ? Math.hypot(p.j.pelvis.x - c.x, p.j.pelvis.z - c.z) : null; }
// where P2 stands, shown in the room (both centres land on the same spot in the room)
function p2InRoom() { return inRoom(2); }

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
      // the patch: where you dragged it in the camera view (r.pc, kept with your floor), or by default
      // centred left to right, halfway between the middle of the floor and its back (further from the
      // camera = more of you in the picture, without ending up against the back wall of a deep room)
      let w = Math.min(rectW(r), rectW(o)), d = Math.min(rectD(r), rectD(o));
      let cx = r.pc ? r.pc.x : (r.x0 + r.x1) / 2, cz = r.pc ? r.pc.z : Math.min(r.z1 - d / 2, (r.z0 + r.z1) / 2 + (rectD(r) - d) / 4);
      cx = clamp(cx, r.x0 + w / 2, r.x1 - w / 2); cz = clamp(cz, r.z0 + d / 2, r.z1 - d / 2);
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
// a new cube somewhere the body can actually reach, kept out of the front of the floor (too close to the camera)
function spawnInFloor(first) {
  // keep in from the edges by a reach (SET.edgeBuffer), so stretching out for the cube stays in the camera
  let u = usable(1), ins = Math.max(0.05, Math.min(SET.edgeBuffer, rectW(usable(1)) / 2 - 0.05, rectD(usable(1)) / 2 - 0.05)), best = null, bestD = -1;
  if (SET.spawnLR) {
    // mostly left and right: the far side from where P1 stands now, near the middle front to back
    let p = live(1), cx = (u.x0 + u.x1) / 2, cz = (u.z0 + u.z1) / 2, side = first || !p ? (Math.random() < 0.5 ? -1 : 1) : (p.j.pelvis.x > cx ? -1 : 1);
    for (let k = 0; k < 60; k++) {
      // front to back: the middle to the back of the floor (further from the camera = more of you in the picture)
      let x = cx + side * (rectW(u) / 2 - ins) * rand(0.75, 1), z = clamp(cz + rand(0, 0.25) * rectD(u), u.z0 + ins, u.z1 - ins);
      let st = virtOf(x, z), c = new V3(st.x, 0, st.z - 0.47);
      if (Math.abs(c.x) <= ROOM.x - 0.6 && c.z >= ROOM.zBack + 0.6) return c;
    }
  }
  for (let k = 0; k < 160; k++) {
    // never in the front third of the floor (the closest to the camera, where tracking is worst)
    let zF = Math.min(u.z0 + Math.max(ins, rectD(u) / 3), u.z1 - ins);
    let x = first ? (u.x0 + u.x1) / 2 : rand(u.x0 + ins, u.x1 - ins), z = first ? zF : rand(zF, u.z1 - ins);
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
  // the walls fade in when EITHER person nears an edge of the floor they use (P2's room maps onto the same walls)
  let e2 = SET.spaces === 2 && NET.connected ? edgeInfo(2) : null;
  if (SET.edgeWarn) op = [e, e2].filter(Boolean).reduce((o, E) => [E.ahead, E.behind, E.left, E.right].map((d, i) => Math.max(o[i], r3(clamp(1 - d / SET.edgeDist, 0, 1)))), op);
  return { r: [r3(a.x), r3(a.z), r3(b.x), r3(b.z)], op };
}
