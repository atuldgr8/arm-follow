// ============================================================
// ARM FOLLOW · bubbles.js
// BUBBLE POP, built from prototypes/bubble-pop-build.md (26 Oct 2026).
//
// A set of bubbles around the room; pop them all within the round (1 minute).
//   mid bubbles:  two hands touching it at the same moment (whoever owns them)
//   low bubbles:  two feet touching it, any way (a tall column from the floor up)
//   high bubbles: only reachable at the top of a jump
// JUMPING: whoever owns the legs jumps. With the legs split, both jumping together
// (within the same-moment window) = a jump twice as high; only one = a lopsided hop
// on that side. Split legs also walk with the HURDLE rule (old main build's Split 3):
// the body only moves when both step the same general direction, by the smaller step.
// The same-moment window is 0.3 s, and never shorter than the link's delay + a margin.
// No falling-off arm in this mode: the follow rule is off.
// The rules run on P1's laptop (the host); P2's laptop draws what arrives in the snap.
// ============================================================

const BUB = { list: [], layout: null, needLayout: true, phase: 'wait', tl: 60, count: 3, go: 0, total: 0, popped: 0, used: 0, endT: 0,
  pops: [], nextId: 1, hint: '', land: 0, landBig: 0, sharedN: 0, w: 0.3 };
const JUMP = { y: 0, vy: 0, air: false, side: null, shared: false, take: { L: -1e9, R: -1e9 } };
const LEGS = { x: 0, z: 0, init: false, moving: false };
const BUB_KINDS = ['low', 'mid', 'high', 'shared'];
const BUB_R = { low: 0.17, mid: 0.15, high: 0.15 };
const BUB_COL = { low: 0x12c46a, mid: 0x1e90ff, high: 0xa855f7, shared: 0xffb000 };
const JUMP_H = 0.35, HOP_H = 0.18;   // the body's jump (virtual metres); a shared jump is twice JUMP_H

const isBubbles = () => SET.game === 'bubbles' && !SET.armsOnly;
// who owns each leg: P1, unless the legs are split (then P2 gets SET.legP2)
function legOwner(s) { return isBubbles() && SET.legSplit ? (s === SET.legP2 ? 2 : 1) : 1; }
// the delay between the two laptops (ms): half the round trip, plus how often updates are sent
function linkDelay() { return SET.spaces === 2 && NET.connected ? (NET.rtt || 0) / 2 + NET_EVERY : 0; }
// THE SAME-MOMENT WINDOW (s): 0.3, and always at least the link's delay plus a margin, so a slow
// link can never make a real clap fail
function clapWindow() { return Math.max(0.3, linkDelay() / 1000 + 0.15); }

// =====================================================================
// JUMPING
// Each person: p.up is how far their hips AND shoulders have risen together (track.js), p.upMin the
// lowest it was in the last 0.4 s. A take-off is a quick rise past the threshold (the jump sensitivity slider).
// =====================================================================
function jumpSense(p, now) {
  if (!p) return;
  let up = p.up || 0, thr = SET.jumpThr;
  if (!p.jAir && up > thr && up - (p.upMin || 0) > thr * 0.8) { p.jAir = true; p.jN = (p.jN || 0) + 1; p.jT = now; }
  else if (p.jAir && up < thr * 0.5) p.jAir = false;
}
// weighty: rises a little slower, hangs at the top, comes down heavier
const launchV = h => Math.sqrt(18 * Math.max(0, h - 0.072) + 0.36);
function jumpLaunch(side, h) { JUMP.air = true; JUMP.side = side; JUMP.vy = launchV(h); JUMP.shared = false; }
function jumpShared() {
  let h = SET.jumpBoost ? 2 * JUMP_H : JUMP_H;
  if (JUMP.air) { JUMP.side = 'both'; let need = h - JUMP.y; if (need > 0.08) JUMP.vy = Math.max(JUMP.vy, launchV(need)); }
  else jumpLaunch('both', h);
  JUMP.shared = true; BUB.sharedN++;
  logEvent('jump', { who: 'both', shared: true, high: h });
}
function jumpTakeoff(k, now) {
  let mine = SET.solo ? ['L', 'R'] : ['L', 'R'].filter(s => legOwner(s) === k);
  if (!mine.length) { logEvent('jump', { who: 'P' + k, legs: 'none, so nothing happens' }); return; }
  if (mine.length === 2) { if (!JUMP.air) { jumpLaunch('both', JUMP_H); logEvent('jump', { who: 'P' + k, high: JUMP_H }); } return; }
  // legs split: this person owns one leg
  let s = mine[0], o = s === 'L' ? 'R' : 'L';
  JUMP.take[s] = now;
  if (now - JUMP.take[o] <= BUB.w * 1000) { jumpShared(); return; }   // the other jumped a moment ago: together
  if (!JUMP.air) jumpLaunch(s, HOP_H);                                   // alone: a lopsided hop (upgraded if the other follows in time)
  logEvent('jump', { who: 'P' + k, side: s, lopsided: true });
}
function jumpTick(now) {
  for (let k of SET.solo ? [1] : [1, 2]) {
    let p = k === 2 ? live2() : live(1); if (!p) continue;
    jumpSense(p, now);
    if (p.jN && p.jN !== p.jUsed) { p.jUsed = p.jN; jumpTakeoff(k, now); }
  }
}
function jumpPhysics(dt) {
  if (!JUMP.air) return;
  let v = JUMP.vy, g = v > 0.6 ? 9 : v > -0.6 ? 2.5 : 16;
  JUMP.vy -= g * dt; JUMP.y += JUMP.vy * dt;
  if (JUMP.y <= 0 && JUMP.vy < 0) {
    BUB.land++; BUB.landBig = JUMP.side === 'both' ? (JUMP.shared ? 1 : 0.6) : 0.3;
    JUMP.y = 0; JUMP.vy = 0; JUMP.air = false; JUMP.side = null; JUMP.shared = false;
  }
}
// lift the body by the jump (sim.js, composeAvatar). A lopsided hop lifts only that side.
function jumpLift(j) {
  if (!(JUMP.y > 0)) return;
  for (let k in j) {
    let w = !JUMP.side || JUMP.side === 'both' ? 1 : k.endsWith(JUMP.side) ? 1 : (k.endsWith('L') || k.endsWith('R')) ? 0.12 : 0.55;
    j[k].y += JUMP.y * w;
  }
}

