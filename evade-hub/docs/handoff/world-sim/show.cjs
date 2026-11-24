const { launch, shot, sleep, waitFor, errorsOf, BASE } = require('./lib.cjs');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const { browser, page, logs } = await launch();
  const events = [];
  await page.exposeFunction('__ev', (e) => events.push(e));
  await page.goto(`${BASE}/evade/hub/?test&desktop`, { waitUntil: 'load' });
  await waitFor(page, () => window.__cbx && window.__cbx.on);
  await page.evaluate(() => window.__cbx.on('arcade', (p) => window.__ev(JSON.stringify(p))));
  await waitFor(page, () => { const b = document.querySelector('.cbx-start'); return b && !b.disabled; });
  await sleep(1500);
  await shot(page, 'w-01-splash');
  await page.click('.cbx-start');
  await waitFor(page, () => { const d = window.__cbx.debug(); return d.mode === 'showcase' && d.entered; });
  await sleep(5000);
  await shot(page, 'w-02-3d-start');
  log('debug', JSON.stringify(await page.evaluate(() => { const d = window.__cbx.debug(); return { fps: d.fps, p: d.showcasePrograms, pw: d.showcaseProgramsAfterWarm }; })));
  await page.evaluate(() => { window.__cbx.internals.showcase.yaw = 1.15; });
  await sleep(3000);
  await shot(page, 'w-02b-3d-look');
  // project every cabinet's screen to the page
  const cabs = await page.evaluate(() => {
    const sc = window.__cbx.internals.showcase, st = window.__cbx.internals.stages.showcase;
    const hs = st.houseSet; const out = [];
    for (const c of hs.cabinets) { const p = hs.cabinetScreen(c); st.root.localToWorld(p); p.project(sc.cam); out.push({ id: c.item.id, x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, z: p.z }); }
    return out;
  });
  log('cabs', JSON.stringify(cabs.map((c) => [c.id, Math.round(c.x), Math.round(c.y)])));
  const vis = cabs.filter((c) => c.x > 30 && c.x < 360 && c.y > 150 && c.y < 650 && c.z < 1).sort((a, b) => Math.abs(a.x - 195) - Math.abs(b.x - 195));
  if (vis.length) {
    const c = vis[0];
    await page.touchscreen.tap(c.x, c.y);
    log('tapped', c.id);
    await sleep(2500);
    await shot(page, 'w-03-cabinet-walk');
    await sleep(6000);
    await shot(page, 'w-04-cabinet-card');
  }
  log('arcade events', events.join(' '));
  await page.evaluate(() => window.__cbx.trigger('Dance'));
  await sleep(3000);
  await shot(page, 'w-05-dance');
  log('programs', JSON.stringify(await page.evaluate(() => { const d = window.__cbx.debug(); return { p: d.showcasePrograms, pw: d.showcaseProgramsAfterWarm, fps: d.fps }; })));
  const errs = errorsOf(logs);
  log('errors', errs.length ? errs.slice(0, 20).join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
