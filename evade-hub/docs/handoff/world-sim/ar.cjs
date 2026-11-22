const path = require('path');
const { launch, shot, sleep, waitFor, errorsOf, BASE } = require('./lib.cjs');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const T = 300000;
const dbg = (page) => page.evaluate(() => window.__cbx.debug());
const click = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) throw new Error('no ' + sel); e.click(); }, sel);
(async () => {
  const { browser, page, logs } = await launch({ video: path.join(__dirname, 'floor.y4m') });
  const events = [];
  await page.exposeFunction('__ev', (e) => events.push(e));
  await page.goto(`${BASE}/evade/hub/?test&desktop`, { waitUntil: 'load' });
  await waitFor(page, () => { const b = document.querySelector('.cbx-start'); return b && !b.disabled; }, null, T);
  await page.evaluate(() => window.__cbx.on('arcade', (p) => window.__ev(JSON.stringify(p))));
  await click(page, '.cbx-start');
  await waitFor(page, () => { const d = window.__cbx.debug(); return d.mode === 'showcase' && d.entered; }, null, T);
  await sleep(2000);
  await click(page, '.cbx-switch [data-mode=ar]');
  await waitFor(page, () => { const d = window.__cbx.debug(); return d.mode === 'ar' && d.entered; }, null, T);
  log('ar live');
  await waitFor(page, () => window.__cbx.debug().settled, null, T);
  await waitFor(page, () => { const b = document.querySelector('.cbx-slot-centre .cbx-pill'); return b && !b.disabled; }, null, T);
  await sleep(2000);
  await shot(page, 'world-ar-01-placing');
  const p0 = (await dbg(page)).enginePrograms;
  await click(page, '.cbx-slot-centre .cbx-pill');
  await waitFor(page, () => window.__cbx.debug().ar.placed, null, T);
  await sleep(4000);
  log('placed; programs', p0, (await dbg(page)).enginePrograms);
  await shot(page, 'world-ar-02-placed');
  // the door opens a beat after Place (or on its ~10 s cap in the sim)
  await waitFor(page, () => window.__cbx.internals.stages.ar.houseSet.open > 0.9, null, 60000).catch(() => log('door did not open in time'));
  // stand a step in front of the door, looking through it (test pose, door-local metres)
  await page.evaluate(() => { const ar = window.__cbx.internals.modes.get('ar'); ar.walk.testPose = { x: 0.15, y: 1.35, z: 1.6, yaw: 0, pitch: -0.12 }; });
  await sleep(3500);
  await shot(page, 'world-ar-03-door');
  log('programs at door', (await dbg(page)).enginePrograms);
  // walk in through the doorway
  for (const z of [0.8, 0.2, -0.4, -1.2]) {
    await page.evaluate((z) => { window.__cbx.internals.modes.get('ar').walk.testPose.z = z; }, z);
    await sleep(1500);
  }
  await sleep(2500);
  log('inside?', JSON.stringify((await dbg(page)).ar), 'programs', (await dbg(page)).enginePrograms);
  await shot(page, 'world-ar-04-inside');
  await page.evaluate(() => { window.__cbx.internals.modes.get('ar').walk.testPose.yaw = 0.9; });
  await sleep(3000);
  await shot(page, 'world-ar-05-inside-arcade');
  // tap a machine (by id: goToCabinet, the same path a tap takes)
  await page.evaluate(() => { const ar = window.__cbx.internals.modes.get('ar'); ar.walk.testPose.yaw = 0; ar.goToCabinet(window.__cbx.internals.stages.ar.houseSet.cabinets[0].item.id); });
  await sleep(9000);
  await shot(page, 'world-ar-06-machine');
  log('arcade events', events.join(' '));
  log('final', JSON.stringify(await dbg(page)));
  const errs = errorsOf(logs);
  log('errors', errs.length ? errs.slice(0, 20).join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
