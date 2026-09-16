/**
 * Builds creators/index.html from creators/assets/js/program.js.
 *
 * The program data is the single source of truth. This renders it to static
 * HTML at build time so every fact on the page is crawlable and readable with
 * JavaScript disabled -- the interactive layer enhances it, it does not
 * provide it.
 *
 *   node scripts/build-creators.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROGRAM,
  PRODUCTS,
  COLORWAYS,
  ACTIVATIONS,
  PATHS,
  STEPS,
  LOOP,
  PROOF,
  FAQ,
  MODEL,
} from "../public/creators/assets/js/program.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../public/creators/index.html");
const SITE = "https://medialife.ai";
const PAGE_URL = `${SITE}/creators/`;

/** Escape for HTML text nodes and double-quoted attributes. */
const e = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Registered/trademark marks get a <sup> so they sit correctly at body size. */
const marks = (s) => String(s).replace(/®/g, "<sup>®</sup>").replace(/™/g, "<sup>™</sup>");

const pct = (n) => `${(n * 100).toFixed((n * 100) % 1 === 0 ? 0 : 1)}%`;

// ---------------------------------------------------------------------------
// icons
// ---------------------------------------------------------------------------
const ICON = {
  check:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow:
    '<svg class="ic" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg class="ic" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3.5 12.5 8 5 12.5z" fill="currentColor"/></svg>',
  share:
    '<svg class="ic" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 5.5a2 2 0 1 0-1.9-2.6L5.9 5A2 2 0 1 0 5.9 11l3.7 2.1a2 2 0 1 0 .5-1.3L6.4 9.7a2 2 0 0 0 0-3.4l3.7-2.1c.36.79 1.16 1.3 2 1.3z" fill="currentColor"/></svg>',
  reset:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sound:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M7.5 3 4.5 5.5H2.5v5h2L7.5 13z" fill="currentColor"/><path d="M10 6a2.6 2.6 0 0 1 0 4M12 4a5.3 5.3 0 0 1 0 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M7.5 3 4.5 5.5H2.5v5h2L7.5 13z" fill="currentColor"/><path d="m10.5 6.5 3 3m0-3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  expand:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 2H2v4M10 14h4v-4M14 6V2h-4M2 10v4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download:
    '<svg class="ic" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8m0 0 3-3M8 10 5 7M2.5 12.5h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg class="ic" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 3.2A1.7 1.7 0 0 0 8.9 2H4a2 2 0 0 0-2 2v4.9c0 .75.48 1.38 1.2 1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  close:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  // loop icons
  game: '<svg class="loop-ico" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="2.5" y="7.5" width="23" height="14" rx="5" stroke="currentColor" stroke-width="1.5"/><path d="M8 12v4M6 14h4M18.5 13.2h.01M21 15.6h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  shirt:
    '<svg class="loop-ico" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M10.5 3.5 4 6.5l1.8 5 2.4-.9V24h11.6V10.6l2.4.9 1.8-5-6.5-3a3.6 3.6 0 0 1-7.1 0z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  scan: '<svg class="loop-ico" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M4 9V6a2 2 0 0 1 2-2h3M24 9V6a2 2 0 0 0-2-2h-3M4 19v3a2 2 0 0 0 2 2h3M24 19v3a2 2 0 0 1-2 2h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M14 10.5a3.5 3.5 0 0 1 0 7M17.5 8a6 6 0 0 1 0 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10.5" cy="14" r="1.4" fill="currentColor"/></svg>',
  portal:
    '<svg class="loop-ico" viewBox="0 0 28 28" fill="none" aria-hidden="true"><ellipse cx="14" cy="14" rx="6" ry="10" stroke="currentColor" stroke-width="1.5"/><ellipse cx="14" cy="14" rx="11" ry="5.5" stroke="currentColor" stroke-width="1.5" opacity=".45"/><circle cx="14" cy="14" r="2.4" fill="currentColor"/></svg>',
  // value icons
  vMoney:
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3v14M13 6.5a3 3 0 0 0-3-1.5c-1.7 0-3 .9-3 2.3 0 3.2 6 1.7 6 5 0 1.4-1.3 2.4-3 2.4a3.2 3.2 0 0 1-3.1-1.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  vChart:
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 17h14M6 14V9M10 14V4M14 14v-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  vBox: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5 17 6v8l-7 3.5L3 14V6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 6l7 3.5L17 6M10 9.5v8" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  vBolt:
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M11 2 4 11h4.5L9 18l7-9h-4.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};

/** Line-art product glyphs for the picker, so the list reads without the canvas. */
const GLYPH = {
  tee: '<svg class="glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M12 5 5 8l2 5.5 2.6-1V27h12.8V12.5l2.6 1L27 8l-7-3a4 4 0 0 1-8 0z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  hoodie:
    '<svg class="glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M12 5 5 8.5l2.4 6 2.2-.9V27h12.8V13.6l2.2.9 2.4-6L20 5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 5a4.2 4.2 0 0 0 8 0M16 13.5v5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  keychain:
    '<svg class="glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="8" r="3.6" stroke="currentColor" stroke-width="1.4"/><rect x="9.5" y="13.5" width="13" height="13" rx="3.4" stroke="currentColor" stroke-width="1.4"/><circle cx="16" cy="20" r="2.2" stroke="currentColor" stroke-width="1.4"/></svg>',
  plush:
    '<svg class="glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="18" r="8" stroke="currentColor" stroke-width="1.4"/><circle cx="8.5" cy="9.5" r="3.6" stroke="currentColor" stroke-width="1.4"/><circle cx="23.5" cy="9.5" r="3.6" stroke="currentColor" stroke-width="1.4"/><path d="M13.5 17h.01M18.5 17h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  deskmat:
    '<svg class="glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="3.5" y="10" width="25" height="12" rx="3" stroke="currentColor" stroke-width="1.4"/><rect x="18" y="13" width="5" height="6.5" rx="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M20.5 14.5v1.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
};

