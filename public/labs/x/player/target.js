// Test pictures for a MEDIALIFE AR Player experience: reads ../experience.json and shows each target's
// original picture; tap a card to show it full screen (tap again to fill the screen), arrows to step.
(async () => {
  const $ = (id) => document.getElementById(id);
  const base = new URL('../', location.href);
  const X = await fetch(new URL('experience.json', base)).then((r) => r.json());
  document.title = `${X.title} test pictures · MEDIALIFE Labs`;
  $('h').textContent = `${X.title}: test pictures`;
  const items = X.targets.filter((t) => t.picture).map((t) => ({ src: new URL(t.picture, base).href, title: t.label || t.name, what: t.what || '' }));
  items.forEach((it, i) => {
    const b = document.createElement('button'); b.className = 'card';
    b.innerHTML = '<img alt="" loading="lazy"><b></b><span></span>';
    b.querySelector('img').src = it.src; b.querySelector('b').textContent = it.title; b.querySelector('span').textContent = it.what;
    b.onclick = () => open(i); $('grid').appendChild(b);
  });
  let at = 0, opener = null;
  const show = () => { const it = items[at]; $('v-img').src = it.src; $('v-img').alt = it.title; $('v-text').textContent = `${at + 1} of ${items.length}: ${it.title}`; $('view').classList.remove('big'); };
  function open(i) { at = i; opener = document.activeElement; show(); $('view').hidden = false; $('v-close').focus(); if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }
  function close() { $('view').hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); opener && opener.focus(); }
  const step = (d) => { at = (at + d + items.length) % items.length; show(); };
  $('v-prev').onclick = () => step(-1); $('v-next').onclick = () => step(1); $('v-close').onclick = close;
  $('v-img').onclick = () => $('view').classList.toggle('big');   // tap to enlarge (fill the screen)
  $('v-prev').hidden = $('v-next').hidden = items.length < 2;
  addEventListener('keydown', (e) => { if ($('view').hidden) return; if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'Escape') close(); });
})();
