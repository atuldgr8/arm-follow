// ============================================================
// ARM FOLLOW · sim.js
// The world's rules, run by P1's laptop (the host) or in 1 space:
//   the body (built from P1), the follow rule (drift + turning),
//   the possessed arm's states (attached / falling / lying / returning /
//   snapping, or limp), the grips, and the cube task.
// Everything ends in SNAP: a plain description of the frame that scene.js
// draws (and that the host sends to P2's laptop in 2 spaces).
// World: metres; y up; the body starts at START facing -z, the camera behind it.
// ============================================================

const V3 = THREE.Vector3;
const START = new V3(0, 0, 1.0);
const ARM_LEN = [0.30, 0.27, 0.09];          // upper arm, forearm, palm
const RADII = [0.06, 0.05, 0.04, 0.03];      // shoulder, elbow, wrist, fingertips (for floor contact)
const CUBE_SIZE = 0.42, CH = CUBE_SIZE / 2;
const PLINTH = { w: 0.5, h: 0.6, p: new V3(0, 0, -1.5) };
const TARGET = { p: new V3(1.5, 0, -1.5), on: false };   // the plinth to carry the cube to
// the game is carrying the cube to the other plinth; the optional warm-up is lifting the first one
const taskMode = () => SET.warmup && TASK.score < 1 ? 'lift' : 'carry';
const ROOM = { x: 4.5, zBack: -4.5, zFront: 4.5 };
const toV3 = v => new V3(v.x, v.y, v.z);
const smooth01 = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