/** Abstract preset marks a creator can drop on a product with no upload. */
const MARKS = {
  bolt: '<svg viewBox="0 0 24 24" fill="none"><path d="M13.5 2 5 13.5h5.2L9.5 22 19 10.5h-5.4z" fill="currentColor"/></svg>',
  ring: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  prism:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2.5 21.5 19h-19z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9.5 16 19H8z" fill="currentColor"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7.5" height="7.5" rx="1.4" fill="currentColor"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.4" stroke="currentColor" stroke-width="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.4" stroke="currentColor" stroke-width="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.4" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 1.5c0 5.8 4.7 10.5 10.5 10.5C16.7 12 12 16.7 12 22.5 12 16.7 7.3 12 1.5 12 7.3 12 12 7.3 12 1.5z" fill="currentColor"/></svg>',
};

// ---------------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------------

const VALUES = [
  {
    ico: ICON.vMoney,
    h: "Zero cost to you",
    p: "MEDIALIFE funds product development, sampling, production, inventory, the immersive build and fulfilment. You approve the creative. We carry the inventory risk.",
    foot: `<span class="pill"><span class="dot"></span>$0 up front</span>`,
  },
  {
    ico: ICON.vBox,
    h: "Real product, really made",
    p: "Six modelled categories from a team that has put original IP into Hot Topic, Zumiez, Urban Outfitters and 1,750+ retail doors. Not print-on-demand.",
    foot: `<span class="pill"><span class="dot"></span>6 categories</span>`,
  },
  {
    ico: ICON.scan.replace("loop-ico", ""),
    h: "Every unit is a channel",
    p: "A normal t-shirt stops working the moment it is sold. An activated one keeps sending your fans back to your experience, and tells you when it does.",
    foot: `<span class="pill"><span class="dot"></span>App-free</span>`,
  },
  {
    ico: ICON.vChart,
    h: "Evidence, not vibes",
    p: "Commercial and engagement data on the same report: units, sell-through, price-point performance, activations, dwell time and outbound traffic to your game.",
    foot: `<span class="pill"><span class="dot"></span>90-day review</span>`,
  },
];

const COMPARE = [
  [
    "Physical product is the endpoint",
    "Physical product is a persistent channel back to your experience",
  ],
  ["Limited visibility after purchase", "Post-purchase engagement is measurable, per unit"],
  ["Retail drives product sales", "Retail drives sales, IP discovery and platform return"],
  [
    "Products compete on design and IP alone",
    "The activation itself is a point of differentiation",
  ],
  [
    "No connection between owning it and playing",
    "Approved rewards and content connect the product to your game",
  ],
];

function heroSection() {
  return `
  <section class="hero">
    <div class="wrap">
      <div>
        <span class="pill pill--live rv"><span class="dot"></span>Now onboarding Roblox creators</span>
        <h1 class="rv rv-d1">Launch your own <em class="grad">activated merch line.</em></h1>
        <p class="lede rv rv-d2">
          You have the characters, the look and the community. We design the products with you,
          pay for them, make them and ship them — and every piece carries a chip that opens an
          experience and sends the buyer back into your game with a reward.
        </p>
        <div class="hero-cta rv rv-d3">
          <a class="btn btn--primary btn--lg tap" href="#studio">Design your line ${ICON.arrow}</a>
          <a class="btn btn--lg btn--ghost tap" href="#activate">I already sell merch</a>
        </div>
        <div class="hero-facts rv rv-d4">
          <div class="hero-fact"><b>$0</b><span>Cost to you</span></div>
          <div class="hero-fact"><b>2</b><span>Things we need</span></div>
          <div class="hero-fact"><b>${pct(PROGRAM.economics.royaltyOnPlatform)}<sup>*</sup></b><span>Your royalty</span></div>
        </div>
        <p class="tiny rv rv-d4" style="margin-top:14px;max-width:52ch">* Indicative on-platform royalty for
        modelling. Final royalty, term and territory are set in your program agreement.</p>
      </div>

      <div class="hero-stage rv rv-d2">
        <img src="assets/img/hero-loop.webp" alt="" width="1920" height="1080"
             style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.9" fetchpriority="high" />
        <canvas id="heroCanvas" aria-hidden="true" style="position:absolute;inset:0"></canvas>
        <div class="stage-label"><span class="mono">Activated Merchandise${marks("®")}</span></div>
      </div>
    </div>
  </section>`;
}

/** The whole program. Two of the three steps belong to the creator. */
function stepsSection() {
  return `
  <section class="band band--tight" id="how">
    <div class="wrap">
      <div class="sec-head rv">
        <span class="mono">01 / How it works</span>
        <h2>Two things from you. We do the rest.</h2>
      </div>
      <ol class="steps-flow">
        ${STEPS.map(
          (st, i) => `
        <li class="step-card glass glass-sheen card--hover rv rv-d${i}">
          <span class="step-n">${e(st.n)}</span>
          <span class="step-owner${st.owner === "You" ? " is-you" : ""}">${e(st.owner)}</span>
          <h3>${e(st.title)}</h3>
          <p>${e(st.body)}</p>
        </li>`,
        ).join("")}
      </ol>
      <p class="tiny rv" style="margin-top:20px;max-width:64ch">No artwork yet? Our design team builds it
      with you from your characters, your logo and your in-game look. Plenty of creators arrive with
      nothing but the game.</p>
    </div>
  </section>`;
}

function loopSection() {
  return `
  <section class="band band--tight" id="loop">
    <div class="wrap">
      <div class="sec-head rv">
        <span class="mono">02 / What "activated" means</span>
        <h2>The product keeps working after they buy it.</h2>
        <p class="lede">A normal piece of merch stops the moment it is sold. An activated one is a
        door back into your game, and it tells you every time someone walks through it.</p>
      </div>
      <div class="loop" id="loopTrack">
        ${LOOP.map(
          (st, i) => `
        <article class="loop-step rv rv-d${i}" data-step="${i}">
          <i class="bar"></i>
          ${[ICON.shirt, ICON.scan, ICON.game, ICON.portal][i]}
          <span class="n">${e(st.n)}</span>
          <h3>${e(st.title)}</h3>
          <p>${e(st.body)}</p>
        </article>`,
        ).join("")}
      </div>
    </div>
  </section>`;
}

