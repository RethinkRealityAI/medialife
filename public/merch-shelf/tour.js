/**
 * The guided tour: six short steps with camera moves, shown on a first visit
 * (skippable, replayable from the Tour button).
 */
import { $, esc, ICON, openLayer, closeLayer, isOpen, store, track, countTo } from "./ui.js";

export function createTour(app) {
  const el = $("tour");
  const spot = $("spot");
  let i = 0;
  let steps = [];

  function build() {
    const c = app.config;
    const name = c.creator.name;
    const first =
      app.enabledProducts().find((p) => ["tee", "hoodie", "longsleeve"].includes(p.type)) ||
      app.enabledProducts()[0];
    const greet = app.greeting();
    return [
      {
        id: "shelf",
        kicker: greet ? `Prepared for ${greet}` : "Activated merch · preview",
        title: `This is your shelf, ${name}.`,
        body: `Your name in lights and your art on every piece — heavyweight, vintage-washed, made to order.${c.pitch.presentedBy ? ` Presented by ${c.pitch.presentedBy}.` : ""}`,
        enter: async () => {
          await app.toHero();
          app.neon.ignite();
        },
      },
      {
        id: "activated",
        kicker: "Step 2 · Built in",
        title: "Every product is activated.",
        body: "A QR code and an NFC tag are built into every piece. No app, no account: a fan's phone opens your experience in the browser.",
        enter: async () => {
          if (first) await app.peekProduct(first.id);
        },
      },
      {
        id: "scan",
        kicker: "Step 3 · The fan's side",
        title: "Fans scan it…",
        body: first
          ? `…and ${first.activation.title.charAt(0).toLowerCase() + first.activation.title.slice(1)}. Then they unlock a reward only buyers can get.`
          : "…and something happens.",
        extra: `<div class="mini-scan"><div class="mini-phone" aria-hidden="true"><div class="qrish"></div><div class="scanline"></div></div>
                  <button type="button" class="btn btn-ghost" data-act="try">${ICON.scan}Watch it play</button></div>`,
        enter: async () => {
          if (first) await app.peekProduct(first.id, { glint: true });
        },
      },
      {
        id: "hub",
        kicker: "Step 4 · Your side",
        title: "…and you see everything.",
        body: "Every order, your cut and every scan — live in the MEDIALIFE Creator Hub.",
        extra: `<dl class="hub-mini" aria-label="Example Creator Hub numbers">
                  <div><dt>Orders</dt><dd data-n="1284">0</dd></div>
                  <div><dt>Your cut</dt><dd data-n="9630" data-money="1">$0</dd></div>
                  <div><dt>Scans</dt><dd data-n="3912">0</dd></div>
                  <div><dt><span class="live-dot"></span>Live now</dt><dd data-n="37">0</dd></div>
                </dl><p class="hub-note">Example numbers, for illustration.</p>`,
        enter: () => app.toHero(),
      },
      {
        id: "customise",
        kicker: "Step 5 · Yours",
        title: "Make it yours.",
        body: "Drop in your logo, rename the sign, pick the colours. It stays in your browser — nothing is uploaded.",
        spot: "#btnCustom",
        enter: () => app.toHero(),
      },
      {
        id: "cta",
        kicker: "Ready?",
        title: "Make this real.",
        body: "Apply to the MEDIALIFE Creator Hub. We handle production, fulfilment and customer service; you keep creating.",
        cta: true,
        enter: () => app.toHero(),
      },
    ];
  }

  function placeSpot(sel) {
    const t = sel && document.querySelector(sel);
    if (!t || !t.offsetParent) {
      spot.hidden = true;
      return;
    }
    const r = t.getBoundingClientRect();
    spot.hidden = false;
    Object.assign(spot.style, {
      left: `${r.left - 6}px`,
      top: `${r.top - 6}px`,
      width: `${r.width + 12}px`,
      height: `${r.height + 12}px`,
    });
  }

  async function go(n) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    const s = steps[i];
    track("tour_step", { step: i + 1, id: s.id });
    el.innerHTML = `
      <div class="tour-card">
        <p class="kicker">${esc(s.kicker)}</p>
        <h2 id="tourTitle" tabindex="-1">${esc(s.title)}</h2>
        <p>${esc(s.body)}</p>
        ${s.extra || ""}
        <div class="tour-foot">
          <div class="tour-dots" aria-hidden="true">${steps.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
          <span class="sr-only">Step ${i + 1} of ${steps.length}</span>
          ${s.cta ? "" : `<button type="button" class="tour-skip" data-act="skip">Skip tour</button>`}
          ${i > 0 ? `<button type="button" class="icon-btn" data-act="back" aria-label="Previous step">${ICON.prev}</button>` : ""}
          ${
            s.cta
              ? `<button type="button" class="btn btn-ghost" data-act="done">Explore the shelf</button><a class="btn btn-primary" href="${esc(app.joinUrl())}" data-act="cta">Apply${ICON.arrow}</a>`
              : `<button type="button" class="btn btn-primary" data-act="next">${i === 0 ? "Show me" : "Next"}${ICON.arrow}</button>`
          }
        </div>
      </div>`;
    el.querySelectorAll(".hub-mini dd").forEach((dd) =>
      countTo(dd, Number(dd.dataset.n), {
        ms: 1200,
        format: (v) => (dd.dataset.money ? "$" : "") + Math.round(v).toLocaleString("en-US"),
      }),
    );
    el.querySelector("h2").focus({ preventScroll: true });
    // keep the shelf clear of the caption card
    app.scene.setInsets({ bottom: el.getBoundingClientRect().height + 40 });
    placeSpot(s.spot);
    await s.enter?.();
    placeSpot(s.spot);
  }

  let ending = false;
  function end(skipped) {
    if (ending) return;
    ending = true;
    store.set("ml-shelf-toured", "1");
    spot.hidden = true;
    if (isOpen(el)) closeLayer(el, { immediate: true });
    track(skipped ? "tour_skip" : "tour_finish", { step: i + 1 });
    document.body.classList.remove("is-touring");
    app.measureInsets();
    app.toHero();
    ending = false;
  }

  el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const a = t.dataset.act;
    if (a === "next") go(i + 1);
    if (a === "back") go(i - 1);
    if (a === "skip") end(true);
    if (a === "done") end(false);
    if (a === "cta") track("apply_open", { from: "tour" });
    if (a === "try") {
      const first =
        app.enabledProducts().find((p) => ["tee", "hoodie", "longsleeve"].includes(p.type)) ||
        app.enabledProducts()[0];
      if (first) app.activation.open(first.id);
    }
  });
  addEventListener("resize", () => !spot.hidden && placeSpot(steps[i]?.spot));

  return {
    start(at = 0) {
      if (app.focusedId) app.closeProduct();
      steps = build();
      document.body.classList.add("is-touring");
      if (!isOpen(el))
        openLayer(el, { modal: false, focus: "h2", onClose: () => end(true), openClass: "open" });
      go(at);
    },
    shouldAutoStart: () => store.get("ml-shelf-toured") !== "1",
    get active() {
      return isOpen(el);
    },
    end: () => end(true),
    get step() {
      return i;
    },
  };
}