// =====================================================================
// THE HURDLE WALK (legs split): the body moves only while both step the same general
// direction (within 60°), at the slower one's speed. Works on P1's real floor (virtOf in floor.js).
// =====================================================================
function hurdleStep(dt, p) {
  let q = live2();
  if (!LEGS.init) { LEGS.x = p.j.pelvis.x; LEGS.z = p.j.pelvis.z; LEGS.init = true; }
  LEGS.moving = false;
  if (q === p) { LEGS.x = p.j.pelvis.x; LEGS.z = p.j.pelvis.z; return LEGS; }   // solo: you are both, so you just walk
  if (!q) return LEGS;
  let k = p2Scale(), a = { x: p.vel.x, z: p.vel.z }, b = { x: q.vel.x * k.x, z: q.vel.z * k.z };
  let sa = Math.hypot(a.x, a.z), sb = Math.hypot(b.x, b.z);
  if (sa > 0.12 && sb > 0.12 && (a.x * b.x + a.z * b.z) / (sa * sb) > 0.5) {
    let dx = a.x / sa + b.x / sb, dz = a.z / sa + b.z / sb, dl = Math.hypot(dx, dz), sp = Math.min(sa, sb);
    LEGS.x += dx / dl * sp * dt; LEGS.z += dz / dl * sp * dt; LEGS.moving = true;
  }
  let u = usable(1); if (u) { LEGS.x = clamp(LEGS.x, u.x0, u.x1); LEGS.z = clamp(LEGS.z, u.z0, u.z1); }
  return LEGS;
}

