// ============================================================
// ARM FOLLOW · net.js
// 2 spaces: one person per laptop and camera, linked by a 4-letter code (PeerJS),
// or by a same-computer test link (two browser tabs).
// The HOST is P1 (the body owner): it runs the world and every setting.
// The GUEST is P2: it sends its own body, and draws the world the host sends back.
// ============================================================

const NET = { role: null, myId: 1, peer: null, conn: null, chan: null, code: '', status: 'offline', connected: false, local: false,
  lastSend: 0, lastRecv: 0, lastPing: 0, rtt: 0, snap: null, snapPrev: null, snapT: 0 };
const NET_PREFIX = 'bm-armfollow-';
function netCode() { let a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', c = ''; for (let i = 0; i < 4; i++) { c += a[Math.floor(Math.random() * a.length)]; } return c; }
function netStatus(s) { NET.status = s; if (typeof updatePanel === 'function') updatePanel(); }
function netLeave() {
  try { if (NET.conn) NET.conn.close(); } catch (e) {} try { if (NET.peer) NET.peer.destroy(); } catch (e) {} try { if (NET.chan) NET.chan.close(); } catch (e) {}
  Object.assign(NET, { role: null, peer: null, conn: null, chan: null, code: '', connected: false, myId: 1, snap: null });
  netStatus('offline');
}
function netHost() {
  netLeave(); NET.role = 'host'; NET.myId = 1; NET.code = netCode(); people[2] = null;
  if (NET.local) { NET.chan = new BroadcastChannel(NET_PREFIX + NET.code); NET.chan.onmessage = e => netOn(e.data); netStatus('waiting · code ' + NET.code + ' (same computer)'); return; }
  if (typeof Peer === 'undefined') { netStatus('PeerJS did not load'); return; }
  NET.peer = new Peer(NET_PREFIX + NET.code);
  NET.peer.on('open', () => netStatus('waiting · code ' + NET.code));
  NET.peer.on('connection', c => { if (NET.conn) { try { NET.conn.close(); } catch (e) {} } netAttach(c); });
  NET.peer.on('error', e => netStatus('error: ' + (e && e.type ? e.type : e)));
}
function netJoin(code) {
  code = (code || '').trim().toUpperCase(); if (!code) { netStatus('type the host\'s code'); return; }
  netLeave(); NET.role = 'guest'; NET.myId = 2; NET.code = code; people[1] = null; people[2] = null;
  if (NET.local) { NET.chan = new BroadcastChannel(NET_PREFIX + code); NET.chan.onmessage = e => netOn(e.data); netStatus('joining ' + code + ' (same computer)'); netSend({ type: 'hello' }); return; }
  if (typeof Peer === 'undefined') { netStatus('PeerJS did not load'); return; }
  NET.peer = new Peer();
  NET.peer.on('open', () => { netStatus('joining ' + code); netAttach(NET.peer.connect(NET_PREFIX + code, { reliable: true })); });
  NET.peer.on('error', e => netStatus('error: ' + (e && e.type === 'peer-unavailable' ? 'no host with that code' : (e && e.type ? e.type : e))));
}
function netAttach(c) {
  NET.conn = c;
  c.on('open', () => { NET.connected = true; netStatus('connected as ' + NET.role); logEvent('net', { what: 'connected', role: NET.role }); });
  c.on('data', d => netOn(d));
  c.on('close', () => { NET.connected = false; if (NET.role === 'host') people[2] = null; netStatus(NET.role === 'host' ? 'partner left · code ' + NET.code : 'disconnected'); });
}
function netSend(m) { try { if (NET.conn && NET.conn.open) NET.conn.send(m); else if (NET.chan) { m.from = NET.role; NET.chan.postMessage(m); } } catch (e) {} }

// a person as plain numbers
const packV = v => v ? [r3(v.x), r3(v.y), r3(v.z)] : null;
const unpackV = a => a ? V(a[0], a[1], a[2]) : null;
function packPerson(p) {
  let j = {}; for (let n of JN) { if (p.j[n]) j[n] = packV(p.j[n]); }
  let hands = {}; for (let s of ['L', 'R']) { let h = p.hands[s]; if (h && h.src === 'hand') hands[s] = { n: packV(h.n), f: packV(h.f), open: h.open === null ? null : r3(h.open) }; }
  return { j, hands, chir: p.chir };
}
function unpackPerson(m) {
  let j = {}; for (let n in m.j) { j[n] = unpackV(m.j[n]); }
  let hands = {}; for (let s in (m.hands || {})) { let h = m.hands[s]; hands[s] = { n: unpackV(h.n), f: unpackV(h.f), open: h.open, src: 'hand' }; }
  return { j, hands, chir: m.chir };
}
// settings P2's screen needs to draw the same world
// P1's laptop decides everything; these stay per laptop because they only make sense locally
// (P2 also keeps what depends on its own camera: which camera, its field of view, and mirroring)
const NET_LOCAL = ['comp', 'compDelay', 'compSpeed', 'solo', 'spaces', 'mpSplit', 'fov', 'mirror'];
const NET_TRACKING = ['source', 'hands', 'mpModel'];   // changing these restarts P2's webcam

function netOn(m) {
  if (!m || typeof m !== 'object' || (NET.chan && m.from === NET.role)) return;
  if (m.type === 'hello' && NET.role === 'host') { NET.connected = true; netSend({ type: 'welcome' }); netStatus('connected as host · same computer'); return; }
  if (m.type === 'welcome') { NET.connected = true; netStatus('connected as guest · same computer'); return; }
  if (m.type === 'ping') { netSend({ type: 'pong', t: m.t }); return; }
  if (m.type === 'pong') { let r = performance.now() - m.t; NET.rtt = NET.rtt ? NET.rtt * 0.7 + r * 0.3 : r; return; }
  NET.lastRecv = performance.now();
  // host: P2's body arrives (already smoothed on P2's laptop)
  if (m.type === 'body' && NET.role === 'host') { if (m.p) setPerson(2, 'net', unpackPerson(m.p), performance.now(), false); setOther(m.rect); }
  // guest: the world arrives
  if (m.type === 'snap' && NET.role === 'guest') {
    NET.snapPrev = NET.snap; NET.snap = m.s; NET.snapT = performance.now(); setOther(m.rect);
    let changed = false, retrack = false;
    for (let k in (m.set || {})) {
      if (NET_LOCAL.includes(k) || SET[k] === m.set[k]) continue;
      SET[k] = m.set[k]; changed = true;
      if (NET_TRACKING.includes(k)) retrack = true;
      if (k === 'view') setView(SET.view);
    }
    if (retrack) setSource(SET.source);
    if (changed) updatePanel();
  }
  if (m.type === 'restart' && NET.role === 'guest') { rehome(); }
  // the host measures both floors: its Calibrate starts and stops P2's too
  if (m.type === 'cal' && NET.role === 'guest' && m.on !== CAL.active) calibrate();
  if (m.type === 'calforget' && NET.role === 'guest') forgetFloor();
}
function netTick(now) {
  if (SET.spaces !== 2 || !NET.role) return;
  if (NET.local && NET.role === 'guest' && !NET.connected && now - NET.lastSend > 1000) { NET.lastSend = now; netSend({ type: 'hello' }); }
  if (!NET.connected) return;
  if (now - NET.lastPing > 1000) { NET.lastPing = now; netSend({ type: 'ping', t: now }); }
  if (NET.role === 'host' && people[2] && now - NET.lastRecv > 1500) people[2] = null;
  if (now - NET.lastSend < (NET.role === 'host' ? 50 : 33)) return;
  NET.lastSend = now;
  if (NET.role === 'guest') { let me = live(2); netSend({ type: 'body', p: me ? packPerson(me) : null, rect: CAL.rect }); return; }
  let set = {}; for (let k in SET) { if (!NET_LOCAL.includes(k)) set[k] = SET[k]; }
  netSend({ type: 'snap', s: SNAP, set, rect: CAL.rect });
}
// the guest draws the host's world, eased between updates so it doesn't stutter
function guestSnap(dt) {
  let s = NET.snap; if (!s) return null;
  if (!s.ok || !SC.shown || !SC.shown.ok) { SC.shown = JSON.parse(JSON.stringify(s)); return SC.shown; }
  let k = Math.min(1, dt * 14), out = SC.shown;
  let ease = (a, b) => { for (let i = 0; i < a.length; i++) { a[i] += (b[i] - a[i]) * k; } };
  for (let n in s.body) { if (out.body[n]) ease(out.body[n], s.body[n]); else out.body[n] = s.body[n].slice(); }
  for (let side of ['L', 'R']) {
    let A = out.arms[side], B = s.arms[side];
    for (let i = 0; i < 4; i++) { ease(A.pts[i], B.pts[i]); }
    ease(A.n, B.n); ease(A.f, B.f);
    A.curl += (B.curl - A.curl) * k; A.life = B.life; A.owner = B.owner; A.state = B.state;
  }
  ease(out.cube.c, s.cube.c); out.cube.yaw = s.cube.yaw; out.cube.s = s.cube.s; out.cube.held = s.cube.held; out.cube.appear = s.cube.appear;
  out.plinth = s.plinth; out.ghost = s.ghost; out.chap = s.chap; out.cam = s.cam; out.hud = s.hud; out.strings = s.strings; out.yaw += (s.yaw - out.yaw) * k;
  return out;
}

// the other laptop's measured floor (the panel shows it when it changes)
function setOther(r) { r = r || null; if (JSON.stringify(r) !== JSON.stringify(CAL.other)) { CAL.other = r; updatePanel(); } }
