// MEDIALIFE Holocast control room: everything typed, drawn, dropped, asked or said here beams into the AR
// hologram (/labs/holocast/) through the room API (src/lib/holocast/server.ts, client in ../room.js).
import { Room, CODE_RE, createRoom, savedRoom, saveRoom, keyFromHash, controlUrl, viewUrl, ago, THEMES, REACTIONS } from '../room.js?v=2';
import { LiveHost, canStream } from '../live.js?v=2';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let room = null;
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* none */ } };
let toastT = 0;
function toast(t, ms = 1800) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms); }

// ---------------------------------------------------------------- which room
async function boot() {
  let code = (params.get('room') || '').toUpperCase();
  let key = keyFromHash();
  const saved = savedRoom();
  if (!CODE_RE.test(code)) {
    if (saved && saved.key) { code = saved.code; key = saved.key; }
    else { $('start').hidden = false; return; }
  }
  if (!key && saved && saved.code === code) key = saved.key || '';
  if (key) saveRoom(code, key);
  // the key stays out of the address bar (and out of screenshots / history shares)
  history.replaceState(null, '', `?room=${code}`);
  open(code, key);
}
$('b-new').onclick = async () => {
  $('b-new').disabled = true; $('b-new').textContent = 'Making your room…';
  try {
    const r = await createRoom(); saveRoom(r.code, r.key);
    history.replaceState(null, '', `?room=${r.code}`);
    $('start').hidden = true; open(r.code, r.key); showHologram();
  } catch (e) { toast(e.message || 'Couldn\'t make a room'); $('b-new').disabled = false; $('b-new').textContent = 'Start a new Holocast'; }
};
$('join').onsubmit = (e) => {
  e.preventDefault(); const c = $('join-code').value.trim().toUpperCase();
  if (!CODE_RE.test(c)) { toast('A room code is 6 letters and numbers'); return; }
  history.replaceState(null, '', `?room=${c}`); $('start').hidden = true; open(c, '');
};

function open(code, key) {
  room = new Room(code, key, { role: 'control' });
  $('app').hidden = false; $('room-chip').hidden = false; $('b-show').hidden = false; $('dock').hidden = false; $('t-holo').hidden = false;
  $('room-code').textContent = code;
  $('readonly').hidden = room.canWrite;
  document.querySelectorAll('#app form button, #app .panel button, #app input, #app textarea').forEach((el) => { if (!room.canWrite && !el.closest('.tabs')) el.disabled = true; });
  if (!room.canWrite) { $('b-copy-view').disabled = false; }
  room.on(onRoom);
  room.start();
}

function onRoom(what) {
  const s = room.state;
  if (what === 'gone') { toast('That room doesn\'t exist any more', 4000); $('app').hidden = true; $('start').hidden = false; return; }
  if (what === 'error') { toast(arguments[2] && arguments[2].message ? arguments[2].message : 'Something went wrong'); return; }
  if (what === 'offline') { $('live').classList.add('off'); $('live').classList.remove('on'); return; }
  if (!s) return;
  const all = what === 'init';
  if (all || what === 'presence' || what === 'online') {
    $('watching').textContent = s.watching; $('live').classList.toggle('on', s.watching > 0); $('live').classList.remove('off');
  }
  if (all || what === 'notices') renderNotices();
  if (all || what === 'photos') renderPhotos();
  if (all || what === 'sketch' || what === 'sketch-reset') drawRemote(what === 'sketch-reset' || all);
  if (all || what === 'theme') renderThemes();
  if (all || what === 'title') { if (document.activeElement !== $('h-title')) $('h-title').value = s.title; }
  if (all || what === 'poll') renderPoll();
  if (all || what === 'live') renderLive();
  if (all || what === 'hide') renderScreens();
  if (what === 'reactions') showReactions(arguments[2]);
  if (all) { renderStats(); $('watching').textContent = s.watching; }
  else renderStats();
}

