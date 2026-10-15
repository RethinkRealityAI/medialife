/**
 * The illustrative earnings estimator. Honest by construction: every input is
 * visible, the share is labelled illustrative, and the disclaimer is always on.
 */
import { $, esc, ICON, openLayer, closeLayer, countTo, track } from "./ui.js";
import { compact, moneyExact } from "./config.js";

const MIN = 1e3;
const MAX = 1e7;
const SHARE = 0.2;
const toSlider = (v) => Math.round((Math.log10(Math.max(MIN, Math.min(MAX, v))) - 3) * 250); // 0..1000
const fromSlider = (s) => Math.round(Math.pow(10, 3 + s / 250));

export function createEstimator(app) {
  const btn = $("btnEarn");

  function aov() {
    const ps = app.enabledProducts();
    if (!ps.length) return 0;
    return Math.round(ps.reduce((n, p) => n + p.price, 0) / ps.length);
  }

  function open() {
    track("estimator_use", { audience: app.config.pitch.audience });
    const m = $("modal");
    m.setAttribute("aria-labelledby", "estTitle");
    const start = app.config.pitch.audience || 250000;
    m.innerHTML = `
      <div class="modal-card">
        <button type="button" class="icon-btn close" data-act="close" aria-label="Close">${ICON.close}</button>
        <p class="kicker">Earnings estimator · illustrative</p>
        <h2 id="estTitle">What could one drop earn?</h2>
        <div class="est-row">
          <label for="estAud"><span>Your audience</span><output id="estAudOut"></output></label>
          <input type="range" id="estAud" min="0" max="1000" step="1" value="${toSlider(start)}" aria-describedby="estAudOut" />
        </div>
        <div class="est-row">
          <label for="estPct"><span>Fans who buy</span><output id="estPctOut"></output></label>
          <input type="range" id="estPct" min="1" max="30" step="1" value="5" aria-describedby="estPctOut" />
        </div>
        <dl class="est-facts">
          <div><dt>Units</dt><dd id="estUnits">0</dd></div>
          <div><dt>Avg order</dt><dd>${esc(moneyExact(aov()))}</dd></div>
          <div><dt>Your share</dt><dd>Illustrative 20%</dd></div>
        </dl>
        <div class="est-big" aria-live="polite">
          <div class="lbl">Estimated earnings per drop</div>
          <div class="num gradient-text" id="estNum">$0</div>
          <div class="lbl" id="estGross"></div>
        </div>
        <p class="disclaimer">Illustrative only. Your actual share and prices are agreed with you before anything is made.</p>
        <div class="actions-row"><a class="btn btn-primary" href="${esc(app.joinUrl())}" data-act="cta">Make this real${ICON.arrow}</a></div>
      </div>`;
    const aud = m.querySelector("#estAud");
    const pct = m.querySelector("#estPct");
    const update = () => {
      const audience = fromSlider(Number(aud.value));
      const rate = Number(pct.value) / 1000; // 0.1% .. 3%
      const units = Math.round(audience * rate);
      const gross = units * aov();
      const earn = (gross * SHARE) / 100;
      aud.style.setProperty("--p", `${aud.value / 10}%`);
      pct.style.setProperty("--p", `${((pct.value - 1) / 29) * 100}%`);
      m.querySelector("#estAudOut").textContent = `${compact(audience)} fans`;
      m.querySelector("#estPctOut").textContent = `${(rate * 100).toFixed(1)}%`;
      aud.setAttribute("aria-valuetext", `${compact(audience)} fans`);
      pct.setAttribute("aria-valuetext", `${(rate * 100).toFixed(1)} percent`);
      countTo(m.querySelector("#estUnits"), units, {
        format: (v) => Math.round(v).toLocaleString("en-US"),
      });
      countTo(m.querySelector("#estNum"), earn, {
        format: (v) => "$" + Math.round(v).toLocaleString("en-US"),
      });
      m.querySelector("#estGross").textContent =
        `on $${Math.round(gross / 100).toLocaleString("en-US")} in sales`;
    };
    aud.addEventListener("input", update);
    pct.addEventListener("input", update);
    m.onclick = (e) => {
      if (e.target === m || e.target.closest('[data-act="close"]')) closeLayer(m);
      if (e.target.closest('[data-act="cta"]')) track("apply_open", { from: "estimator" });
    };
    update();
    openLayer(m, { focus: "#estAud" });
  }

  btn.addEventListener("click", open);
  return {
    open,
    sync() {
      btn.hidden = !app.config.pitch.showEstimator;
    },
  };
}
