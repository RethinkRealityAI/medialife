// Talk to Misa: a chat character on your floor (from the 8th Wall "chatbot" sample, A-Frame -> plain three.js).
//
// Kept from the sample (src/app.js): the chat UI that keeps the last two messages, typing makes her TALK, keyword
// commands (breakdance, backflip, shopping, party, dance) play the whole clip once with a line in character and
// skip the reply engine, replies carry an emotion (HAPPY / SAD / ANGRY -> one-shot clip, TALK -> talk briefly,
// WALK -> walk loop), clip names are matched loosely ("IDLE.001" == "IDLE").
// Changed: the sample sent every message to OpenAI from the browser through a hosted secret slot. Here the reply
// engine is LOCAL (scripted keywords, no network, no key). To use a real model, set CHAT_ENDPOINT to a server route
// that holds the key and answers { reply, emotion } (SYSTEM_PROMPT below is the sample's persona to use there).
import { createDemo, THREE, MEDIA, loadGLB, fitTo, contactShadow, qs } from '../shared/shell.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ------------------------------------------------------------------ server hook (off by default)
// e.g. '/api/labs/misa': POST { message, history:[{who,text}] } -> { reply: string, emotion: 'HAPPY'|'SAD'|'ANGRY'|'TALK'|'WALK'|'IDLE' }
const CHAT_ENDPOINT = qs.get('bot') && /^\/api\//.test(qs.get('bot')) ? qs.get('bot') : null;
export const SYSTEM_PROMPT = `You are "Misa", a tiny anime-style girl (tsundere). Easily offended, but cute. Your emotions can swing
from happy to sad to angry. Keep it PG. Return ONLY valid JSON: {"reply":"string","emotion":"HAPPY|SAD|ANGRY|TALK|WALK|IDLE"}
1-2 sentences. Compliments -> HAPPY. Teasing/insults -> ANGRY (cute). Apologies -> SAD/IDLE. Move/walk/follow -> WALK.
Otherwise -> TALK/IDLE.`;

const HEIGHT = 0.55; // Misa is ~55 cm on the floor at size 1 (starts at 1.3x = ~70 cm; pinch 0.5x-2.5x while placing)
const norm = (n) => String(n || '').toUpperCase().replace(/[^A-Z]/g, '');
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let gltf = null, misa = null, mixer = null, clips = [], current = null, oneShot = null, typingT = 0, walkT = 0, busy = false;
const history = [];
let lastEmotion = null;

const demo = createDemo({
  slug: 'robot-chat', mode: 'world', tag: 'Chat',
  title: 'Talk to Misa', titleHtml: 'Talk to <span>Misa</span>',
  lead: 'Put Misa on your floor and chat with her. Say "dance", "backflip" or "party" and she acts it out.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><rect x="70" y="60" width="160" height="90" rx="22" fill="#4fd6e8"/><path d="M110 150l-6 30 34-30z" fill="#4fd6e8"/><circle cx="115" cy="105" r="9" fill="#0a1c2a"/><circle cx="150" cy="105" r="9" fill="#0a1c2a"/><circle cx="185" cy="105" r="9" fill="#0a1c2a"/></svg>`,
  how: [
    '<b>Find the floor.</b> Move your phone slowly, then tap <b>Place here</b>. Pinch first to make her bigger or smaller.',
    '<b>Chat.</b> Type below. Be nice and she\'s happy; tease her and she gets cross.',
    '<b>Ask for a move.</b> "dance", "breakdance", "backflip", "party", "shopping", "walk".',
    '<b>Move</b> (bottom right) puts her somewhere else.',
  ],
  size: [0.5, 2.5, 1.3],
  placeHint: 'Tap Place here to put Misa down',
  async load(d) {
    gltf = await loadGLB(MEDIA + 'misa.glb');
    d.progress(0.9);
  },
  hero() {
    const o = SkeletonUtils.clone(gltf.scene); fitTo(o, 1);
    const m = new THREE.AnimationMixer(o); const idle = findClip('IDLE'); idle && m.clipAction(idle).play();
    o.userData.mixer = m; return o;
  },
  build(d) {
    misa = gltf.scene; fitTo(misa, HEIGHT);
    misa.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    d.stage.add(contactShadow(0.16, 0.4)); d.stage.add(misa);
    mixer = new THREE.AnimationMixer(misa);
    mixer.addEventListener('finished', (e) => { if (oneShot && e.action === oneShot) { oneShot = null; play('IDLE'); } });
    play('IDLE');
    buildChat(d);
  },
  onPlaced(d, first) {
    if (first) setTimeout(() => say({ who: 'misa', text: 'H-hey. You put me on the floor? Fine. Say something, then.' }, 'TALK'), 500);
  },
  update(dt, d) {
    mixer && mixer.update(dt);
    if (!misa) return;
    // WALK: a small loop round the spot she was placed on, then back to where she stood
    if (walkT > 0) {
      walkT -= dt; const a = (6 - walkT) * 0.9, r = 0.18;
      misa.position.set(Math.sin(a) * r, 0, (Math.cos(a) - 1) * r);
      misa.rotation.y = a + Math.PI / 2;
      if (walkT <= 0) { misa.position.set(0, 0, 0); misa.rotation.y = 0; play('IDLE'); }
    }
  },
});

