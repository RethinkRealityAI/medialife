/**
 * The product sheet: slide-in panel on desktop, bottom sheet on phones.
 * Colour, size, quantity, add to cart, front/back for apparel, and the
 * "Activated" section that launches the fan-experience demo.
 */
import { $, esc, ICON, openLayer, closeLayer, isOpen, toast, flyToCart, track } from "./ui.js";
import { PRODUCT_META, SWATCHES, money } from "./config.js";
import { drawQR } from "./art.js";

export function createSheet(app) {
  const el = $("sheet");
  const state = new Map(); // id -> { size, qty }
  let current = null;
  let closing = false;

  function swatchesFor(p, color) {
    // The configured colour stays selected. One within a hair of a lineup
    // swatch is shown as that swatch; anything else gets its own swatch first.
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
    const near = (hex) => SWATCHES.find((s) => s.hex === hex || dist(s.hex, hex) < 12);
    const list = SWATCHES.map((s) => ({ ...s }));
    const drop = p.color.toLowerCase();
    const dropNear = near(drop);
    if (!dropNear) list.unshift({ hex: drop, name: "Drop colour" });
    else list.find((s) => s.name === dropNear.name).hex = drop;
    const cur = color.toLowerCase();
    const sel = list.find((s) => s.hex === cur) || { hex: cur, name: "Custom" };
    return { list, sel };
  }

  /** Bottom card (portrait phones) or floating side card (everything else). */
  const BOTTOM_Q = "(max-width: 1100px) and (orientation: portrait)";
  const isBottom = () => matchMedia(BOTTOM_Q).matches;
  /** Details start open where there's room for them beside the product. */
  let expanded = false; // remembered across products

  function render(id) {
    const h = app.products.get(id);
    if (!h) return;
    const p = h.product;
    const meta = PRODUCT_META[p.type];
    const s = state.get(id) || { size: "M", qty: 1 };
    state.set(id, s);
    const a = p.activation;
    const enabled = app.enabledProducts();
    const idx = enabled.findIndex((x) => x.id === id);
    const many = enabled.length > 1;
    const { list, sel } = swatchesFor(p, h.color);
    el.innerHTML = `
      <button type="button" class="sheet-grab" data-act="more" aria-expanded="false" aria-controls="sheetMore"><i aria-hidden="true"></i><span class="sr-only">Show details</span></button>
      <div class="sheet-scroll">
        <div class="sheet-head">
          <div class="titles">
            <p class="kicker"><span class="kind">${ICON.sparkle}Immersive experience</span><span class="sr-only"> · ${esc(meta.label)}</span></p>
            <div class="title-row"><h2 id="sheetTitle">${esc(p.name)}</h2><span class="tprice" aria-hidden="true">${money(p.price)}</span></div>
          </div>
          <div class="sheet-nav">
            ${many ? `<button type="button" class="icon-btn" data-act="prev" aria-label="Previous product">${ICON.prev}</button><span class="pos" aria-hidden="true">${idx + 1}/${enabled.length}</span><button type="button" class="icon-btn" data-act="next" aria-label="Next product">${ICON.next}</button>` : ""}
            <button type="button" class="icon-btn" data-act="close" aria-label="Close and go back to the shelf">${ICON.close}</button>
          </div>
        </div>
        <p class="price">${money(p.price)}<small>Preview price</small></p>
        <div class="opts">
          ${
            meta.tintable
              ? `<fieldset class="colour">
                  <legend>Colour · <b id="colorName">${esc(sel.name)}</b></legend>
                  <div class="swatches" role="radiogroup" aria-label="Colour">
                    ${list
                      .map(
                        (c) =>
                          `<button type="button" class="swatch" role="radio" style="--c:${c.hex}" data-color="${c.hex}" data-name="${esc(c.name)}" aria-checked="${c.hex === sel.hex}" aria-label="${esc(c.name)}" title="${esc(c.name)}"></button>`,
                      )
                      .join("")}
                  </div>
                </fieldset>`
              : `<p class="finish-note"><i aria-hidden="true"></i>${esc(meta.finish || "")}</p>`
          }
        </div>
        ${
          meta.sizes
            ? `<fieldset class="size-set">
                <legend>Size · <b id="sizeName">${esc(s.size)}</b></legend>
                <div class="sizes" role="radiogroup" aria-label="Size">
                  ${meta.sizes.map((z) => `<button type="button" class="size" role="radio" data-size="${z}" aria-checked="${z === s.size}">${z}</button>`).join("")}
                </div>
              </fieldset>`
            : ""
        }
        <div class="buy">
          <div class="qty" role="group" aria-label="Quantity">
            <button type="button" data-act="minus" aria-label="One less">−</button>
            <output id="qtyOut" aria-live="polite">${s.qty}</output>
            <button type="button" data-act="plus" aria-label="One more">+</button>
          </div>
          <button type="button" class="btn btn-act" data-act="activate">${ICON.scan}<span>Experience it</span></button>
          <button type="button" class="btn btn-primary" data-act="add" id="addBtn">${ICON.cart}<span>Add to cart</span></button>
        </div>
        <button type="button" class="more-toggle" data-act="more" aria-expanded="false" aria-controls="sheetMore"><span>Details &amp; the fan experience</span>${ICON.chevron}</button>
        <div class="sheet-more" id="sheetMore">
          <p class="blurb">${esc(p.blurb)}</p>
          <section class="activated" aria-labelledby="actTitle">
            <div class="act-head">
              <span class="act-icon">${ICON.sparkle}</span>
              <div>
                <p class="kicker">When a fan scans it</p>
                <h3 id="actTitle">${esc(a.title)}</h3>
              </div>
            </div>
            <p>${esc(a.description)}</p>
            ${a.reward ? `<div class="reward-chip">${ICON.gift}<span><b>Reward:</b> ${esc(a.reward)}</span></div>` : ""}
            <div class="tryphone">
              <canvas width="168" height="168" id="sheetQr" aria-label="QR code that opens this experience on your phone" role="img"></canvas>
              <p><b>Try it on your phone</b>Point your camera here. It opens straight into this product's experience — no app.</p>
            </div>
          </section>
          <ol class="how" aria-label="How it works">
            <li><i>1</i><span>A fan scans the tag or taps it with their phone</span></li>
            <li><i>2</i><span>The immersive experience opens in the browser, no app</span></li>
            <li><i>3</i><span>They unlock a reward, and you see every scan</span></li>
          </ol>
          <a class="more-cta" href="${esc(app.joinUrl())}" data-act="cta">Make this real — apply to the Creator Hub${ICON.arrow}</a>
        </div>
      </div>`;
    const qr = el.querySelector("#sheetQr");
    if (qr)
      drawQR(qr.getContext("2d"), app.activateUrl(id), 0, 0, 168, {
        dark: "#111216",
        light: "#ffffff",
        margin: 1,
      });
    setExpanded(expanded, { silent: true });
    renderView(h);
  }

  /* The view control floats by the product (it turns the product, it isn't an order option). */
  const view = $("viewCtl");
  function renderView(h) {
    const apparel = PRODUCT_META[h.product.type].apparel;
    view.innerHTML = `
      ${
        apparel
          ? `<div class="seg" role="group" aria-label="Show the">
              <button type="button" data-face="front" aria-pressed="${h.face === "front"}">Front</button>
              <button type="button" data-face="back" aria-pressed="${h.face === "back"}">Back</button>
            </div>`
          : ""
      }
      <span class="turn-hint">${ICON.turn}<span>Drag to turn</span></span>`;
    view.hidden = false;
  }
  view.addEventListener("click", (e) => {
    const t = e.target.closest("[data-face]");
    if (!t || !current) return;
    app.setFace(current, t.dataset.face);
    view
      .querySelectorAll("[data-face]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === t)));
  });
  // keep the floating controls just above the card as it grows and shrinks
  let peekH = 0; // the card's height with the details folded away
  new ResizeObserver(() => {
    if (!el.classList.contains("is-expanded")) peekH = el.offsetHeight;
    document.documentElement.style.setProperty("--sheet-h", `${el.offsetHeight}px`);
    document.documentElement.style.setProperty("--sheet-w-px", `${el.offsetWidth}px`);
  }).observe(el);

  function setExpanded(on, { silent = false } = {}) {
    const was = el.classList.contains("is-expanded");
    el.classList.toggle("is-expanded", on);
    el.querySelectorAll('[data-act="more"]').forEach((b) =>
      b.setAttribute("aria-expanded", String(on)),
    );
    const label = el.querySelector(".sheet-grab .sr-only");
    if (label) label.textContent = on ? "Hide details" : "Show details";
    const text = el.querySelector(".more-toggle span");
    if (text) text.textContent = on ? "Fewer details" : "Details & the fan experience";
    if (!on) el.querySelector(".sheet-scroll")?.scrollTo({ top: 0 });
    if (!silent && was !== on) {
      expanded = on;
      // beside the product the card's height doesn't matter; over it (phones)
      // the details are a reading state, so the product keeps its framing
      if (on) track("sheet_details", { id: current });
    }
  }

  // Swipe the card: up shows the details, down hides them, down again closes.
  (() => {
    let y0 = null;
    let t0 = 0;
    el.addEventListener("pointerdown", (e) => {
      if (!isBottom() || e.target.closest("button:not(.sheet-grab), a, input")) return;
      const scroller = el.querySelector(".sheet-scroll");
      if (scroller && scroller.scrollTop > 0 && !e.target.closest(".sheet-grab")) return;
      y0 = e.clientY;
      t0 = performance.now();
    });
    const end = (e) => {
      if (y0 === null) return;
      const dy = e.clientY - y0;
      const fast = performance.now() - t0 < 400;
      y0 = null;
      if (Math.abs(dy) < (fast ? 24 : 48)) return;
      const open = el.classList.contains("is-expanded");
      if (dy < 0 && !open) setExpanded(true);
      else if (dy > 0 && open) setExpanded(false);
      else if (dy > 0 && !open) app.closeProduct();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", () => (y0 = null));
  })();

  el.addEventListener("click", async (e) => {
    const t = e.target.closest("button, a");
    if (!t || !current) return;
    const h = app.products.get(current);
    const s = state.get(current);
    if (t.dataset.color) {
      el.querySelectorAll(".swatch").forEach((b) =>
        b.setAttribute("aria-checked", String(b === t)),
      );
      el.querySelector("#colorName").textContent = t.dataset.name;
      app.setColor(current, t.dataset.color);
      return;
    }
    if (t.dataset.size) {
      s.size = t.dataset.size;
      el.querySelectorAll(".size").forEach((b) => b.setAttribute("aria-checked", String(b === t)));
      el.querySelector("#sizeName").textContent = s.size;
      return;
    }
    switch (t.dataset.act) {
      case "more":
        setExpanded(!el.classList.contains("is-expanded"));
        break;
      case "close":
        app.closeProduct();
        break;
      case "prev":
      case "next": {
        const list = app.enabledProducts();
        const i = list.findIndex((x) => x.id === current);
        const n = list[(i + (t.dataset.act === "next" ? 1 : -1) + list.length) % list.length];
        app.openProduct(n.id);
        break;
      }
      case "minus":
        s.qty = Math.max(1, s.qty - 1);
        el.querySelector("#qtyOut").textContent = s.qty;
        break;
      case "plus":
        s.qty = Math.min(20, s.qty + 1);
        el.querySelector("#qtyOut").textContent = s.qty;
        break;
      case "add": {
        const meta = PRODUCT_META[h.product.type];
        const swatch = el.querySelector('.swatch[aria-checked="true"]');
        const thumb = app.thumbnail(current);
        app.cart.add({
          id: current,
          name: h.product.name,
          price: h.product.price,
          color: h.color,
          colorName: meta.tintable
            ? swatch?.dataset.name || ""
            : meta.finish?.split(" · ")[0] || "",
          size: meta.sizes ? s.size : "",
          qty: s.qty,
          thumb,
        });
        flyToCart(t, thumb);
        toast(`Added ${s.qty > 1 ? `${s.qty} × ` : ""}${h.product.name} to your cart`);
        track("add_to_cart", {
          id: current,
          type: h.product.type,
          qty: s.qty,
          price: h.product.price,
        });
        break;
      }
      case "activate":
        app.activation.open(current);
        break;
      case "cta":
        track("apply_open", { from: "sheet" });
        break;
    }
  });

  return {
    open(id) {
      current = id;
      render(id);
      el.scrollTop = 0;
      if (!isOpen(el)) {
        document.body.classList.add("is-sheet");
        openLayer(el, {
          modal: false,
          focus: "h2",
          onClose: () => {
            view.hidden = true;
            document.body.classList.remove("is-sheet");
            if (!closing) app.closeProduct({ fromSheet: true });
          },
        });
        el.querySelector("h2")?.setAttribute("tabindex", "-1");
      } else {
        el.querySelector("h2")?.setAttribute("tabindex", "-1");
        el.querySelector("h2")?.focus({ preventScroll: true });
      }
    },
    close() {
      view.hidden = true;
      if (!isOpen(el)) return;
      closing = true;
      closeLayer(el);
      closing = false;
      current = null;
    },
    setFaceUI(face) {
      view
        .querySelectorAll("[data-face]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.face === face)));
    },
    get current() {
      return current;
    },
    /** The face the view control shows. */
    get face() {
      return view.querySelector('[data-face][aria-pressed="true"]')?.dataset.face || null;
    },
    get bottomLayout() {
      return isBottom();
    },
    /**
     * Pixels the card and the view pill cover, for the camera framing.
     */
    footprint() {
      if (!isOpen(el)) return { side: 0, bottom: 0 };
      // + the floating Front/Back pill, which sits just above the card (or at the bottom)
      if (isBottom()) {
        const h = el.classList.contains("is-expanded") && peekH ? peekH : el.offsetHeight;
        return { side: 0, bottom: h + 52 };
      }
      return { side: el.offsetWidth + 28, bottom: 64 };
    },
  };
}
