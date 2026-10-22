// ============================================================
// ARM FOLLOW · net.js
// 2 spaces: one person per laptop and camera, linked by a 4-letter code (PeerJS),
// or by a same-computer test link (two browser tabs).
// The HOST is P1 (the body owner): it runs the world and decides the experience.
// The GUEST is P2: it sends its own body (and its measured floor), and draws the
// world the host sends back. To feel instant, P2's laptop draws P2's own possessed
// arm from its own tracking straight away, instead of waiting for the round trip.
// ============================================================

const NET = { role: null, myId: 1, peer: null, conn: null, chan: null, code: '', status: 'offline', connected: false, local: false,
  lastSend: 0, lastRecv: 0, lastPing: 0, rtt: 0, snap: null, snapT: 0, rxN: 0, rxT: 0, rxRate: 0,
  seq: 0, lastSeq: -1, buf: [], clock: null, setJ: '', setT: 0, bodyT: 0 };
const NET_PREFIX = 'bm-armfollow-';
const NET_EVERY = 30;   // ms between updates, both ways (about 33 a second)
function netCode() { let a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', c = ''; for (let i = 0; i < 4; i++) { c += a[Math.floor(Math.random() * a.length)]; } return c; }
function netStatus(s) { NET.status = s; if (typeof updatePanel === 'function') updatePanel(); }
function netNiceStatus() {
  if (!NET.role || /^(Error|PeerJS|P2 left|Disconnected|Type)/.test(NET.status)) return NET.status;
  if (NET.role === 'host') return NET.connected ? 'Hosting ' + NET.code + ' · P2 connected' : 'Hosting · code ' + NET.code + ' · waiting for P2';
  return NET.connected ? 'Joined ' + NET.code + ' as P2' : 'Joining ' + NET.code + '…';
}
function netConnected() {
  if (NET.connected) return;
  NET.connected = true; logEvent('net', { what: 'connected', role: NET.role }); netStatus(netNiceStatus());
}
function netLeave() {
  try { if (NET.conn) NET.conn.close(); } catch (e) {} try { if (NET.peer) NET.peer.destroy(); } catch (e) {} try { if (NET.chan) NET.chan.close(); } catch (e) {}
  Object.assign(NET, { role: null, peer: null, conn: null, chan: null, code: '', connected: false, myId: 1, snap: null, buf: [], clock: null, lastSeq: -1 });
  netStatus('offline');
}
function netHost() {
  netLeave(); NET.role = 'host'; NET.myId = 1; NET.code = netCode(); people[2] = null;
  if (NET.local) { NET.chan = new BroadcastChannel(NET_PREFIX + NET.code); NET.chan.onmessage = e => netOn(e.data); netStatus(netNiceStatus()); return; }
  if (typeof Peer === 'undefined') { netStatus('PeerJS did not load'); return; }
  NET.peer = new Peer(NET_PREFIX + NET.code);
  NET.peer.on('open', () => netStatus(netNiceStatus()));
  NET.peer.on('connection', c => { if (NET.conn) { try { NET.conn.close(); } catch (e) {} } netAttach(c); });
  NET.peer.on('error', e => netStatus('Error: ' + (e && e.type ? e.type : e)));
}
function netJoin(code) {
  code = (code || '').trim().toUpperCase(); if (!code) { netStatus('Type the host’s code first'); return; }
  netLeave(); NET.role = 'guest'; NET.myId = 2; NET.code = code; people[1] = null; people[2] = null;
  if (NET.local) { NET.chan = new BroadcastChannel(NET_PREFIX + code); NET.chan.onmessage = e => netOn(e.data); netStatus(netNiceStatus()); netSend({ type: 'hello' }); return; }
  if (typeof Peer === 'undefined') { netStatus('PeerJS did not load'); return; }
  NET.peer = new Peer();
  NET.peer.on('open', () => { netStatus(netNiceStatus()); netAttach(NET.peer.connect(NET_PREFIX + code, { reliable: false, serialization: 'json' })); });
  NET.peer.on('error', e => netStatus('Error: ' + (e && e.type === 'peer-unavailable' ? 'no host with that code' : (e && e.type ? e.type : e))));
}
function netAttach(c) {
  NET.conn = c;
  c.on('open', netConnected);
  c.on('data', d => netOn(d));
  c.on('close', () => { NET.connected = false; if (NET.role === 'host') people[2] = null; netStatus(NET.role === 'host' ? 'P2 left · code ' + NET.code : 'Disconnected'); });
}
function netSend(m) { try { if (NET.conn && NET.conn.open) NET.conn.send(m); else if (NET.chan) { m.from = NET.role; NET.chan.postMessage(m); } } catch (e) {} }

// a person as plain numbers
const packV = v => v ? [r3(v.x), r3(v.y), r3(v.z)] : null;
const unpackV = a => a ? V(a[0], a[1], a[2]) : null;
function packPerson(p) {
  let j = {}; for (let n of JN) { if (p.j[n]) j[n] = packV(p.j[n]); }
  let hands = {}; for (let s of ['L', 'R']) { let h = p.hands[s]; if (h && h.src === 'hand') hands[s] = { n: packV(h.n), f: packV(h.f), open: h.open === null ? null : r3(h.open) }; }
  return { j, hands, chir: p.chir, human: SET.source === 'mediapipe' };
}
function unpackPerson(m) {
  let j = {}; for (let n in m.j) { j[n] = unpackV(m.j[n]); }
  let hands = {}; for (let s in (m.hands || {})) { let h = m.hands[s]; hands[s] = { n: unpackV(h.n), f: unpackV(h.f), open: h.open, src: 'hand' }; }
  return { j, hands, chir: m.chir };
}
// P1's laptop decides the experience; these stay per laptop because they only make sense locally
// (P2 also keeps what depends on its own camera: which camera, its field of view, and mirroring)
const NET_LOCAL = ['comp', 'compDelay', 'compSpeed', 'solo', 'spaces', 'mpSplit', 'fov', 'mirror'];
const NET_TRACKING = ['source', 'hands', 'mpModel'];   // changing these restarts P2's webcam

function netOn(m) {
  if (!m || typeof m !== 'object' || (NET.chan && m.from === NET.role)) return;
  if (m.type === 'hello' && NET.role === 'host') { netSend({ type: 'welcome' }); netConnected(); return; }
  if (m.type === 'welcome') { netConnected(); return; }
  if (m.type === 'ping') { netSend({ type: 'pong', t: m.t }); return; }
  if (m.type === 'pong') { let r = performance.now() - m.t; NET.rtt = NET.rtt ? NET.rtt * 0.7 + r * 0.3 : r; return; }
  // anything from the other laptop means we're linked, whatever the connection said
  if (m.type === 'body' || m.type === 'snap') netConnected();
  // the link may deliver out of order: an older update than one already seen is dropped
  if ((m.type === 'body' || m.type === 'snap') && m.n !== undefined) { if (m.n <= NET.lastSeq && NET.lastSeq - m.n < 1000) return; NET.lastSeq = m.n; }
  let now = performance.now();
  NET.lastRecv = now; NET.rxN++;
  if (now - NET.rxT > 1000) { NET.rxRate = NET.rxN * 1000 / (now - NET.rxT || 1); NET.rxN = 0; NET.rxT = now; }
  // host: P2's body arrives (already smoothed on P2's laptop), with P2's floor and where P2 is in the start flow
  if (m.type === 'body' && NET.role === 'host') {
    NET.bodyT = now;
    if (m.p) { setPerson(2, 'net', unpackPerson(m.p), now, false); people[2].human = !!m.p.human; }
    setOther(m.rect); NET.otherCal = !!m.cal; NET.otherDone = !!m.done;
  }
  // guest: the world arrives
  if (m.type === 'snap' && NET.role === 'guest') {
    NET.snap = m.s; NET.snapT = now; setOther(m.rect);
    // keep the last few, stamped with P1's clock, to play back smoothly a moment behind
    if (m.t !== undefined) {
      let off = now - m.t;   // P1's clock → this laptop's (plus the trip); the smallest seen is the truest
      NET.clock = NET.clock === null || off < NET.clock ? off : NET.clock + 0.02;
      NET.buf.push({ t: m.t, s: m.s }); while (NET.buf.length > 12) NET.buf.shift();
    }
    if (m.phase && m.phase !== RUN.phase) {
      if (m.phase === 'setup') unlockPeople(); else if (RUN.phase === 'setup') lockPeople();
      RUN.phase = m.phase; updatePanel();
    }
    RUN.centre = m.centre || null;
    let changed = false, retrack = false;
    for (let k in (m.set || {})) {   // settings come only now and then (when they change, and once a second)
      if (NET_LOCAL.includes(k) || SET[k] === m.set[k]) continue;
      SET[k] = m.set[k]; changed = true;
      if (NET_TRACKING.includes(k)) retrack = true;
      if (k === 'view') setView(SET.view);
    }
    if (retrack) setSource(SET.source);
    if (changed) updatePanel();
  }
}
function netTick(now) {
  if (SET.spaces !== 2 || !NET.role) return;
  if (NET.local && NET.role === 'guest' && !NET.connected && now - NET.lastSend > 1000) { NET.lastSend = now; netSend({ type: 'hello' }); }
  if (!NET.connected) return;
  if (now - NET.lastPing > 1000) { NET.lastPing = now; netSend({ type: 'ping', t: now }); }
  if (NET.role === 'host' && people[2] && now - NET.bodyT > 4000) people[2] = null;
  if (now - NET.lastSend < NET_EVERY) return;
  NET.lastSend = now;
  NET.seq++;
  if (NET.role === 'guest') { let me = live(2); netSend({ type: 'body', n: NET.seq, p: me ? packPerson(me) : null, rect: CAL.rect, cal: CAL.active, done: calStepDone() }); return; }
  let set = {}; for (let k in SET) { if (!NET_LOCAL.includes(k)) set[k] = SET[k]; }
  let sj = JSON.stringify(set), withSet = sj !== NET.setJ || now - NET.setT > 1000;
  if (withSet) { NET.setJ = sj; NET.setT = now; }
  netSend({ type: 'snap', n: NET.seq, t: Math.round(now), s: SNAP, set: withSet ? set : undefined, rect: CAL.rect, phase: RUN.phase, centre: RUN.centre });
}
// the guest draws the host's world a moment behind, blending between the two updates either side,
// so it moves smoothly even when updates arrive bunched up
function guestSnap(dt) {
  let s = NET.snap; if (!s) return null;
  let buf = NET.buf;
  if (!s.ok || buf.length < 2 || NET.clock === null) { SC.shown = JSON.parse(JSON.stringify(s)); predictOwnArms(SC.shown); return SC.shown; }
  let rt = performance.now() - NET.clock - SET.netSmooth, a = buf[0], b = buf[buf.length - 1];
  if (rt >= b.t) a = b;
  else for (let i = buf.length - 1; i > 0; i--) { if (buf[i - 1].t <= rt) { a = buf[i - 1]; b = buf[i]; break; } }
  let k = a === b || !a.s.ok ? 1 : clamp((rt - a.t) / Math.max(1, b.t - a.t), 0, 1);
  let A = a.s, B = b.s, out = JSON.parse(JSON.stringify(B));
  let mix = (x, y) => x.map((v, i) => v + (y[i] - v) * k);
  if (A.ok && k < 1) {
    for (let n in out.body) { if (A.body[n]) out.body[n] = mix(A.body[n], B.body[n]); }
    for (let side of ['L', 'R']) {
      let P = A.arms[side], Q = out.arms[side];
      for (let i = 0; i < 4; i++) { Q.pts[i] = mix(P.pts[i], B.arms[side].pts[i]); }
      Q.n = mix(P.n, B.arms[side].n); Q.f = mix(P.f, B.arms[side].f); Q.curl = P.curl + (B.arms[side].curl - P.curl) * k;
    }
    out.cube.c = mix(A.cube.c, B.cube.c); out.yaw = A.yaw + (B.yaw - A.yaw) * k;
    if (A.ghost && B.ghost && A.ghost.p && B.ghost.p) { out.ghost.p = mix(A.ghost.p, B.ghost.p); }
    if (A.cam && B.cam) { out.cam.p = mix(A.cam.p, B.cam.p); out.cam.l = mix(A.cam.l, B.cam.l); }
  }
  SC.shown = out;
  predictOwnArms(out);
  return out;
}
// P2's own possessed arm, drawn straight from P2's own tracking (no round trip), on P1's body
function predictOwnArms(out) {
  let me = live(2); if (!me || !out.ok) return;
  let b = out.body, A3 = a => V(a[0], a[1], a[2]);
  let to = torsoFrame({ shL: A3(b.shL), shR: A3(b.shR), neck: A3(b.neck), pelvis: A3(b.pelvis) }), from = torsoFrame(me.j), j = me.j;
  for (let s of ['L', 'R']) {
    let A = out.arms[s]; if (A.owner !== 2 || A.state !== 'attached') continue;
    let u = vnorm(xfer(vsub(j['el' + s], j['sh' + s]), from, to)), fv = vnorm(xfer(vsub(j['wr' + s], j['el' + s]), from, to));
    let h = me.hands[s] || { n: V(0, 0, -1), f: fv };
    let hf = vnorm(xfer(h.f, from, to)), hn = xfer(h.n, from, to);
    let S = A3(b['sh' + s]), E = vadd(S, vmul(u, ARM_LEN[0])), W = vadd(E, vmul(fv, ARM_LEN[1])), H = vadd(W, vmul(hf, ARM_LEN[2]));
    A.pts = [S, E, W, H].map(p => [p.x, p.y, p.z]); A.f = [hf.x, hf.y, hf.z]; A.n = [hn.x, hn.y, hn.z];
  }
}

// the other laptop's measured floor (the panel shows it when it changes)
function setOther(r) { r = r || null; if (JSON.stringify(r) !== JSON.stringify(CAL.other)) { CAL.other = r; updatePanel(); } }