const AV = { ok: false, root: new V3(), py: 0.93, j: {}, yaw: 0, frame: null, unturn: 0 };
// turn a direction back by the part of P1's turning that's over the limit
function unturn(v) { let a = AV.unturn; if (!a) return v; let c = Math.cos(a), s = Math.sin(a); return V(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
const FOLLOW = { state: 'vacant', ref1: null, ref2: null, yaw1: 0, yaw2: 0, drift: 0, turn: 0, dvec: { x: 0, z: 0 } };
const CUBE = { c: new V3(0, PLINTH.h + CH, -1.5), yaw: 0, vy: 0, held: false, mode: null, lockSep: 0, off: new V3(), yawOff: 0, dwell: 0, scale: 1, vanish: 0, appear: 0, hands: null, slip: 0 };
const TASK = { score: 0, holdT: 0, flash: 0, lost: 0 };
let SNAP = null;

function ownerOf(s) {
  if (SET.own === 'both') return 2;
  if (SET.own === 'custom') return s === 'L' ? SET.ownL : SET.ownR;
  return SET.own === s ? 2 : 1;
}

// ---------------- torso frames: a possessed arm moves relative to P2's own body,
// and is carried over onto P1's body (so leaning or turning a little doesn't swing it)
function torsoFrame(j) {
  let X = vnorm(vsub(j.shR, j.shL)), up = vsub(j.neck, j.pelvis);
  let Y = vnorm(vsub(up, vmul(X, vdot(up, X))));
  return { X, Y, Z: vcross(X, Y) };
}
function xfer(v, from, to) {
  let lx = vdot(v, from.X), ly = vdot(v, from.Y), lz = vdot(v, from.Z);
  return vadd(vadd(vmul(to.X, lx), vmul(to.Y, ly)), vmul(to.Z, lz));
}

// =====================================================================
// THE BODY: P1's tracked joints, placed in the room. Your real steps move it
// (walk gain), and the feet are kept on the floor.
// =====================================================================
function composeAvatar(dt) {
  let p = live(1); if (!p) return;
  if (!p.home) p.home = { x: p.j.pelvis.x, z: p.j.pelvis.z };
  // limit how far the body may turn: anything past the limit is turned back
  let yawC = clamp(p.yaw, -SET.turnMax, SET.turnMax);
  AV.unturn = (p.yaw - yawC) * Math.PI / 180;
  let j = p.j, pel = j.pelvis, rel = n => unturn(vsub(j[n], pel)), legs = {};
  for (let s of ['L', 'R']) {
    let hip = rel('hip' + s), kn = vadd(hip, vmul(vnorm(unturn(vsub(j['kn' + s], j['hip' + s]))), 0.43));
    legs[s] = { hip, kn, an: vadd(kn, vmul(vnorm(unturn(vsub(j['an' + s], j['kn' + s]))), 0.42)) };
  }
  let pyT = 0.075 - Math.min(legs.L.an.y, legs.R.an.y);
  AV.py = AV.ok ? AV.py + (pyT - AV.py) * Math.min(1, dt * 8) : pyT;
  let vp = SET.armsOnly ? { x: START.x, z: START.z } : virtOf(pel.x, pel.z);   // your real floor position, in the room (floor.js); arms only: stays put
  vp = reachHold(vp);
  if (SET.solid && !SET.armsOnly) vp = solidPush(vp);
  AV.root.set(clamp(vp.x, -ROOM.x + 0.4, ROOM.x - 0.4), 0, clamp(vp.z, ROOM.zBack + 0.4, ROOM.zFront - 0.4));
  let base = new V3(AV.root.x, AV.py, AV.root.z), W = r => base.clone().add(toV3(r));
  AV.j = { pelvis: base, neck: W(rel('neck')), head: W(rel('head')), shL: W(rel('shL')), shR: W(rel('shR')),
    hipL: W(legs.L.hip), knL: W(legs.L.kn), anL: W(legs.L.an), hipR: W(legs.R.hip), knR: W(legs.R.kn), anR: W(legs.R.an) };
  let F = torsoFrame(j);
  AV.frame = { X: unturn(F.X), Y: unturn(F.Y), Z: unturn(F.Z) };
  AV.yaw = yawC;
  AV.ok = true;
}

// SOLID: the plinths (and the cube on them) can't be walked into. A body is about 30 cm around the
// middle, so it's kept that far from a plinth's sides and slides along them.
function solidPush(vp) {
  let r = PLINTH.w / 2 + 0.3, x = vp.x, z = vp.z;
  for (let P of TARGET.on ? [PLINTH.p, TARGET.p] : [PLINTH.p]) {
    let dx = x - P.x, dz = z - P.z;
    if (Math.abs(dx) < r && Math.abs(dz) < r) {   // inside: out by the shortest way
      if (r - Math.abs(dx) < r - Math.abs(dz)) x = P.x + Math.sign(dx || 1) * r; else z = P.z + Math.sign(dz || 1) * r;
    }
  }
  return { x, z };
}
// REACHING HOLDS YOUR PLACE (a game-like cut): within reach of the cube, or of the plinth while you hold
// it, the body ignores your small shifts (leaning in, swaying, the camera's wobble) and only your arms
// move. A deliberate step still moves you: anything beyond the hold zone (about 12 cm of real floor at
// the usual walk gain) pushes the body along. Webcam/iPhone people only (the demo walks exactly).
const RLOCK = { on: false, at: null };
function reachHold(vp) {
  if (!SET.reachLock || SET.armsOnly || !AV.ok || SET.source !== 'mediapipe') { RLOCK.on = false; return vp; }
  let goal = CUBE.held ? (TARGET.on ? TARGET.p : null) : CUBE.c;
  let d = goal ? Math.hypot(goal.x - AV.root.x, goal.z - AV.root.z) : 99;
  if (!RLOCK.on && d < 0.9 && !CUBE.vanish) { RLOCK.on = true; RLOCK.at = { x: AV.root.x, z: AV.root.z }; logEvent('reach hold', { on: true }); }
  if (RLOCK.on && d > 1.25) { RLOCK.on = false; logEvent('reach hold', { on: false }); }
  if (!RLOCK.on) return vp;
  let zone = 0.25, ex = vp.x - RLOCK.at.x, ez = vp.z - RLOCK.at.z, e = Math.hypot(ex, ez);
  if (e > zone) { let k = 1 - zone / e; RLOCK.at.x += ex * k; RLOCK.at.z += ez * k; }
  return { x: RLOCK.at.x, z: RLOCK.at.z };
}

// where an arm would be if it were attached: P1's shoulder, the driver's arm directions
function armTarget(side) {
  let owner = ownerOf(side), q = owner === 2 ? live2() : live(1);
  if (!q || !AV.ok) return null;
  let j = q.j, same = q === live(1), from = same ? null : torsoFrame(j);
  let X = v => same ? unturn(v) : xfer(v, from, AV.frame);
  let u = vnorm(X(vsub(j['el' + side], j['sh' + side]))), fv = vnorm(X(vsub(j['wr' + side], j['el' + side])));
  let h = q.hands[side] || { n: V(0, 0, -1), f: fv, open: null };
  let hf = vnorm(X(h.f)), hn = X(h.n);
  hn = vnorm(vsub(hn, vmul(hf, vdot(hn, hf))));
  let S = AV.j['sh' + side].clone();
  let E = S.clone().addScaledVector(toV3(u), ARM_LEN[0]), Wp = E.clone().addScaledVector(toV3(fv), ARM_LEN[1]), H = Wp.clone().addScaledVector(toV3(hf), ARM_LEN[2]);
  return { pts: [S, E, Wp, H], n: toV3(hn), open: h.open, u, fv, hf, rel: vsub(j['wr' + side], j['sh' + side]) };
}

// =====================================================================
// THE FOLLOW RULE
// drift: how far P1 and P2 have moved apart since the arm was last attached, on the
// floor only. 2 spaces: P1's movement − P2's movement. 1 space: how much the gap
// between them changed. (It's the same sum either way.) Turning counts too.
// =====================================================================
function resetRefs(a, b) {
  FOLLOW.ref1 = { x: a.j.pelvis.x, z: a.j.pelvis.z }; FOLLOW.ref2 = { x: b.j.pelvis.x, z: b.j.pelvis.z };
  FOLLOW.yaw1 = a.yaw; FOLLOW.yaw2 = b.yaw;
}
const wrap180 = a => { while (a > 180) { a -= 360; } while (a < -180) { a += 360; } return a; };
function p2Arms() { return ['L', 'R'].filter(s => ownerOf(s) === 2); }
function followStep() {
  let a = live(1), b = live2(), mine = p2Arms();
  if (!a) return;
  if (!b) {
    if (FOLLOW.state !== 'vacant') { FOLLOW.state = 'vacant'; logEvent('P2 gone', {}); }
    for (let s of mine) { let arm = ARMS[s]; if (['attached', 'snapping', 'returning'].includes(arm.state)) become(arm, 'vacant'); }
    FOLLOW.drift = 0; FOLLOW.turn = 0; FOLLOW.dvec = { x: 0, z: 0 };
    return;
  }
  if (FOLLOW.state === 'vacant' || !FOLLOW.ref1) {
    resetRefs(a, b); FOLLOW.state = 'returning';
    for (let s of mine) { if (ARMS[s].state !== 'attached') become(ARMS[s], 'returning'); }
    logEvent('P2 here', {});
  }
  let k2 = p2Scale();   // rooms of different sizes, mapped: P2's steps scaled into P1's room
  // stepping toward/away from the camera counts less (SET.depthDrift): leaning in to reach looks like a step
  let dx = (a.j.pelvis.x - FOLLOW.ref1.x) - (b.j.pelvis.x - FOLLOW.ref2.x) * k2.x, dz = ((a.j.pelvis.z - FOLLOW.ref1.z) - (b.j.pelvis.z - FOLLOW.ref2.z) * k2.z) * SET.depthDrift;
  FOLLOW.dvec = { x: dx, z: dz };
  FOLLOW.drift = Math.hypot(dx, dz);
  FOLLOW.turn = Math.abs(wrap180((a.yaw - FOLLOW.yaw1) - (b.yaw - FOLLOW.yaw2)));
  if (SET.armsOnly) { FOLLOW.drift = 0; FOLLOW.turn = 0; FOLLOW.dvec = { x: 0, z: 0 }; }   // arms only: never left behind (a fallen arm comes back)
  if (!mine.length) { FOLLOW.state = 'together'; return; }
  let over = FOLLOW.drift > SET.tol || FOLLOW.turn > SET.turnTol;
  let under = FOLLOW.drift < 0.6 * SET.tol && FOLLOW.turn < 0.6 * SET.turnTol;
  let why = FOLLOW.drift > SET.tol ? 'walked apart' : 'turned apart';
  if (FOLLOW.state === 'together' && over) {
    FOLLOW.state = 'apart'; TASK.lost++;
    for (let s of mine) { become(ARMS[s], 'falling'); }
    logEvent('left behind', { why, drift: +FOLLOW.drift.toFixed(2), turn: Math.round(FOLLOW.turn) });
  } else if (FOLLOW.state === 'apart' && under) {
    FOLLOW.state = 'returning';
    for (let s of mine) { become(ARMS[s], 'returning'); }
    logEvent('caught up', { drift: +FOLLOW.drift.toFixed(2) });
  } else if (FOLLOW.state === 'returning') {
    if (over) {
      FOLLOW.state = 'apart';
      for (let s of mine) { if (['returning', 'snapping', 'attached'].includes(ARMS[s].state)) become(ARMS[s], 'falling'); }
      logEvent('left behind again', { why });
    } else if (mine.every(s => ARMS[s].state === 'attached')) {
      FOLLOW.state = 'together'; resetRefs(a, b); logEvent('arm back', {});
    }
  }
}

// =====================================================================
// THE ARMS
// A chain of four points (shoulder S, elbow E, wrist W, fingertips H).
// Attached: placed from the driver's tracking. Lifeless: a small physics
// simulation (gravity, joints that keep their lengths, the floor), which is
// what makes it fall loose like a marionette with its strings cut.
// =====================================================================
function newArm(side) {
  let p4 = () => [new V3(), new V3(), new V3(), new V3()];
  return { side, owner: 1, state: 'attached', t: 0, init: false, pts: p4(), prev: p4(), acc: p4(), last: p4(), snapO: p4(), snapV: p4(),
    n: new V3(0, 0, -1), f: new V3(0, -1, 0), curl: 0.12, life: 1, restS: new V3(), dirU0: new V3(1, 0, 0), hist: [],
    sk: new V3(), skv: new V3(), p: 0, pT: 0, jolt: 0, twCD: 0, calm: 0, from: null, mech: null, retLimp: false, wspd: 0, lastRel: null, lastDt: 0.016 };
}
const ARMS = { L: newArm('L'), R: newArm('R') };
const openCurl = open => open === null || open === undefined ? 0.12 : clamp(1 - open, 0, 1) * 0.9;
const lifelessCurl = () => SET.curl ? 1 : 0.12;

function hangFromShoulder(arm) {
  let S = AV.j['sh' + arm.side], sg = arm.side === 'L' ? -1 : 1;
  arm.pts[0].copy(S); arm.pts[1].copy(S).add(new V3(sg * 0.02, -0.30, 0)); arm.pts[2].copy(arm.pts[1]).add(new V3(0, -0.27, 0)); arm.pts[3].copy(arm.pts[2]).add(new V3(0, -0.09, 0));
  for (let i = 0; i < 4; i++) { arm.prev[i].copy(arm.pts[i]); }
  arm.init = true;
}
function setPose(arm, tgt) { for (let i = 0; i < 4; i++) { arm.pts[i].copy(tgt.pts[i]); arm.prev[i].copy(tgt.pts[i]); } arm.init = true; }

function become(arm, state) {
  let from = arm.state;
  if (!arm.init) hangFromShoulder(arm);
  if (state === 'falling' && SET.lifeless === 'limp') state = 'limp';
  arm.state = state; arm.t = 0; arm.calm = 0;
  if (state === 'falling') {
    // start falling with the speed the arm already had, plus a small loose kick outward
    let sg = arm.side === 'L' ? -1 : 1, h = arm.lastDt;
    for (let i = 0; i < 4; i++) {
      let v = arm.pts[i].clone().sub(arm.last[i]).divideScalar(Math.max(0.005, arm.lastDt));
      v.add(new V3(sg * 0.35, 0.25, 0.1));
      arm.prev[i].copy(arm.pts[i]).addScaledVector(v, -h / 3);
    }
    if (!SET.puppetFall) {
      // stiff, mechanical drop: the arm keeps its shape and lies down flat
      let S = arm.pts[0], dir = arm.pts[1].clone().sub(S).setY(0);
      if (dir.length() < 0.05) dir.set(sg, 0, 0.2);
      dir.normalize();
      let S0 = new V3(S.x, RADII[0], S.z), E = S0.clone().addScaledVector(dir, ARM_LEN[0]), Wp = E.clone().addScaledVector(dir, ARM_LEN[1]), H = Wp.clone().addScaledVector(dir, ARM_LEN[2]);
      E.y = RADII[1]; Wp.y = RADII[2]; H.y = RADII[3];
      arm.mech = { from: arm.pts.map(p => p.clone()), to: [S0, E, Wp, H] };
    }
  } else if (state === 'lying') {
    arm.restS.copy(arm.pts[0]);
    let d = arm.pts[1].clone().sub(arm.pts[0]).setY(0);
    arm.dirU0.copy(d.length() > 0.03 ? d.normalize() : new V3(arm.side === 'L' ? -1 : 1, 0, 0));
    for (let i = 0; i < 4; i++) { arm.prev[i].copy(arm.pts[i]); }
  } else if (state === 'limp' || state === 'vacant') {
    for (let i = 0; i < 4; i++) { arm.prev[i].copy(arm.pts[i]); }
  } else if (state === 'returning') {
    arm.p = 0; arm.pT = 0; arm.jolt = 0; arm.from = arm.pts.map(p => p.clone());
    arm.retLimp = from === 'limp' || from === 'vacant' || from === 'attached';
    arm.restS.copy(arm.pts[0]); arm.sk.copy(arm.pts[0]); arm.skv.set(0, 0, 0);
  } else if (state === 'snapping') {
    let tgt = armTarget(arm.side);
    for (let i = 0; i < 4; i++) { arm.snapO[i].copy(tgt ? arm.pts[i].clone().sub(tgt.pts[i]) : new V3()); arm.snapV[i].set(0, 0, 0); }
  }
  if (from !== state) logEvent('arm ' + arm.side, { from, to: state });
}

// ---------------- physics ----------------
function groundAt(x, z) {
  let on = P => Math.abs(x - P.x) < PLINTH.w / 2 && Math.abs(z - P.z) < PLINTH.w / 2;
  return on(PLINTH.p) || (TARGET.on && on(TARGET.p)) ? PLINTH.h : 0;
}
function link(a, b, L, wa, wb, minOnly) {
  let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6;
  if (minOnly && d >= L) return;
  let k = (d - L) / d / (wa + wb);
  a.x += dx * k * wa; a.y += dy * k * wa; a.z += dz * k * wa;
  b.x -= dx * k * wb; b.y -= dy * k * wb; b.z -= dz * k * wb;
}
function physics(arm, dt, pin, forces) {
  const SUB = 3, h = dt / SUB, rest = SET.puppetFall ? 0.35 : 0;
  let P = arm.pts, Q = arm.prev, A = arm.acc;
  for (let k = 0; k < SUB; k++) {
    if (forces) forces(h);
    for (let i = 0; i < 4; i++) {
      if (i === 0 && pin) continue;
      let p = P[i], q = Q[i], a = A[i];
      let vx = (p.x - q.x) * 0.996, vy = (p.y - q.y) * 0.996, vz = (p.z - q.z) * 0.996;
      q.copy(p);
      p.x += vx + a.x * h * h; p.y += vy + (a.y - 9.8) * h * h; p.z += vz + a.z * h * h;
    }
    if (pin) { Q[0].copy(P[0]); P[0].copy(pin); }
    let w0 = pin ? 0 : 1;
    for (let it = 0; it < 4; it++) {
      link(P[0], P[1], ARM_LEN[0], w0, 1); link(P[1], P[2], ARM_LEN[1], 1, 1); link(P[2], P[3], ARM_LEN[2], 1, 1);
      link(P[0], P[2], 0.16, w0, 1, true); link(P[1], P[3], 0.12, 1, 1, true);   // an elbow can't fold right back on itself
    }
    // the floor and the plinth: bounce (once, with puppet fall on), then slide to a stop
    for (let i = pin ? 1 : 0; i < 4; i++) {
      let p = P[i], q = Q[i], r = RADII[i];
      for (let PP of TARGET.on ? [PLINTH.p, TARGET.p] : [PLINTH.p]) {
      let inX = Math.abs(p.x - PP.x) < PLINTH.w / 2 + r, inZ = Math.abs(p.z - PP.z) < PLINTH.w / 2 + r;
      if (inX && inZ && p.y < PLINTH.h + r) {
        if (PLINTH.h + r - p.y < 0.1) { let vy = p.y - q.y; p.y = PLINTH.h + r; q.y = p.y + Math.min(0, vy) * rest; }
        else {   // into the plinth's side: push back out sideways
          let ox = PLINTH.w / 2 + r - Math.abs(p.x - PP.x), oz = PLINTH.w / 2 + r - Math.abs(p.z - PP.z);
          if (ox < oz) p.x += Math.sign(p.x - PP.x || 1) * ox; else p.z += Math.sign(p.z - PP.z || 1) * oz;
        }
      }
      }
      if (p.y < r) {
        let vy = p.y - q.y; p.y = r; q.y = p.y + Math.min(0, vy) * rest;
        q.x = p.x - (p.x - q.x) * 0.75; q.z = p.z - (p.z - q.z) * 0.75;
      }
    }
    for (let a of A) { a.set(0, 0, 0); }
  }
}
const velOf = (arm, i, h) => arm.pts[i].clone().sub(arm.prev[i]).divideScalar(h);

// the driver's arm, a moment ago (for the lying arm that follows late)
function delayedPose(arm, tMs) {
  let best = arm.hist[0];
  for (let e of arm.hist) { if (e.t <= tMs) best = e; }
  return best;
}
// the driver's arm shape, laid down on the floor where the arm lies
function lyingTargets(arm, d) {
  let q = new THREE.Quaternion().setFromUnitVectors(toV3(d.u), arm.dirU0);
  let flat = v => { let w = toV3(v).applyQuaternion(q); w.y = Math.max(-0.05, w.y * 0.7); return w.normalize(); };   // it can lift off the floor a little, like it could work again
  let E = arm.restS.clone().addScaledVector(arm.dirU0, ARM_LEN[0]);
  let Wp = E.clone().addScaledVector(flat(d.fv), ARM_LEN[1]);
  return [null, E, Wp, Wp.clone().addScaledVector(flat(d.hf), ARM_LEN[2])];
}

function armStep(arm, dt, now) {
  arm.owner = ownerOf(arm.side);
  let tgt = armTarget(arm.side);
  for (let i = 0; i < 4; i++) { arm.last[i].copy(arm.pts[i]); }
  arm.lastDt = dt;
  if (tgt && !arm.init) setPose(arm, tgt);
  if (!arm.init) { if (AV.ok) hangFromShoulder(arm); else return; }
  if (tgt) {
    arm.hist.push({ t: now, u: tgt.u, fv: tgt.fv, hf: tgt.hf });
    while (arm.hist.length > 2 && now - arm.hist[0].t > 2500) arm.hist.shift();
    if (arm.lastRel) arm.wspd += (vlen(vsub(tgt.rel, arm.lastRel)) / Math.max(0.005, dt) - arm.wspd) * 0.3;
    arm.lastRel = tgt.rel;
  }
  // P1's own arm: always alive
  if (arm.owner === 1) {
    if (arm.state !== 'attached') { arm.state = 'attached'; arm.t = 0; }
    if (tgt) { setPose(arm, tgt); arm.n.copy(tgt.n); }
    arm.life = 1; arm.curl += ((tgt ? openCurl(tgt.open) : 0.12) - arm.curl) * Math.min(1, dt * 10);
    handFrame(arm, tgt); return;
  }
  arm.t += dt;
  switch (arm.state) {
    case 'attached':
      if (!tgt) { become(arm, 'vacant'); break; }
      setPose(arm, tgt); arm.n.copy(tgt.n);
      arm.life = Math.min(1, arm.life + dt * 4);
      arm.curl += (openCurl(tgt.open) - arm.curl) * Math.min(1, dt * 10);
      break;
    case 'falling':
      arm.life = Math.max(0, arm.life - dt * 3);
      arm.curl += (lifelessCurl() - arm.curl) * Math.min(1, dt * 4);
      if (!SET.puppetFall && arm.mech) {
        let k = Math.min(1, arm.t / 0.35);
        for (let i = 0; i < 4; i++) { arm.pts[i].copy(arm.mech.from[i]).lerp(arm.mech.to[i], k); }
        if (k >= 1) become(arm, 'lying');
        break;
      }
      physics(arm, dt, null);
      {
        let sp = 0; for (let i = 0; i < 4; i++) { sp = Math.max(sp, arm.pts[i].distanceTo(arm.prev[i]) / (dt / 3)); }
        arm.calm = sp < 0.08 ? arm.calm + dt : 0;
        if (arm.calm > 0.25 || arm.t > 2.5) become(arm, 'lying');
      }
      break;
    case 'lying': {
      arm.life = Math.max(0, arm.life - dt * 3);
      let cT = SET.lyingFollow && tgt ? lifelessCurl() * 0.45 + openCurl(tgt.open) * 0.55 : lifelessCurl();   // the fingers still follow P2's hand, weakly
      arm.curl += (cT - arm.curl) * Math.min(1, dt * 4);
      let d = SET.lyingFollow && arm.hist.length ? delayedPose(arm, now - SET.lag * 1000) : null;
      let T = d ? lyingTargets(arm, d) : null, k = 50 * SET.lyingStrength;
      physics(arm, dt, null, h => {
        arm.acc[0].addScaledVector(arm.restS.clone().sub(arm.pts[0]), 90).addScaledVector(velOf(arm, 0, h), -10);   // the shoulder end stays where it fell
        if (T) { for (let i = 1; i < 4; i++) { arm.acc[i].addScaledVector(T[i].clone().sub(arm.pts[i]), k).addScaledVector(velOf(arm, i, h), -6); } }
      });
      // small twitches when the driver moves a lot
      arm.twCD -= dt;
      if (SET.twitch && tgt && arm.wspd > 1.0 && arm.twCD <= 0) {
        arm.twCD = rand(0.25, 0.6);
        let kick = new V3(rand(-0.3, 0.3), rand(0.25, 0.5), rand(-0.3, 0.3)), h = dt / 3;
        for (let i of [2, 3]) { arm.prev[i].addScaledVector(kick, -h * (i === 3 ? 1.3 : 1)); }
      }
      break;
    }
    case 'limp': case 'vacant':
      arm.life = Math.max(0, arm.life - dt * 3);
      arm.curl += (lifelessCurl() - arm.curl) * Math.min(1, dt * 4);
      physics(arm, dt, AV.j['sh' + arm.side]);
      break;
    case 'returning': {
      if (!tgt) { become(arm, 'vacant'); break; }
      let sh = AV.j['sh' + arm.side];
      if (SET.returnStyle === 'glide') {
        // smooth and mechanical, for comparison
        let k = smooth01(arm.t / (SET.returnTime * 0.6));
        for (let i = 0; i < 4; i++) { arm.pts[i].copy(arm.from[i]).lerp(tgt.pts[i], k); arm.prev[i].copy(arm.pts[i]); }
        arm.life = k; arm.curl += (openCurl(tgt.open) - arm.curl) * k;
        if (k >= 1) become(arm, 'attached');
        break;
      }
      // invisible strings: pulled up in jerks, dangling, a little too slow
      arm.jolt -= dt;
      if (arm.jolt <= 0) { arm.pT = Math.min(1, arm.pT + rand(0.7, 1.5) * 0.13 / SET.returnTime); arm.jolt = rand(0.09, 0.18); }
      if (arm.t > SET.returnTime * 1.8) arm.pT = 1;
      arm.p += (arm.pT - arm.p) * Math.min(1, dt * 14);
      let p = arm.p;
      // the shoulder end hangs on its own string: it chases a target that moves in jolts, so it moves in jerks
      if (!arm.retLimp) {
        let Sg = arm.restS.clone().lerp(sh, smooth01(p)).add(new V3(0, Math.sin(Math.PI * p) * 0.35, 0));
        let k = 160, c = 2 * Math.sqrt(k) * 0.55;
        arm.skv.addScaledVector(Sg.sub(arm.sk), k * dt).multiplyScalar(Math.max(0, 1 - c * dt));
        arm.sk.addScaledVector(arm.skv, dt);
      }
      physics(arm, dt, arm.retLimp ? sh : arm.sk, h => {
        // the wrist's string: it hangs from the shoulder, then is drawn into the driver's pose near the end
        let hang = arm.pts[0].clone().add(new V3(0, -0.42, -0.05)), Wg = hang.lerp(tgt.pts[2], smooth01((p - 0.55) / 0.45));
        arm.acc[2].addScaledVector(Wg.sub(arm.pts[2]), 5 + 40 * p * p).addScaledVector(velOf(arm, 2, h), -2 * p);
      });
      arm.life = p * 0.35;
      if (p > 0.995 && arm.pts[0].distanceTo(sh) < 0.05) become(arm, 'snapping');
      break;
    }
    case 'snapping': {
      if (!tgt) { become(arm, 'vacant'); break; }
      // into the shoulder with a small overshoot (a springy snap); fingers twitch back to life
      let w = 24, z = SET.overshoot ? 0.38 : 1.0, maxO = 0, h = dt / 2;
      for (let s = 0; s < 2; s++) {
        for (let i = 0; i < 4; i++) {
          let o = arm.snapO[i], v = arm.snapV[i];
          v.addScaledVector(o, -w * w * h).addScaledVector(v, -2 * z * w * h);
          o.addScaledVector(v, h);
        }
      }
      for (let i = 0; i < 4; i++) { arm.pts[i].copy(tgt.pts[i]).add(arm.snapO[i]); arm.prev[i].copy(arm.pts[i]); maxO = Math.max(maxO, arm.snapO[i].length()); }
      arm.n.copy(tgt.n);
      arm.life = Math.min(1, arm.t / 0.25);
      let base = openCurl(tgt.open);
      arm.curl = SET.curl ? base + (1 - base) * Math.exp(-4 * arm.t) * (0.5 + 0.5 * Math.cos(28 * arm.t)) : base;
      if (arm.t > 0.3 && maxO < 0.004) become(arm, 'attached');
      break;
    }
  }
  handFrame(arm, tgt);
}
// which way the palm faces: from tracking when alive; when lifeless it keeps its last
// direction, turning palm-down as it lies
function handFrame(arm, tgt) {
  let f = arm.pts[3].clone().sub(arm.pts[2]);
  f = f.length() > 1e-4 ? f.normalize() : new V3(0, -1, 0);
  let n = arm.n.clone();
  if ((arm.state === 'attached' || arm.state === 'snapping') && tgt) n.copy(tgt.n);
  else if (arm.state === 'lying') n.lerp(new V3(0, -1, 0), 0.05);
  n.addScaledVector(f, -n.dot(f));
  if (n.length() < 1e-3) n.set(0, 0, -1).addScaledVector(f, -f.z);
  arm.n.copy(n.normalize()); arm.f.copy(f);
}

// =====================================================================
// PICKING UP THE CUBE (two hands, on opposite sides)
//   squeeze: held only while both palms press in; ease off and it slips, let go and it drops
//   palm:    palms touching and facing the cube lock it to the hands
//   touch:   both hands touching is enough
//   dwell:   both hands touching for 0.5 s and it sticks
// All of them: palms moving apart lets go. A lifeless hand can't hold.
// =====================================================================
const cubeAxes = () => { let c = Math.cos(CUBE.yaw), s = Math.sin(CUBE.yaw); return { x: new V3(c, 0, -s), z: new V3(s, 0, c) }; };
function cubeLocal(p) { let d = p.clone().sub(CUBE.c), c = Math.cos(CUBE.yaw), s = Math.sin(CUBE.yaw); return new V3(d.x * c - d.z * s, d.y, d.x * s + d.z * c); }
const rotY = (v, a) => new V3(v.x * Math.cos(a) + v.z * Math.sin(a), v.y, -v.x * Math.sin(a) + v.z * Math.cos(a));
function palmOf(arm) { return arm.pts[2].clone().addScaledVector(arm.f, 0.045).addScaledVector(arm.n, 0.0125); }
function gripHands() {
  let out = [];
  for (let s of ['L', 'R']) {
    let arm = ARMS[s];
    if (arm.state !== 'attached') continue;                              // lifeless: powerless
    if (SET.holders === 'possessed' && arm.owner !== 2) continue;
    out.push({ side: s, p: palmOf(arm), n: arm.n.clone() });
  }
  return out;
}
// is this palm touching one of the cube's four sides?
function touchInfo(p, n) {
  let l = cubeLocal(p), hs = CH * CUBE.scale;
  let qx = Math.abs(l.x) - hs, qy = Math.abs(l.y) - hs, qz = Math.abs(l.z) - hs;
  let out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
  if (out > SET.touch || qy > 0.03) return null;
  let ax = cubeAxes(), axis = qx >= qz ? 'x' : 'z', sign = Math.sign(axis === 'x' ? l.x : l.z) || 1;
  let inward = ax[axis].clone().multiplyScalar(-sign);
  return { axis, sign, inward, facing: n.dot(inward), out };
}
function lockCube(A, B, mode) {
  let mid = A.p.clone().add(B.p).multiplyScalar(0.5), a = B.p.clone().sub(A.p), ya = Math.atan2(-a.z, a.x);
  CUBE.off = rotY(CUBE.c.clone().sub(mid), -ya); CUBE.yawOff = CUBE.yaw - ya;
  CUBE.lockSep = a.length(); CUBE.held = true; CUBE.mode = mode; CUBE.hands = [A.side, B.side]; CUBE.slip = 0; CUBE.away = 0;
  logEvent('grip', { mode, sep: +CUBE.lockSep.toFixed(3) });
}
function dropCube(why) { CUBE.held = false; CUBE.vy = 0; CUBE.hands = null; CUBE.slip = 0; CUBE.dwell = 0; logEvent('drop', { why }); }
// HAND ASSIST: a palm near one of the cube's four sides is drawn onto it (and turned to face it),
// more strongly the closer it is, so holding the cube looks and feels like holding it.
// The raw palms are kept for letting go, so pulling your hands apart still drops it.
function assistHands() {
  if (!CUBE.snapHeld) { CUBE.raw = {}; for (let s of ['L', 'R']) { let arm = ARMS[s]; if (arm.state === 'attached') CUBE.raw[s] = palmOf(arm); } }
  if (!SET.assist || CUBE.vanish > 0) return;
  let ax = cubeAxes(), hs = CH * CUBE.scale, R = 0.06 + 0.22 * SET.assist;
  for (let s of ['L', 'R']) {
    let arm = ARMS[s]; if (arm.state !== 'attached') continue;
    if (SET.holders === 'possessed' && arm.owner !== 2) continue;
    let p = palmOf(arm), l = cubeLocal(p);
    if (Math.abs(l.y) > hs + 0.06) continue;
    let axis = Math.abs(l.x) >= Math.abs(l.z) ? 'x' : 'z', sg = Math.sign(axis === 'x' ? l.x : l.z) || 1;
    let gap = Math.abs(axis === 'x' ? l.x : l.z) - hs;          // how far off the side (negative: inside)
    let along = Math.abs(axis === 'x' ? l.z : l.x) - hs;          // past the side's edge
    let held = CUBE.held && CUBE.hands && CUBE.hands.includes(s);
    if (held !== !!CUBE.snapHeld) continue;     // before the grip: free hands; after the cube has moved: the holding hands
    if (!held && (gap > R || along > 0.04)) continue;
    let w = held ? 1 : smooth01(1 - Math.max(0, gap) / R) * (0.35 + 0.65 * SET.assist);
    let out = ax[axis].clone().multiplyScalar(sg);
    let target = p.clone().addScaledVector(out, -gap);            // onto the side
    if (along > 0) target.addScaledVector(axis === 'x' ? ax.z : ax.x, -Math.sign(axis === 'x' ? l.z : l.x) * along);
    let move = target.sub(p).multiplyScalar(w);
    arm.pts[2].add(move); arm.pts[3].add(move);
    arm.pts[1].addScaledVector(move, 0.4);
    arm.n.lerp(out.clone().negate(), w * 0.8).normalize();
    arm.assist = w;
  }
}
function gripStep(dt) {
  for (let s of ['L', 'R']) { ARMS[s].assist = 0; }
  CUBE.snapHeld = false; assistHands();
  let hands = gripHands(), touch = hands.map(h => touchInfo(h.p, h.n));
  // the holding hands move the cube from where they really are (not where they're drawn)
  if (CUBE.held) for (let h of hands) { if (CUBE.raw[h.side] && CUBE.hands.includes(h.side)) h.p = CUBE.raw[h.side].clone(); }
  CUBE.touching = touch.filter(t => t).length;
  if (CUBE.vanish > 0) return;
  if (CUBE.held) {
    let A = hands.find(h => h.side === CUBE.hands[0]), B = hands.find(h => h.side === CUBE.hands[1]);
    if (!A || !B) return dropCube('a hand went lifeless');
    let a = B.p.clone().sub(A.p), sep = a.length();
    if (CUBE.mode === 'squeeze') {
      CUBE.lockSep = Math.max(CUBE_SIZE * CUBE.scale - 0.02, Math.min(CUBE.lockSep, sep));
      let loose = sep - CUBE.lockSep, dir = a.clone().normalize();
      let facing = Math.min(A.n.dot(dir), -B.n.dot(dir));
      if (loose > 0.06) return dropCube('let go');
      CUBE.slip = Math.max(0, (loose - 0.015) / 0.045) + (facing < 0.15 ? 0.6 : 0);
      CUBE.off.y -= CUBE.slip * 0.5 * dt;
      if (CUBE.off.y < -0.22) return dropCube('slipped out');
    } else {
      // held while your palms face each other, as if holding a box (overhead too); let go by
      // opening your hands outward, or pulling them well apart
      let dir = a.clone().normalize(), facing = Math.min(A.n.dot(dir), -B.n.dot(dir));
      CUBE.away = facing < -0.15 ? (CUBE.away || 0) + dt : 0;
      if (sep > CUBE.lockSep + 0.3 || CUBE.away > 0.35) return dropCube(CUBE.away > 0.35 ? 'opened hands' : 'let go');
    }
    let mid = A.p.clone().add(B.p).multiplyScalar(0.5), ya = Math.atan2(-a.z, a.x);
    let want = mid.add(rotY(CUBE.off, ya)), k = Math.min(1, dt * 14);
    CUBE.c.lerp(want, k); CUBE.yaw += wrap180((ya + CUBE.yawOff - CUBE.yaw) * 180 / Math.PI) * Math.PI / 180 * k; CUBE.vy = 0;
    CUBE.snapHeld = true; assistHands();   // and the hands are drawn on its sides
    return;
  }
  // not held: look for two hands on opposite sides
  let found = null;
  for (let i = 0; i < hands.length && !found; i++) {
    for (let k = i + 1; k < hands.length && !found; k++) {
      let ti = touch[i], tk = touch[k];
      if (!ti || !tk || ti.axis !== tk.axis || ti.sign === tk.sign) continue;
      let along = Math.abs(hands[k].p.clone().sub(hands[i].p).dot(cubeAxes()[ti.axis]));
      let ok = SET.grip === 'squeeze' ? ti.facing > 0.3 && tk.facing > 0.3 && along < CUBE_SIZE * CUBE.scale + 0.035
        : SET.grip === 'palm' ? ti.facing > 0.5 && tk.facing > 0.5
        : true;
      found = { A: hands[i], B: hands[k], ok };
    }
  }
  if (found && SET.grip === 'dwell') { CUBE.dwell += dt; found.ok = CUBE.dwell >= 0.5; }
  else if (!found) CUBE.dwell = 0;
  if (found && found.ok) {
    let [A, B] = found.A.side === 'L' ? [found.A, found.B] : [found.B, found.A];
    if (SET.assist && CUBE.raw[A.side] && CUBE.raw[B.side]) { A = Object.assign({}, A, { p: CUBE.raw[A.side].clone() }); B = Object.assign({}, B, { p: CUBE.raw[B.side].clone() }); }
    lockCube(A, B, SET.grip); return;
  }
  // falls onto the plinth or the floor
  let onP = P => Math.abs(CUBE.c.x - P.x) < PLINTH.w / 2 + 0.05 && Math.abs(CUBE.c.z - P.z) < PLINTH.w / 2 + 0.05;
  let support = (onP(PLINTH.p) || (TARGET.on && onP(TARGET.p)) ? PLINTH.h : 0) + CH * CUBE.scale;
  CUBE.vy -= 9.8 * dt; CUBE.c.y += CUBE.vy * dt;
  if (CUBE.c.y < support) { CUBE.c.y = support; CUBE.vy = 0; }
  CUBE.c.x = clamp(CUBE.c.x, -ROOM.x + CH, ROOM.x - CH); CUBE.c.z = clamp(CUBE.c.z, ROOM.zBack + CH, ROOM.zFront - CH);
}
// for the picture only: palms rest on the cube's surface instead of sinking into it
function palmsOnSurface() {
  if (CUBE.vanish > 0) return;
  let ax = cubeAxes(), hs = CH * CUBE.scale;
  for (let s of ['L', 'R']) {
    let arm = ARMS[s]; if (arm.state !== 'attached') continue;
    let p = palmOf(arm), l = cubeLocal(p);
    if (Math.abs(l.x) >= hs || Math.abs(l.y) >= hs || Math.abs(l.z) >= hs) continue;
    let px = hs - Math.abs(l.x), pz = hs - Math.abs(l.z);
    let push = px < pz ? ax.x.clone().multiplyScalar(Math.sign(l.x) * px) : ax.z.clone().multiplyScalar(Math.sign(l.z) * pz);
    arm.pts[2].add(push); arm.pts[3].add(push);
  }
}

// =====================================================================
// THE TASK: walk to the cube, lift it above the body's waist (its bottom above the
// waist), hold it there for 2 s. Then a new cube appears somewhere else.
// =====================================================================
function taskStep(dt) {
  TASK.flash = Math.max(0, TASK.flash - dt * 1.5);
  if (CUBE.appear > 0) CUBE.appear = Math.max(0, CUBE.appear - dt * 2);
  if (CUBE.vanish > 0) {
    CUBE.vanish -= dt; CUBE.scale = Math.max(0.01, CUBE.vanish / 0.6);
    if (CUBE.vanish <= 0) spawnCube(false);
    return;
  }
  let done = false;
  if (taskMode() === 'carry') {
    // level 2: set it down on the other plinth (let go, and it rests there)
    let onT = !CUBE.held && Math.abs(CUBE.c.x - TARGET.p.x) < PLINTH.w / 2 + 0.05 && Math.abs(CUBE.c.z - TARGET.p.z) < PLINTH.w / 2 + 0.05 && Math.abs(CUBE.c.y - (PLINTH.h + CH * CUBE.scale)) < 0.02;
    TASK.holdT = onT ? TASK.holdT + dt : 0;
    done = TASK.holdT >= 0.4;
  } else {
    let waist = AV.j.pelvis.y;
    let up = CUBE.held && CUBE.c.y - CH * CUBE.scale > waist;
    TASK.holdT = up ? TASK.holdT + dt : Math.max(0, TASK.holdT - dt * 2);
    done = TASK.holdT >= SET.holdTime;
  }
  if (done) {
    TASK.score++; TASK.flash = 1; TASK.holdT = 0;
    logEvent('done', { score: TASK.score });
    CUBE.held = false; CUBE.hands = null; CUBE.vanish = 0.6;
  }
}
function spawnCube(first) {
  let pos = null;
  if (usable(1) && SET.calUse !== 'gain') pos = spawnInFloor(first);
  else if (SET.spawnLR) {
    // mostly left and right: the other side from where the body is now
    let bx = AV.ok ? AV.root.x - START.x : 0, side = first || Math.abs(bx) < 0.2 ? (Math.random() < 0.5 ? -1 : 1) : (bx > 0 ? -1 : 1);
    let rx = side * SET.areaW / 2 * rand(0.75, 1), rz = rand(-0.3, 0);
    pos = new V3(clamp(START.x + rx * effGain(), -ROOM.x + 0.7, ROOM.x - 0.7), 0, START.z + rz * effGain() - 0.47);
  } else if (!first) {
    for (let k = 0; k < 120 && !pos; k++) {
      let rx = rand(-SET.areaW / 2, SET.areaW / 2), rz = rand(-SET.areaD, 0.1);
      let stand = new V3(START.x + rx * effGain(), 0, START.z + rz * effGain()), c = stand.clone().add(new V3(0, 0, -0.47));
      let d = Math.hypot(c.x - AV.root.x, c.z - AV.root.z);
      if (d < 1.4 || d > 3.2 || Math.abs(c.x) > ROOM.x - 0.6 || c.z < ROOM.zBack + 0.6) continue;
      pos = c;
    }
  }
  if (!pos) pos = new V3(START.x, 0, START.z - 2.5);
  PLINTH.p.copy(pos);
  TARGET.on = taskMode() === 'carry';
  if (TARGET.on) {
    let cx = usable(1) ? VR.cx : START.x, lim = ROOM.x - 0.7, tx = 2 * cx - pos.x;
    if (Math.abs(tx - pos.x) < 1.6) tx = pos.x + (pos.x > cx ? -1.8 : 1.8);
    TARGET.p.set(clamp(tx, -lim, lim), 0, pos.z);
    if (Math.abs(TARGET.p.x - pos.x) < 1.2) TARGET.p.x = clamp(pos.x + (TARGET.p.x > pos.x ? -1.8 : 1.8), -lim, lim);
  }
  CUBE.c.set(pos.x, PLINTH.h + CH, pos.z); CUBE.yaw = 0; CUBE.vy = 0; CUBE.held = false; CUBE.hands = null; CUBE.scale = 1; CUBE.vanish = 0; CUBE.appear = 1; CUBE.dwell = 0;
}
// for the demo people: where to stand, and where their wrists go to hold and lift the cube
TASK.standPoint = () => PLINTH.p.clone().add(new V3(0, 0, 0.47));
TASK.realStand = () => realOf(TASK.standPoint());   // the same spot on P1's real floor
TASK.handTargets = (k, lift, apart) => {
  if (!AV.ok) return null;
  let base = AV.j.pelvis, cc = new V3(PLINTH.p.x, PLINTH.h + CH + lift * 0.5, PLINTH.p.z + 0.02), out = {};
  for (let [s, sg] of [['L', -1], ['R', 1]]) {
    let n = new V3(-sg, 0, 0), f = new V3(0, -0.3, -1).normalize();
    let P = new V3(cc.x + sg * (CH - 0.004 + (apart || 0)), cc.y, cc.z);
    let W = P.addScaledVector(n, -0.0125).addScaledVector(f, -0.045);
    let hang = AV.j['sh' + s].clone().add(new V3(sg * 0.05, -0.56, 0));
    let wr = hang.lerp(W, smooth01(k)).sub(base);
    out[s] = { wr: V(wr.x, wr.y, wr.z), n: V(n.x, n.y, n.z), f: V(f.x, f.y, f.z) };
  }
  return out;
};

// =====================================================================
function restartWorld() {
  rehome();
  FOLLOW.state = 'vacant'; FOLLOW.ref1 = null; FOLLOW.drift = 0; FOLLOW.turn = 0;
  TASK.score = 0; TASK.holdT = 0; TASK.lost = 0;
  for (let s of ['L', 'R']) { ARMS[s] = newArm(s); }
  AV.ok = false;
  spawnCube(true);
  logEvent('restart', {});
}
// when who-owns-what changes, every arm starts attached again
function ownershipChanged() {
  for (let s of ['L', 'R']) { let a = ARMS[s]; a.state = 'attached'; a.t = 0; a.life = 1; }
  FOLLOW.state = 'vacant'; FOLLOW.ref1 = null;
  if (CUBE.held) dropCube('owners changed');
}

function simStep(dt, now) {
  composeAvatar(dt);
  if (AV.ok) {
    followStep();
    for (let s of ['L', 'R']) { armStep(ARMS[s], dt, now); }
    if (!SET.armsOnly) { gripStep(dt); palmsOnSurface(); taskStep(dt); }
  }
  SNAP = buildSnap();
}

// ---------------- the frame, as plain numbers (drawn here, and sent to P2's laptop) ----------------
const r3 = x => Math.round(x * 1000) / 1000;
const a3 = v => [r3(v.x), r3(v.y), r3(v.z)];
function buildSnap() {
  if (!AV.ok) return { ok: false, hud: hudSnap() };
  let b = {};
  for (let k in AV.j) { b[k] = a3(AV.j[k]); }
  let arms = {};
  for (let s of ['L', 'R']) {
    let a = ARMS[s];
    arms[s] = { pts: a.pts.map(a3), n: a3(a.n), f: a3(a.f), curl: r3(a.curl), life: r3(a.life), owner: a.owner, state: a.state, as: r3(a.assist || 0) };
  }
  // where P2 is in the room: P2's shadow on the floor. Walk your shadow under the body and the arm comes back.
  let ghost = null, mine = p2Arms();
  let showG = SET.ghost === 'always' || (SET.ghost === 'auto' && ['apart', 'returning'].includes(FOLLOW.state));
  if (showG && FOLLOW.ref1 && live2() && mine.length) {
    let g = effGain();
    ghost = { p: [r3(AV.root.x - g * FOLLOW.dvec.x), r3(AV.root.z - g * FOLLOW.dvec.z / Math.max(0.05, SET.depthDrift))], sh: mine[0], ok: FOLLOW.drift < 0.6 * SET.tol };
  }
  return { ok: true, body: b, yaw: r3(AV.yaw), arms, strings: SET.strings,
    cube: { c: a3(CUBE.c), yaw: r3(CUBE.yaw), s: r3(CUBE.scale), held: CUBE.held, appear: r3(CUBE.appear) },
    armsOnly: SET.armsOnly, armsView: SET.armsView, thread: SET.thread, plinth: [r3(PLINTH.p.x), r3(PLINTH.p.z)], target: TARGET.on ? [r3(TARGET.p.x), r3(TARGET.p.z)] : null, ghost, chap: chapSnap(), hud: hudSnap(), centre: centreSnap() };
}
function hudSnap() {
  return { drift: r3(FOLLOW.drift), tol: SET.tol, turn: Math.round(FOLLOW.turn), turnTol: SET.turnTol, state: FOLLOW.state,
    score: TASK.score, hold: r3(TASK.holdT / SET.holdTime), flash: r3(TASK.flash), p1: !!live(1), p2: !!live2(), anyP2: p2Arms().length > 0,
    held: CUBE.held, slip: r3(CUBE.slip), touching: CUBE.touching || 0, dwell: r3(CUBE.dwell),
    task: taskMode(), nearT: AV.ok && TARGET.on ? r3(Math.hypot(TARGET.p.x - AV.root.x, TARGET.p.z - AV.root.z)) : 99,
    near: AV.ok ? r3(Math.hypot(CUBE.c.x - AV.root.x, CUBE.c.z - AV.root.z)) : 99, up: CUBE.held && AV.ok && CUBE.c.y - CH * CUBE.scale > AV.j.pelvis.y,
    lifeless: p2Arms().some(s => ARMS[s].state !== 'attached'), assist: r3(Math.max(ARMS.L.assist || 0, ARMS.R.assist || 0)) };
}

// the walk to the centre: the ring everyone walks onto (the middle of the room), and where P2 is
function centreSnap() {
  if (typeof RUN === 'undefined' || RUN.phase !== 'centre') return null;
  let p2 = p2InRoom(), c = RUN.centre || {};
  return { ring: [VR.cx, VR.cz], p2: p2 ? [r3(p2.x), r3(p2.z)] : null, ok1: c.d1 !== null && c.d1 < 0.15, ok2: c.d2 !== null && c.d2 < 0.15 };
}