// =====================================================================
// THE BUBBLES
// =====================================================================
// a spot on the floor the body can walk to: inside your measured floor (not its front third, the
// closest to the camera), or around the start without a measured floor
function bubbleSpot() {
  let u = usable(1), g = effGain();
  if (u) {
    let w = rectW(u), d = rectD(u), ins = Math.max(0.05, Math.min(SET.edgeBuffer, w / 2 - 0.05, d / 2 - 0.05));
    let zF = Math.min(u.z0 + Math.max(ins, d / 3), u.z1 - ins);
    return virtOf(rand(u.x0 + ins, u.x1 - ins), rand(zF, u.z1 - ins));
  }
  return { x: START.x + rand(-SET.areaW / 2, SET.areaW / 2) * g, z: START.z + rand(-SET.areaD, 0) * g };
}
// a round's layout: a quarter low, a quarter high, the rest in reach. Heights come from the body's own
// shoulders and reach, so nothing is out of range (high ones: just past standing reach, under a jump's)
function bubbleLayout() {
  let n = Math.max(3, Math.round(SET.bubbleN)), nLow = Math.max(1, Math.round(n / 4)), nHigh = Math.max(1, Math.round(n / 4)), nMid = Math.max(1, n - nLow - nHigh);
  let kinds = [...Array(nLow).fill('low'), ...Array(nMid).fill('mid'), ...Array(nHigh).fill('high')];
  for (let i = kinds.length - 1; i > 0; i--) { let k = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[k]] = [kinds[k], kinds[i]]; }
  let shY = AV.ok ? (AV.j.shL.y + AV.j.shR.y) / 2 - JUMP.y : 1.42, pelY = AV.ok ? AV.j.pelvis.y - JUMP.y : 0.95;
  let nShared = SET.sharedOnly && SET.legSplit && SET.jumpBoost ? Math.max(1, Math.floor(nHigh / 2)) : 0;
  let spots = [], out = [];
  for (let kind of kinds) {
    let best = null, bd = -1;
    for (let tries = 0; tries < 80; tries++) {
      let s = bubbleSpot();
      if (Math.abs(s.x) > ROOM.x - 0.7 || s.z < ROOM.zBack + 0.9 || s.z > ROOM.zFront - 0.5) continue;
      let dmin = spots.reduce((m, q) => Math.min(m, Math.hypot(q.x - s.x, q.z - s.z)), 99);
      if (AV.ok) dmin = Math.min(dmin, Math.hypot(AV.root.x - s.x, AV.root.z - s.z) + 0.3);   // not right where you stand
      if (dmin > 1.0) { best = s; break; }
      if (dmin > bd) { bd = dmin; best = s; }
    }
    if (!best) best = { x: START.x, z: START.z - 2 };
    spots.push(best);
    let r = BUB_R[kind], ns = kind === 'high' && nShared-- > 0, y, dz;
    if (kind === 'low') { y = r; dz = 0; }                                       // sitting on the floor: stand on it
    else if (kind === 'mid') { y = rand(pelY + 0.15, shY + 0.2); dz = -0.35; }   // in front of where you stand, waist to head
    else { y = shY + 0.6 + (ns ? 0.68 : 0.32); dz = -0.15; }                     // just overhead, past standing reach
    out.push({ kind, ns, x: best.x, y, z: best.z + dz, r });
  }
  return out;
}
// a new round (retry: the same layout again)
function bubbleRound(retry) {
  if (!retry || !BUB.layout) BUB.layout = bubbleLayout();
  BUB.list = BUB.layout.map(d => ({ id: BUB.nextId++, kind: d.kind, ns: d.ns, r: d.r, c: new V3(d.x, d.y, d.z), base: new V3(d.x, d.y, d.z), v: new V3(),
    tH: { L: -1e9, R: -1e9 }, tF: { L: -1e9, R: -1e9 }, s0: { L: 0, R: 0 }, touch: 0 }));
  BUB.total = BUB.list.length; BUB.popped = 0; BUB.phase = 'count'; BUB.count = 3; BUB.tl = SET.roundS; BUB.go = 0; BUB.used = 0;
  logEvent('round', { retry: !!retry, bubbles: BUB.total, low: BUB.list.filter(b => b.kind === 'low').length, high: BUB.list.filter(b => b.kind === 'high').length });
}
function bubblesReset() {
  BUB.needLayout = true; BUB.layout = null; BUB.list = []; BUB.phase = 'wait'; BUB.pops = [];
  JUMP.y = 0; JUMP.vy = 0; JUMP.air = false; JUMP.side = null; JUMP.take = { L: -1e9, R: -1e9 };
  LEGS.init = false;
}
function bubbleDrift(dt) {
  for (let b of BUB.list) {
    b.v.x += rand(-1, 1) * 0.25 * dt; b.v.z += rand(-1, 1) * 0.25 * dt;
    if (b.kind !== 'low') b.v.y += rand(-1, 1) * 0.12 * dt;
    b.v.addScaledVector(b.c.clone().sub(b.base), -0.08 * dt);   // a soft pull back, so none wanders off for good
    let sp = Math.hypot(b.v.x, b.v.z); if (sp > 0.12) { b.v.x *= 0.12 / sp; b.v.z *= 0.12 / sp; }
    b.v.y = clamp(b.v.y, -0.05, 0.05);
    b.c.addScaledVector(b.v, dt);
    b.c.x = clamp(b.c.x, -ROOM.x + 0.6, ROOM.x - 0.6); b.c.z = clamp(b.c.z, ROOM.zBack + 0.6, ROOM.zFront - 0.6);
    b.c.y = b.kind === 'low' ? b.r : clamp(b.c.y, b.base.y - 0.15, b.base.y + 0.15);
  }
}
// touching. Webcam depth is a guess, so the touch zone is stretched front to back.
// A hand: inside the bubble (+ the touching distance). A foot: inside a tall column from the floor up.
function inBubble(p, b) { let R = b.r + SET.touch, dx = p.x - b.c.x, dy = p.y - b.c.y, dz = (p.z - b.c.z) / 1.8; return dx * dx + dy * dy + dz * dz <= R * R; }
function inColumn(p, b) { let R = b.r + SET.touch, dx = p.x - b.c.x, dz = (p.z - b.c.z) / 1.6; return dx * dx + dz * dz <= R * R && p.y < b.r * 2 + 0.15; }
function bubbleTouches(now) {
  let w = BUB.w * 1000, palms = {}, feet = {};
  for (let s of ['L', 'R']) {
    let arm = ARMS[s]; if (arm.state === 'attached' || arm.state === 'snapping') palms[s] = palmOf(arm);
    feet[s] = AV.j['an' + s];
  }
  for (let b of BUB.list.slice()) {
    let T = b.kind === 'low' ? b.tF : b.tH;
    for (let s of ['L', 'R']) {
      let hit = b.kind === 'low' ? feet[s] && inColumn(feet[s], b) : palms[s] && inBubble(palms[s], b);
      if (!hit) continue;
      if (now - T[s] > 150) b.s0[s] = now;   // a new touch starts (for the log: who got there first)
      T[s] = now; b.touch++;
    }
    if (now - T.L <= w && now - T.R <= w) bubblePop(b, now);
  }
}
function bubblePop(b, now) {
  BUB.list.splice(BUB.list.indexOf(b), 1); BUB.popped++;
  let low = b.kind === 'low', first = b.s0.L <= b.s0.R ? 'L' : 'R', other = first === 'L' ? 'R' : 'L';
  let who = s => 'P' + (low ? legOwner(s) : ARMS[s].owner) + ' ' + (low ? 'foot ' : 'hand ') + s;
  BUB.pops.push({ id: b.id, k: b.ns ? 'shared' : b.kind, c: b.c.clone(), t: now });
  logEvent('pop', { bubble: b.ns ? 'high, shared jump' : b.kind, first: who(first), then: who(other), gapMs: Math.round(Math.abs(b.s0.L - b.s0.R)),
    inAir: JUMP.y > 0.02, left: BUB.list.length, secondsLeft: +BUB.tl.toFixed(1) });
}
// what to do next, in a few words, for the bubble nearest the body
function bubbleHint(now) {
  if (BUB.phase !== 'play' || !AV.ok) return '';
  let best = null, bd = 1.6;
  for (let b of BUB.list) {
    let dz = b.kind === 'mid' ? 0.35 : b.kind === 'high' ? 0.15 : 0, d = Math.hypot(b.c.x - AV.root.x, b.c.z + dz - AV.root.z);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) return '';
  let on = T => ['L', 'R'].filter(s => now - T[s] < 200).length;
  if (best.kind === 'low') return on(best.tF) === 1 ? 'one foot on · now the other foot' : 'stand on it · both feet';
  if (on(best.tH) === 1) return 'one hand on · now the other hand';
  if (best.kind === 'high') return best.ns ? 'too high for one · jump together' : 'jump · both hands up';
  return 'both hands on it';
}