// ---------------------------------------------------------------- tabs
const TABS = ['notice', 'draw', 'cam', 'photo', 'live', 'holo'];
const DOCK = TABS.slice(0, 5);                 // the floating dock; 'holo' is the header's Hologram button
let curTab = 'notice';
function tab(name) {
  curTab = name;
  for (const t of TABS) { $('t-' + t).setAttribute('aria-selected', String(t === name)); $('p-' + t).hidden = t !== name; }
  document.body.classList.toggle('cam-mode', name === 'cam');
  try { sessionStorage.setItem('holocast-tab', name); } catch (e) { /* none */ }
  if (name === 'draw') drawRemote(true);
  if (name !== 'cam') scrollTo(0, 0);
}
TABS.forEach((t) => { $('t-' + t).onclick = () => tab(t === 'holo' && curTab === 'holo' ? 'notice' : t); });
$('dock').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = Math.max(0, DOCK.indexOf(curTab));
  const n = DOCK[(i + (e.key === 'ArrowRight' ? 1 : DOCK.length - 1)) % DOCK.length]; tab(n); $('t-' + n).focus();
});
try { const t = sessionStorage.getItem('holocast-tab'); if (TABS.includes(t)) tab(t); } catch (e) { /* none */ }

// ---------------------------------------------------------------- notice board
try { $('n-from').value = localStorage.getItem('holocast-from') || ''; } catch (e) { /* none */ }
const from = () => { const f = $('n-from').value.trim(); try { localStorage.setItem('holocast-from', f); } catch (e) { /* none */ } return f; };
function syncNoticeCard() {
  const t = $('n-text').value.trim();
  $('n-count').textContent = `${$('n-text').value.length} / 160`;
  $('n-fling').hidden = !t || !room || !room.canWrite;
  $('n-card-t').textContent = t; $('n-card-f').textContent = (from() || 'Control room') + ($('n-pin').checked ? ' · pinned' : '');
}
$('n-text').addEventListener('input', syncNoticeCard); $('n-from').addEventListener('input', syncNoticeCard); $('n-pin').addEventListener('change', syncNoticeCard);
async function sendNotice(fling) {
  const text = $('n-text').value.trim(); if (!text || !room) return;
  $('n-send').disabled = true;
  const ok = await room.send({ op: 'notice', text, from: from(), pin: $('n-pin').checked, fling: !!fling });
  $('n-send').disabled = false;
  if (ok) { $('n-text').value = ''; $('n-pin').checked = false; syncNoticeCard(); toast(fling ? 'Flung into the hologram' : 'Beamed to the hologram'); buzz(15); }
}
$('f-notice').onsubmit = (e) => { e.preventDefault(); sendNotice(false); };
$('n-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendNotice(false); } });
function renderNotices() {
  const L = $('n-list'); L.innerHTML = '';
  const list = [...room.state.notices].reverse();
  if (!list.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Nothing on the board yet.'; L.appendChild(li); return; }
  for (const n of list) {
    const li = document.createElement('li'); li.className = n.pinned ? 'pinned' : '';
    const t = document.createElement('div'); t.className = 't';
    const p = document.createElement('div'); p.textContent = n.text;
    const m = document.createElement('div'); m.className = 'm'; m.textContent = `${n.from} · ${ago(n.at)}${n.pinned ? ' · pinned' : ''}`;
    t.append(p, m); li.appendChild(t);
    if (room.canWrite) {
      const pin = document.createElement('button'); pin.type = 'button'; pin.textContent = n.pinned ? 'Pinned' : 'Pin'; pin.setAttribute('aria-pressed', String(!!n.pinned));
      pin.setAttribute('aria-label', (n.pinned ? 'Unpin: ' : 'Pin big: ') + n.text); pin.onclick = () => room.send({ op: 'pin', id: n.id });
      const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Remove'; del.setAttribute('aria-label', 'Remove: ' + n.text);
      del.onclick = () => room.send({ op: 'unnotice', id: n.id });
      li.append(pin, del);
    }
    L.appendChild(li);
  }
}

// ---------------------------------------------------------------- fling: swipe a card up to throw it in
function flingable(card, onFling) {
  let y0 = 0, t0 = 0, dy = 0, id = null;
  card.addEventListener('pointerdown', (e) => { id = e.pointerId; y0 = e.clientY; t0 = performance.now(); dy = 0; card.classList.add('drag'); try { card.setPointerCapture(id); } catch (er) { /* old Safari */ } });
  card.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; dy = Math.min(0, e.clientY - y0); card.style.transform = `translateY(${dy}px) rotate(${dy * 0.02}deg) scale(${1 + dy * 0.0006})`; });
  const end = (e) => {
    if (e.pointerId !== id) return; id = null; card.classList.remove('drag');
    const v = -dy / Math.max(60, performance.now() - t0);   // px per ms
    if (dy < -90 || (dy < -30 && v > 0.6)) { card.classList.add('gone'); buzz([10, 30, 20]); onFling(); setTimeout(() => { card.classList.remove('gone'); card.style.transform = ''; }, 700); }
    else card.style.transform = '';
  };
  card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.add('gone'); onFling(); setTimeout(() => { card.classList.remove('gone'); }, 700); } });
}
flingable($('n-card'), () => sendNotice(true));

