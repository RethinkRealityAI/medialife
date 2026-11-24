// Float Notes: sticky notes left floating in the air round your room (from the 8th Wall "floatnoates" sample,
// A-Frame -> plain three.js).
//
// Kept from the sample (src/note-creator.js): New note opens a text field; when you finish, a note in a random
// colour from the same palette appears where a "hold anchor" 3 units in front of the camera was, turned to face
// you; tap a note to edit its text; the trash button gives every note gravity so they all fall and disappear.
// Changed: the text is drawn on the note with a canvas (no A-Frame text), the field has Save / Delete / Cancel
// (the sample edited only on keyboard blur), notes fall to the tracked floor and bounce before they vanish (no
// physics engine), notes are ~16 cm and appear 60 cm in front of you, and Move (bottom right) picks up the last
// note you touched: it rides in front of the phone until you tap Drop.
import { createDemo, THREE, clamp, backOut } from '../shared/shell.js';

const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55']; // the sample's
const NOTE = 0.16, DEPTH = 0.008, HOLD = 0.6, MAX_NOTES = 30;
const notes = []; // { mesh, text, color, tex, born, fall:{v,spin}|null, dead }
let editing = null, carry = null, last = null;

const demo = createDemo({
  slug: 'float-notes', mode: 'world', tag: 'Notes',
  title: 'Float Notes', titleHtml: 'Float <span>Notes</span>',
  lead: 'Leave sticky notes floating in the air around your room. Tap one to change it, or drop them all.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><rect x="70" y="80" width="90" height="90" fill="#ffcc00" transform="rotate(-8 115 125)"/><rect x="140" y="120" width="90" height="90" fill="#5ac8fa" transform="rotate(6 185 165)"/></svg>`,
  how: [
    '<b>New note</b> opens a text box. Type, then tap <b>Save</b>: the note floats where your phone is pointing.',
    '<b>Tap a note</b> to change it or delete it.',
    '<b>Drop all</b> lets every note fall to the floor.',
    '<b>Move</b> (bottom right) picks up the last note you touched. Point where you want it and tap <b>Drop</b>.',
  ],
  placement: 'custom',
  hero() {
    const g = new THREE.Group();
    [['Hello!', '#ffcc00', -0.06, 0.04, -0.15], ['Ideas', '#5ac8fa', 0.07, -0.05, 0.12], ['MEDIALIFE', '#ff2d55', 0.0, 0.12, 0.05]].forEach(([t, c, x, y, r]) => {
      const m = makeNote(t, c).mesh; m.position.set(x, y, 0); m.rotation.z = r; g.add(m);
    });
    return g;
  },
  build(d) { buildUi(d); },
  onLive(d) { d.hint('Tap New note to write your first one'); },
  onTap(ndc, d) {
    if (carry) { drop(d); return true; }
    if (editing !== null) return true;
    d.rayFrom(ndc);
    const hit = d.raycaster.intersectObjects(notes.filter((n) => !n.fall).map((n) => n.mesh), false)[0];
    if (hit) { const n = notes.find((x) => x.mesh === hit.object); last = n; openEditor(d, n); }
    return true;
  },
  onMove(d) {
    const n = last && !last.fall && notes.includes(last) ? last : [...notes].reverse().find((x) => !x.fall);
    if (!n) return;
    carry = n; d.hint('Point where you want it, then tap Drop');
    setMoveLabel(d, 'Drop'); d.moveBtn.onclick = () => drop(d);
  },
  update(dt, d, now) {
    const cam = d.camera;
    if (carry) { holdPose(cam, tmpP, tmpQ); carry.mesh.position.lerp(tmpP, 1 - Math.exp(-12 * dt)); carry.mesh.quaternion.slerp(tmpQ, 1 - Math.exp(-12 * dt)); }
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      const t = (now - n.born) / 450; if (!(n.fall && n.fall.landed)) n.mesh.scale.setScalar(Math.max(1e-3, backOut(t)));
      if (n.fall) {
        const f = n.fall;
        f.v.y -= 9.8 * dt; n.mesh.position.addScaledVector(f.v, dt);
        n.mesh.rotateX(f.spin * dt);
        if (n.mesh.position.y < 0.01) { n.mesh.position.y = 0.01; f.v.y *= -0.35; f.v.x *= 0.6; f.v.z *= 0.6; f.spin *= 0.5; if (!f.landed) f.landed = now; }
        if (f.landed && now - f.landed > 900) {
          const k = 1 - clamp((now - f.landed - 900) / 400, 0, 1); n.mesh.scale.setScalar(Math.max(1e-3, k));
          if (k <= 0) { d.scene.remove(n.mesh); n.tex.dispose(); notes.splice(i, 1); }
        }
      }
    }
    d.moveBtn.hidden = !notes.some((n) => !n.fall);
  },
});

const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
function holdPose(cam, p, q) { // the sample's holdAnchor: in front of the camera, facing it, kept upright
  const f = new THREE.Vector3(); cam.getWorldDirection(f);
  p.copy(cam.position).addScaledVector(f, HOLD);
  const yaw = Math.atan2(-f.x, -f.z), pitch = Math.asin(clamp(f.y, -1, 1));
  q.setFromEuler(new THREE.Euler(pitch * 0.6, yaw, 0, 'YXZ'));
}