// one frame of the game (host), after the body and the arms (sim.js)
function bubbleStep(dt, now) {
  BUB.w = clapWindow();
  jumpTick(now); jumpPhysics(dt);
  if (BUB.needLayout && AV.ok) { BUB.needLayout = false; bubbleRound(false); }
  for (let b of BUB.list) { b.touch = 0; }
  BUB.pops = BUB.pops.filter(p => now - p.t < 900);
  if (typeof RUN !== 'undefined' && RUN.phase !== 'play') { BUB.hint = ''; return; }   // still getting ready: hold
  if (SET.drift && BUB.phase === 'play') bubbleDrift(dt);
  if (BUB.phase === 'count') {
    BUB.count -= dt;
    if (BUB.count <= 0) { BUB.phase = 'play'; BUB.go = 0.8; logEvent('round', { go: true }); }
  } else if (BUB.phase === 'play') {
    BUB.tl -= dt; BUB.go = Math.max(0, BUB.go - dt);
    bubbleTouches(now);
    if (!BUB.list.length) { BUB.phase = 'clear'; BUB.endT = 5; BUB.used = SET.roundS - BUB.tl; logEvent('round', { result: 'cleared', seconds: +BUB.used.toFixed(1) }); }
    else if (BUB.tl <= 0) { BUB.tl = 0; BUB.phase = 'over'; BUB.endT = 5; logEvent('round', { result: 'time up', popped: BUB.popped, of: BUB.total }); }
  } else if (BUB.phase === 'clear' || BUB.phase === 'over') {
    BUB.endT -= dt;
    if (BUB.endT <= 0) bubbleRound(BUB.phase === 'over');   // time ran out: retry the same layout; cleared: a new one
  }
  BUB.hint = bubbleHint(now);
}

// the game, as plain numbers (drawn here, and sent to P2's laptop)
function bubSnap() {
  return { ph: BUB.phase, tl: r3(BUB.tl), cnt: Math.ceil(BUB.count), go: r3(BUB.go), tot: BUB.total, left: BUB.list.length, popped: BUB.popped, used: r3(BUB.used), endT: Math.ceil(BUB.endT),
    hint: BUB.hint, w: Math.round(BUB.w * 1000), delay: Math.round(linkDelay()),
    list: BUB.list.map(b => [b.id, b.ns ? 3 : BUB_KINDS.indexOf(b.kind), r3(b.c.x), r3(b.c.y), r3(b.c.z), r3(b.r), b.touch]),
    pops: BUB.pops.map(p => [p.id, p.k, r3(p.c.x), r3(p.c.y), r3(p.c.z)]),
    land: BUB.land, big: BUB.landBig, sharedN: BUB.sharedN, jy: r3(JUMP.y), side: JUMP.side, shared: JUMP.shared,
    legs: { L: legOwner('L'), R: legOwner('R') }, hurdle: !!SET.legSplit, moving: LEGS.moving };
}

