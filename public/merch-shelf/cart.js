/**
 * Cart drawer + the checkout explainer. The cart is a per-visitor convenience
 * kept in localStorage (keyed by the creator's name); nothing is sold here.
 */
import { $, esc, ICON, openLayer, closeLayer, store, track } from "./ui.js";
import { moneyExact } from "./config.js";

export function createCart(app) {
  const el = $("cart");
  const btn = $("btnCart");
  const key = () => `ml-shelf-cart:${app.config.creator.name.toLowerCase()}`;
  let lines = [];
  try {
    lines = JSON.parse(store.get(key()) || "[]").filter((l) => l && l.id && l.qty > 0);
  } catch {
    lines = [];
  }

  const save = () =>
    store.set(
      key(),
      JSON.stringify(
        lines.map((l) => ({ ...l, thumb: l.thumb && l.thumb.length < 60000 ? l.thumb : null })),
      ),
    );
  const count = () => lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = () => lines.reduce((n, l) => n + l.qty * l.price, 0);

  function badge() {
    const n = count();
    $("cartCount").textContent = String(n);
    btn.classList.toggle("has-items", n > 0);
    btn.setAttribute("aria-label", n ? `Cart, ${n} item${n === 1 ? "" : "s"}` : "Cart, empty");
  }

  function render() {
    el.innerHTML = `
      <div class="drawer-head">
        <div><p class="kicker">Preview store</p><h2 id="cartTitle">Your cart</h2></div>
        <button type="button" class="icon-btn" data-act="close" aria-label="Close cart">${ICON.close}</button>
      </div>
      <div class="drawer-body" aria-live="polite">
        ${
          lines.length
            ? lines
                .map(
                  (l, i) => `
          <div class="line">
            ${l.thumb ? `<img src="${l.thumb}" alt="" width="68" height="68" />` : `<span class="ph" aria-hidden="true"></span>`}
            <div>
              <h3>${esc(l.name)}</h3>
              <p class="meta">${l.colorName ? `<span class="dot" style="--c:${esc(l.color)}"></span>${esc(l.colorName)}` : ""}${l.size ? ` · Size ${esc(l.size)}` : ""}</p>
              <div class="qty" role="group" aria-label="Quantity of ${esc(l.name)}">
                <button type="button" data-act="minus" data-i="${i}" aria-label="One less">−</button>
                <output>${l.qty}</output>
                <button type="button" data-act="plus" data-i="${i}" aria-label="One more">+</button>
              </div>
            </div>
            <div class="right">
              <b>${moneyExact(l.price * l.qty)}</b>
              <button type="button" class="remove" data-act="remove" data-i="${i}">Remove</button>
            </div>
          </div>`,
                )
                .join("")
            : `<div class="empty">${ICON.cart}<p>Your cart is empty.<br />Open a product on the shelf and add it.</p></div>`
        }
      </div>
      <div class="drawer-foot">
        <div class="subtotal"><span>Subtotal</span><b>${moneyExact(subtotal())}</b></div>
        <p class="note">Preview prices. Shipping and taxes are worked out at checkout.</p>
        <button type="button" class="btn btn-primary btn-block" data-act="checkout"${lines.length ? "" : " disabled"}>Checkout${ICON.arrow}</button>
      </div>`;
  }

  el.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const i = Number(t.dataset.i);
    switch (t.dataset.act) {
      case "close":
        closeLayer(el);
        break;
      case "minus":
        lines[i].qty = Math.max(0, lines[i].qty - 1);
        if (!lines[i].qty) lines.splice(i, 1);
        break;
      case "plus":
        lines[i].qty = Math.min(20, lines[i].qty + 1);
        break;
      case "remove":
        lines.splice(i, 1);
        break;
      case "checkout":
        closeLayer(el, { restoreFocus: false });
        checkout();
        return;
      default:
        return;
    }
    save();
    badge();
    render();
    el.querySelector(`[data-act="${t.dataset.act}"][data-i="${i}"]`)?.focus();
  });

  function checkout() {
    track("checkout", { items: count(), subtotal: subtotal() });
    const m = $("modal");
    m.setAttribute("aria-labelledby", "coTitle");
    m.innerHTML = `
      <div class="modal-card">
        <button type="button" class="icon-btn close" data-act="close" aria-label="Close">${ICON.close}</button>
        <p class="kicker">Checkout</p>
        <h2 id="coTitle">This is a preview of <span class="gradient-text">your</span> store.</h2>
        <p>With MEDIALIFE, your real shop runs on Shopify — we handle production, fulfilment and customer service. Every product you sell is activated.</p>
        <ul class="ticks">
          <li>${ICON.check}<span>Heavyweight, vintage-washed pieces made to order with your art.</span></li>
          <li>${ICON.check}<span>A QR + NFC tag in every piece opens your experience — no app.</span></li>
          <li>${ICON.check}<span>Every order, your cut and every scan, live in the Creator Hub.</span></li>
        </ul>
        <div class="actions-row">
          <a class="btn btn-primary" href="${esc(app.joinUrl())}" data-act="cta">Make this real${ICON.arrow}</a>
          <button type="button" class="btn btn-ghost" data-act="close">Keep exploring</button>
        </div>
      </div>`;
    m.onclick = (e) => {
      if (e.target === m || e.target.closest('[data-act="close"]')) closeLayer(m);
      if (e.target.closest('[data-act="cta"]')) track("apply_open", { from: "checkout" });
    };
    openLayer(m, { focus: ".btn-primary" });
  }

  btn.addEventListener("click", () => api.open());
  badge();

  const api = {
    open() {
      render();
      track("cart_open", { items: count() });
      openLayer(el, { focus: '[data-act="close"]' });
    },
    add(item) {
      const same = lines.find(
        (l) => l.id === item.id && l.color === item.color && l.size === item.size,
      );
      if (same) {
        same.qty = Math.min(20, same.qty + item.qty);
        same.thumb = item.thumb || same.thumb;
      } else lines.push({ ...item });
      save();
      badge();
    },
    count,
    subtotal,
  };
  return api;
}