// ------------------------------------------------------------------ animation
function findClip(name) {
  const w = norm(name);
  return gltf.animations.find((c) => norm(c.name) === w) || gltf.animations.find((c) => norm(c.name).includes(w)) || null;
}
function play(name, once = false) {
  if (!mixer) return;
  const clip = findClip(name) || findClip('IDLE');
  const a = mixer.clipAction(clip);
  if (a === current && !once) return;
  a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
  if (current) a.crossFadeFrom(current, 0.25, false);
  a.play(); current = a; oneShot = once ? a : null;
}

// ------------------------------------------------------------------ chat UI (sample: keep the last 2 messages)
let log, input;
function buildChat(d) {
  const wrap = document.createElement('div'); wrap.className = 'chat';
  wrap.innerHTML = `<div class="log" id="chatlog" aria-live="polite"></div>
    <form id="chatform" autocomplete="off"><label class="sr" for="chatinput">Message Misa</label>
    <input id="chatinput" type="text" maxlength="160" placeholder="Talk to Misa…" enterkeyhint="send">
    <button id="chatsend" class="primary" type="submit" aria-label="Send">Send</button></form>`;
  d.panel.appendChild(wrap);
  log = wrap.querySelector('#chatlog'); input = wrap.querySelector('#chatinput');
  wrap.querySelector('#chatform').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); input.value = ''; });
  input.addEventListener('input', () => {
    if (oneShot || walkT > 0) return;
    play('TALK'); clearTimeout(typingT); typingT = setTimeout(() => { if (!oneShot && walkT <= 0) play('IDLE'); }, 600);
  });
  wrap.hidden = true; d.chat = wrap;
}
function say({ who, text }) {
  const row = document.createElement('div'); row.className = 'msg ' + who;
  row.innerHTML = `<b>${who === 'you' ? 'You' : 'Misa'}</b><span></span>`; row.lastChild.textContent = text;
  log.appendChild(row); while (log.children.length > 2) log.firstElementChild.remove();
  history.push({ who, text }); if (history.length > 12) history.shift();
}

// ------------------------------------------------------------------ keyword commands (sample, most specific first)
const word = (t, w) => new RegExp(`\\b${w}\\b`, 'i').test(t);
const COMMANDS = [
  { key: 'BREAKDANCE', match: (t) => word(t, 'breakdance') || /\bbreak\s+dance\b/i.test(t) || /\b(b[-\s]?boy|b[-\s]?girl|bboy|bgirl)\b/i.test(t) },
  { key: 'BACKFLIP', match: (t) => word(t, 'backflip') || /\b(do\s+a\s+)?flip\b/i.test(t) },
  { key: 'SHOPPING', match: (t) => word(t, 'shopping') || word(t, 'shop') || /\b(go\s+shopping|buy\s+stuff)\b/i.test(t) },
  { key: 'PARTY', match: (t) => word(t, 'party') || /\bparty\s*time\b/i.test(t) || /\bcelebrate\b/i.test(t) },
  { key: 'DANCE', match: (t) => word(t, 'dance') || word(t, 'dancing') || /\b(boogie|groove)\b/i.test(t) },
];
const REACTIONS = {
  BREAKDANCE: ['W-why are you staring?! Fine… I\'ll show you.', 'Hmph! Don\'t expect perfection… b-but watch this!', 'I-I can totally do this! It\'s not for you or anything!'],
  DANCE: ['O-okay… just a little. Don\'t get weird about it.', 'Fine! I\'ll dance… but only because I feel like it.', 'W-watch closely… not that I care what you think!'],
  BACKFLIP: ['Eek! I mean… easy. Totally easy.', 'D-don\'t distract me! If I land this it\'s your fault!', 'One flip. That\'s it. Don\'t ask for more!'],
  PARTY: ['P-party?! Ugh… fine. I\'ll tolerate fun.', 'Okay… okay… just don\'t make it cringe!', 'Hmph… I guess a little celebration is… acceptable.'],
  SHOPPING: ['Shopping?! Don\'t slow me down, okay?', 'If you pick something tacky, I\'m judging you.', 'Fine… but I\'m not carrying your bags!'],
};

