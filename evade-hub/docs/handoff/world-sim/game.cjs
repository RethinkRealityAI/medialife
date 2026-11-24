const { launch, shot, sleep, waitFor, errorsOf, BASE } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await launch();
  await page.goto(`${BASE}/evade/hub/?test&desktop`, { waitUntil: 'load' });
  await waitFor(page, () => { const b = document.querySelector('.cbx-start'); return b && !b.disabled; });
  await page.click('.cbx-start'); await sleep(4000);
  const p0 = await page.evaluate(() => window.__cbx.debug().showcasePrograms);
  console.log('run', await page.evaluate(() => window.__cbx.startPlay('heart-run')));
  await sleep(9000); await shot(page, 'world-3d-04-can-dash');
  await page.evaluate(() => window.__cbx.stopPlay()); await sleep(1500);
  console.log('hoops', await page.evaluate(() => window.__cbx.startPlay('heart-hoops')));
  await sleep(9000); await shot(page, 'world-3d-05-paw-hoops');
  console.log('programs', p0, await page.evaluate(() => window.__cbx.debug().showcasePrograms));
  console.log(errorsOf(logs).slice(0, 10).join('\n') || 'no errors');
  await browser.close();
})();