// ---------------------------------------------------------------- live sketch
const COLS = ['#3fe6ff', '#ff2fae', '#ffc53d', '#7dff6a', '#ffffff', '#ff5a3c', '#8a6bff'];
let col = COLS[0], width = 10;
const sw = $('swatches');
COLS.forEach((c, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.style.setProperty('--c', c); b.setAttribute('aria-label', 'Colour ' + (i + 1)); b.setAttribute('aria-checked', String(i === 0));
  b.onclick = () => { col = c; sw.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); }; sw.appendChild(b);
});
document.querySelectorAll('.sizes button').forEach((b) => { b.onclick = () => { width = +b.dataset.w; document.querySelectorAll('.sizes button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); }; });
const pad = $('pad'), pg = pad.getContext('2d');
const mine = new Map();                       // my strokes (id -> {c, w, p}) drawn locally at once
function strokePath(g, s, from = 0) {
  const p = s.p; if (p.length < 2) return;
  g.strokeStyle = s.c; g.fillStyle = s.c; g.lineWidth = s.w; g.lineCap = 'round'; g.lineJoin = 'round';
  if (p.length === 2) { g.beginPath(); g.arc(p[0], p[1], s.w / 2, 0, Math.PI * 2); g.fill(); return; }
  g.beginPath(); const i0 = Math.max(0, from - 2); g.moveTo(p[i0], p[i0 + 1]);
  for (let i = i0 + 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.stroke();
}
let drawn = new Map();                        // id -> points drawn so far
function drawRemote(full) {
  if (!room) return;
  if (full) { pg.fillStyle = '#060a10'; pg.fillRect(0, 0, 1000, 1000); drawn = new Map(); }
  for (const [id, s] of room.strokes) {
    const m = mine.get(id); const src = m && m.p.length > s.p.length ? m : s;
    const have = drawn.get(id) || 0; if (src.p.length <= have) continue;
    strokePath(pg, src, have); drawn.set(id, src.p.length);
  }
  for (const [id, m] of mine) if (!room.strokes.has(id)) { const have = drawn.get(id) || 0; if (m.p.length > have) { strokePath(pg, m, have); drawn.set(id, m.p.length); } }
}
let cur = null, pend = [], sending = false, liveT = 0;
const toPad = (e) => { const r = pad.getBoundingClientRect(), c = (v) => Math.max(0, Math.min(1000, Math.round(v * 1000))); return [c((e.clientX - r.left) / r.width), c((e.clientY - r.top) / r.height)]; };
pad.addEventListener('pointerdown', (e) => {
  if (!room || !room.canWrite) return; e.preventDefault();
  try { pad.setPointerCapture(e.pointerId); } catch (er) { /* none */ }
  const id = Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
  const [x, y] = toPad(e);
  cur = { id, c: col, w: width, p: [x, y], sent: 0, fails: 0, done: false, pid: e.pointerId }; mine.set(id, cur);
  drawRemote(false); flush();
});
pad.addEventListener('pointermove', (e) => {
  if (!cur || e.pointerId !== cur.pid) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs) {
    const [x, y] = toPad(ev); const n = cur.p.length;
    if (Math.hypot(x - cur.p[n - 2], y - cur.p[n - 1]) < 4) continue;     // thin the points: ~4/1000 apart
    cur.p.push(x, y);
  }
  drawRemote(false);
});
const penUp = (e) => { if (!cur || e.pointerId !== cur.pid) return; cur.done = true; flush(); cur = null; };
pad.addEventListener('pointerup', penUp); pad.addEventListener('pointercancel', penUp);
// stream the new points every ~120 ms, one request in flight at a time
async function flush() {
  if (sending) return;
  const s = [...mine.values()].find((m) => m.sent < m.p.length || (m.done && !m.doneSent));
  if (!s) { $('pad-live').hidden = true; return; }
  sending = true; $('pad-live').hidden = false; clearTimeout(liveT);
  const pts = s.p.slice(s.sent), upto = s.p.length, done = s.done;
  const ok = await room.send({ op: 'stroke', id: s.id, c: s.c, w: s.w, p: pts, done });
  sending = false;
  if (ok) { s.sent = upto; s.fails = 0; if (done && upto === s.p.length) { s.doneSent = true; setTimeout(() => mine.delete(s.id), 4000); } }
  else if (++s.fails >= 3) { s.sent = s.p.length; s.doneSent = true; mine.delete(s.id); drawRemote(true); toast('That stroke didn\'t reach the hologram'); }
  setTimeout(flush, ok ? 110 : 800);
}
setInterval(() => { if (cur) flush(); }, 140);
$('d-undo').onclick = () => room && room.send({ op: 'undo' });
let clearArmed = 0;
$('d-clear').onclick = () => {
  if (!clearArmed) { clearArmed = setTimeout(() => { clearArmed = 0; $('d-clear').classList.remove('armed'); $('d-clear').textContent = 'Clear'; }, 3000); $('d-clear').classList.add('armed'); $('d-clear').textContent = 'Tap again to clear'; return; }
  clearTimeout(clearArmed); clearArmed = 0; $('d-clear').classList.remove('armed'); $('d-clear').textContent = 'Clear';
  mine.clear(); room.send({ op: 'clear' });
};

// ---------------------------------------------------------------- photos
let picked = null;                            // { blob, w, h, url }
async function resize(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  let src = bmp;
  if (!src) { const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); src = img; }
  const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight, k = Math.min(1, 1280 / Math.max(W, H));
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  let q = 0.85, blob;
  do { blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q)); q -= 0.15; } while (blob && blob.size > 850 * 1024 && q > 0.3);
  return { blob, w: c.width, h: c.height };
}
async function pick(file) {
  if (!file || !/^image\//.test(file.type)) { toast('Pick a photo'); return; }
  $('ph-status').textContent = 'Getting it ready…';
  try {
    const r = await resize(file); if (picked) URL.revokeObjectURL(picked.url);
    picked = { ...r, url: URL.createObjectURL(r.blob) }; $('ph-prev').src = picked.url; $('ph-fling').hidden = false; $('ph-status').textContent = '';
  } catch (e) { $('ph-status').textContent = 'Couldn\'t read that photo.'; }
}
$('ph-file').onchange = (e) => { pick(e.target.files[0]); e.target.value = ''; };
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); });
async function sendPhoto(fling) {
  if (!picked || !room) return;
  const p = picked; $('ph-send').disabled = true; $('ph-status').textContent = 'Beaming…';
  try { await room.sendPhoto(p.blob, p.w, p.h, from(), fling); toast(fling ? 'Flung into the hologram' : 'Photo beamed in'); buzz(15); $('ph-fling').hidden = true; picked = null; $('ph-status').textContent = ''; }
  catch (e) { $('ph-status').textContent = e.message || 'Couldn\'t send it'; }
  $('ph-send').disabled = false;
}
$('ph-send').onclick = () => sendPhoto(false);
$('ph-cancel').onclick = () => { $('ph-fling').hidden = true; picked = null; };
flingable($('ph-card'), () => sendPhoto(true));
function renderPhotos() {
  const L = $('ph-list'); L.innerHTML = '';
  const list = [...room.state.photos].reverse();
  list.forEach((p, i) => {
    const li = document.createElement('li'); if (i === 0) li.className = 'newest';
    const img = document.createElement('img'); img.src = room.photoUrl(p.id); img.alt = `Photo from ${p.from}`; img.loading = 'lazy';
    const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = i === 0 ? 'Showing now' : ago(p.at);
    li.append(img, tag);
    if (room.canWrite) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Remove'; b.setAttribute('aria-label', 'Remove this photo'); b.onclick = () => room.send({ op: 'unphoto', id: p.id }); li.appendChild(b); }
    L.appendChild(li);
  });
}

