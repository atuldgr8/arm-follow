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
  $('hud').style.display = h && h.anyP2 && h.p1 ? 'block' : 'none';
  if (!h) { $('waiting').textContent = 'Starting…'; return; }
  let wait = !h.p1 ? 'Waiting for P1' : (h.anyP2 && !h.p2 ? 'Waiting for P2 · the arm has nobody in it' : '');
  $('waiting').textContent = wait;
  let k = clamp(h.drift / h.tol / METER_MAX, 0, 1), kt = clamp(h.turn / h.turnTol / METER_MAX, 0, 1);
  let apart = h.state === 'apart', back = h.state === 'returning';
  let col = apart ? '#ff6a5a' : k > 0.6 / METER_MAX ? '#f2b84b' : '#d9dcdf';
  let f = $('m-drift').querySelector('.fill'); f.style.width = (k * 100) + '%'; f.style.background = col;
  $('m-drift').querySelector('.zone').style.background = apart ? 'rgba(120,230,160,0.22)' : 'rgba(120,230,160,0)';
  let ft = $('m-turn').querySelector('.fill'); ft.style.width = (kt * 100) + '%'; ft.style.background = h.turn > h.turnTol ? '#ff6a5a' : '#9aa3ad';
  $('hud-label').textContent = apart ? 'arm left behind · catch up' : back ? 'coming back' : h.state === 'vacant' ? 'nobody in the arm' : 'together';
  $('hud-label').style.color = apart ? '#ff8a7a' : '#c9ced6';
  $('score').textContent = 'CUBES ' + h.score;
  if (h.score !== lastScore) { lastScore = h.score; $('score').style.transform = 'scale(1.35)'; setTimeout(() => { $('score').style.transform = ''; }, 260); }
  $('hold').style.opacity = h.hold > 0.01 ? 1 : 0;
  let et = edgeText(); $('edge').style.display = et ? 'block' : 'none'; $('edge').textContent = et;
  $('calib').style.display = CAL.active ? 'flex' : 'none';
  if (CAL.active) $('calib-text').innerHTML = 'Walk to your front, back, left and right edges<br>' + (CAL.live ? rectW(CAL.live).toFixed(1) + ' × ' + rectD(CAL.live).toFixed(1) + ' m so far' : 'waiting for someone in the camera') + '<br>press C (or the button) when done';
  $('hold').querySelector('.fill').style.width = (clamp(h.hold, 0, 1) * 100) + '%';
}
function statsStep(S) {
  let el = $('stats'); el.style.display = SET.hud ? 'block' : 'none'; if (!SET.hud) return;
  let mins = Math.max(0.05, (performance.now() - TRK.since) / 60000), h = S && S.hud;
  let guest = isGuest(), arms = S && S.ok ? S.arms : null;
  let armTxt = arms ? ['L', 'R'].map(s => s + ' ' + (arms[s].owner === 2 ? 'P2' : 'P1') + ' ' + arms[s].state).join(' · ') : '-';
  let lines = [
    `ARM FOLLOW v1 · ${TRK.status} · ${TRK.hz.toFixed(1)} Hz · dropouts ${TRK.dropouts} (${(TRK.dropouts / mins).toFixed(1)}/min)${SET.solo ? ' · SOLO' : ''}${SET.comp !== 'off' ? ' · COMPUTER plays ' + SET.comp : ''}`,
    `${SET.spaces === 2 ? '2 SPACES · ' + (NET.role || 'offline') + ' · ' + NET.status + (NET.rtt ? ' · ping ' + Math.round(NET.rtt) + ' ms' : '') : '1 SPACE'} · P1 ${h && h.p1 ? 'tracked' : '-'} · P2 ${h && h.p2 ? 'tracked' : '-'}`,
    h ? `follow ${h.state} · drift ${h.drift.toFixed(2)} / ${h.tol} m · turn ${h.turn}° / ${h.turnTol}° · lost ${TASK.lost}` : '',
    `arms ${armTxt}`,
    h ? `grip ${SET.grip} · hands on the cube ${h.touching} · ${h.held ? 'HELD' + (h.slip > 0.01 ? ' slipping ' + h.slip.toFixed(2) : '') : 'not held'}${SET.grip === 'dwell' && h.dwell > 0 ? ' · dwell ' + h.dwell.toFixed(1) : ''} · hold ${(h.hold * SET.holdTime).toFixed(1)} s · cubes ${h.score}` : '',
    handsLine(),
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
  let c = $('pip'); c.style.display = SET.pip ? 'block' : 'none'; if (!SET.pip) return;
  let cam = SET.source === 'mediapipe' && MP.video && MP.video.readyState >= 2;
  let w = 400, h = cam ? Math.round(w * MP.video.videoHeight / MP.video.videoWidth) : 260;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  let x = c.getContext('2d');
  x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(0, 0, w, h);
  if (cam) {
    x.save(); if (SET.mirror) { x.translate(w, 0); x.scale(-1, 1); }
    x.drawImage(MP.video, 0, 0, w, h);
    if (MP.halves) { x.strokeStyle = 'rgba(255,255,255,0.45)'; x.setLineDash([6, 6]); for (let u of [0.4, 0.6]) { x.beginPath(); x.moveTo(u * w, 0); x.lineTo(u * w, h); x.stroke(); } x.setLineDash([]); }
    // which person is which: nearest pelvis in the picture to each slot's last picture
    for (let lm of MP.found || []) {
      let slot = [1, 2].find(k => people[k] && people[k].lm === lm) || 0;
      let col = slot === 2 ? 'rgba(255,154,74,0.95)' : 'rgba(255,255,255,0.95)';
      x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 2.5; x.lineCap = 'round';
      for (let [a, b] of PIP_BONES) { if (lm[a] && lm[b]) { x.beginPath(); x.moveTo(lm[a].x * w, lm[a].y * h); x.lineTo(lm[b].x * w, lm[b].y * h); x.stroke(); } }
      if (slot) { x.save(); x.translate(lm[0].x * w, lm[0].y * h - 18); if (SET.mirror) x.scale(-1, 1); x.font = 'bold 12px monospace'; x.textAlign = 'center'; x.fillText('P' + slot, 0, 0); x.restore(); }
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
const LOG = { rows: [], events: [], last: 0, started: new Date().toISOString() };
function logEvent(kind, data) { LOG.events.push(Object.assign({ t: Math.round(performance.now()), kind }, data || {})); if (LOG.events.length > 5000) LOG.events.shift(); }
function logTick(now, S) {
  if (now - LOG.last < 100 || !S || !S.hud) return; LOG.last = now;
  let h = S.hud;
  LOG.rows.push({ t: Math.round(now), src: SET.source, hz: Math.round(TRK.hz), p1: h.p1, p2: h.p2, follow: h.state, drift: h.drift, turn: h.turn,
    arms: S.ok ? { L: S.arms.L.state, R: S.arms.R.state } : null, held: h.held, slip: h.slip, score: h.score });
  if (LOG.rows.length > 12000) LOG.rows.shift();
}
function saveLog() {
  let data = { app: 'Arm Follow v1', started: LOG.started, saved: new Date().toISOString(), settings: SET, events: LOG.events, rows: LOG.rows };
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
function setupPanel() {
  $('src').onchange = e => { setSource(e.target.value, $('cam').value); updatePanel(); };
  cameraList().then(l => { $('cam').innerHTML = l.map((c, i) => `<option value="${c.deviceId}">${c.label || 'Camera ' + (i + 1)}</option>`).join(''); });
  $('cam').onchange = () => { if (SET.source === 'mediapipe') setSource('mediapipe', $('cam').value); };
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
  tog('btn-mirror', 'mirror'); tog('btn-solo', 'solo');
  tog('btn-puppet', 'puppetFall'); tog('btn-curl', 'curl'); tog('btn-lyingf', 'lyingFollow'); tog('btn-twitch', 'twitch');
  tog('btn-over', 'overshoot'); tog('btn-strings', 'strings'); tog('btn-ghost', 'ghost'); tog('btn-hud', 'hud'); tog('btn-pip', 'pip');
  let sl = (id, key, fmt) => { $(id).value = SET[key]; $('val-' + id).textContent = fmt(SET[key]); $(id).oninput = e => { SET[key] = parseFloat(e.target.value); $('val-' + id).textContent = fmt(SET[key]); }; };
  sl('fov', 'fov', v => v + '°'); sl('feel', 'smooth', v => v.toFixed(2));
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
  sel('camlock', 'camLock');
  $('btn-cal').onclick = calibrate; $('btn-calclear').onclick = forgetFloor;
  sel('caluse', 'calUse', () => { if (!isGuest()) restartWorld(); }); sel('roomfit', 'roomFit');
  tog('btn-edge', 'edgeWarn'); sl('edged', 'edgeDist', v => Math.round(v * 100) + ' cm');
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
  let set = (id, label, on) => { let b = $(id); if (!b) return; b.textContent = label + (on ? 'On' : 'Off'); b.classList.toggle('on', !!on); };
  let quick = (id, on) => { let b = $(id); if (b) b.classList.toggle('on', !!on); };
  // a group that doesn't apply right now folds into one greyed line saying why
  let cond = (id, on) => { let g = $(id); if (g) g.classList.toggle('off', !on); };
  quick('btn-pip', SET.pip); quick('btn-hud', SET.hud); quick('btn-solo', SET.solo); quick('btn-cal', CAL.active);
  $('btn-cal').innerHTML = (CAL.active ? 'Done' : 'Calibrate') + ' <kbd>C</kbd>';
  $('btn-viewq').innerHTML = { behind: 'Behind', first: 'First person', orbit: 'Orbit' }[SET.view] + ' <kbd>V</kbd>';
  set('btn-mirror', 'Mirror: ', SET.mirror);
  set('btn-puppet', 'Puppet fall: ', SET.puppetFall); set('btn-curl', 'Fingers curl: ', SET.curl); set('btn-lyingf', 'Lying arm follows: ', SET.lyingFollow); set('btn-twitch', 'Twitches: ', SET.twitch);
  set('btn-over', 'Snap overshoot: ', SET.overshoot); set('btn-strings', 'Show strings: ', SET.strings); set('btn-ghost', 'Ghost of P2: ', SET.ghost);
  set('btn-edge', 'Edge warning: ', SET.edgeWarn);
  let fmt = r => r ? rectW(r).toFixed(1) + ' × ' + rectD(r).toFixed(1) + ' m' : 'not measured';
  $('cal-status').textContent = 'This laptop: ' + fmt(CAL.rect) + (SET.spaces === 2 && NET.connected ? ' · other laptop: ' + fmt(CAL.other) : '') +
    (CAL.rect && SET.calUse !== 'cubes' ? ' · walk gain ' + effGain().toFixed(1) : '') + (CAL.rect ? '' : ' (Calibrate in the bar above)');
  for (let [id, key] of [['src', 'source'], ['hands', 'hands'], ['mpmodel', 'mpModel'], ['comp', 'comp'], ['spaces', 'spaces'], ['own', 'own'], ['ownL', 'ownL'], ['ownR', 'ownR'], ['lifeless', 'lifeless'], ['rstyle', 'returnStyle'], ['grip', 'grip'], ['holders', 'holders'], ['view', 'view'], ['camlock', 'camLock'], ['caluse', 'calUse'], ['roomfit', 'roomFit']]) { $(id).value = String(SET[key]); }
  $('mpsplit').value = SET.mpSplit ? '1' : '0';
  for (let [id, key] of [['tol', 'tol'], ['turn', 'turnTol'], ['lag', 'lag'], ['lstr', 'lyingStrength'], ['rtime', 'returnTime'], ['touch', 'touch'], ['gain', 'gain']]) { $(id).value = SET[key]; }
  $('val-tol').textContent = SET.tol.toFixed(2) + ' m'; $('val-turn').textContent = SET.turnTol + '°'; $('val-gain').textContent = '1 m → ' + SET.gain.toFixed(1) + ' m';
  let cam = SET.source === 'mediapipe', floorOn = !!usable(1);
  cond('g-mp', cam); cond('g-split', SET.spaces === 1); cond('g-comp', cam); cond('comp-row', SET.comp !== 'off');
  cond('net-row', SET.spaces === 2); cond('g-roomfit', SET.spaces === 2);
  cond('g-gain', !(floorOn && SET.calUse !== 'cubes')); cond('g-area', !(floorOn && SET.calUse !== 'gain')); cond('g-edged', SET.edgeWarn);
  cond('own-row', SET.own === 'custom');
  cond('g-fall', SET.lifeless === 'fall'); cond('g-lying', SET.lyingFollow); cond('g-rtime', SET.returnStyle === 'strings');
  $('net-status').textContent = NET.status;
  $('holders-note').textContent = SET.holders === 'possessed' && p2Arms().length < 2 ? 'Only one arm is possessed, so the two-hand cube can’t be lifted with this setting.' : '';
  let lock = isGuest();
  document.querySelectorAll('#panel .world').forEach(el => { el.disabled = lock; });
  $('lock-all').style.display = lock ? 'block' : 'none';
}

function cycleView() { let order = ['behind', 'first', 'orbit'], v = order[(order.indexOf(SET.view) + 1) % 3]; setView(v); toast({ behind: 'Behind the body', first: 'First person', orbit: 'Free orbit (drag)' }[v]); }

// ---------------- keys ----------------
window.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  let el = document.activeElement; if (el && el.tagName === 'INPUT' && el.type === 'text') return;
  if (el && /BUTTON|INPUT|SELECT|SUMMARY/.test(el.tagName)) el.blur();
  let k = (e.key || '').toLowerCase();
  if (k === 'h') { let p = $('panel'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; setTimeout(sceneResize, 0); }
  else if (k === 'j') SET.pip = !SET.pip;
  else if (k === 'v') cycleView();
  else if (k === 'r') restartAll();
  else if (k === 'c') calibrate();
  else if (k === 's') { SET.solo = !SET.solo; toast('Solo ' + (SET.solo ? 'on: you are P1 and P2' : 'off')); }
  else if (k === 'o') saveLog();
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
  hudStep(S); statsStep(S); pipStep(); logTick(now, S);
}
sceneInit($('stage'));
setupPanel();
spawnCube(true);
setSource(SET.source);
requestAnimationFrame(frame);
window.__af = { SET, people, FOLLOW, ARMS, CUBE, TASK, AV, NET, LOG, simStep, restartWorld };   // for testing from the console
