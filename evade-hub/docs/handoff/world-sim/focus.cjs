const { launch, shot, sleep, waitFor, BASE } = require('./lib.cjs');
(async () => {
  const { browser, page } = await launch();
  await page.goto(`${BASE}/evade/hub/?test&desktop`, { waitUntil: 'load' });
  await waitFor(page, () => { const b = document.querySelector('.cbx-start'); return b && !b.disabled; });
  await page.click('.cbx-start'); await sleep(6000);
  for (const id of ['where-is-bobo', 'bobo-portal', 'vault']) {
    await page.evaluate((id) => { const sc = window.__cbx.internals.showcase; const st = window.__cbx.internals.stages.showcase; sc.goToCabinet(st.houseSet.cabinets.find((c) => c.item.id === id)); }, id);
    await sleep(7500);
    console.log(id, await page.evaluate((id) => { const sc = window.__cbx.internals.showcase, hs = window.__cbx.internals.stages.showcase.houseSet; const c = hs.cabinets.find((c) => c.item.id === id); const r = (v) => v.toArray().map((x) => +x.toFixed(2));
      return JSON.stringify({ cam: r(sc.cam.position), scr: r(hs.cabinetScreen(c)), front: r(hs.cabinetFront(c)), focus: sc.focus, actor: r(window.__cbx.internals.stages.showcase.actor.position) }); }, id));
    await shot(page, 'f-' + id);
    await page.evaluate(() => document.querySelectorAll('.cbx-sheet-wrap .row .btn, [aria-label="Close"]').forEach((b) => b.click()));
    await sleep(800);
  }
  await browser.close();
})();