/** The second door: creators who already sell merch. */
function activateSection() {
  const path = PATHS.find((p) => p.id === "activate");
  return `
  <section class="band" id="activate">
    <div class="wrap">
      <div class="card glass glass-sheen split-card rv">
        <div>
          <span class="mono">05 / ${e(path.kicker)}</span>
          <h2 style="margin-top:14px">${e(path.title)}</h2>
          <p class="lede" style="margin-top:16px">${e(path.body)}</p>
          <ul class="tick-list" style="margin-top:20px">
            ${path.points.map((pt) => `<li>${e(pt)}</li>`).join("")}
          </ul>
          <a class="btn btn--primary tap" href="#apply" style="margin-top:24px">${e(path.cta)} ${ICON.arrow}</a>
        </div>
        <img src="assets/img/scan-activate.webp" alt="A hand holds a phone above the sleeve of a black hoodie, where a small activation tag glows."
             width="1800" height="1200" loading="lazy" decoding="async"
             style="border-radius:var(--radius-md);border:1px solid var(--border)" />
      </div>
    </div>
  </section>`;
}

function valueSection() {
  return `
  <section class="band" id="why">
    <div class="wrap">
      <div class="sec-head rv">
        <span class="mono">03 / Why this is different</span>
        <h2>Most merch programs end at the cash register.</h2>
        <p class="lede">Activated Merchandise${marks("®")} does not. The product is the start of the
        relationship, not the end of it — and that is the part you can actually measure.</p>
      </div>

      <div class="grid grid--4">
        ${VALUES.map(
          (v, i) => `
        <article class="card card--hover rv rv-d${i}">
          <div class="val">
            <span class="ico">${v.ico}</span>
            <h3>${e(v.h)}</h3>
            <p>${e(v.p)}</p>
            <div class="foot">${v.foot}</div>
          </div>
        </article>`,
        ).join("")}
      </div>

      <div class="compare rv">
        <div class="compare-row compare-head">
          <div>Conventional licensed merch</div>
          <div>Activated Merchandise${marks("®")}</div>
        </div>
        ${COMPARE.map(
          ([a, b]) => `
        <div class="compare-row"><div>${e(a)}</div><div>${e(b)}</div></div>`,
        ).join("")}
      </div>
    </div>
  </section>`;
}