// ---------------------------------------------------------------- live poll
$('f-poll').onsubmit = async (e) => {
  e.preventDefault();
  const options = [...$('pl-opts').querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
  if (options.length < 2) { toast('Add at least two answers'); return; }
  const ok = await room.send({ op: 'poll', q: $('pl-q').value.trim(), options });
  if (ok) { toast('Poll is live in the hologram'); buzz(15); }
};
$('pl-end').onclick = () => room.send({ op: 'endpoll' });
$('pl-clear').onclick = () => room.send({ op: 'endpoll', clear: true });
function renderPoll() {
  const p = room.state.poll;
  $('pl-live').hidden = !p;
  if (!p) return;
  $('pl-live-q').textContent = p.q + (p.open ? '' : ' (closed)');
  $('pl-total').textContent = `${p.total} vote${p.total === 1 ? '' : 's'}`;
  $('pl-end').hidden = !p.open || !room.canWrite; $('pl-clear').hidden = !room.canWrite;
  const B = $('pl-bars'); const max = Math.max(...p.counts);
  if (B.children.length !== p.options.length || B.dataset.id !== p.id) {
    B.innerHTML = ''; B.dataset.id = p.id;
    p.options.forEach(() => { const d = document.createElement('div'); d.className = 'bar'; d.innerHTML = '<i></i><span></span><b></b>'; B.appendChild(d); });
  }
  p.options.forEach((o, i) => {
    const d = B.children[i]; d.querySelector('span').textContent = o; d.querySelector('b').textContent = p.counts[i];
    d.querySelector('i').style.width = (p.total ? (p.counts[i] / p.total) * 100 : 0) + '%';
    d.classList.toggle('win', max > 0 && p.counts[i] === max);
  });
}

// ---------------------------------------------------------------- speak it in (the browser's own speech-to-text)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, talking = false, sayT = 0, lastSaid = '', sayBusy = false, sayNext = null;
if (!SR) { $('v-mic').hidden = true; $('v-none').hidden = false; }
async function say(text, final) {
  sayNext = { text, final };
  if (sayBusy) return;
  while (sayNext) {
    const s = sayNext; sayNext = null; if (s.text === lastSaid && !s.final) continue;
    sayBusy = true; lastSaid = s.text; await room.send({ op: 'say', text: s.text, final: s.final, from: from() }, { quiet: true }); sayBusy = false;
  }
}
function micUi(on) { talking = on; $('v-mic').setAttribute('aria-pressed', String(on)); $('v-mic-t').textContent = on ? 'Stop talking' : 'Start talking'; }
const MIC_ERR = {
  'not-allowed': 'The microphone is blocked. Allow it for this site in your browser settings, then tap Start talking again.',
  'service-not-allowed': 'Speech-to-text is turned off on this device. On iPhone: Settings > General > Keyboard > Enable Dictation.',
  'audio-capture': 'No microphone found. Check one is plugged in and not used by another app.',
  network: 'Speech-to-text needs an internet connection. Check you are online and try again.',
  'language-not-supported': 'This browser can\'t do speech-to-text in your language yet.',
};
let micOk = false;
// ask for the mic ourselves first: it brings up the browser's permission prompt reliably (speech recognition alone
// often fails silently), and gives a clear message when it's blocked
async function askMic() {
  if (micOk || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return true;
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); micOk = true; return true; }
  catch (e) { toast(e && e.name === 'NotFoundError' ? MIC_ERR['audio-capture'] : MIC_ERR['not-allowed'], 6000); return false; }
}
$('v-mic').onclick = async () => {
  if (!room || !room.canWrite) return;
  if (talking) { try { rec.stop(); } catch (e) { /* stopped */ } micUi(false); return; }
  $('v-mic').disabled = true; const ok = await askMic(); $('v-mic').disabled = false; if (!ok) return;
  rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = navigator.language || 'en-US';
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalText = r[0].transcript.trim(); else interim += r[0].transcript; }
    const text = (interim || finalText).trim(); const isFinal = !interim;
    $('v-prev').textContent = text;
    clearTimeout(sayT);
    if (isFinal) say(text, true); else sayT = setTimeout(() => say(text, false), 180);
  };
  rec.onerror = (e) => { if (e.error === 'no-speech' || e.error === 'aborted') return; toast(MIC_ERR[e.error] || 'The mic stopped (' + e.error + '). Tap Start talking to try again.', 6000); micUi(false); };
  rec.onend = () => { if (talking) { try { rec.start(); } catch (e) { micUi(false); } } };
  try { rec.start(); micUi(true); buzz(10); } catch (e) { toast('The mic didn\'t start'); }
};

