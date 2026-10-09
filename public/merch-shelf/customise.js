/**
 * "Make it yours": drop in a logo (read locally with FileReader; never
 * uploaded), rename the sign, pick colours, finish, backdrop and products.
 * Every change re-renders live. Share builds a quick link; Save image renders
 * a framed PNG of the hero view.
 */
import { $, esc, ICON, openLayer, closeLayer, toast, track } from "./ui.js";
import { buildQuickLink, PRODUCT_META, luminance } from "./config.js";
import { trimmed } from "./art.js";
import { saveImage } from "./snapshot.js";

const NEONS = ["#ff37ae", "#19affe", "#b6ff3b", "#ffb020", "#a66bff", "#ff4b3e", "#f4f2ec"];
const FINISHES = [
  ["walnut", "Walnut", "#5d3c26"],
  ["maple", "Maple", "#dcbf95"],
  ["black", "Black", "#111114"],
  ["white", "White", "#e9e8e4"],
];
const BACKDROPS = [
  ["midnight", "Midnight", "#121a3c"],
  ["sunset", "Sunset", "linear-gradient(#4a1a5e,#f08a3c)"],
  ["arcade", "Arcade", "linear-gradient(#0c0820,#ff37ae)"],
  ["snow", "Snow", "linear-gradient(#0a2141,#a9cdea)"],
];