function studioSection() {
  const swatches = COLORWAYS.map(
    (c, i) => `
    <button type="button" class="sw" data-color="${e(c.id)}" data-name="${e(c.name)}"
            style="background:${e(c.hex)}" aria-pressed="${i === 0 ? "true" : "false"}"
            aria-label="Colourway: ${e(c.name)}"></button>`,
  ).join("");

  const products = PRODUCTS.map(
    (p, i) => `
    <button type="button" class="prod" data-product="${e(p.id)}" aria-pressed="${i < 2 ? "true" : "false"}">
      ${GLYPH[p.id]}
      <span class="meta"><span class="nm">${e(p.name)}</span><span class="tg">${marks(e(p.tag))}</span></span>
      <span class="pr" data-price-for="${e(p.id)}">$${p.price}</span>
      <span class="check" role="checkbox" tabindex="0" aria-checked="${i < 2 ? "true" : "false"}"
            aria-label="Include ${e(p.name)} in the drop">${ICON.check}</span>
    </button>`,
  ).join("");

  const acts = ACTIVATIONS.map(
    (a) => `
    <button type="button" data-activation="${e(a.id)}" aria-pressed="${a.id === "both" ? "true" : "false"}">${e(a.name)}</button>`,
  ).join("");

  const presetMarks = Object.entries(MARKS)
    .map(
      ([k, svg], i) => `
    <button type="button" class="mark" data-mark="${e(k)}" aria-pressed="${i === 0 ? "true" : "false"}" aria-label="Preset mark: ${e(k)}">${svg}</button>`,
    )
    .join("");

  return `
  <section class="band studio-band" id="studio">
    <div class="wrap">
      <div class="sec-head rv">
        <span class="mono">04 / The drop studio</span>
        <h2>Build the drop you would actually want.</h2>
        <p class="lede">Pick your SKUs, set the colourway, drop your mark on it and press
        <b style="color:var(--foreground);font-weight:500">Activate</b> to watch the whole loop run.
        Everything you build here carries into your application.</p>
      </div>

      <div class="studio rv">
        <div class="studio-bar">
          <span class="mono">Drop Studio</span>
          <span class="spacer"></span>
          <div class="studio-tools">
            <button type="button" class="icon-btn" id="btnSound" aria-pressed="false" aria-label="Toggle interface sound" title="Sound">${ICON.sound}</button>
            <button type="button" class="icon-btn" id="btnReset" aria-label="Reset the studio" title="Reset">${ICON.reset}</button>
            <button type="button" class="icon-btn" id="btnFull" aria-pressed="false" aria-label="Expand the viewport" title="Expand">${ICON.expand}</button>
          </div>
        </div>

        <div class="studio-body">
          <!-- ---------- viewport ---------- -->
          <div class="viewport" id="viewport">
            <canvas id="studioCanvas" tabindex="0" aria-describedby="vpHint"
                    aria-label="3D preview of your configured product. Arrow keys orbit it, plus and minus zoom, Home resets. Every option is also available in the panel beside this viewport."></canvas>

            <div class="viewport-badge">
              <span class="pill"><span class="dot"></span><span id="vpProduct">T-Shirt</span></span>
              <span class="pill" id="vpTagPill" hidden><span class="dot"></span>Activation tag</span>
            </div>

            <div class="act-overlay" id="actOverlay" aria-hidden="true">
              <div class="act-cap"><span class="idx" id="actIdx">01</span><span id="actText"></span></div>
              <div class="act-prog"><i id="actProg"></i></div>
            </div>

            <p class="viewport-hint" id="vpHint">
              <span class="hint-fine">Drag to orbit · scroll to zoom · arrow keys when focused</span>
              <span class="hint-coarse">Drag to rotate · pinch to zoom</span>
            </p>

            <div class="viewport-msg" id="viewportMsg">
              <div>
                <div class="spin" id="vpSpin"></div>
                <p class="mono" id="vpMsgText">Loading studio</p>
                <div id="studioFallback">
                  <img src="assets/img/merch-flatlay.webp" alt="The Activated Merchandise product categories laid out on a dark surface: t-shirt, hoodie, snapback, keychain, vinyl figure and deskmat." width="1920" height="1080" />
                  <p class="sub" style="max-width:36ch;margin-inline:auto">Your browser could not start the 3D studio. Every option is still available in the panel — and your selections still carry into the application.</p>
                </div>
              </div>
            </div>
          </div>

          <!-- ---------- panel ---------- -->
          <div class="panel">
            <div class="panel-tabs" role="tablist" aria-label="Drop studio controls">
              <button role="tab" id="tab-build" aria-controls="tp-build" aria-selected="true">Build</button>
              <button role="tab" id="tab-brand" aria-controls="tp-brand" aria-selected="false">Artwork</button>
              <button role="tab" id="tab-numbers" aria-controls="tp-numbers" aria-selected="false">Numbers</button>
            </div>

            <div class="panel-scroll">
              <!-- BUILD -->
              <div class="tabpanel" role="tabpanel" id="tp-build" aria-labelledby="tab-build">
                <div class="field">
                  <span class="field-label">Your assortment <span class="v"><span id="skuCount">2</span> of ${e(PROGRAM.pilot.skusPerProperty)}</span></span>
                  <div class="prod-list">${products}</div>
                  <p class="tiny" style="margin-top:10px">Tap a row to view it in 3D; tap the tick to add or
                  remove it. Pilots run ${e(PROGRAM.pilot.skusPerProperty)} SKUs per property — pick more here to model a
                  wider drop and we will narrow it together during onboarding.</p>
                </div>

                <div class="field">
                  <span class="field-label">Price <span class="v" id="priceLabel">$32</span></span>
                  <input type="range" class="range" id="priceRange" min="15" max="70" step="1" value="32"
                         aria-label="Suggested on-platform price for the selected product" />
                  <p class="tiny">Suggested on-platform range across the catalogue is
                  $${PROGRAM.economics.priceFloor}–$${PROGRAM.economics.priceCeiling}. Each category has its own band.</p>
                </div>

                <div class="field">
                  <span class="field-label">Colourway</span>
                  <div class="swatches">${swatches}</div>
                </div>

                <div class="field">
                  <span class="field-label">Activation</span>
                  <div class="seg" id="actSeg">${acts}</div>
                  <p class="tiny" id="actBlurb" style="margin-top:11px">${e(ACTIVATIONS[2].blurb)}</p>
                </div>

                <div class="field">
                  <span class="field-label">Show the tag <span class="v" id="tagState">On</span></span>
                  <div class="seg" id="tagSeg">
                    <button type="button" data-tag="on" aria-pressed="true">Visible</button>
                    <button type="button" data-tag="off" aria-pressed="false">Hidden</button>
                  </div>
                  <p class="tiny" style="margin-top:11px">On real product the chip is hidden in a care label, cuff or hang tag. This shows you where it lives.</p>
                </div>
              </div>

              <!-- ARTWORK -->
              <div class="tabpanel" role="tabpanel" id="tp-brand" aria-labelledby="tab-brand" hidden>
                <div class="field">
                  <span class="field-label">Print area <span class="v" id="printCount">1 print</span></span>
                  <div class="zone-row" id="zoneRow" role="group" aria-label="Choose which print area to work on"></div>
                  <p class="tiny" style="margin-top:10px">Each area is a real safe area — the space a
                  printer can actually reproduce on that product. Put artwork in as many as you like.</p>
                </div>

                <p class="tiny" id="artEmpty" hidden style="color:var(--muted-foreground)">
                  Nothing printed in this area yet. Upload your artwork or pick a preset below to add it.</p>

                <div class="field">
                  <span class="field-label">Your artwork</span>
                  <div class="dropzone" id="dropzone">
                    <button type="button" class="btn btn--sm tap" id="btnUpload">Upload your artwork</button>
                    <p>PNG or SVG, transparent background.<br />Drag and drop works too.</p>
                    <input type="file" id="fileInput" accept="image/png,image/svg+xml,image/jpeg,image/webp" hidden />
                  </div>
                  <p class="tiny" style="margin-top:10px"><b style="color:var(--muted-foreground)">Nothing is uploaded.</b>
                  Your image is read in the browser and never leaves this device.</p>
                  <div class="decal-preview" id="decalPreview" hidden>
                    <img id="decalImg" alt="Preview of the artwork you added" />
                    <div style="flex:1;min-width:0">
                      <div class="tiny" id="decalName" style="color:var(--muted-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
                      <button type="button" class="btn btn--sm btn--ghost tap" id="btnClearDecal" style="margin-top:7px">Remove</button>
                    </div>
                  </div>
                </div>

                <div class="field">
                  <span class="field-label">Or start from a preset</span>
                  <div class="mark-grid">${presetMarks}</div>
                </div>

                <div id="artControls">
                  <div class="field">
                    <span class="field-label">Placement in <b id="artZoneName" style="color:var(--foreground);font-weight:500">the front chest</b></span>
                    <div class="art-grid">
                      <label class="art-ctl">
                        <span>Size <i class="v" id="scaleLabel">72%</i></span>
                        <input type="range" class="range" id="scaleRange" min="15" max="100" step="1" value="72"
                               aria-label="Artwork size, as a percentage of the safe area" />
                      </label>
                      <label class="art-ctl">
                        <span>Rotate <i class="v" id="rotLabel">0°</i></span>
                        <input type="range" class="range" id="rotRange" min="-180" max="180" step="1" value="0"
                               aria-label="Artwork rotation in degrees" />
                      </label>
                      <label class="art-ctl">
                        <span>Across <i class="v" id="acrossLabel">Centre</i></span>
                        <input type="range" class="range" id="acrossRange" min="-100" max="100" step="1" value="0"
                               aria-label="Move the artwork left or right inside the safe area" />
                      </label>
                      <label class="art-ctl">
                        <span>Up <i class="v" id="upLabel">Centre</i></span>
                        <input type="range" class="range" id="upRange" min="-100" max="100" step="1" value="0"
                               aria-label="Move the artwork up or down inside the safe area" />
                      </label>
                    </div>
                    <p class="tiny" style="margin-top:12px">Artwork is clamped to the safe area, so it
                    cannot run off the edge. You can also drag it directly on the product.</p>
                  </div>

                  <div class="field">
                    <span class="field-label">Artwork colour</span>
                    <div class="seg seg-glass" id="inkSeg">
                      <button type="button" data-ink="auto" aria-pressed="true">Auto</button>
                      <button type="button" data-ink="light" aria-pressed="false">Light</button>
                      <button type="button" data-ink="dark" aria-pressed="false">Dark</button>
                      <button type="button" data-ink="ember" aria-pressed="false">Ember</button>
                    </div>
                    <p class="tiny" style="margin-top:10px">Applies to preset marks. Uploaded artwork
                    prints exactly as you supplied it.</p>
                  </div>

                  <div class="field">
                    <span class="field-label">Safe area outline</span>
                    <div class="seg seg-glass" id="guideSeg">
                      <button type="button" data-guide="on" aria-pressed="true">Show</button>
                      <button type="button" data-guide="off" aria-pressed="false">Hide</button>
                    </div>
                    <button type="button" class="btn btn--sm btn--ghost tap" id="btnRemoveArt" style="margin-top:14px">Remove this print</button>
                  </div>
                </div>
              </div>

              <!-- NUMBERS -->
              <div class="tabpanel" role="tabpanel" id="tp-numbers" aria-labelledby="tab-numbers" hidden>
                <div class="field">
                  <span class="field-label">Monthly experience visits <span class="v" id="visitsLabel">1.5M</span></span>
                  <input type="range" class="range" id="visitsRange" min="0" max="1000" step="1" value="560"
                         aria-label="Your monthly experience visits" />
                  <p class="tiny">Use your real number from the Creator Dashboard. This is the only input we cannot estimate for you.</p>
                </div>

                <div class="field">
                  <span class="field-label">Purchase rate <span class="v" id="attachLabel">0.10%</span></span>
                  <input type="range" class="range" id="attachRange"
                         min="${MODEL.attachRange.min * 10000}" max="${MODEL.attachRange.max * 10000}" step="1"
                         value="${MODEL.defaults.attachRate * 10000}"
                         aria-label="Share of monthly visitors who buy" />
                  <p class="tiny">Share of monthly visitors who buy something. ${(MODEL.defaults.attachRate * 100).toFixed(2)}% is a deliberately
                  conservative starting point — move it and watch what changes.</p>
                </div>

                <div class="field">
                  <span class="field-label">Projected ${PROGRAM.pilot.reviewDays}-day pilot</span>
                  <div class="readout">
                    <div class="ro-row"><span class="k">Units</span><span class="v" id="outUnits">—</span></div>
                    <div class="ro-row"><span class="k">Avg. order value</span><span class="v" id="outAov">—</span></div>
                    <div class="ro-row"><span class="k">Gross merch value</span><span class="v" id="outGmv">—</span></div>
                    <div class="ro-row ro-row--hero"><span class="k">Your royalty</span><span class="v" id="outRoyalty">—</span></div>
                  </div>
                  <div class="split" id="skuSplit" hidden>
                    <span class="field-label" style="margin-bottom:9px">Where it comes from</span>
                    <div class="split-bar" id="splitBar" role="img" aria-labelledby="splitTable"></div>
                    <table class="split-table" id="splitTable">
                      <caption class="sr-only">Modelled units and gross merchandise value by product</caption>
                      <thead><tr><th scope="col">SKU</th><th scope="col">Units</th><th scope="col">Value</th></tr></thead>
                      <tbody id="splitRows"></tbody>
                    </table>
                  </div>
                  <p class="note" id="capNote" hidden><b>Capped by pilot inventory.</b> We deliberately hold limited
                  stock during validation — roughly ${MODEL.inventoryCapPerSku.toLocaleString("en-US")} units per SKU. Selling out fast
                  is the signal that triggers a reorder at a lower unit cost.</p>
                  <p class="note">${e(MODEL.disclaimer)}</p>
                </div>

                <div class="field">
                  <span class="field-label">The terms behind that number</span>
                  <div class="readout">
                    <div class="ro-row"><span class="k">On-platform royalty</span><span class="v">${pct(PROGRAM.economics.royaltyOnPlatform)} of net sales</span></div>
                    <div class="ro-row"><span class="k">Retail royalty</span><span class="v">${pct(PROGRAM.economics.royaltyRetail)} of wholesale</span></div>
                    <div class="ro-row"><span class="k">Your cost</span><span class="v">$0</span></div>
                    <div class="ro-row"><span class="k">Inventory risk</span><span class="v">MEDIALIFE</span></div>
                  </div>
                  <p class="note">${e(PROGRAM.economics.note)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="studio-foot">
          <div class="studio-sum">
            <span class="item"><span>Drop</span><b id="sumSkus">2 SKUs</b></span>
            <span class="item"><span>Royalty / 90d</span><b id="sumRoyalty">—</b></span>
          </div>
          <span class="spacer"></span>
          <button type="button" class="btn btn--sm" id="btnActivate">${ICON.play} Run the activation</button>
          <button type="button" class="btn btn--sm btn--primary" id="btnPass">${ICON.share} Get your Drop Pass</button>
        </div>
      </div>

      <p class="tiny rv" style="margin-top:18px;max-width:70ch">
        The Drop Studio is a design and modelling tool. Products shown are representative of the six
        modelled categories; final construction, trims and activation placement are set during sampling.
      </p>
    </div>
  </section>`;
}