// ---------------------------------------------------------------- go live (the camera, streamed into the hologram)
let cam = null;   // { stream, host, id, facing }
let camFacing = 'user';
if (!canStream()) { $('cam-go').hidden = true; $('cam-none').hidden = false; }
function camStatus(t, on) { $('cam-status-t').textContent = t; $('cam-status').classList.toggle('on', !!on); }
const audioOn = () => $('cam-audio').getAttribute('aria-checked') === 'true';
$('cam-audio').onclick = () => { if (cam) return; const on = !audioOn(); $('cam-audio').setAttribute('aria-checked', String(on)); $('cam-audio').setAttribute('aria-label', on ? 'Sound on: tap to go live without sound' : 'Sound off: tap to include sound'); toast(on ? 'Your sound goes live too' : 'Going live without sound'); };
async function getCam(facing, audio) {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
    audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
  });
}
function showCam(stream, facing) {
  const v = $('cam-v'); v.srcObject = stream; v.play().catch(() => {});
  $('cam-box').classList.add('on'); $('cam-box').classList.toggle('mirror', facing === 'user');
}
const camAspect = () => { const v = $('cam-v'); return v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9; };
async function goLive() {
  if (!room || !room.canWrite || cam) return;
  $('cam-go').disabled = true; camStatus('Starting your camera…');
  let stream;
  try { stream = await getCam(camFacing, audioOn()); }
  catch (e) {
    $('cam-go').disabled = false;
    camStatus('Not live');
    toast(e && e.name === 'NotAllowedError' ? 'The camera is blocked. Allow it for this site in your browser settings, then try again.' : e && e.name === 'NotFoundError' ? 'No camera found on this device.' : 'The camera didn\'t start. Close other apps using it and try again.', 6000);
    return;
  }
  showCam(stream, camFacing);
  await new Promise((r) => { const v = $('cam-v'); if (v.videoWidth) r(); else { v.onloadedmetadata = () => r(); setTimeout(r, 1500); } });
  const v = await room.send({ op: 'live', on: true, aspect: camAspect(), audio: audioOn(), from: from() });
  if (!v || !v.live) { stream.getTracks().forEach((t) => t.stop()); $('cam-box').classList.remove('on'); $('cam-go').disabled = false; camStatus('Couldn\'t go live. Try again.'); return; }
  cam = { stream, id: v.live.id, host: new LiveHost(room, $('cam-v'), { onStatus: liveStatus }) };
  room.liveId = cam.id;
  cam.host.start(cam.id, stream);
  $('cam-go').disabled = false; buzz([15, 40, 15]); toast('You\'re live in the hologram');
  renderLive();
}
async function endLive(id) {
  const mine = cam && (!id || id === cam.id);
  if (mine) { cam.host.stop(); cam.stream.getTracks().forEach((t) => t.stop()); $('cam-v').srcObject = null; $('cam-box').classList.remove('on'); id = cam.id; cam = null; room.liveId = null; }
  await room.send({ op: 'live', on: false, id });
  renderLive();
}
function liveStatus({ peers, relay }) {
  if (!cam) return;
  const n = peers + relay;
  camStatus(n ? `Live · ${n} ${n === 1 ? 'phone' : 'phones'} watching${relay ? ` (${relay} on the light feed)` : ''}` : 'Live · waiting for viewers', true);
}
function renderLive() {
  const l = room && room.liveNow ? room.liveNow() : null;
  const mineOn = !!cam;
  $('cam-go-t').textContent = mineOn ? 'End live' : 'Go live';
  $('cam-go').setAttribute('aria-label', mineOn ? 'End live' : 'Go live');
  $('cam-go').classList.toggle('stop', mineOn);
  $('cam-box').classList.toggle('is-live', mineOn);
  $('cam-flip').hidden = !mineOn;
  $('cam-audio').hidden = mineOn;
  $('cam-audio').disabled = mineOn || !(room && room.canWrite);
  $('t-cam').classList.toggle('is-live', mineOn);
  const other = l && !mineOn;
  $('cam-other').hidden = !other;
  if (other) {
    $('cam-other').innerHTML = '';
    const t = document.createElement('span'); t.textContent = `${l.from} is live from another device. Going live here takes over.`;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary warn'; b.textContent = 'End their feed'; b.onclick = () => endLive(l.id);
    $('cam-other').append(t, b);
  }
  if (!mineOn) camStatus(other ? 'Someone else is live' : 'Not live');
  // someone else took over from this device
  if (mineOn && room.state && room.state.live && room.state.live.id !== cam.id) { toast('Someone else went live, so your feed stopped', 4000); endLive(cam.id); }
  if (mineOn && room.state && !room.state.live) { cam.host.stop(); cam.stream.getTracks().forEach((t) => t.stop()); $('cam-v').srcObject = null; $('cam-box').classList.remove('on'); cam = null; room.liveId = null; renderLive(); toast('The live feed was ended'); }
}
$('cam-go').onclick = () => (cam ? endLive() : goLive());
$('cam-flip').onclick = async () => {
  if (!cam) return;
  const next = camFacing === 'user' ? 'environment' : 'user';
  try {
    const s = await getCam(next, audioOn());
    cam.stream.getTracks().forEach((t) => t.stop());
    camFacing = next; cam.stream = s; cam.host.setStream(s); showCam(s, next);
    setTimeout(() => room.send({ op: 'live', on: true, id: cam.id, aspect: camAspect(), audio: audioOn() }, { quiet: true }), 900);
  } catch (e) { toast('Couldn\'t switch cameras'); }
};
$('cam-v').addEventListener('resize', () => { if (cam) room.send({ op: 'live', on: true, id: cam.id, aspect: camAspect(), audio: audioOn() }, { quiet: true }); });
// closing the tab ends the feed for everyone straight away (otherwise it times out after 25 s)
addEventListener('pagehide', () => {
  if (!cam || !room) return;
  try { navigator.sendBeacon(`/api/holocast/${room.code}`, new Blob([JSON.stringify({ op: 'live', on: false, id: cam.id, k: room.key, sid: room.sid })], { type: 'application/json' })); } catch (e) { /* gone */ }
});