// =====================================================================
// DEMO PEOPLE play Bubble Pop: P1 walks the body to the nearest bubble and pops it (hands, feet, or a
// jump with both hands up); P2 copies P1 a quarter of a second late, so claps and jumps land together
// =====================================================================
function bubbleHands(b, k) {
  let base = AV.j.pelvis, out = {};
  for (let [s, sg] of [['L', -1], ['R', 1]]) {
    let n = new V3(-sg, 0, 0), P = b.c.clone().add(new V3(sg * b.r * 0.7, 0, 0));
    let f = P.clone().sub(AV.j['sh' + s]).normalize();
    let W = P.clone().addScaledVector(f, -0.045).addScaledVector(n, -0.0125);
    let wr = AV.j['sh' + s].clone().add(new V3(sg * 0.05, -0.56, 0)).lerp(W, smooth01(k)).sub(base);
    out[s] = { wr: V(wr.x, wr.y, wr.z), n: V(n.x, n.y, n.z), f: V(f.x, f.y, f.z) };
  }
  return out;
}
function demoBubbles(now, dt, which) {
  if (DEMO.reset || !DEMO.p1 || !DEMO.bub) {
    DEMO.reset = false; DEMO.bub = true;
    DEMO.p1 = { x: 0, z: 2.8, home: { x: 0, z: 2.8 }, phase: 'walk', t: 0, walk: 0, tgt: null, lift: 0 };
    let x2 = SET.spaces === 1 ? 0.9 : 0;
    DEMO.p2 = { x: x2, z: 2.8, home: { x: x2, z: 2.8 }, hist: [], walk: 0 };
  }
  let A = DEMO.p1, B = DEMO.p2, out = {}, moving = 0, hands = null;
  A.t += dt; A.lift = 0;
  let alive = BUB.phase === 'play' ? BUB.list : [];
  if (!A.tgt || !alive.includes(A.tgt)) {
    A.tgt = null; A.phase = 'walk'; let bd = 1e9;
    if (AV.ok) for (let b of alive) { let d = Math.hypot(b.c.x - AV.root.x, b.c.z - AV.root.z); if (d < bd) { bd = d; A.tgt = b; } }
  }
  if (A.tgt && AV.ok) {
    // steer by where the BODY is (with the legs split it lags behind P1), toward where it should stand
    let b = A.tgt, sz = b.kind === 'mid' ? 0.35 : b.kind === 'high' ? 0.15 : 0, gx = b.c.x - AV.root.x, gz = b.c.z + sz - AV.root.z, d = Math.hypot(gx, gz);
    if (A.phase === 'walk') {
      if (d > 0.06) { let g = effGain(), step = 0.55 * dt; A.x += gx / d * Math.min(step, d / g); A.z += gz / d * Math.min(step, d / g); moving = 1; }
      else { A.phase = 'reach'; A.t = 0; }
    } else {
      if (d > 0.25) { A.phase = 'walk'; A.t = 0; }
      if (b.kind !== 'low') hands = bubbleHands(b, Math.min(1, A.t / 0.7));
      if (b.kind === 'high' && A.t > 0.6) { let u = (A.t - 0.6) % 1.5; if (u < 0.45) A.lift = 0.22 * Math.sin(Math.PI * u / 0.45); }
    }
  }
  A.walk += dt * 7 * moving;
  let toA = h => h ? { wr: vadd(V(A.x, 0.95, A.z), h.wr), n: h.n, f: h.f } : null;
  out[1] = makePerson(A.x, A.z, A.walk, moving, hands ? { L: toA(hands.L), R: toA(hands.R) } : null, A.lift);
  B.hist.push({ t: now, x: A.x - A.home.x, z: A.z - A.home.z, hands, lift: A.lift });
  while (B.hist.length > 2 && now - B.hist[1].t > 250) B.hist.shift();
  let late = B.hist[0], tx = B.home.x + late.x, tz = B.home.z + late.z, dx = tx - B.x, dz = tz - B.z, dd = Math.hypot(dx, dz), bmove = 0;
  if (dd > 0.01) { let sp = 0.8 * dt; B.x += dx / dd * Math.min(sp, dd); B.z += dz / dd * Math.min(sp, dd); bmove = 1; }
  B.walk += dt * 7 * bmove;
  let toB = h => h ? { wr: vadd(V(B.x, 0.95, B.z), h.wr), n: h.n, f: h.f } : null;
  out[2] = makePerson(B.x, B.z, B.walk, bmove, late.hands ? { L: toB(late.hands.L), R: toB(late.hands.R) } : null, late.lift);
  return which ? out[which] : out;
}