function proofSection() {
  return `
  <section class="band" id="proof">
    <div class="wrap">
      <div class="sec-head rv">
        <span class="mono">06 / Track record</span>
        <h2>We have already run this loop at retail scale.</h2>
        <p class="lede">These are measured results from a shipped MEDIALIFE activated print program
        with Netflix, across 150+ North American retail locations and the largest fan conventions
        in the country.</p>
      </div>

      <div class="stats rv">
        ${PROOF.stats
          .map(
            (s) => `
        <div class="stat">
          <b data-count="${e(s.value)}">${e(s.value)}</b>
          <span class="label">${e(s.label)}</span>
          <span class="foot">${e(s.foot)}</span>
        </div>`,
          )
          .join("")}
      </div>

      <div class="grid grid--2 rv" style="margin-top:16px">
        <img src="assets/img/retail-endcap.webp" alt="A matte black modular retail endcap in a darkened store aisle, framed by a cyan-to-magenta light strip with an illuminated screen panel and merchandise on pegs."
             width="1920" height="1080" loading="lazy" decoding="async"
             style="border-radius:var(--radius-lg);border:1px solid var(--border);height:100%;object-fit:cover" />
        <article class="card">
          <span class="mono">Running in parallel</span>
          <h3 style="margin-top:14px">Activated Retail</h3>
          <p class="sub" style="margin-top:12px">Alongside the merchandising pilot, MEDIALIFE is developing
          an activated retail concept with Roblox: modular interactive displays that introduce shoppers to
          Roblox-native IP in a physical store and route them straight into the platform.</p>
          <p class="sub" style="margin-top:12px">It is a second physical channel built for discovery, reviewed
          by location, property and creative treatment. Properties that perform in the merchandising
          pilot are the first candidates for it.</p>
        </article>
      </div>

      <div class="track" style="margin-top:44px">
        ${PROOF.track
          .map(
            (t, i) => `
        <article class="track-item rv rv-d${Math.min(i, 4)}">
          <span class="yr">${e(t.year)}</span>
          <div>
            <h3>${e(t.title)}</h3>
            <span class="kind">${e(t.kind)}</span>
            <p>${e(t.body)}</p>
          </div>
        </article>`,
          )
          .join("")}
      </div>
    </div>
  </section>`;
}

