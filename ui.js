// ============================================================
// ARM FOLLOW · ui.js
// The visitor HUD (drift meter, cube count, hold bar), Atul's control panel,
// keys, the camera + skeletons view, the log, and the main loop.
// ============================================================

const $ = id => document.getElementById(id);
const METER_MAX = 1.4;   // the drift meter shows up to 1.4 × the tolerance

// ---------------- HUD (for visitors) ----------------
let lastScore = 0;
function hudStep(S) {
  let h = S && S.hud;
  $('hud').style.display = h && h.anyP2 && h.p1 && RUN.phase === 'play' && !SET.armsOnly ? 'block' : 'none';
  if (!h) { $('waiting').textContent = 'Starting…'; return; }
  let wait = !h.p1 ? 'Waiting for P1' : (h.anyP2 && !h.p2 ? 'Waiting for P2 · the arm has nobody in it' : '');
  $('waiting').textContent = wait;
  let k = clamp(h.drift / h.tol / METER_MAX, 0, 1), kt = clamp(h.turn / h.turnTol / METER_MAX, 0, 1);
  let apart = h.state === 'apart', back = h.state === 'returning';
  let col = apart ? '#E5372A' : k > 0.6 / METER_MAX ? '#F5B800' : '#1A1A1A';
  let f = $('m-drift').querySelector('.fill'); f.style.width = (k * 100) + '%'; f.style.background = col;
  $('m-drift').querySelector('.zone').style.background = apart ? 'rgba(18,161,80,0.25)' : 'rgba(95,224,176,0)';
  let ft = $('m-turn').querySelector('.fill'); ft.style.width = (kt * 100) + '%'; ft.style.background = h.turn > h.turnTol ? '#E5372A' : '#1A1A1A';
  $('hud-label').textContent = apart ? 'arm left behind · catch up' : back ? 'coming back' : h.state === 'vacant' ? 'nobody in the arm' : 'together';
  $('hud-label').style.color = apart ? '#E5372A' : '#1A1A1A';
  $('score').textContent = 'CUBES ' + h.score; $('score').style.display = SET.armsOnly ? 'none' : '';
  if (h.score !== lastScore) { lastScore = h.score; $('score').style.transform = 'scale(1.35)'; setTimeout(() => { $('score').style.transform = ''; }, 260); }
  $('hold').style.opacity = h.hold > 0.01 && h.task !== 'carry' ? 1 : 0;
  let et = edgeText(); $('edge').style.display = et ? 'block' : 'none'; $('edge').textContent = et;
  // the big cue, readable from across the room
  let cue = null, gest = SET.gestures && SET.source === 'mediapipe';
  if (CAL.active) cue = ['WALK TO EVERY EDGE', (CAL.live ? rectW(CAL.live).toFixed(1) + ' × ' + rectD(CAL.live).toFixed(1) + ' m so far' : 'step into the camera') + '<br>' + (gest ? 'then raise both hands above your head' : 'then press C (or Done)')];
  else if (RUN.phase === 'setup' && gest && !calStepDone()) cue = ['RAISE BOTH HANDS', 'above your head, to start measuring your floor'];
  else if (RUN.phase === 'setup' && gest && !isGuest() && !$('f-start').disabled) cue = ['RAISE BOTH HANDS', 'above your head to START'];
  $('calib').style.display = cue ? 'flex' : 'none';
  if (cue) { $('calib-big').textContent = cue[0]; $('calib-text').innerHTML = cue[1]; $('calib-g').style.width = (GEST.k * 100) + '%'; }
  $('hold').querySelector('.fill').style.width = (clamp(h.hold, 0, 1) * 100) + '%';
  // what to do next, in a few words
  let pr = '';
  if (RUN.phase === 'play' && h.p1 && !SET.armsOnly) {
    if (h.state === 'apart') pr = 'P2: walk your shadow under the body';
    else if (h.held && h.task === 'carry') pr = h.nearT < 1.0 ? 'HELD · set it down on the blue-marked plinth' : 'HELD · carry it to the blue-marked plinth →';
    else if (h.task === 'carry' && h.hold > 0) pr = 'placed ✓';
    else if (h.held && h.up) pr = 'HELD · keep it up';
    else if (h.held) pr = 'HELD · lift it above your waist ↑';
    else if (h.lifeless && h.near < 1.6) pr = 'the arm is lifeless · it can’t hold';
    else if (h.touching === 1) pr = 'one hand on · the other on the opposite side';
    else if (h.near < 1.3) pr = 'both hands on the sides of the cube';
  }
  $('prompt').textContent = pr; $('prompt').style.opacity = pr ? 1 : 0;
  $('prompt').classList.toggle('held', !!h.held); $('prompt').classList.toggle('apart', h.state === 'apart');
}
function statsStep(S) {
  let el = $('stats'); el.style.display = SET.hud ? 'block' : 'none'; if (!SET.hud) return;
  el.style.maxWidth = SET.pip ? 'calc(100% - 450px)' : 'calc(100% - 40px)';   // never under the camera view
  let mins = Math.max(0.05, (performance.now() - TRK.since) / 60000), h = S && S.hud;
  let guest = isGuest(), arms = S && S.ok ? S.arms : null;
  let armTxt = arms ? ['L', 'R'].map(s => s + ' ' + (arms[s].owner === 2 ? 'P2' : 'P1') + ' ' + arms[s].state).join(' · ') : '-';
  let lines = [
    `ARM FOLLOW v1 · ${TRK.status} · ${TRK.hz.toFixed(1)} Hz · dropouts ${TRK.dropouts} (${(TRK.dropouts / mins).toFixed(1)}/min)${SET.solo ? ' · SOLO' : ''}${SET.comp !== 'off' ? ' · COMPUTER plays ' + SET.comp : ''}`,
    `${SET.spaces === 2 ? '2 SPACES · ' + (NET.role || 'offline') + ' · ' + NET.status + (NET.rtt ? ' · ping ' + Math.round(NET.rtt) + ' ms' : '') + (NET.connected ? ' · in ' + NET.rxRate.toFixed(0) + '/s' + (NET.role === 'host' ? ' · P2 body ' + Math.round(performance.now() - NET.bodyT) + ' ms ago' : '') : '') : '1 SPACE'} · P1 ${h && h.p1 ? 'tracked' : '-'} · P2 ${h && h.p2 ? 'tracked' : '-'}`,
    h ? `follow ${h.state} · drift ${h.drift.toFixed(2)} / ${h.tol} m · turn ${h.turn}° / ${h.turnTol}° · lost ${TASK.lost}` : '',
    `arms ${armTxt}`,
    h ? `grip ${SET.grip} · hands on the cube ${h.touching} · ${h.held ? 'HELD' + (h.slip > 0.01 ? ' slipping ' + h.slip.toFixed(2) : '') : 'not held'}${SET.grip === 'dwell' && h.dwell > 0 ? ' · dwell ' + h.dwell.toFixed(1) : ''} · hold ${(h.hold * SET.holdTime).toFixed(1)} s · cubes ${h.score}` : '',
    handsLine(),
    SET.source === 'mediapipe' ? 'where you stand from: ' + [1, 2].filter(k => MPF[k]).map(k => { let M = MPF[k], p = people[k]; return 'P' + k + ' ' + M.src + (M.meas ? ' (' + M.meas.filter(Boolean).length + ' of 33 joints measured)' : '') + ' ' + (M.d ? M.d.toFixed(2) : '-') + ' m · lean ' + Math.round(M.lean || 0) + '° · camera tilt ' + Math.round((M.pitch || 0) * 57.3) + '° (shape ' + (M.T ? M.T.x.toFixed(2) + ',' + M.T.z.toFixed(2) : 'none') + ' · size ' + (M.dU ? M.dU.toFixed(2) : '-') + ') · body at ' + (p && p.j ? p.j.pelvis.x.toFixed(2) + ',' + p.j.pelvis.z.toFixed(2) : '-') + (AV.ok ? ' · room ' + AV.root.x.toFixed(2) + ',' + AV.root.z.toFixed(2) : ''); }).join(' · ') + (CAL.active ? ' · MEASURING ' + (CAL.live ? rectW(CAL.live).toFixed(2) + '×' + rectD(CAL.live).toFixed(2) : 'nobody yet') : '') + (CAL.rect && CAL.rect.v === 2 && CAL.rect.fa !== undefined ? '' : ' (feet: measure the floor, walking toward and away)') : '',
    `view ${SET.view} · gain ${effGain().toFixed(1)} · floor ${CAL.rect ? rectW(CAL.rect).toFixed(1) + '×' + rectD(CAL.rect).toFixed(1) + ' m' : 'not measured'} · keys H panel · J camera · V view · R restart · S solo · O log · D stats · F fullscreen`
  ];
  el.textContent = lines.filter(l => l).join('\n');
  if (guest) el.textContent += '\nlinked as P2: the world comes from the host';
}
function handsLine() {
  let out = [];
  for (let k of [1, 2]) {
    let p = people[k]; if (!p || !p.hands) continue;
    let t = ['L', 'R'].map(s => { let h = p.hands[s]; return h ? s + ' ' + h.src + (h.open !== null && h.open !== undefined ? ' open ' + h.open.toFixed(2) : '') : s + ' -'; }).join(' ');
    out.push('P' + k + ' hands: ' + t);
  }
  return out.join(' · ');
}
function toast(msg) { let t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => { t.style.opacity = 0; }, 1300); }