// =====================================================================
// DRAWING (every laptop, from the snap): the bubbles, their shadows and floor rings, a dashed line
// down from the high ones, bursts when they pop, and a little camera shake on landing
// =====================================================================
const BV = { init: false, items: [], bursts: [], popSeen: new Set(), land: null, shared: null, ph: null, tex: null };
function bubbleSceneInit() {
  BV.init = true;
  let cv = document.createElement('canvas'); cv.width = cv.height = 64;
  let g = cv.getContext('2d'), gd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gd.addColorStop(0, 'rgba(0,0,0,0.5)'); gd.addColorStop(0.6, 'rgba(0,0,0,0.2)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gd; g.fillRect(0, 0, 64, 64); BV.tex = new THREE.CanvasTexture(cv);
  let sph = new THREE.SphereGeometry(1, 32, 20), small = new THREE.SphereGeometry(1, 12, 8), ringG = new THREE.RingGeometry(0.86, 1, 48);
  for (let i = 0; i < 24; i++) {
    let mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.42, iridescence: 1, iridescenceIOR: 1.3,
      clearcoat: 1, clearcoatRoughness: 0.1, emissive: 0x000000, depthWrite: false });
    let m = new THREE.Mesh(sph, mat); m.renderOrder = 2;
    let hi = new THREE.Mesh(small, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    hi.scale.setScalar(0.16); hi.position.set(-0.38, 0.45, 0.55); m.add(hi);
    let sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: BV.tex, transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    let ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    let stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3(0, 1, 0)]), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.06, gapSize: 0.06, transparent: true, opacity: 0.6 }));
    stem.frustumCulled = false;
    for (let o of [m, sh, ring, stem]) { o.visible = false; SC.scene.add(o); }
    BV.items.push({ m, mat, sh, ring, stem });
  }
}
function bubbleBurst(p) {
  let [id, k, x, y, z] = p, col = BUB_COL[k] || 0xffffff, N = 22, pos = new Float32Array(N * 3), vel = [];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    let d = new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.8, 2.2)); d.y += 0.6; vel.push(d);
  }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  let pts = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: 0.045, transparent: true, opacity: 1, depthWrite: false }));
  let ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.position.set(x, y, z); pts.frustumCulled = false;
  SC.scene.add(pts); SC.scene.add(ring);
  BV.bursts.push({ pts, ring, vel, t: 0 });
}
function bubbleRender(S, dt) {
  if (!BV.init) { if (!SC.scene) return; bubbleSceneInit(); }
  let B = S && S.ok && S.bub ? S.bub : null, t = performance.now() / 1000;
  for (let it of BV.items) { it.m.visible = it.sh.visible = it.ring.visible = it.stem.visible = false; }
  if (B) {
    B.list.forEach((b, i) => {
      let it = BV.items[i]; if (!it) return;
      let [id, k, x, y, z, r, touch] = b, col = BUB_COL[BUB_KINDS[k]];
      let wob = touch ? 1.1 + 0.05 * Math.sin(t * 22) : 1 + 0.035 * Math.sin(t * 2.2 + id);
      it.m.visible = true; it.m.position.set(x, y + (k ? 0.03 * Math.sin(t * 1.3 + id * 1.7) : 0), z); it.m.scale.set(r * wob, r * (2 - wob), r * wob);
      it.mat.color.setHex(col); it.mat.emissive.setHex(col); it.mat.emissiveIntensity = touch ? 0.65 : 0.18; it.mat.opacity = touch ? 0.62 : 0.42;
      let s = r * 2.6 * (1 + y * 0.15);
      it.sh.visible = true; it.sh.position.set(x, 0.006, z); it.sh.scale.set(s, s, 1); it.sh.material.opacity = clamp(0.6 - y * 0.12, 0.15, 0.6);
      it.ring.visible = true; it.ring.position.set(x, 0.008, z); it.ring.scale.setScalar(r * (k === 3 ? 1.35 : 1.15) * (touch ? 1.15 : 1)); it.ring.material.color.setHex(col);
      if (k >= 2) {
        let a = it.stem.geometry.attributes.position; a.setXYZ(0, x, y - r, z); a.setXYZ(1, x, 0.01, z); a.needsUpdate = true;
        it.stem.computeLineDistances(); it.stem.material.color.setHex(col); it.stem.visible = true;
      }
    });
    for (let p of B.pops) { if (BV.popSeen.has(p[0])) continue; BV.popSeen.add(p[0]); bubbleBurst(p); sndPop(p[1]); }
    if (BV.popSeen.size > 300) BV.popSeen = new Set([...BV.popSeen].slice(-100));
    if (BV.land !== null && B.land !== BV.land) { SC.shake = Math.max(SC.shake || 0, B.big); sndThud(B.big); }
    BV.land = B.land;
    if (BV.shared !== null && B.sharedN !== BV.shared) sndWhoosh();
    BV.shared = B.sharedN;
    let key = B.ph + (B.ph === 'count' ? B.cnt : ''), play = typeof RUN === 'undefined' || RUN.phase === 'play';
    if (BV.ph !== null && key !== BV.ph && play) {
      if (B.ph === 'count') sndBeep(520, 0.09); else if (B.ph === 'play') sndBeep(880, 0.2); else if (B.ph === 'clear') sndChime(); else if (B.ph === 'over') sndOver();
    }
    BV.ph = key;
  } else { BV.ph = null; BV.land = null; BV.shared = null; }
  // the bursts: droplets thrown out and falling, a ring opening
  BV.bursts = BV.bursts.filter(b => {
    b.t += dt;
    if (b.t > 0.8) { SC.scene.remove(b.pts); SC.scene.remove(b.ring); b.pts.geometry.dispose(); b.ring.geometry.dispose(); return false; }
    let a = b.pts.geometry.attributes.position;
    b.vel.forEach((v, i) => { v.y -= 6 * dt; a.setXYZ(i, a.getX(i) + v.x * dt, Math.max(0.01, a.getY(i) + v.y * dt), a.getZ(i) + v.z * dt); });
    a.needsUpdate = true; b.pts.material.opacity = 1 - b.t / 0.8;
    b.ring.scale.setScalar(0.12 + b.t * 0.8); b.ring.lookAt(SC.camera.position); b.ring.material.opacity = Math.max(0, 0.9 * (1 - b.t / 0.5));
    return true;
  });
}