function faqSection() {
  return `
  <section class="band" id="faq">
    <div class="wrap" style="max-width:900px">
      <div class="sec-head rv">
        <span class="mono">07 / Questions</span>
        <h2>The things creators actually ask.</h2>
      </div>
      <div class="faq rv">
        ${FAQ.map(
          (f) => `
        <details>
          <summary>${e(f.q)}</summary>
          <div class="ans">${e(f.a)}</div>
        </details>`,
        ).join("")}
      </div>
    </div>
  </section>`;
}

const GENRES = [
  "Simulator",
  "Roleplay",
  "Obby / Platformer",
  "Tycoon",
  "Horror",
  "Fighting / PvP",
  "Survival",
  "Social / Hangout",
  "RPG",
  "Racing",
  "Other",
];
const ROLES = [
  "Owner / Founder",
  "Lead developer",
  "Studio / Group",
  "Manager or agent",
  "Publisher",
  "Other",
];
const WINDOWS = [
  "As soon as possible",
  "Next quarter",
  "Tied to an in-game event",
  "Tied to a convention",
  "Still deciding",
];
const MERCH_HISTORY = [
  "Never sold merch",
  "Sold UGC only",
  "Ran a print-on-demand store",
  "Sold real merch before",
  "Currently selling merch",
];