// ------------------------------------------------------------------ the local reply engine (no network, no key)
const RULES = [
  { re: /\b(walk|follow|move around|come here|stroll)\b/i, emotion: 'WALK', lines: ['Fine, I\'ll walk. Not because you asked.', 'Ugh, okay, a little walk. Keep up!'] },
  { re: /\b(sorry|apolog|my bad|forgive)\b/i, emotion: 'SAD', lines: ['…It\'s fine. I wasn\'t upset anyway.', 'Hmph. Apology accepted. This time.'] },
  { re: /\b(stupid|dumb|ugly|annoying|hate you|boring|weird|baka|lame|short|tiny)\b/i, emotion: 'ANGRY', lines: ['Excuse me?! Take that back!', 'Wow. Rude. I\'m not talking to you. …Okay, I am, but I\'m mad.', 'Tch! Say that again and see what happens!'] },
  { re: /\b(cute|pretty|cool|awesome|amazing|love you|best|great|nice|beautiful|smart|clever)\b/i, emotion: 'HAPPY', lines: ['W-what? Well… obviously. Thanks, I guess.', 'Hmph. You have good taste, at least.', 'D-don\'t say things like that so suddenly!'] },
  { re: /\b(sad|tired|lonely|bad day|upset)\b/i, emotion: 'SAD', lines: ['Oh… that\'s rough. I-I\'m here, I suppose.', 'Want me to dance? It might help. Maybe.'] },
  { re: /\b(hi|hello|hey|yo|sup|good (morning|evening|afternoon))\b/i, emotion: 'HAPPY', lines: ['Oh. Hi. I wasn\'t waiting for you or anything.', 'Hey. You took your time.'] },
  { re: /\b(who are you|your name|what are you)\b/i, emotion: 'TALK', lines: ['I\'m Misa. Remember it, because I\'m not saying it twice.', 'Misa. A very small, very important character on your floor.'] },
  { re: /\b(medialife|labs|ar|augmented)\b/i, emotion: 'TALK', lines: ['MEDIALIFE puts characters like me in your room. You\'re welcome.', 'This is a Labs demo. I\'m the best one, obviously.'] },
  { re: /\b(what can you do|help|commands|tricks)\b/i, emotion: 'TALK', lines: ['Ask me to dance, breakdance, backflip, party or go shopping. Or walk. If you\'re nice.'] },
  { re: /\b(bye|goodbye|see you|later)\b/i, emotion: 'SAD', lines: ['Leaving already? F-fine. Bye.', 'Hmph. Come back soon. Or don\'t. Whatever.'] },
  { re: /\?\s*$/, emotion: 'TALK', lines: ['Hmm. That\'s a hard one. Ask me something easier, like to dance.', 'Why are you asking me? …Okay, I don\'t know.'] },
];
const FALLBACK = [{ emotion: 'TALK', lines: ['Uh-huh. And?', 'Interesting. I guess.', 'Is that so? Tell me more. Not that I care.'] }];
async function replyFor(text) {
  if (CHAT_ENDPOINT) { // server hook: the key stays on the server
    try {
      const r = await fetch(CHAT_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, history }) });
      if (r.ok) { const j = await r.json(); if (j && j.reply) return { reply: String(j.reply), emotion: String(j.emotion || 'IDLE').toUpperCase() }; }
    } catch (e) { /* fall back to the local bot */ }
  }
  const rule = RULES.find((r) => r.re.test(text)) || FALLBACK[0];
  await new Promise((r) => setTimeout(r, 450 + Math.random() * 350)); // a beat, so it feels like a reply
  return { reply: pick(rule.lines), emotion: rule.emotion };
}
function quirks(reply, emotion) { // sample's applyEmotionQuirks, without emoji
  if (emotion === 'ANGRY' && !/baka/i.test(reply) && Math.random() < 0.6) return reply + pick([' Hmph!', ' Tch!', ' Oi!']);
  return reply;
}

async function send(raw) {
  const text = (raw || '').trim();
  if (!text || busy) return;
  say({ who: 'you', text });
  clearTimeout(typingT);
  const cmd = COMMANDS.find((c) => c.match(text));
  if (cmd) { walkT = 0; misa.position.set(0, 0, 0); misa.rotation.y = 0; play(cmd.key, true); say({ who: 'misa', text: pick(REACTIONS[cmd.key]) }); lastEmotion = cmd.key; return; }
  busy = true;
  try {
    const { reply, emotion } = await replyFor(text);
    say({ who: 'misa', text: quirks(reply, emotion) }); lastEmotion = emotion;
    if (emotion === 'WALK') { walkT = 6; play('WALK'); }
    else if (emotion === 'TALK') { play('TALK'); setTimeout(() => { if (!oneShot && walkT <= 0) play('IDLE'); }, 1400); }
    else if (['HAPPY', 'SAD', 'ANGRY'].includes(emotion)) play(emotion, true);
    else play('IDLE');
  } finally { busy = false; }
}
// the chat shows once Misa is on the floor (the Place button needs the dock first)
const _onPlaced = demo.cfg.onPlaced;
demo.cfg.onPlaced = (d, first) => { d.chat.hidden = false; _onPlaced(d, first); };
const _onMove = demo.cfg.onMove;
demo.cfg.onMove = (d) => { d.chat.hidden = true; _onMove && _onMove(d); };

window.__misa = { send, play, get clip() { return current && current.getClip().name; }, get last() { return lastEmotion; }, get log() { return [...log.children].map((r) => r.textContent); } };