// ---------------- camera + skeletons [J] ----------------
const PIP_BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [15, 17], [15, 19], [17, 19], [16, 18], [16, 20], [18, 20], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const HAND_BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
function pipStep() {
  phoneButton();
  let c = $('pip'); c.style.display = SET.pip ? 'block' : 'none'; if (!SET.pip) return;
  // the picture: the webcam's, or the small one the iPhone sends
  let pic = SET.source !== 'mediapipe' ? null : phoneOn() ? (PHONE.img ? { el: PHONE.img, w: PHONE.img.naturalWidth, h: PHONE.img.naturalHeight } : null)
    : MP.fromPhone ? (PHONE.bmp ? { el: MP.video, w: MP.video.width, h: MP.video.height } : null)
    : MP.video && MP.video.readyState >= 2 ? { el: MP.video, w: MP.video.videoWidth, h: MP.video.videoHeight } : null;
  let cam = !!pic;
  let w = 400, h = cam ? Math.round(w * pic.h / pic.w) : 260;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  let x = c.getContext('2d');
  x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(0, 0, w, h);
  if (cam) {
    x.save(); if (SET.mirror) { x.translate(w, 0); x.scale(-1, 1); }
    x.drawImage(pic.el, 0, 0, w, h);
    if (MP.halves) { x.strokeStyle = 'rgba(255,255,255,0.45)'; x.setLineDash([6, 6]); for (let u of [0.4, 0.6]) { x.beginPath(); x.moveTo(u * w, 0); x.lineTo(u * w, h); x.stroke(); } x.setLineDash([]); }
    // which person is which: nearest pelvis in the picture to each slot's last picture
    for (let lm of MP.found || []) {
      // followed: in colour, labelled. Anyone else the camera sees: grey and dashed, marked "ignored"
      let slot = [1, 2].find(k => people[k] && people[k].lm === lm) || 0;
      let col = slot === 2 ? 'rgba(255,120,60,0.98)' : slot === 1 ? 'rgba(255,255,255,0.98)' : 'rgba(170,170,170,0.7)';
      // a followed person is drawn as the game uses them (smoothed); the raw detection faintly underneath
      let shown = slot && people[slot].lmS ? people[slot].lmS : lm;
      let bones = (pts, c, wd, dash) => { x.strokeStyle = c; x.lineWidth = wd; x.lineCap = 'round'; x.setLineDash(dash); for (let [a, b] of PIP_BONES) { if (pts[a] && pts[b]) { x.beginPath(); x.moveTo(pts[a].x * w, pts[a].y * h); x.lineTo(pts[b].x * w, pts[b].y * h); x.stroke(); } } };
      if (slot && SET.pipRaw) bones(lm, 'rgba(255,255,255,0.25)', 1, []);
      bones(shown, col, slot ? 3 : 1.5, slot ? [] : [4, 4]);
      x.fillStyle = col; lm = shown;
      x.setLineDash([]);
      x.save(); x.translate(lm[0].x * w, lm[0].y * h - 18); if (SET.mirror) x.scale(-1, 1); x.font = 'bold 12px monospace'; x.textAlign = 'center';
      x.fillText(slot ? 'P' + slot + (LOCK.on ? ' · locked' : '') : 'ignored', 0, 0); x.restore();
    }
    // the floor this laptop uses (or the one being measured), outlined on the picture; the centre during the walk to it
    let my = isGuest() ? 2 : 1, fr = CAL.active ? Object.assign({}, CAL.live || {}, { fa: (CAL.rect || {}).fa, fb: (CAL.rect || {}).fb }) : usable(my);
    if (fr && fr.x0 !== undefined && !phoneOn()) {
      let base = CAL.rect || {}, src = { fa: fr.fa !== undefined ? fr.fa : base.fa, fb: fr.fb !== undefined ? fr.fb : base.fb };
      let pts = [[fr.x0, fr.z0], [fr.x1, fr.z0], [fr.x1, fr.z1], [fr.x0, fr.z1]].map(([px, pz]) => floorToPicture(src, px, pz));
      if (pts.every(q => q)) {
        x.strokeStyle = 'rgba(64,200,224,0.9)'; x.lineWidth = 2; x.setLineDash([7, 5]); x.beginPath();
        pts.forEach((q, i) => i ? x.lineTo(q.x * w, q.y * h) : x.moveTo(q.x * w, q.y * h)); x.closePath(); x.stroke(); x.setLineDash([]);
        let c = centreOf(my), cp = c && RUN.phase === 'centre' ? floorToPicture(src, c.x, c.z) : null;
        if (cp) { x.strokeStyle = 'rgba(48,209,88,0.95)'; x.lineWidth = 3; x.beginPath(); x.ellipse(cp.x * w, cp.y * h, 26, 9, 0, 0, Math.PI * 2); x.stroke(); }
      }
    }
    // locked on, but the locked person wasn't matched just now
    if (LOCK.on && LOCK.miss) {
      let mine = SET.spaces === 2 ? [NET.myId] : [1, 2], miss = mine.filter(k => LOCK.miss[k] && performance.now() - LOCK.miss[k] < 400);
      if (miss.length) { x.save(); if (SET.mirror) { x.translate(w, 0); x.scale(-1, 1); } x.fillStyle = 'rgba(229,55,42,0.95)'; x.font = 'bold 12px monospace'; x.fillText('P' + miss.join('+P') + ' not matched · Setup re-picks who is followed', 8, h - 10); x.restore(); }
    }
    // iPhone ultra-wide + LiDAR: the zone the depth map covers, and rings on the joints it measured
    if (SET.tracker === 'phonedepth' && SET.pipDepth) {
      let Z = depthZone();
      if (Z) { x.strokeStyle = 'rgba(64,200,224,0.9)'; x.lineWidth = 2; x.setLineDash([7, 5]); x.strokeRect(Z.x0 * w, Z.y0 * h, (Z.x1 - Z.x0) * w, (Z.y1 - Z.y0) * h); x.setLineDash([]); }
      for (let k of [1, 2]) {
        let M = MPF[k], p = people[k]; if (!M || !M.meas || !p || !p.lmS) continue;
        x.strokeStyle = 'rgba(64,200,224,1)'; x.lineWidth = 2;
        M.meas.forEach((ok, i) => { let q = p.lmS[i]; if (ok && q) { x.beginPath(); x.arc(q.x * w, q.y * h, 6, 0, Math.PI * 2); x.stroke(); } });
      }
    }
    x.strokeStyle = 'rgba(120,230,255,0.95)'; x.lineWidth = 1.5;
    for (let hd of MP.handsFound || []) { for (let [a, b] of HAND_BONES) { x.beginPath(); x.moveTo(hd.lm[a].x * w, hd.lm[a].y * h); x.lineTo(hd.lm[b].x * w, hd.lm[b].y * h); x.stroke(); } }
    x.restore();
  } else {
    // no webcam: both people seen from the front (A space), and a floor plan of the drift
    let bones = [['head', 'neck'], ['neck', 'pelvis'], ['shL', 'shR'], ['shL', 'elL'], ['elL', 'wrL'], ['shR', 'elR'], ['elR', 'wrR'], ['hipL', 'hipR'], ['hipL', 'knL'], ['knL', 'anL'], ['hipR', 'knR'], ['knR', 'anR']];
    let sx = v => w * 0.34 + v.x * 110, sy = v => h - 14 - v.y * 140;
    for (let k of [1, 2]) {
      let p = people[k]; if (!p || !p.j) continue;
      let ox = k === 2 && SET.spaces === 2 ? 0.9 : 0;
      x.strokeStyle = k === 1 ? '#fff' : '#ff9a4a'; x.lineWidth = 2;
      for (let [a, b] of bones) { let q = p.j[a], r = p.j[b]; if (!q || !r) continue; x.beginPath(); x.moveTo(sx(q) + ox * 110, sy(q)); x.lineTo(sx(r) + ox * 110, sy(r)); x.stroke(); }
      x.fillStyle = x.strokeStyle; x.font = '11px monospace'; x.fillText('P' + k + (p.lost ? ' lost' : ''), sx(p.j.head) + ox * 110 - 8, sy(p.j.head) - 10);
    }
    // floor plan: each person's movement since the arm was attached
    let cx = w - 70, cy = h / 2;
    x.strokeStyle = '#3a414a'; x.strokeRect(cx - 55, cy - 55, 110, 110);
    x.beginPath(); x.arc(cx, cy, SET.tol * 60, 0, Math.PI * 2); x.stroke();
    if (FOLLOW.ref1 && live(1) && live2()) {
      let a = live(1).j.pelvis, b = live2().j.pelvis;
      let d1 = { x: a.x - FOLLOW.ref1.x, z: a.z - FOLLOW.ref1.z }, d2 = { x: b.x - FOLLOW.ref2.x, z: b.z - FOLLOW.ref2.z };
      x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + d1.x * 60, cy + d1.z * 60, 4, 0, 7); x.fill();
      x.fillStyle = '#ff9a4a'; x.beginPath(); x.arc(cx + d2.x * 60, cy + d2.z * 60, 4, 0, 7); x.fill();
    }
    x.fillStyle = '#8a95a1'; x.font = '10px monospace'; x.fillText('moved since attached', cx - 55, cy + 68);
  }
  x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = '11px monospace'; x.fillText(cam ? 'CAMERA · ' + (MP.found || []).length + ' bodies · ' + (MP.handsFound || []).length + ' hands · J hides' : 'SKELETONS (no webcam) · J hides', 8, 14);
}