// ---------------------------------------------------------------- what viewers see (screens on / off for everyone)
const SCREENS = [
  ['notice', 'Notice board'], ['globe', 'Where is Bobo? globe'], ['sketch', 'Live sketch'], ['photo', 'Photo drop'],
  ['poll', 'Live poll'], ['caption', 'Captions'], ['ticker', 'Activity ring'], ['reacts', 'Emoji reactions'],
];
function renderScreens() {
  const box = $('screens'), hide = (room.state && room.state.hide) || [];
  if (!box.children.length) {
    for (const [k, label] of SCREENS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sw-row'; b.setAttribute('role', 'switch'); b.dataset.k = k;
      b.innerHTML = '<span></span><i aria-hidden="true"></i>'; b.firstChild.textContent = label;
      b.disabled = !room.canWrite;
      b.onclick = async () => {
        const cur = new Set((room.state && room.state.hide) || []);
        if (cur.has(k)) cur.delete(k); else cur.add(k);
        b.setAttribute('aria-checked', String(!cur.has(k)));
        const ok = await room.send({ op: 'hide', hide: [...cur] });
        if (ok) toast(`${label} ${cur.has(k) ? 'hidden' : 'showing'} for everyone`); else renderScreens();
      };
      box.appendChild(b);
    }
  }
  for (const b of box.children) b.setAttribute('aria-checked', String(!hide.includes(b.dataset.k)));
}

