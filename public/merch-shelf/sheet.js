/**
 * The product sheet: slide-in panel on desktop, bottom sheet on phones.
 * Colour, size, quantity, add to cart, front/back for apparel, and the
 * "Activated" section that launches the fan-experience demo.
 */
import {
  $,
  esc,
  ICON,
  KIND_ICON,
  KIND_LABEL,
  openLayer,
  closeLayer,
  isOpen,
  toast,
  flyToCart,
  track,
} from "./ui.js";
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
    const { list, sel } = swatchesFor(p, h.color);
    el.innerHTML = `
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-scroll">
        <div class="sheet-head">
          <div class="titles">
            <p class="kicker">Activated · ${esc(meta.label)}</p>
            <h2 id="sheetTitle">${esc(p.name)}</h2>
            <p class="price">${money(p.price)}<small>PREVIEW PRICE</small></p>
          </div>
          <div class="sheet-nav">
            <button type="button" class="icon-btn" data-act="prev" aria-label="Previous product"${enabled.length < 2 ? " hidden" : ""}>${ICON.prev}</button>
            <button type="button" class="icon-btn" data-act="next" aria-label="Next product"${enabled.length < 2 ? " hidden" : ""}>${ICON.next}</button>
            <button type="button" class="icon-btn" data-act="close" aria-label="Close and go back to the shelf">${ICON.close}</button>
          </div>
        </div>
        <p class="blurb">${esc(p.blurb)}</p>
        ${
          meta.apparel
            ? `<div class="seg" role="group" aria-label="View">
                <button type="button" data-face="front" aria-pressed="${h.face === "front"}">Front</button>
                <button type="button" data-face="back" aria-pressed="${h.face === "back"}">Back print</button>
              </div>`
            : ""
        }
        ${
          meta.tintable
            ? `<fieldset>
                <legend>Colour · <b id="colorName">${esc(sel.name)}</b></legend>
                <div class="swatches" role="radiogroup" aria-label="Colour">
                  ${list
                    .map(
                      (c) =>
                        `<button type="button" class="swatch" role="radio" style="--c:${c.hex}" data-color="${c.hex}" data-name="${esc(c.name)}" aria-checked="${c.hex === sel.hex}" aria-label="${esc(c.name)}"></button>`,
                    )
                    .join("")}
                </div>
              </fieldset>`
            : `<p class="finish-note"><i aria-hidden="true"></i>${esc(meta.finish || "")}</p>`
        }
        ${
          meta.sizes
            ? `<fieldset>
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
          <button type="button" class="btn btn-primary" data-act="add" id="addBtn">${ICON.cart}Add to cart</button>
        </div>
        <section class="activated" aria-labelledby="actTitle">
          <div class="act-head">
            <span class="act-icon">${KIND_ICON[a.kind]}</span>
            <div>
              <p class="kicker">Fans experience · ${esc(KIND_LABEL[a.kind])}</p>
              <h3 id="actTitle">${esc(a.title)}</h3>
            </div>
          </div>
          <p>${esc(a.description)}</p>
          ${a.reward ? `<div class="reward-chip">${ICON.gift}<span><b>Reward:</b> ${esc(a.reward)}</span></div>` : ""}
          <button type="button" class="btn btn-ghost btn-block" data-act="activate">${ICON.scan}See what fans experience</button>
          <div class="tryphone">
            <canvas width="168" height="168" id="sheetQr" aria-label="QR code that opens this experience on your phone" role="img"></canvas>
            <p><b>Try it on your phone</b>Point your camera here. It opens straight into this product's experience — no app.</p>
          </div>
        </section>
      </div>
      <div class="sheet-foot">
        <span>${idx + 1} of ${enabled.length}</span>
        <a class="linkish" href="${esc(app.joinUrl())}" data-act="cta">Make this real →</a>
      </div>`;
    const qr = el.querySelector("#sheetQr");
    if (qr)
      drawQR(qr.getContext("2d"), app.activateUrl(id), 0, 0, 168, {
        dark: "#111216",
        light: "#ffffff",
        margin: 1,
      });
  }

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
    if (t.dataset.face) {
      app.setFace(current, t.dataset.face);
      el.querySelectorAll("[data-face]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === t)),
      );
      return;
    }
    switch (t.dataset.act) {
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
      if (!isOpen(el)) return;
      closing = true;
      closeLayer(el);
      closing = false;
      current = null;
    },
    setFaceUI(face) {
      el.querySelectorAll("[data-face]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.face === face)),
      );
    },
    get current() {
      return current;
    },
    /** Pixel size the sheet covers, for the camera framing. */
    footprint() {
      const phone = matchMedia("(max-width: 760px)").matches;
      if (phone) return { side: 0, bottom: Math.min(window.innerHeight * 0.56, 560) };
      return { side: 420 + 16, bottom: 0 };
    },
  };
}