// ---------------- log [O] ----------------
const LOG = { rows: [], events: [], cam: [], last: 0, started: new Date().toISOString() };
function logEvent(kind, data) { LOG.events.push(Object.assign({ t: Math.round(performance.now()), kind }, data || {})); if (LOG.events.length > 5000) LOG.events.shift(); }
function logTick(now, S) {
  if (now - LOG.last < 100 || !S || !S.hud) return; LOG.last = now;
  let h = S.hud;
  LOG.rows.push({ t: Math.round(now), src: SET.source, hz: Math.round(TRK.hz), p1: h.p1, p2: h.p2, follow: h.state, drift: h.drift, turn: h.turn,
    arms: S.ok ? { L: S.arms.L.state, R: S.arms.R.state } : null, held: h.held, slip: h.slip, score: h.score });
  if (LOG.rows.length > 12000) LOG.rows.shift();
}
function saveLog() {
  let data = { app: 'Arm Follow v1', started: LOG.started, saved: new Date().toISOString(), settings: SET, build: window.BUILD, floor: CAL.rect, calLive: CAL.live, events: LOG.events, rows: LOG.rows, cam: LOG.cam };
  let blob = new Blob([JSON.stringify(data)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'arm-follow-log-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json';
  document.body.appendChild(a); a.click(); a.remove(); toast('Log saved');
}

// ---------------- panel ----------------
const isGuest = () => SET.spaces === 2 && NET.role === 'guest' && NET.connected;
function restartAll() {
  if (isGuest()) { toast('Restart on the host laptop'); return; }
  restartWorld(); if (NET.connected) netSend({ type: 'restart' }); toast('Restarted');
}
function restartTracking() { if (SET.source === 'mediapipe') setSource('mediapipe', $('cam').value); else { people[1] = null; people[2] = null; DEMO.reset = true; } }
// CHEAT MODE: one switch for every helper. Each mode keeps its own values, so a tweak made in cheat
// mode (say a lower hand assist) is still there next time you switch back.
const CHEAT_KEYS = ['assist', 'reachLock', 'solid', 'seeThroughCube', 'fpNear', 'smooth', 'stillZone', 'quickHands'];
const CHEAT = {
  on: { assist: 0.85, reachLock: true, solid: true, seeThroughCube: true, fpNear: true, smooth: 1.0, stillZone: 0.025, quickHands: false },
  off: { assist: 0, reachLock: false, solid: false, seeThroughCube: false, fpNear: false, smooth: 0.5, stillZone: 0, quickHands: true },
};
try { let s = JSON.parse(localStorage.getItem('armfollow.cheat') || 'null'); if (s && s.on && s.off) { Object.assign(CHEAT.on, s.on); Object.assign(CHEAT.off, s.off); } } catch (e) {}
for (let k of CHEAT_KEYS) SET[k] = CHEAT[SET.cheat ? 'on' : 'off'][k];
function toggleCheat() {
  let from = SET.cheat ? 'on' : 'off', to = SET.cheat ? 'off' : 'on';
  for (let k of CHEAT_KEYS) CHEAT[from][k] = SET[k];   // remember this mode's tweaks
  for (let k of CHEAT_KEYS) SET[k] = CHEAT[to][k];
  SET.cheat = !SET.cheat;
  try { localStorage.setItem('armfollow.cheat', JSON.stringify(CHEAT)); } catch (e) {}
  for (let [id, key] of [['feel', 'smooth'], ['assist', 'assist'], ['stillz', 'stillZone']]) { let el = $(id); if (el) { el.value = SET[key]; el.dispatchEvent(new Event('input')); } }
  logEvent('cheat', { on: SET.cheat }); toast(SET.cheat ? 'Cheat mode: every helper on' : 'Regular: no helpers');
}
// the Input list shows what's in use now
function showInput() {
  let el = $('input'); if (!el || !el.options.length) return;
  let v = SET.source === 'demo' ? 'demo' : SET.tracker !== 'webcam' ? SET.tracker : 'cam:' + ($('cam').value || '');
  if ([...el.options].some(o => o.value === v)) el.value = v;
  else if (v.startsWith('cam:') && el.options.length) el.selectedIndex = 0;
}
// the Connect button says how the link to the iPhone is doing
function phoneButton() {
  let b = $('btn-phone'); if (!b) return;
  let t = 'Connect', c = '';
  if (PHONE.state === 'connecting') { t = 'Connecting…'; }
  else if (PHONE.state === 'open') {
    let fresh = performance.now() - (PHONE.lastMsg || 0) < 1500;
    t = fresh ? 'Connected ✓' : 'Connected · waiting'; c = fresh ? 'ok' : '';
  }
  else if (PHONE.state === 'failed') { t = 'Failed · retry'; c = 'bad'; }
  else if (PHONE.state === 'closed') { t = 'Reconnect'; }
  if (b.textContent !== t) b.textContent = t;
  b.style.background = c === 'ok' ? '#12A150' : c === 'bad' ? '#E5372A' : ''; b.style.color = c ? '#fff' : ''; b.style.borderColor = c ? 'transparent' : '';
}
function setupPanel() {
  $('btn-cheat').onclick = () => { toggleCheat(); updatePanel(); };
  $('src').onchange = e => { unlockPeople(); setSource(e.target.value, $('cam').value); RUN.phase = SET.source === 'demo' ? 'play' : 'setup'; updatePanel(); };
  // ONE INPUT LIST: every webcam by name, the three iPhone modes, demo people. It sets the source, the tracker
  // and the camera together (those three stay underneath, hidden, as the rest of the code knows them).
  let fillInput = l => {
    $('cam').innerHTML = l.map((c, i) => `<option value="${c.deviceId}">${c.label || 'Camera ' + (i + 1)}</option>`).join('');
    let cams = l.map((c, i) => `<option value="cam:${c.deviceId}">Webcam · ${(c.label || 'Camera ' + (i + 1)).replace(/</g, '')}</option>`).join('') || '<option value="cam:">Webcam</option>';
    $('input').innerHTML = cams + '<option value="iphone">iPhone · body tracking (Apple)</option><option value="phonecam">iPhone · ultra-wide camera</option><option value="phonedepth">iPhone · ultra-wide + LiDAR depth</option><option value="demo">Demo people (nobody needed)</option>';
    showInput();
  };
  cameraList().then(fillInput);
  $('input').onchange = e => {
    let v = e.target.value; unlockPeople();
    if (v === 'demo') { setSource('demo'); }
    else {
      SET.tracker = v.startsWith('cam:') ? 'webcam' : v;
      try { localStorage.setItem('armfollow.tracker', SET.tracker); } catch (x) {}
      if (v.startsWith('cam:')) $('cam').value = v.slice(4);
      setSource('mediapipe', $('cam').value);
    }
    RUN.phase = SET.source === 'demo' ? 'play' : 'setup'; updatePanel();
  };
  $('cam').onchange = () => { if (SET.source === 'mediapipe') setSource('mediapipe', $('cam').value); };
  $('tracker').value = SET.tracker; $('tracker').onchange = e => { SET.tracker = e.target.value; try { localStorage.setItem('armfollow.tracker', SET.tracker); } catch (x) {} unlockPeople(); restartTracking(); updatePanel(); };
  $('phoneip').value = SET.phoneIP;
  let phoneGo = () => { SET.phoneIP = $('phoneip').value.trim(); try { localStorage.setItem('armfollow.phoneIP', SET.phoneIP); } catch (x) {} if (SET.tracker !== 'webcam') restartTracking(); };
  $('btn-phone').onclick = phoneGo; $('phoneip').onkeydown = e => { if (e.key === 'Enter') phoneGo(); };
  let sel = (id, key, after, num) => { $(id).value = String(SET[key]); $(id).onchange = e => { SET[key] = num ? parseFloat(e.target.value) : e.target.value; if (after) after(); updatePanel(); }; };
  sel('hands', 'hands', restartTracking);
  $('mpsplit').onchange = e => { SET.mpSplit = e.target.value === '1'; restartTracking(); };
  sel('mpmodel', 'mpModel', restartTracking);
  sel('comp', 'comp', () => { COMP.hist = []; COMP.x = null; restartTracking(); });
  sel('spaces', 'spaces', () => { if (SET.spaces === 1) netLeave(); restartTracking(); FOLLOW.state = 'vacant'; FOLLOW.ref1 = null; }, true);
  $('btn-host').onclick = () => { NET.local = $('net-local').checked; netHost(); };
  $('btn-join').onclick = () => { NET.local = $('net-local').checked; netJoin($('net-code').value); };
  $('btn-leave').onclick = netLeave;
  sel('own', 'own', ownershipChanged); sel('ownL', 'ownL', ownershipChanged, true); sel('ownR', 'ownR', ownershipChanged, true);
  sel('lifeless', 'lifeless'); sel('rstyle', 'returnStyle'); sel('grip', 'grip', () => { if (CUBE.held) dropCube('grip changed'); }); sel('holders', 'holders');
  $('view').value = SET.view; $('view').onchange = e => { setView(e.target.value); updatePanel(); };
  let tog = (id, key, after) => { $(id).onclick = () => { SET[key] = !SET[key]; if (after) after(); updatePanel(); }; };
  tog('btn-mirror', 'mirror'); tog('btn-pipdepth', 'pipDepth'); tog('btn-pipraw', 'pipRaw'); tog('btn-gest', 'gestures'); tog('btn-tilt', 'tiltFix', () => { CAMT.n = 0; CAMT.pitch = 0; }); tog('btn-bend', 'bendHold'); tog('btn-qhands', 'quickHands'); tog('btn-solo', 'solo');
  tog('btn-puppet', 'puppetFall'); tog('btn-curl', 'curl'); tog('btn-lyingf', 'lyingFollow'); tog('btn-twitch', 'twitch');
  tog('btn-over', 'overshoot'); tog('btn-strings', 'strings'); tog('btn-hud', 'hud'); tog('btn-pip', 'pip');
  let sl = (id, key, fmt) => { $(id).value = SET[key]; $('val-' + id).textContent = fmt(SET[key]); $(id).oninput = e => { SET[key] = parseFloat(e.target.value); $('val-' + id).textContent = fmt(SET[key]); }; };
  sl('fov', 'fov', v => v + '°'); sl('stillz', 'stillZone', v => v === 0 ? 'off' : 'ignore under ' + Math.round(v * 100) + ' cm'); sl('feel', 'smooth', v => v.toFixed(2));
  sel('reach', 'reach'); sel('ghost', 'ghost'); tog('btn-warmup', 'warmup', () => { if (!isGuest()) restartWorld(); }); tog('btn-thread', 'thread'); tog('btn-fpnear', 'fpNear'); tog('btn-rlock', 'reachLock'); tog('btn-solid', 'solid'); tog('btn-seecube', 'seeThroughCube');
  sl('ddrift', 'depthDrift', v => v === 0 ? 'not at all' : v === 1 ? 'fully' : Math.round(v * 100) + '%');
  sl('assist', 'assist', v => v === 0 ? 'off' : v.toFixed(2)); sl('ebuf', 'edgeBuffer', v => Math.round(v * 100) + ' cm'); sl('netsm', 'netSmooth', v => v + ' ms');
  sl('cdelay', 'compDelay', v => v.toFixed(2) + ' s'); sl('cspeed', 'compSpeed', v => v.toFixed(2) + ' m/s');
  sl('tol', 'tol', v => v.toFixed(2) + ' m'); sl('turn', 'turnTol', v => v + '°');
  sl('lag', 'lag', v => v.toFixed(2) + ' s'); sl('lstr', 'lyingStrength', v => v.toFixed(2)); sl('rtime', 'returnTime', v => v.toFixed(1) + ' s');
  sl('touch', 'touch', v => Math.round(v * 100) + ' cm'); $('hold-t').value = SET.holdTime; $('val-hold').textContent = SET.holdTime + ' s';
  $('hold-t').oninput = e => { SET.holdTime = parseFloat(e.target.value); $('val-hold').textContent = SET.holdTime + ' s'; };
  let area = () => { $('val-area').textContent = SET.areaW.toFixed(1) + ' × ' + SET.areaD.toFixed(1) + ' m'; };
  $('areaW').value = SET.areaW; $('areaD').value = SET.areaD; area();
  $('areaW').oninput = e => { SET.areaW = parseFloat(e.target.value); area(); }; $('areaD').oninput = e => { SET.areaD = parseFloat(e.target.value); area(); };
  sl('gain', 'gain', v => '1 m → ' + v.toFixed(1) + ' m');
  sl('turnmax', 'turnMax', v => v >= 180 ? 'no limit' : '±' + v + '°');
  sel('camlock', 'camLock'); sel('examine', 'examine');
  sl('examd', 'examineDist', v => v.toFixed(1) + ' m'); tog('btn-xray', 'xray');
  $('btn-cal').onclick = calibrate; $('btn-cal3').onclick = calibrate; $('btn-calclear').onclick = forgetFloor;
  $('f-cal').onclick = calibrate; $('f-skip').onclick = skipFloor; $('f-again').onclick = calibrate;
  $('f-mapped').onclick = () => { SET.roomFit = 'mapped'; updatePanel(); }; $('f-smaller').onclick = () => { SET.roomFit = 'smaller'; updatePanel(); };
  $('f-start').onclick = startRun; $('btn-setup').onclick = backToSetup;
  $('spawnlr').value = SET.spawnLR ? '1' : '0'; $('spawnlr').onchange = e => { SET.spawnLR = e.target.value === '1'; updatePanel(); };
  sel('caluse', 'calUse', () => { if (!isGuest()) restartWorld(); }); sel('roomfit', 'roomFit');
  tog('btn-edge', 'edgeWarn'); sl('edged', 'edgeDist', v => Math.round(v * 100) + ' cm');
  $('btn-arms').onclick = toggleArms;
  $('armsview').onchange = e => { SET.armsView = e.target.value; updatePanel(); };
  $('btn-restart').onclick = restartAll; $('btn-log').onclick = saveLog; $('btn-viewq').onclick = () => { cycleView(); updatePanel(); };
  // the panel remembers which sections you left open
  document.querySelectorAll('#panel details[data-key]').forEach(d => {
    try { let v = localStorage.getItem('armfollow.panel.' + d.dataset.key); if (v !== null) d.open = v === '1'; } catch (e) {}
    d.addEventListener('toggle', () => { try { localStorage.setItem('armfollow.panel.' + d.dataset.key, d.open ? '1' : '0'); } catch (e) {} });
  });
  // drift meter marks: comes back under 60%, left behind at 100%
  let m = $('m-drift').querySelectorAll('.mark');
  m[0].style.left = (0.6 / METER_MAX * 100) + '%'; m[1].style.left = (1 / METER_MAX * 100) + '%';
  $('m-drift').querySelector('.zone').style.width = (0.6 / METER_MAX * 100) + '%';
  $('m-turn').querySelector('.mark').style.left = (1 / METER_MAX * 100) + '%';
  updatePanel();
}
function updatePanel() {
  if (!$('src')) return;
  // switches show just their name; the switch itself shows on / off
  let set = (id, label, on) => { let b = $(id); if (!b) return; b.textContent = b.classList.contains('sw') ? label.replace(/[:\s]+$/, '').replace(/ \([A-Z]\)$/, '') : label + (on ? 'On' : 'Off'); b.classList.toggle('on', !!on); };
  let quick = (id, on) => { let b = $(id); if (b) b.classList.toggle('on', !!on); };
  // a group that doesn't apply right now folds into one greyed line saying why
  let cond = (id, on) => { let g = $(id); if (g) g.classList.toggle('off', !on); };
  showInput(); $('tracker').value = SET.tracker; cond('g-phone', SET.tracker !== 'webcam' && SET.source !== 'demo'); cond('g-webcam', SET.tracker !== 'iphone');
  quick('btn-pip', SET.pip); quick('btn-cheat', SET.cheat); $('btn-cheat').innerHTML = (SET.cheat ? 'Cheat mode · every helper on' : 'Regular · no helpers') + ' <kbd>K</kbd>'; quick('btn-arms', SET.armsOnly); $('armsview').value = SET.armsView; cond('g-armsview', SET.armsOnly); quick('btn-hud', SET.hud); quick('btn-solo', SET.solo); quick('btn-cal', CAL.active);
  $('btn-cal').innerHTML = (CAL.active ? 'Done' : 'Calibrate') + ' <kbd>C</kbd>';
  $('btn-viewq').innerHTML = { behind: 'Behind', first: 'First person', orbit: 'Orbit' }[SET.view] + ' <kbd>V</kbd>';
  set('btn-mirror', 'Mirror: ', SET.mirror); set('btn-pipdepth', 'Show the depth zone: ', SET.pipDepth); set('btn-pipraw', 'Raw detection under the skeleton: ', SET.pipRaw); set('btn-gest', 'Raise both hands = next step: ', SET.gestures); set('btn-tilt', 'Correct the camera’s tilt: ', SET.tiltFix); set('btn-bend', 'Hold your place while bending: ', SET.bendHold); set('btn-qhands', 'Quicker hands: ', SET.quickHands);
  set('btn-puppet', 'Puppet fall: ', SET.puppetFall); set('btn-curl', 'Fingers curl: ', SET.curl); set('btn-lyingf', 'Lying arm follows: ', SET.lyingFollow); set('btn-twitch', 'Twitches: ', SET.twitch);
  set('btn-over', 'Snap overshoot: ', SET.overshoot); set('btn-strings', 'Show strings: ', SET.strings);
  set('btn-warmup', 'Warm-up first (lift one): ', SET.warmup); set('btn-thread', 'Thread from the fallen arm: ', SET.thread); set('btn-fpnear', 'First person near the cube: ', SET.fpNear); set('btn-rlock', 'Hold my place while reaching: ', SET.reachLock); set('btn-solid', 'Solid plinths: ', SET.solid); set('btn-seecube', 'See-through cube when held: ', SET.seeThroughCube);
  set('btn-edge', 'Edge warning: ', SET.edgeWarn); set('btn-xray', 'See-through body: ', SET.xray);
  let fmt = r => r ? rectW(r).toFixed(1) + ' × ' + rectD(r).toFixed(1) + ' m' : 'not measured';
  $('cal-status').textContent = 'This laptop: ' + fmt(CAL.rect) + (SET.spaces === 2 && NET.connected ? ' · other laptop: ' + fmt(CAL.other) : '') +
    (CAL.rect && SET.calUse !== 'cubes' ? ' · walk gain ' + effGain().toFixed(1) : '');
  $('btn-cal3').textContent = CAL.active ? 'Done measuring' : 'Calibrate floor';
  $('spawnlr').value = SET.spawnLR ? '1' : '0';
  for (let [id, key] of [['src', 'source'], ['hands', 'hands'], ['mpmodel', 'mpModel'], ['comp', 'comp'], ['spaces', 'spaces'], ['own', 'own'], ['ownL', 'ownL'], ['ownR', 'ownR'], ['lifeless', 'lifeless'], ['rstyle', 'returnStyle'], ['grip', 'grip'], ['holders', 'holders'], ['view', 'view'], ['camlock', 'camLock'], ['examine', 'examine'], ['caluse', 'calUse'], ['roomfit', 'roomFit'], ['reach', 'reach'], ['ghost', 'ghost']]) { $(id).value = String(SET[key]); }
  $('mpsplit').value = SET.mpSplit ? '1' : '0';
  for (let [id, key] of [['tol', 'tol'], ['turn', 'turnTol'], ['lag', 'lag'], ['lstr', 'lyingStrength'], ['rtime', 'returnTime'], ['touch', 'touch'], ['gain', 'gain'], ['ddrift', 'depthDrift'], ['assist', 'assist'], ['ebuf', 'edgeBuffer'], ['netsm', 'netSmooth']]) { $(id).value = SET[key]; }
  $('val-ddrift').textContent = SET.depthDrift === 0 ? 'not at all' : SET.depthDrift === 1 ? 'fully' : Math.round(SET.depthDrift * 100) + '%';
  $('val-assist').textContent = SET.assist === 0 ? 'off' : SET.assist.toFixed(2); $('val-ebuf').textContent = Math.round(SET.edgeBuffer * 100) + ' cm'; $('val-netsm').textContent = SET.netSmooth + ' ms';
  $('val-tol').textContent = SET.tol.toFixed(2) + ' m'; $('val-turn').textContent = SET.turnTol + '°'; $('val-gain').textContent = '1 m → ' + SET.gain.toFixed(1) + ' m';
  let cam = SET.source === 'mediapipe', floorOn = !!usable(1);
  cond('g-mp', cam); cond('g-split', SET.spaces === 1); cond('g-comp', cam); cond('comp-row', SET.comp !== 'off');
  cond('net-row', SET.spaces === 2); cond('g-roomfit', SET.spaces === 2);
  cond('g-gain', !(floorOn && SET.calUse !== 'cubes')); cond('g-area', !(floorOn && SET.calUse !== 'gain')); cond('g-edged', SET.edgeWarn);
  cond('own-row', SET.own === 'custom'); cond('g-holdt', SET.warmup); cond('g-exam', SET.examine !== 'off' || SET.fpNear);
  cond('g-fall', SET.lifeless === 'fall'); cond('g-lying', SET.lyingFollow); cond('g-rtime', SET.returnStyle === 'strings');
  $('net-status').textContent = netNiceStatus(); $('net-status').classList.toggle('ok', NET.connected);
  $('btn-host').classList.toggle('on', NET.role === 'host'); $('btn-host').textContent = NET.role === 'host' ? 'Hosting · code ' + NET.code : 'Host on this laptop (P1)';
  $('btn-join').classList.toggle('on', NET.role === 'guest'); $('btn-join').textContent = NET.role === 'guest' ? (NET.connected ? 'Joined ✓' : 'Joining…') : 'Join as P2';
  $('holders-note').textContent = SET.holders === 'possessed' && p2Arms().length < 2 ? 'Only one arm is possessed, so the two-hand cube can’t be lifted with this setting.' : '';
  // linked as P2: P1's laptop decides the experience; P2 keeps only what its own camera needs, and leaving
  let lock = isGuest(), p2own = ['btn-leave', 'tracker', 'phoneip', 'btn-phone', 'cam', 'fov', 'btn-mirror', 'btn-cal', 'btn-cal3', 'btn-calclear'];
  document.querySelectorAll('#panel select, #panel input, #panel button').forEach(el => { el.disabled = lock && !p2own.includes(el.id); });
  $('lock-all').style.display = lock ? 'block' : 'none';
}

// ---------------- the start flow ----------------
// setup:  each laptop measures its floor (or keeps its saved one) → P1 picks how two
//         different rooms fit → both step into their cameras → P1 presses START
// centre: START locks onto the people being followed; both walk onto the ring (the
//         middle of the floor they use); once both are there it begins by itself
// play:   the experience. Setup (quick bar) goes back to the start.
const RUN = { phase: SET.source === 'demo' ? 'play' : 'setup', centre: null, centreT: 0 };
const isHuman = p => p && (p.key === null || (p.key === 'net' && p.human));
function needsCentre() { return SET.spaces === 2 && !!usable(1); }
function startRun() {
  if (isGuest()) return;
  if (CAL.active) calibrate();
  lockPeople();
  if (needsCentre()) { RUN.phase = 'centre'; RUN.centreT = 0; RUN.centreSince = 0; logEvent('flow', { to: 'centre' }); }
  else beginPlay();
  updatePanel();
}
function beginPlay() { RUN.phase = 'play'; RUN.centre = null; restartWorld(); logEvent('flow', { to: 'play' }); toast('Go!'); updatePanel(); }
function backToSetup() {
  if (isGuest()) { toast('P1’s laptop decides this'); return; }
  unlockPeople(); RUN.phase = SET.source === 'demo' ? 'play' : 'setup'; RUN.centre = null; logEvent('flow', { to: 'setup' }); updatePanel();
}
// host: during the walk to the centre, who's there yet
function centreStep(dt) {
  if (RUN.phase !== 'centre' || isGuest()) return;
  let st = {};
  for (let k of [1, 2]) {
    let p = k === 2 ? live2() : live(1), d = centreDist(k);
    st['d' + k] = !p ? null : (d === null || !isHuman(p)) ? 0 : r3(d);
  }
  RUN.centre = st;
  let there = k => st['d' + k] !== null && st['d' + k] < 0.15;
  // both on the ring for 0.8 s (real time) and it begins
  let now = performance.now();
  if (!(there(1) && there(2))) RUN.centreSince = 0; else if (!RUN.centreSince) RUN.centreSince = now;
  RUN.centreT = RUN.centreSince ? (now - RUN.centreSince) / 1000 : 0;
  if (RUN.centreT > 0.8) beginPlay();
}
function flowStep() {
  let cam = SET.source === 'mediapipe';
  let showCard = cam && RUN.phase === 'setup', showCentre = RUN.phase === 'centre';
  $('flow').style.display = showCard ? 'block' : 'none';
  $('centre').style.display = showCentre ? 'block' : 'none';
  $('waiting').style.visibility = showCard ? 'hidden' : 'visible';
  if (showCentre) {
    let c = RUN.centre || {}, f = d => d === null || d === undefined ? 'not found' : d < 0.15 ? '✓ there' : d.toFixed(2) + ' m away';
    $('centre-who').textContent = 'P1 ' + f(c.d1) + '   ·   P2 ' + f(c.d2);
  }
  if (!showCard) return;
  let guest = isGuest(), linked = SET.spaces === 2 && NET.connected, fmt = r => rectW(r).toFixed(1) + ' × ' + rectD(r).toFixed(1) + ' m';
  // 1 · the floor
  let done1 = calStepDone(), t1;
  if (CAL.active) t1 = 'Walk to the front, back, left and right edges of the space you can use, then press Done.<br><b>' + (CAL.live ? fmt(CAL.live) + ' so far' : 'Waiting to see you in the camera…') + '</b>';
  else if (CAL.rect) t1 = '✓ Using ' + (CAL.skipped ? 'your saved' : 'this') + ' floor: <b>' + fmt(CAL.rect) + '</b>';
  else if (CAL.skipped) t1 = '✓ Skipped: the walk-gain sliders are used instead.';
  else t1 = 'Press Calibrate, walk to the front, back, left and right edges of the space you can use, then press Done.';
  $('fs1-text').innerHTML = t1;
  $('f-cal').textContent = CAL.active ? 'Done' : 'Calibrate';
  $('f-cal').style.display = CAL.active || !done1 ? '' : 'none';
  $('f-skip').style.display = !CAL.active && !done1 ? '' : 'none';
  $('f-again').style.display = !CAL.active && done1 ? '' : 'none';
  $('fs1').classList.toggle('done', done1);
  let other = '';
  if (linked && !guest) other = 'P2’s laptop: ' + (NET.otherCal ? 'measuring…' : CAL.other ? '✓ ' + fmt(CAL.other) : NET.otherDone ? '✓ skipped' : 'not done yet');
  $('fs1-other').textContent = other;
  // 2 · two rooms of different sizes (2 spaces, both measured)
  let two = linked && CAL.rect && CAL.other;
  $('fs2').style.display = two ? '' : 'none';
  if (two) {
    let mine = guest ? 'P2' : 'P1', theirs = guest ? 'P1' : 'P2';
    $('fs2-text').innerHTML = mine + ' (you): <b>' + fmt(CAL.rect) + '</b> · ' + theirs + ': <b>' + fmt(CAL.other) + '</b>' + (guest ? '<br>P1 chooses how they fit.' : '');
    $('f-mapped').classList.toggle('on', SET.roomFit === 'mapped'); $('f-smaller').classList.toggle('on', SET.roomFit === 'smaller');
    $('f-mapped').disabled = guest; $('f-smaller').disabled = guest;
    $('fs2-note').textContent = SET.roomFit === 'mapped' ? 'Each room maps onto the other: in the smaller room each step counts for more.' : 'Both use a patch the size of the smaller room; the person in the bigger room gets walls (and an outline in their camera view).';
  }
  // 3 · step into the camera
  let mineSlots = SET.comp !== 'off' ? [SET.comp === 'P2' ? 1 : 2] : SET.spaces === 2 ? [NET.connected ? NET.myId : 1] : [1, 2];
  let seen = mineSlots.filter(k => live(k)), n = (MP.found || []).length;
  let p2ok = SET.spaces === 1 || SET.comp !== 'off' || SET.solo || !!live2();
  $('fs3-text').innerHTML = (mineSlots.length === 2 ? 'The two biggest people in the picture become P1 (screen left) and P2.' : 'The biggest person in your camera is followed as ' + (mineSlots[0] === 1 ? 'P1' : 'P2') + '; anyone else is ignored after START.') +
    '<br><span class="' + (seen.length === mineSlots.length ? 'ok' : 'wait') + '">' + (seen.length === mineSlots.length ? '✓ Found you' : 'Looking for you…') + ' · ' + n + ' in the picture</span>' +
    (!guest && SET.spaces === 2 && SET.comp === 'off' && !SET.solo ? ' · <span class="' + (p2ok ? 'ok' : 'wait') + '">' + (p2ok ? '✓ P2 found' : linked ? 'P2 not found yet' : 'P2 not linked yet') + '</span>' : '');
  $('fs3').classList.toggle('done', seen.length === mineSlots.length && p2ok);
  // START
  let ready = done1 && seen.length === mineSlots.length && p2ok && (!linked || NET.otherDone || !!CAL.other);
  $('f-start').style.display = guest ? 'none' : ''; $('f-wait').style.display = guest ? '' : 'none';
  $('f-start').disabled = !ready;
  $('f-start-note').textContent = guest ? '' : ready ? (needsCentre() ? 'After START, both walk onto the ring in the room; it begins once you’re both there.' : '') : 'START unlocks once every step above is done.';
}

// ARMS ONLY: just your arms (and P2's possessed arm), the body standing still, nothing to do: feel the tracking
function toggleArms() {
  if (isGuest()) { toast('P1’s laptop decides this'); return; }
  SET.armsOnly = !SET.armsOnly;
  if (SET.armsOnly) { RUN.phase = 'play'; if (SET.view === 'behind') setView('behind'); toast('Arms only: just your arms · A to leave'); }
  else { toast('Arms only off'); restartWorld(); }
  updatePanel();
}
function cycleView() { let order = ['behind', 'first', 'orbit'], v = order[(order.indexOf(SET.view) + 1) % 3]; setView(v); toast({ behind: 'Behind the body', first: 'First person', orbit: 'Free orbit (drag)' }[v]); }

// ---------------- keys ----------------
window.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  let el = document.activeElement; if (el && el.tagName === 'INPUT' && el.type === 'text') return;
  if (el && /BUTTON|INPUT|SELECT|SUMMARY/.test(el.tagName)) el.blur();
  let k = (e.key || '').toLowerCase();
  if (isGuest() && k !== 'h' && k !== 'f') { if ('jdvscrok'.includes(k)) { toast('P1’s laptop decides this'); e.preventDefault(); } return; }
  if (k === 'h') { let p = $('panel'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; setTimeout(sceneResize, 0); }
  else if (k === 'j') SET.pip = !SET.pip;
  else if (k === 'v') cycleView();
  else if (k === 'r') restartAll();
  else if (k === 'c') calibrate();
  else if (k === 's') { SET.solo = !SET.solo; toast('Solo ' + (SET.solo ? 'on: you are P1 and P2' : 'off')); }
  else if (k === 'o') saveLog();
  else if (k === 'a') toggleArms();
  else if (k === 'k') toggleCheat();
  else if (k === 'd') SET.hud = !SET.hud;
  else if (k === 'f') { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
  else return;
  updatePanel(); e.preventDefault();
});

// ---------------- main loop ----------------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000)); lastT = now;
  trackTick(now, dt);
  calTick();
  netTick(now);
  let S;
  if (isGuest()) S = guestSnap(dt);
  else { simStep(dt, now); S = SNAP; }
  sceneRender(S, dt);
  centreStep(dt); hudStep(S); statsStep(S); pipStep(); flowStep(); logTick(now, S);
}
sceneInit($('stage'));
try { let t = localStorage.getItem('armfollow.tracker'), a = localStorage.getItem('armfollow.phoneIP'); if (t) SET.tracker = t; if (a) SET.phoneIP = a; } catch (e) {}
setupPanel();
spawnCube(true);
setSource(SET.source);
requestAnimationFrame(frame);
window.__af = { SET, people, FOLLOW, ARMS, CUBE, TASK, AV, NET, LOG, simStep, restartWorld };   // for testing from the console