// =====================================================================
// SOUND (made on the spot with the Web Audio API; each laptop can mute its own)
// =====================================================================
const SND = { ctx: null };
function snd() {
  if (!SET.sound) return null;
  try { if (!SND.ctx) SND.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (SND.ctx.state === 'suspended') SND.ctx.resume(); } catch (e) { return null; }
  return SND.ctx;
}
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => { if (SET.sound) snd(); }, true));   // browsers only allow sound after a click or key
function tone(f0, f1, dur, type, vol, delay) {
  let c = snd(); if (!c) return;
  let t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noiseHit(dur, fc, q, vol, delay) {
  let c = snd(); if (!c) return;
  let t = c.currentTime + (delay || 0), n = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n); }
  let s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.frequency.value = fc; f.Q.value = q; g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination); s.start(t);
}
function sndPop(k) { let p = { low: 0.8, mid: 1, high: 1.25, shared: 1.5 }[k] || 1; noiseHit(0.05, 2400 * p, 1.2, 0.5); tone(900 * p, 180 * p, 0.09, 'sine', 0.35); }
function sndThud(big) { tone(110, 40, 0.18 + 0.15 * big, 'sine', 0.3 + 0.4 * big); noiseHit(0.08, 300, 0.8, 0.1 + 0.25 * big); }
function sndBeep(f, d) { tone(f, f, d, 'square', 0.08); }
function sndChime() { [660, 880, 1320].forEach((f, i) => tone(f, f, 0.25, 'triangle', 0.18, i * 0.11)); }
function sndOver() { tone(330, 160, 0.5, 'triangle', 0.2); }
function sndWhoosh() { noiseHit(0.35, 900, 0.6, 0.35); tone(300, 700, 0.3, 'sine', 0.12); }