export function createCustomise(app) {
  const el = $("custom");
  let timer = 0;

  const draft = () => structuredClone(app.config);
  const commit = (next, delay = 0) => {
    clearTimeout(timer);
    timer = setTimeout(() => app.applyConfig(next), delay);
  };

  function colorRow(name, value) {
    return `<div class="colors" role="radiogroup" aria-label="${name} colour">
      ${NEONS.map((c) => `<button type="button" class="swatch" role="radio" style="--c:${c}" data-${name}="${c}" aria-checked="${c === value}" aria-label="${c}"></button>`).join("")}
      <label class="color-input" title="Pick any colour"><span class="sr-only">Custom ${name} colour</span><input type="color" data-${name}-input value="${value}" /></label>
    </div>`;
  }

  function render() {
    const c = app.config;
    const logo = app.localLogo;
    el.innerHTML = `
      <div class="panel-head">
        <div><p class="kicker">Make it yours</p><h2 id="customTitle">Customise the shelf</h2></div>
        <button type="button" class="icon-btn" data-act="close" aria-label="Close">${ICON.close}</button>
      </div>
      <div class="panel-body">
        <div class="field">
          <span class="lbl">Your logo</span>
          <label class="drop" id="drop">
            <span class="thumb" id="logoThumb"></span>
            <span><b>${logo ? esc(app.localLogoName || "Your logo") : "Drop your logo here"}</b><span>${logo ? "Click to change · PNG, SVG or WebP" : "or click to choose · transparent PNG/SVG works best"}</span></span>
            <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" id="logoFile" />
          </label>
          ${logo || c.creator.logo ? `<button type="button" class="linkish" data-act="wordmark" style="font-size:13px;margin-top:8px">Use the generated wordmark instead</button>` : ""}
          <p class="privacy">Your file stays in this browser — it's never uploaded.</p>
        </div>
        <div class="field"><label for="fName">Sign text</label><input class="text" id="fName" maxlength="28" value="${esc(c.creator.name)}" autocomplete="off" /></div>
        <div class="field"><label for="fHandle">Handle</label><input class="text" id="fHandle" maxlength="40" value="${esc(c.creator.handle)}" placeholder="@yourchannel" autocomplete="off" /></div>
        <div class="field"><span class="lbl">Neon colour</span>${colorRow("neon", c.theme.neon)}</div>
        <div class="field"><span class="lbl">Accent (LEDs, prints)</span>${colorRow("accent", c.theme.accent)}</div>
        <div class="field"><span class="lbl">Shelf finish</span>
          <div class="chips" role="radiogroup" aria-label="Shelf finish">${FINISHES.map(([k, n, col]) => `<button type="button" class="chip" role="radio" data-shelf="${k}" aria-checked="${c.theme.shelf === k}"><i style="--c:${col}"></i>${n}</button>`).join("")}</div>
        </div>
        <div class="field"><span class="lbl">Backdrop</span>
          <div class="chips" role="radiogroup" aria-label="Backdrop">${BACKDROPS.map(([k, n, col]) => `<button type="button" class="chip" role="radio" data-backdrop="${k}" aria-checked="${c.theme.backdrop === k}"><i style="--c:${col}"></i>${n}</button>`).join("")}</div>
        </div>
        <div class="field"><span class="lbl">Products</span>
          <div class="prod-toggles">
            ${c.products
              .map(
                (p, i) => `<div class="prod-toggle">
                  ${PRODUCT_META[p.type].tintable ? `<label class="pc" style="--c:${p.color}" title="Colour"><span class="sr-only">${esc(p.name)} colour</span><input type="color" data-pcolor="${i}" value="${p.color}" /></label>` : `<span class="pc" style="--c:conic-gradient(#9cf,#f9c,#ff9,#9fc,#9cf)" aria-hidden="true"></span>`}
                  <span class="nm">${esc(p.name)}</span>
                  <button type="button" class="switch" role="switch" data-ptoggle="${i}" aria-checked="${p.enabled}" aria-label="Show ${esc(p.name)}"></button>
                </div>`,
              )
              .join("")}
          </div>
        </div>
      </div>
      <div class="panel-foot">
        <button type="button" class="btn btn-ghost" data-act="share">${ICON.link}Share this shelf</button>
        <button type="button" class="btn btn-ghost" data-act="save">${ICON.image}Save image</button>
      </div>`;
    const thumb = el.querySelector("#logoThumb");
    const art = app.kit?.logo("light");
    if (art) {
      const cv = document.createElement("canvas");
      cv.width = art.width;
      cv.height = art.height;
      cv.getContext("2d").drawImage(art, 0, 0);
      thumb.appendChild(cv);
    }
    wireDrop();
  }

  function readFile(file) {
    if (!file || !/^image\//.test(file.type)) {
      toast("That file isn't an image. Try a PNG, SVG or WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast("That image is over 8 MB — try a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const art = trimmed(img, 1400);
        track("shelf_customize", { what: "logo" });
        await app.setLocalLogo(art, file.name);
        render();
        toast("Your logo is on every product now.");
      };
      img.onerror = () => toast("Couldn't read that image.");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function wireDrop() {
    const drop = el.querySelector("#drop");
    const input = el.querySelector("#logoFile");
    input.addEventListener("change", () => readFile(input.files[0]));
    ["dragenter", "dragover"].forEach((t) =>
      drop.addEventListener(t, (e) => {
        e.preventDefault();
        drop.classList.add("over");
      }),
    );
    ["dragleave", "drop"].forEach((t) =>
      drop.addEventListener(t, () => drop.classList.remove("over")),
    );
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      readFile(e.dataTransfer.files[0]);
    });
  }

  el.addEventListener("input", (e) => {
    const t = e.target;
    const next = draft();
    if (t.id === "fName") {
      const v = t.value.trim();
      if (!v) return;
      next.creator.name = v.slice(0, 28);
      commit(next, 350);
    } else if (t.id === "fHandle") {
      next.creator.handle = t.value.trim().slice(0, 40);
      commit(next, 350);
    } else if (t.dataset.neonInput !== undefined) {
      next.theme.neon = t.value;
      commit(next, 120);
    } else if (t.dataset.accentInput !== undefined) {
      next.theme.accent = t.value;
      commit(next, 120);
    } else if (t.dataset.pcolor !== undefined) {
      const p = app.config.products[Number(t.dataset.pcolor)];
      t.parentElement.style.setProperty("--c", t.value);
      app.setColor(p.id, t.value, { persist: true });
    }
  });

  el.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const next = draft();
    const d = t.dataset;
    const pick = (attr) => {
      t.parentElement
        .querySelectorAll("[role=radio]")
        .forEach((b) => b.setAttribute("aria-checked", String(b === t)));
    };
    if (d.neon) {
      pick();
      next.theme.neon = d.neon;
      commit(next);
    } else if (d.accent) {
      pick();
      next.theme.accent = d.accent;
      commit(next);
    } else if (d.shelf) {
      pick();
      next.theme.shelf = d.shelf;
      commit(next);
    } else if (d.backdrop) {
      pick();
      next.theme.backdrop = d.backdrop;
      commit(next);
    } else if (d.ptoggle !== undefined) {
      const i = Number(d.ptoggle);
      const on = t.getAttribute("aria-checked") !== "true";
      if (!on && next.products.filter((p) => p.enabled).length <= 1) {
        toast("Keep at least one product on the shelf.");
        return;
      }
      next.products[i].enabled = on;
      t.setAttribute("aria-checked", String(on));
      commit(next, 250);
    } else if (d.act === "close") closeLayer(el);
    else if (d.act === "wordmark") {
      next.creator.logo = null;
      app.setLocalLogo(null).then(() => app.applyConfig(next).then(render));
    } else if (d.act === "share") share();
    else if (d.act === "save") saveDialog();
    if (d.neon || d.accent || d.shelf || d.backdrop)
      track("shelf_customize", { what: Object.keys(d)[0] });
  });

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function share() {
    const url = buildQuickLink(app.config, { includeLogo: !app.localLogo });
    track("shelf_customize", { what: "share", local: !!app.localLogo });
    if (!app.localLogo) {
      if (await copy(url)) toast("Link copied — paste it anywhere.");
      else showLink(url, "Copy this link");
      return;
    }
    showLink(
      url,
      "Your logo can't travel in a link",
      "The logo you dropped in lives only in this browser, so a link can't carry it. This link keeps your name, colours, finish and products — the shelf will show your generated wordmark. To share it with your logo, save an image or ask us to publish a shelf for you.",
    );
  }

  function showLink(url, title, body = "") {
    const m = $("modal");
    m.setAttribute("aria-labelledby", "shareTitle");
    m.innerHTML = `
      <div class="modal-card">
        <button type="button" class="icon-btn close" data-act="close" aria-label="Close">${ICON.close}</button>
        <p class="kicker">Share this shelf</p>
        <h2 id="shareTitle">${esc(title)}</h2>
        ${body ? `<p>${esc(body)}</p>` : ""}
        <label class="sr-only" for="shareUrl">Quick link</label>
        <input class="text" id="shareUrl" readonly value="${esc(url)}" />
        <div class="actions-row">
          <button type="button" class="btn btn-primary" data-act="copy">${ICON.link}Copy link</button>
          ${app.localLogo ? `<button type="button" class="btn btn-ghost" data-act="img">${ICON.image}Save image instead</button>` : ""}
        </div>
      </div>`;
    m.onclick = async (e) => {
      if (e.target === m || e.target.closest('[data-act="close"]')) closeLayer(m);
      if (e.target.closest('[data-act="copy"]')) {
        const ok = await copy(url);
        const inp = m.querySelector("#shareUrl");
        inp.select();
        toast(ok ? "Link copied." : "Select the link and copy it.");
      }
      if (e.target.closest('[data-act="img"]')) {
        closeLayer(m, { restoreFocus: false });
        saveDialog();
      }
    };
    openLayer(m, { focus: '[data-act="copy"]' });
  }

  function saveDialog() {
    const m = $("modal");
    m.setAttribute("aria-labelledby", "saveTitle");
    m.innerHTML = `
      <div class="modal-card">
        <button type="button" class="icon-btn close" data-act="close" aria-label="Close">${ICON.close}</button>
        <p class="kicker">Save image</p>
        <h2 id="saveTitle">A picture of your shelf</h2>
        <p>A PNG of the shelf with a slim branded frame, ready to paste into an email or a post.</p>
        <div class="actions-row">
          <button type="button" class="btn btn-primary" data-size="1600x1000">${ICON.image}Email · 1600×1000</button>
          <button type="button" class="btn btn-ghost" data-size="1200x630">Social · 1200×630</button>
        </div>
      </div>`;
    m.onclick = async (e) => {
      if (e.target === m || e.target.closest('[data-act="close"]')) closeLayer(m);
      const b = e.target.closest("[data-size]");
      if (b) {
        const [w, h] = b.dataset.size.split("x").map(Number);
        b.disabled = true;
        await saveImage(app, w, h);
        b.disabled = false;
        track("shelf_customize", { what: "snapshot", w, h });
        toast("Image saved.");
      }
    };
    openLayer(m, { focus: "[data-size]" });
  }

  $("btnCustom").addEventListener("click", () => api.open());

  const api = {
    open() {
      if (app.focusedId) app.closeProduct();
      render();
      track("shelf_customize", { what: "open" });
      // slide the shelf clear of the panel so changes are visible as they're made
      const phone = matchMedia("(max-width: 760px)").matches;
      app.scene.setInsets(
        phone ? { bottom: el.getBoundingClientRect().height + 8 } : { left: 410 },
      );
      app.toHero();
      openLayer(el, {
        focus: "#fName",
        onClose: () => {
          app.scene.setInsets({ left: 0 });
          app.measureInsets();
          app.toHero();
        },
      });
    },
    refresh() {
      if (!el.hidden) render();
    },
  };
  return api;
}