// ---------------------------------------------------------------- hologram settings
function renderThemes() {
  const T = $('themes'); if (!T.children.length) {
    for (const [k, t] of Object.entries(THEMES)) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.t = k; b.style.setProperty('--c', t.c);
      b.innerHTML = `<i></i>${t.name}`; b.onclick = () => room.send({ op: 'theme', theme: k }); b.disabled = !room.canWrite; T.appendChild(b);
    }
  }
  T.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.t === room.state.theme)));
}
$('b-pulse').onclick = () => { room.send({ op: 'pulse' }); buzz(20); toast('Pulse sent'); };
$('f-title').onsubmit = (e) => { e.preventDefault(); room.send({ op: 'title', title: $('h-title').value }); toast('Saved'); };
async function copy(text, what) {
  try { if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ title: 'MEDIALIFE Holocast', text: what, url: text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch (e) { prompt('Copy this link', text); }
}
$('b-copy-ctl').onclick = () => copy(controlUrl(room.code, room.key), 'Control my hologram');
$('b-copy-view').onclick = () => copy(viewUrl(room.code), 'Watch my hologram');
function renderStats() {
  const s = room.state.stats; if (!s) return;
  $('stats').textContent = `${s.notices} notices · ${s.strokes} strokes · ${s.photos} photos · ${s.reactions} reactions so far`;
}

// ---------------------------------------------------------------- reactions coming back from the hologram
let seenR = Date.now() - 2000;
function showReactions() {
  const fresh = room.state.reactions.filter((r) => r.at > seenR); if (!fresh.length) return;
  seenR = Math.max(...fresh.map((r) => r.at));
  fresh.slice(-8).forEach((r, i) => setTimeout(() => {
    const g = (REACTIONS.find((x) => x.e === r.e) || {}).g || '✨';
    const s = document.createElement('span'); s.textContent = g; s.style.right = (6 + Math.random() * 30) + 'px';
    $('reacts').appendChild(s); setTimeout(() => s.remove(), 2600);
  }, i * 160));
}

// ---------------------------------------------------------------- open the hologram on a phone
function showHologram() {
  const url = viewUrl(room.code) + (room.key ? '#k=' + room.key : '');
  $('show-url').textContent = viewUrl(room.code);
  try { window.QRCode && QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('show-qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
  $('show').hidden = false;
}
$('b-show').onclick = showHologram;
$('show-close').onclick = () => { $('show').hidden = true; };
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('show').hidden = true; });

boot();