// ------------------------------------------------------------------ notes
function drawNote(c, text, color) {
  const S = 512, g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 0, S, 40); // the sticky strip, one flat shade
  const dark = ['#ffcc00', '#4cd964', '#5ac8fa', '#ff9500'].includes(color);
  g.fillStyle = dark ? '#151515' : '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let size = 92, lines;
  for (; size >= 34; size -= 6) { // biggest size that fits in 5 lines (the sample wrapped at 15 chars)
    g.font = `700 ${size}px "Space Grotesk", system-ui, sans-serif`;
    lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > S - 70 && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    if (lines.length * size * 1.15 < S - 110 && lines.every((l) => g.measureText(l).width < S - 50)) break;
  }
  const lh = size * 1.15, y0 = S / 2 + 18 - (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => g.fillText(l, S / 2, y0 + i * lh, S - 50));
}
function makeNote(text, color) {
  const c = document.createElement('canvas'); c.width = c.height = 512; drawNote(c, text, color);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const side = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(NOTE, NOTE, DEPTH), [side, side, side, side, front, side]);
  return { mesh, tex, canvas: c, text, color };
}
function addNote(d, text) {
  const n = makeNote(text, COLORS[Math.floor(Math.random() * COLORS.length)]);
  holdPose(d.camera, n.mesh.position, n.mesh.quaternion);
  n.born = performance.now(); n.fall = null; d.scene.add(n.mesh); notes.push(n); last = n;
  const alive = notes.filter((x) => !x.fall); if (alive.length > MAX_NOTES) dropOne(alive[0]);
  d.hint('');
  return n;
}
function setText(n, text) { n.text = text; drawNote(n.canvas, text, n.color); n.tex.needsUpdate = true; }
function dropOne(n) { n.fall = { v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.4, (Math.random() - 0.5) * 0.3), spin: (Math.random() - 0.5) * 6 }; if (carry === n) carry = null; }
function drop(d) { carry = null; setMoveLabel(d, 'Move'); d.moveBtn.onclick = () => d.startMove(); d.hint(''); }
function setMoveLabel(d, t) { d.moveBtn.querySelector('span').textContent = t; }

// ------------------------------------------------------------------ UI: New note, Drop all, the editor
let ui = {};
function buildUi(d) {
  const ed = document.createElement('form'); ed.className = 'editor card-panel'; ed.hidden = true; ed.autocomplete = 'off';
  ed.innerHTML = `<label for="note-in" class="ed-t">New note</label>
    <input id="note-in" type="text" maxlength="80" placeholder="Write something…" enterkeyhint="done">
    <div class="ed-row"><button type="button" id="ed-del" class="ed-del">Delete</button><button type="button" id="ed-cancel">Cancel</button><button type="submit" class="primary" id="ed-save">Save</button></div>`;
  const row = document.createElement('div'); row.className = 'note-row';
  row.innerHTML = `<button type="button" id="b-drop" class="tool" aria-label="Drop all notes"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg><span>Drop all</span></button>
    <button type="button" id="b-new" class="primary">+ New note</button>`;
  d.panel.appendChild(ed); d.panel.appendChild(row);
  ui = { ed, row, input: ed.querySelector('#note-in'), title: ed.querySelector('.ed-t'), del: ed.querySelector('#ed-del') };
  row.querySelector('#b-new').onclick = () => openEditor(d, null);
  row.querySelector('#b-drop').onclick = () => { const live = notes.filter((n) => !n.fall); if (!live.length) return d.toast('No notes yet'); live.forEach(dropOne); };
  ed.addEventListener('submit', (e) => { e.preventDefault(); save(d); });
  ed.querySelector('#ed-cancel').onclick = () => closeEditor();
  ui.del.onclick = () => { if (editing) { const n = editing; closeEditor(); dropOne(n); } };
}
function openEditor(d, n) {
  editing = n || 0; // 0 = a new note
  ui.title.textContent = n ? 'Edit note' : 'New note';
  ui.input.value = n ? n.text : ''; ui.del.hidden = !n;
  ui.ed.hidden = false; ui.row.hidden = true;
  ui.input.focus();
}
function closeEditor() { editing = null; ui.ed.hidden = true; ui.row.hidden = false; ui.input.blur(); }
function save(d) {
  const text = ui.input.value.trim();
  if (editing) { if (text) setText(editing, text); last = editing; }
  else if (text) addNote(d, text);
  closeEditor();
}

window.__notes = {
  add(text) { openEditor(demo, null); ui.input.value = text; save(demo); },
  get list() { return notes.map((n) => ({ text: n.text, fall: !!n.fall, p: n.mesh.position.toArray().map((x) => +x.toFixed(2)) })); },
  screenOf(i) { const v = notes[i].mesh.position.clone().project(demo.camera); const r = demo.canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
  get carrying() { return !!carry; },
};