// =====================================================================
// HUD, camera view and stats (every laptop)
// =====================================================================
const isBubblesLocal = () => SET.game === 'bubbles' && !SET.armsOnly;
// are this person's feet in the picture? (null: no picture to tell from)
function feetSeenOf(p) {
  let lm = p && (p.lmS || p.lm); if (!lm || !lm[27] || !lm[28]) return null;
  return [27, 28].every(i => { let q = lm[i]; return (q.visibility === undefined || q.visibility > 0.6) && q.y > 0.02 && q.y < 0.97 && q.x > 0.01 && q.x < 0.99; });
}
// THE FRAME CHECK: feet and jumping need head to toe in the picture
function feetText() {
  if (!isBubblesLocal() || SET.source !== 'mediapipe') return '';
  let slots = calSlots(), out = [];
  for (let k of slots) { if (feetSeenOf(live(k)) === false) out.push((slots.length > 1 ? 'P' + k + ': ' : '') + 'step back · your feet are out of the picture'); }
  return out.join(' · ');
}
// for the getting-ready card (step 3)
function feetNote() {
  if (!isBubblesLocal() || SET.source !== 'mediapipe') return '';
  let seen = calSlots().map(k => feetSeenOf(live(k))).filter(f => f !== null);
  if (!seen.length) return '';
  return seen.every(f => f) ? '<br><span class="ok">✓ Feet in the picture</span>' : '<br><span class="wait">Bubble Pop needs your feet: step back until they’re in the picture</span>';
}
// each laptop watches its own people's jumps too, for the marker in its camera view
function bubbleLocalTick(now) {
  if (!isBubblesLocal()) return;
  for (let k of calSlots()) jumpSense(live(k), now);
}
const fmtT = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function bubbleHud(S) {
  let B = S && S.ok && S.bub ? S.bub : null, play = typeof RUN === 'undefined' || RUN.phase === 'play';
  let tEl = $('timer'), big = $('bigmsg'), feet = $('feet');
  if (!B) { tEl.style.display = 'none'; big.style.display = 'none'; feet.style.display = 'none'; return; }
  $('hud').style.display = 'none'; $('hold').style.opacity = 0;
  $('score').textContent = 'BUBBLES ' + B.left + ' / ' + B.tot;
  tEl.style.display = play ? 'block' : 'none'; tEl.textContent = fmtT(B.tl); tEl.classList.toggle('low', B.ph === 'play' && B.tl < 10);
  let msg = null;
  if (play) {
    if (B.ph === 'count') msg = [String(Math.max(1, B.cnt)), 'pop all ' + B.tot + ' · two hands each · two feet for the low ones · jump for the high ones'];
    else if (B.ph === 'play' && B.go > 0) msg = ['GO!', ''];
    else if (B.ph === 'clear') msg = ['CLEARED', 'in ' + fmtT(B.used) + ' · next round in ' + B.endT];
    else if (B.ph === 'over') msg = ['TIME’S UP', B.popped + ' of ' + B.tot + ' popped · again in ' + B.endT];
  }
  big.style.display = msg ? 'flex' : 'none';
  if (msg) { $('big-a').textContent = msg[0]; $('big-b').textContent = msg[1]; $('big-b').style.display = msg[1] ? '' : 'none'; }
  let pr = play && B.ph === 'play' ? B.hint : '';
  $('prompt').textContent = pr; $('prompt').style.opacity = pr ? 1 : 0; $('prompt').classList.remove('held', 'apart');
  let ft = feetText(); feet.style.display = ft ? 'block' : 'none'; feet.textContent = ft;
}
// in the camera view (drawn in the picture's own, possibly mirrored, space): the ankles (green seen,
// red not), a jump meter beside the hips (the tick is where a hop counts), and JUMP! when one fires
function bubblePipMarks(x, w, h) {
  if (!isBubblesLocal()) return;
  let now = performance.now(), say = (txt, px, py, col) => { x.save(); x.translate(px, py); if (SET.mirror) x.scale(-1, 1); x.fillStyle = col; x.font = 'bold 15px monospace'; x.textAlign = 'center'; x.fillText(txt, 0, 0); x.restore(); };
  for (let k of calSlots()) {
    let p = live(k), lm = p && (p.lmS || p.lm); if (!lm || !lm[23] || !lm[24]) continue;
    for (let i of [27, 28]) {
      let q = lm[i]; if (!q) continue;
      let ok = (q.visibility === undefined || q.visibility > 0.6) && q.y < 0.97;
      x.strokeStyle = ok ? 'rgba(48,209,88,0.95)' : 'rgba(229,55,42,0.95)'; x.lineWidth = 2; x.beginPath(); x.arc(q.x * w, Math.min(q.y, 0.99) * h, 7, 0, 7); x.stroke();
    }
    let hx = (lm[23].x + lm[24].x) / 2 * w + 30, hy = (lm[23].y + lm[24].y) / 2 * h, M = 46, up = p.up || 0, kk = clamp(up / (SET.jumpThr * 2), 0, 1);
    x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(hx - 3, hy - M, 6, M);
    x.fillStyle = p.jAir ? 'rgba(255,214,0,1)' : 'rgba(255,255,255,0.9)'; x.fillRect(hx - 3, hy - M * kk, 6, M * kk);
    x.fillStyle = 'rgba(255,214,0,1)'; x.fillRect(hx - 7, hy - M / 2 - 1, 14, 2);
    if (p.jAir || (p.jT && now - p.jT < 450)) say('JUMP!', lm[0] ? lm[0].x * w : hx, lm[0] ? Math.max(16, lm[0].y * h - 30) : hy - M - 8, 'rgba(255,214,0,1)');
  }
}
// around the whole camera view: green when your feet are in, red and dashed when not; and the clap window
function bubblePipFrame(x, w, h) {
  if (!isBubblesLocal() || SET.source !== 'mediapipe') return;
  let ok = !feetText(), col = ok ? 'rgba(48,209,88,0.9)' : 'rgba(229,55,42,0.95)';
  x.strokeStyle = col; x.lineWidth = 4; x.setLineDash(ok ? [] : [10, 6]); x.strokeRect(2, 2, w - 4, h - 4); x.setLineDash([]);
  x.fillStyle = col; x.font = 'bold 11px monospace'; x.textAlign = 'right';
  x.fillText(ok ? 'FEET IN ✓' : 'FEET OUT · STEP BACK', w - 9, h - 9);
  let S = typeof SC !== 'undefined' && SC.lastSnap, B = S && S.bub;
  if (B) { x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillText('clap window ' + B.w + ' ms' + (B.delay ? ' · link ' + B.delay + ' ms' : ''), w - 9, 14); }
  x.textAlign = 'left';
}
function bubbleStatsLine(S) {
  let B = S && S.ok && S.bub; if (!B) return '';
  let pp = k => { let p = people[k]; return p ? 'P' + k + ' up ' + Math.round((p.up || 0) * 100) + ' cm' + (p.jAir ? ' IN THE AIR' : '') : 'P' + k + ' -'; };
  let body = B.jy > 0 ? 'up ' + Math.round(B.jy * 100) + ' cm' + (B.side && B.side !== 'both' ? ' (lopsided, ' + B.side + ')' : B.shared ? ' (together)' : '') : 'on the floor';
  return 'BUBBLE POP · ' + B.ph + ' · ' + B.left + ' of ' + B.tot + ' left · ' + Math.max(0, Math.ceil(B.tl)) + ' s · clap window ' + B.w + ' ms (link delay ' + B.delay + ' ms)' +
    ' · legs L P' + B.legs.L + ' R P' + B.legs.R + (B.hurdle ? ' (hurdle walk, ' + (B.moving ? 'moving' : 'still') + ')' : '') + ' · body ' + body + ' · ' + pp(1) + ' · ' + pp(2);
}