function applySection() {
  const chips = (name, list) =>
    list
      .map(
        (v) => `
    <button type="button" class="chip" data-chip="${e(name)}" data-value="${e(v)}" aria-pressed="false">${e(v)}</button>`,
      )
      .join("");

  return `
  <section class="band apply-band" id="apply">
    <div class="wrap">
      <div class="sec-head rv">
        <span class="mono">08 / Apply</span>
        <h2>Four short steps. About three minutes.</h2>
        <p class="lede">Applying costs nothing and commits you to nothing. We review every submission
        against fit, not follower count, and reply either way.</p>
      </div>

      <div class="apply rv">
        <div class="apply-head">
          <span class="mono">Creator application · ${PROGRAM.short}</span>
          <div class="steps" id="steps">
            ${["Your property", "Your audience", "Your drop", "You"]
              .map(
                (l, i) => `
            <div class="step-dot${i === 0 ? " is-on" : ""}" data-step="${i}"><span class="bar"><i></i></span><span class="lb">${e(l)}</span></div>`,
              )
              .join("")}
          </div>
        </div>

        <div class="apply-body">
          <form id="applyForm" name="roblox-creator-application" method="POST"
                action="/__forms.html" data-netlify="true"
                netlify-honeypot="company-website" novalidate>
            <input type="hidden" name="form-name" value="roblox-creator-application" />
            <input type="hidden" name="drop-config" id="dropConfigField" />
            <p style="display:none"><label>Leave this empty <input name="company-website" tabindex="-1" autocomplete="off" /></label></p>

            <!-- STEP 1 -->
            <div class="fstep is-on" data-step="0">
              <h3>Tell us about your experience.</h3>
              <p class="sub">We only need enough to see whether it is a fit.</p>
              <div class="fgrid">
                <div class="fld span2">
                  <label for="f-game">Experience name <span class="req">*</span></label>
                  <input type="text" id="f-game" name="experience-name" required autocomplete="off" placeholder="The name players know it by" />
                  <span class="err">Please tell us what your experience is called.</span>
                </div>
                <div class="fld span2">
                  <label for="f-url">Roblox experience link <span class="req">*</span></label>
                  <input type="url" id="f-url" name="experience-url" required inputmode="url" placeholder="https://www.roblox.com/games/..." />
                  <span class="hint">Paste the link straight from your address bar.</span>
                  <span class="err">Please paste a valid link, starting with https://</span>
                </div>
                <div class="fld">
                  <label for="f-genre">Genre</label>
                  <select id="f-genre" name="genre">${GENRES.map((g) => `<option>${e(g)}</option>`).join("")}</select>
                </div>
                <div class="fld">
                  <label for="f-role">Your role</label>
                  <select id="f-role" name="role">${ROLES.map((r) => `<option>${e(r)}</option>`).join("")}</select>
                </div>
              </div>
            </div>

            <!-- STEP 2 -->
            <div class="fstep" data-step="1">
              <h3>How big is your community?</h3>
              <p class="sub">Approximate is fine. We are looking at engagement and fit, not raw scale — a
              committed mid-size community usually outperforms a large passive one.</p>
              <div class="fgrid">
                <div class="fld">
                  <label for="f-visits">Monthly visits <span class="req">*</span></label>
                  <input type="number" id="f-visits" name="monthly-visits" required min="0" step="1000" inputmode="numeric" placeholder="1500000" />
                  <span class="err">A rough monthly visit count, please.</span>
                </div>
                <div class="fld">
                  <label for="f-ccu">Typical peak CCU</label>
                  <input type="number" id="f-ccu" name="peak-ccu" min="0" step="10" inputmode="numeric" placeholder="800" />
                </div>
                <div class="fld span2">
                  <label>Have you sold merch before?</label>
                  <div class="chips">${chips("merch-history", MERCH_HISTORY)}</div>
                  <input type="hidden" name="merch-history" id="f-merch" />
                </div>
                <div class="fld span2">
                  <label for="f-community">Where does your community live outside the experience?</label>
                  <input type="text" id="f-community" name="community-links" placeholder="Discord, TikTok, YouTube, X — whichever matter most" />
                  <span class="hint">This is how we plan the launch with you.</span>
                </div>
              </div>
            </div>

            <!-- STEP 3 -->
            <div class="fstep" data-step="2">
              <h3>What do you want to make?</h3>
              <p class="sub">Pulled straight from your Drop Studio build — change anything here.</p>
              <div class="fgrid">
                <div class="fld span2">
                  <label>Your assortment</label>
                  <div class="review" id="dropSummary"></div>
                  <span class="hint">Edit it any time in the <a href="#studio" style="color:var(--primary)">Drop Studio</a>.</span>
                </div>
                <div class="fld span2">
                  <label>Ideal launch window</label>
                  <div class="chips">${chips("launch-window", WINDOWS)}</div>
                  <input type="hidden" name="launch-window" id="f-window" />
                </div>
                <div class="fld span2">
                  <label for="f-notes">Anything we should know about your IP?</label>
                  <textarea id="f-notes" name="notes" placeholder="Characters, existing licensing deals, art you already own, a moment you want to hit…"></textarea>
                </div>
              </div>
            </div>

            <!-- STEP 4 -->
            <div class="fstep" data-step="3">
              <h3>How do we reach you?</h3>
              <p class="sub">A real person reads this and replies either way.</p>
              <div class="fgrid">
                <div class="fld">
                  <label for="f-name">Your name <span class="req">*</span></label>
                  <input type="text" id="f-name" name="contact-name" required autocomplete="name" />
                  <span class="err">Please tell us your name.</span>
                </div>
                <div class="fld">
                  <label for="f-email">Email <span class="req">*</span></label>
                  <input type="email" id="f-email" name="email" required autocomplete="email" inputmode="email" />
                  <span class="err">Please enter an email we can reply to.</span>
                </div>
                <div class="fld">
                  <label for="f-roblox">Roblox username</label>
                  <input type="text" id="f-roblox" name="roblox-username" autocomplete="off" />
                </div>
                <div class="fld">
                  <label for="f-discord">Discord</label>
                  <input type="text" id="f-discord" name="discord" autocomplete="off" />
                </div>
                <div class="span2" style="margin-top:6px">
                  <div class="check-line">
                    <input type="checkbox" id="f-rights" name="rights-confirmed" required />
                    <label for="f-rights">I hold or represent the rights to this IP and can approve its use on merchandise. <span class="req">*</span></label>
                  </div>
                  <div class="check-line">
                    <input type="checkbox" id="f-contact" name="contact-consent" required />
                    <label for="f-contact">MEDIALIFE may contact me about this application. <span class="req">*</span></label>
                  </div>
                  <div class="check-line">
                    <input type="checkbox" id="f-updates" name="program-updates" />
                    <label for="f-updates">Send me program updates. No more than monthly, and you can stop them any time.</label>
                  </div>
                </div>
                <div class="fld span2">
                  <label>Review</label>
                  <div class="review" id="reviewOut"></div>
                </div>
              </div>
              <p class="tiny" style="margin-top:18px">Submitting an application does not create a contract.
              Program terms, royalty rate, territory and term are set in a separate agreement. Indicative
              figures on this page are for modelling only.</p>
            </div>

            <div class="apply-nav">
              <button type="button" class="btn btn--ghost" id="btnBack" hidden>Back</button>
              <span class="autosave" id="autosave" aria-live="polite"></span>
              <span class="spacer"></span>
              <button type="button" class="btn btn--primary" id="btnNext">Continue ${ICON.arrow}</button>
              <button type="submit" class="btn btn--primary" id="btnSubmit" hidden>Submit application ${ICON.arrow}</button>
            </div>
          </form>

          <div class="sent" id="sent" role="status">
            <div class="tick">${ICON.check}</div>
            <h3>Application received.</h3>
            <p class="sub" style="max-width:44ch;margin:14px auto 0">We read every one. Expect a reply within
            five business days — yes or no, with a reason either way.</p>
            <div class="next card">
              <span class="mono">What happens next</span>
              <ol style="margin:14px 0 0;padding-left:18px;color:var(--muted-foreground);font-size:.89rem;line-height:1.7">
                <li>We review fit, audience and IP readiness.</li>
                <li>If it is a fit, a 30-minute call to walk the assortment and the agreement.</li>
                <li>Onboarding starts, and day 1 of the ${PROGRAM.pilot.reviewDays}-day pilot clock begins.</li>
              </ol>
            </div>
            <div style="margin-top:26px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
              <a class="btn" href="activate/">Preview the fan experience</a>
              <button type="button" class="btn btn--ghost" id="btnAnother">Submit another property</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function passModal() {
  return `
  <div class="pass-modal" id="passModal" role="dialog" aria-modal="true" aria-labelledby="passTitle" hidden>
    <div class="pass-inner">
      <div class="pass-head">
        <span class="mono" id="passTitle">Your Drop Pass</span>
        <span class="spacer"></span>
        <button type="button" class="icon-btn" id="passClose" aria-label="Close">${ICON.close}</button>
      </div>
      <div class="pass-body">
        <img class="pass-shot" id="passShot" alt="A rendered sheet showing the drop you configured." />
        <div class="pass-qr">
          <canvas id="passQr" width="96" height="96" aria-label="QR code linking to this drop configuration"></canvas>
          <div>
            <p class="mono" style="margin-bottom:6px">Scan to reopen</p>
            <p class="tiny">This code carries your exact build. Scan it on a phone or send it to whoever
            signs off on merch — it opens the studio with everything already set.</p>
          </div>
        </div>
        <div class="pass-link">
          <input type="text" id="passUrl" readonly aria-label="Shareable link to this drop" />
          <button type="button" class="btn btn--sm" id="passCopy">${ICON.copy} Copy</button>
        </div>
        <div class="pass-actions">
          <button type="button" class="btn btn--primary" id="passDownload">${ICON.download} Download sheet</button>
          <a class="btn" href="#apply" id="passApply">Use this in my application ${ICON.arrow}</a>
        </div>
      </div>
    </div>
  </div>`;
}

function footer() {
  return `
  <footer class="foot">
    <div class="wrap">
      <div>
        <div class="brand" style="margin-bottom:14px">
          <img src="/card/mark.svg" alt="" width="26" height="26" />
          <b>MEDIALIFE<sup>™</sup></b><span class="x">×</span><span class="rb">ROBLOX</span>
        </div>
        <p class="tiny" style="max-width:34ch">Activated Merchandise<sup>®</sup>, Activated Apparel<sup>®</sup>
        and Activated Print<sup>®</sup> are registered trademarks of MEDIALIFE.</p>
      </div>
      <div class="cols">
        <div>
          <h4>Program</h4>
          <ul>
            <li><a href="#loop">How it works</a></li>
            <li><a href="#studio">Drop Studio</a></li>
            <li><a href="#pilot">The ${PROGRAM.pilot.reviewDays}-day pilot</a></li>
            <li><a href="#data">What you get back</a></li>
          </ul>
        </div>
        <div>
          <h4>More</h4>
          <ul>
            <li><a href="activate/">Fan experience preview</a></li>
            <li><a href="#proof">Track record</a></li>
            <li><a href="#team">The team</a></li>
            <li><a href="#faq">Questions</a></li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <ul>
            <li><a href="#apply">Apply to the program</a></li>
            <li><a href="https://medialife.ai" rel="noopener">medialife.ai</a></li>
          </ul>
        </div>
      </div>
      <div class="foot-legal">
        <span class="tiny">© ${new Date().getFullYear()} MEDIALIFE. Roblox is a trademark of Roblox Corporation; use here is descriptive and does not imply endorsement.</span>
        <span class="tiny">Figures marked indicative are modelling assumptions, not offers.</span>
      </div>
    </div>
  </footer>`;
}

// ---------------------------------------------------------------------------
// document
// ---------------------------------------------------------------------------

const TITLE = "Creator Program — MEDIALIFE × Roblox";
const DESC =
  "MEDIALIFE builds, funds and operates physical merch for Roblox creators. NFC and QR in every " +
  "unit opens an app-free experience that sends fans back into your game. $0 up front, 90-day pilot.";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": PAGE_URL,
      name: TITLE,
      description: DESC,
      isPartOf: { "@type": "WebSite", name: "MEDIALIFE", url: SITE },
    },
    {
      "@type": "Organization",
      name: "MEDIALIFE",
      url: SITE,
      description:
        "MEDIALIFE builds Activated Merchandise, Activated Apparel and Activated Print — physical " +
        "products with app-free immersive experiences and measurable post-purchase engagement.",
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${e(TITLE)}</title>
<meta name="description" content="${e(DESC)}" />
<meta name="robots" content="noindex, nofollow" />
<meta name="theme-color" content="#020202" />
<link rel="canonical" href="${PAGE_URL}" />

<meta property="og:type" content="website" />
<meta property="og:title" content="${e(TITLE)}" />
<meta property="og:description" content="${e(DESC)}" />
<meta property="og:url" content="${PAGE_URL}" />
<meta property="og:image" content="${PAGE_URL}assets/img/og-card.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${e(TITLE)}" />
<meta name="twitter:description" content="${e(DESC)}" />
<meta name="twitter:image" content="${PAGE_URL}assets/img/og-card.jpg" />

<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<!-- Identical href to src/routes/__root.tsx so a visitor arriving from the main
     site gets a cache hit rather than a second font fetch. -->
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=block" rel="stylesheet" />
<link rel="stylesheet" href="assets/css/app.css" />
<link rel="preload" as="image" href="assets/img/hero-loop.webp" fetchpriority="high" />

<script type="importmap">
{"imports":{"three":"./vendor/three/build/three.module.js","three/addons/":"./vendor/three/jsm/","qrcode":"./vendor/qrcode/qrcode.esm.js"}}
</script>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div class="bg-grid" aria-hidden="true"></div>
<div class="bg-glow" aria-hidden="true"></div>

<header class="nav" id="nav">
  <div class="wrap">
    <a class="brand" href="#main" aria-label="MEDIALIFE × Roblox creator program">
      <img src="/card/mark.svg" alt="" width="26" height="26" />
      <b>MEDIALIFE<sup>™</sup></b><span class="x">×</span><span class="rb">ROBLOX</span>
    </a>
    <nav class="nav-links" aria-label="Sections">
      <a href="#loop">How it works</a>
      <a href="#studio">Drop Studio</a>
      <a href="#pilot">The pilot</a>
      <a href="#proof">Track record</a>
      <a href="#faq">FAQ</a>
    </nav>
    <a class="btn btn--sm btn--primary" href="#apply" style="margin-left:14px">Apply</a>
  </div>
</header>

<main id="main">
${heroSection()}
${stepsSection()}
${loopSection()}
${valueSection()}
${studioSection()}
${activateSection()}
${proofSection()}
${faqSection()}
${applySection()}
</main>

${footer()}
${passModal()}

<div class="toast" id="toast" role="status" aria-live="polite"><span id="toastText"></span></div>

<script type="module" src="assets/js/app.js"></script>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, "utf8");
console.log(`✓ public/creators/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
