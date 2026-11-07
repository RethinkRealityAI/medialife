// GENERATED from mattercraft/cola-run/HubCore.ts by scripts/build-hub-core.mjs. Don't edit.
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import * as THREE from "three";
const HIDEOUT_VERSION = "5";
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function formatCodeInput(v) {
  let raw = (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.startsWith("BOBO")) raw = raw.slice(4);
  else if ("BOBO".startsWith(raw)) return raw;
  raw = raw.slice(0, 8);
  return "BOBO-" + raw.slice(0, 4) + (raw.length > 4 ? "-" + raw.slice(4) : "");
}
function checkCode(v) {
  let raw = (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.startsWith("BOBO")) raw = raw.slice(4);
  if (!raw) return { ok: false, message: "Enter the code from your card." };
  if (/[01OIL]/.test(raw))
    return {
      ok: false,
      message: "Codes never use 0, 1, O, I or L. Check those characters on your card."
    };
  if (raw.length !== 8)
    return { ok: false, message: "Codes have 8 characters after BOBO, like BOBO-K7RM-9XQC." };
  for (const ch of raw)
    if (!CODE_ALPHABET.includes(ch))
      return { ok: false, message: "That doesn't look like a code." };
  return { ok: true, code: "BOBO-" + raw.slice(0, 4) + "-" + raw.slice(4) };
}
const esc = (s) => String(s ?? "").replace(
  /[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
);
function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1e3);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
const flag = (cc) => /^[A-Z]{2}$/.test(cc || "") ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : "\u{1F310}";
const safeLink = (u) => {
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  try {
    return new URL(u).protocol === "https:" ? u : null;
  } catch {
    return null;
  }
};
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
    }
  }
};
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smooth01 = (t) => t * t * (3 - 2 * t);
const OPEN_YAW = Math.PI / 4;
const UP = new THREE.Vector3(0, 1, 0);
const backOut = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
function srgb(tex) {
  const T = THREE;
  if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
  else tex.encoding = 3001;
}
function rgbTriplet(c) {
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (h) {
    const x = h[1].length === 3 ? [...h[1]].map((d) => d + d).join("") : h[1];
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)).join(",");
  }
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c.trim());
  return m ? `${m[1]},${m[2]},${m[3]}` : null;
}
const svg = (d) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  alerts: svg(
    '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'
  ),
  globe: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
  ),
  leaderboard: svg(
    '<path d="M8 21V11M16 21V7M12 21v-6M4 21h16"/><path d="m12 3 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>'
  ),
  colarun: svg(
    '<rect x="2.5" y="7" width="19" height="11" rx="4"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9"/><circle cx="18" cy="13.8" r=".9"/>'
  ),
  collection: svg('<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M12 21 8.5 9 12 3l3.5 6z"/>'),
  shop: svg(
    '<path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'
  ),
  me: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  power: svg('<path d="M12 3v9"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  home: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>'),
  exit: svg(
    '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l-5-5 5-5M5 12h11"/>'
  ),
  lock: svg(
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
  ),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  wifi: svg(
    '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.3a10 10 0 0 1 14 0M8.5 15.8a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>'
  ),
  paw: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><g fill="currentColor"><ellipse cx="7.4" cy="10.2" rx="1.9" ry="2.4"/><ellipse cx="12" cy="8.7" rx="1.95" ry="2.5"/><ellipse cx="16.6" cy="10.2" rx="1.9" ry="2.4"/><path d="M12 12.8c3.1 0 5.4 2.1 5.4 4.5 0 2-1.8 3.1-3.8 3.1h-3.2c-2 0-3.8-1.1-3.8-3.1 0-2.4 2.3-4.5 5.4-4.5z"/></g></svg>',
  music: svg(
    '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'
  ),
  sound: svg(
    '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'
  ),
  move: svg('<path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01"/><path d="M20.5 3.5V9h-5.5"/>'),
  help: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.8"/><path d="M12 17.2h.01"/>'
  ),
  play: svg('<path d="M8 5.5 18.5 12 8 18.5z"/>'),
  external: svg(
    '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  )
};
const APPS = [
  { id: "alerts", name: "Alerts", color: "#ff4fa3", g: ["#ff7ab8", "#c2186a"], w: 420, h: 520 },
  {
    id: "globe",
    name: "Where's Bobo?",
    color: "#36e3ff",
    g: ["#2a5bd7", "#0b1f6b"],
    w: 820,
    h: 560
  },
  {
    id: "leaderboard",
    name: "Leaderboard",
    color: "#ffc42e",
    g: ["#7a3cff", "#2b0d77"],
    w: 460,
    h: 560
  },
  { id: "colarun", name: "Cola Run", color: "#ff5b5b", g: ["#ffd84d", "#ff7a1a"], w: 440, h: 500 },
  {
    id: "collection",
    name: "Digital Collection",
    color: "#9b7bff",
    g: ["#1e2a4f", "#070b1e"],
    w: 980,
    h: 640
  },
  { id: "shop", name: "Shop", color: "#4fe0a5", g: ["#3df0b0", "#078a61"], w: 420, h: 460 },
  { id: "me", name: "Me", color: "#8fb3ff", g: ["#6f8cff", "#2d3fa8"], w: 380, h: 400 }
];
const tileFor = (a, badge = false) => `<span class="mlh-tile" style="--a:${a.g[0]};--b:${a.g[1]}">${ICON3D[a.id]}${badge ? '<span class="mlh-badge" data-badge hidden></span>' : ""}</span>`;
const DEFS = `<svg class="mlh-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
<linearGradient id="mlhg-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d6e4ff"/></linearGradient>
<linearGradient id="mlhg-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".45" stop-color="#ffcf3a"/><stop offset="1" stop-color="#c97d00"/></linearGradient>
<radialGradient id="mlhg-globe" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e9fdff"/><stop offset=".45" stop-color="#5ae8ff"/><stop offset="1" stop-color="#0a6aa8"/></radialGradient>
<linearGradient id="mlhg-can" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a0f1d"/><stop offset=".3" stop-color="#ff4b5c"/><stop offset=".55" stop-color="#ffb3ba"/><stop offset=".75" stop-color="#e3243a"/><stop offset="1" stop-color="#6d0b18"/></linearGradient>
<linearGradient id="mlhg-alu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f9aad"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#7d889b"/></linearGradient>
<linearGradient id="mlhg-gem1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ecff"/><stop offset="1" stop-color="#b79bff"/></linearGradient>
<linearGradient id="mlhg-gem2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a98bff"/><stop offset="1" stop-color="#5a33d6"/></linearGradient>
<linearGradient id="mlhg-bag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b8f5dc"/></linearGradient>
<radialGradient id="mlhg-head" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#b9cdff"/></radialGradient>
</defs></svg>`;
const OS_MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="mlhg-mk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5df2ff"/><stop offset="1" stop-color="#ff5fb1"/></linearGradient></defs><path d="M6 9 4 3l7 4h10l7-4-2 6c1.3 1.8 2 4 2 6.4C28 22.4 22.6 28 16 28S4 22.4 4 15.4C4 13 4.7 10.8 6 9z" fill="url(#mlhg-mk)"/><circle cx="11.5" cy="15.5" r="2" fill="#061024"/><circle cx="20.5" cy="15.5" r="2" fill="#061024"/><path d="M14 20.5c1.2 1 2.8 1 4 0" stroke="#061024" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`;
const g3 = (d) => `<svg viewBox="0 0 48 48" class="g3" aria-hidden="true">${d}</svg>`;
const ICON3D = {
  alerts: g3(
    '<path d="M24 7c-6.6 0-11 5-11 11.5v6.8c0 2-1 3.6-2.6 5L9 31.6c-.9.9-.3 2.4 1 2.4h28c1.3 0 1.9-1.5 1-2.4l-1.4-1.3c-1.6-1.4-2.6-3-2.6-5v-6.8C35 12 30.6 7 24 7z" fill="url(#mlhg-w)"/><path d="M15.5 19c.4-4.4 3.4-8 8.5-8.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".9"/><ellipse cx="24" cy="38.5" rx="4.6" ry="3.4" fill="url(#mlhg-gold)"/><circle cx="35" cy="12" r="5" fill="#ff2d6f" stroke="#fff" stroke-width="2"/>'
  ),
  globe: g3(
    '<circle cx="24" cy="24" r="15" fill="url(#mlhg-globe)"/><path d="M9 24h30M24 9c5 4.5 5 25.5 0 30M24 9c-5 4.5-5 25.5 0 30M12 16h24M12 32h24" stroke="#063a63" stroke-opacity=".45" stroke-width="1.6" fill="none"/><ellipse cx="24" cy="24" rx="22" ry="7" transform="rotate(-20 24 24)" fill="none" stroke="#fff" stroke-width="2" stroke-opacity=".85"/><circle cx="41.5" cy="17.5" r="2.6" fill="#ffd23a"/><path d="M18 13.5c2.5-1.6 5.5-2 8-1.6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".8"/>'
  ),
  leaderboard: g3(
    '<path d="M15 9h18v9.5c0 5.2-4 9.5-9 9.5s-9-4.3-9-9.5z" fill="url(#mlhg-gold)"/><path d="M15 12H9.5c0 5 2.6 8 6.5 8.6M33 12h5.5c0 5-2.6 8-6.5 8.6" stroke="#ffd85a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M21.5 28h5l1 6h-7z" fill="#e7a300"/><rect x="15" y="34" width="18" height="5.5" rx="2" fill="url(#mlhg-gold)"/><path d="m24 13 1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff" opacity=".95"/><path d="M18 11.5v6" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>'
  ),
  colarun: g3(
    '<ellipse cx="24" cy="39" rx="9.5" ry="3" fill="#000" opacity=".25"/><path d="M14.5 12.5h19v23.5c0 1.9-4.3 3.5-9.5 3.5s-9.5-1.6-9.5-3.5z" fill="url(#mlhg-can)"/><ellipse cx="24" cy="12.5" rx="9.5" ry="3.2" fill="url(#mlhg-alu)"/><ellipse cx="24" cy="12.3" rx="7" ry="2.1" fill="#c9d1de"/><rect x="21.5" y="10.6" width="5" height="2.6" rx="1.3" fill="#7d889b"/><path d="M14.5 20.5c3 1.6 16 1.6 19 0v7c-3 1.6-16 1.6-19 0z" fill="#fff" opacity=".92"/><path d="m21.5 22.3 5 2.2-5 2.2z" fill="#e3243a"/><path d="M17.5 15v19" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".45"/>'
  ),
  collection: g3(
    '<path d="M12 18 18 10h12l6 8-12 21z" fill="url(#mlhg-gem2)"/><path d="M12 18h24L24 39z" fill="url(#mlhg-gem2)"/><path d="M18 10l-6 8h9.5zM30 10l6 8h-9.5zM18 10h12l-3.5 8h-5z" fill="url(#mlhg-gem1)"/><path d="M21.5 18h5L24 39z" fill="#d6c6ff"/><path d="M12 18h9.5L24 39z" fill="#7b55ef"/><path d="M19.5 12.5l-3 4" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="37" cy="9" r="1.8" fill="#fff"/><circle cx="10" cy="31" r="1.3" fill="#fff" opacity=".8"/>'
  ),
  shop: g3(
    '<path d="M11 17h26l-1.6 20.5a2.5 2.5 0 0 1-2.5 2.3H15.1a2.5 2.5 0 0 1-2.5-2.3z" fill="url(#mlhg-bag)"/><path d="M11 17h26l-.4 4.5H11.4z" fill="#fff"/><path d="M18 21v-6a6 6 0 0 1 12 0v6" stroke="#0e7a53" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="18" cy="21.5" r="1.8" fill="#0e7a53"/><circle cx="30" cy="21.5" r="1.8" fill="#0e7a53"/><path d="m24 26.5 1.4 2.9 3.2.5-2.3 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1-2.3-2.2 3.2-.5z" fill="#14b87d"/>'
  ),
  me: g3(
    '<circle cx="24" cy="18" r="8" fill="url(#mlhg-head)"/><path d="M9.5 39c1.2-7.4 7.2-12 14.5-12s13.3 4.6 14.5 12z" fill="url(#mlhg-head)"/><path d="M19.5 14.5c1.2-1.6 3-2.4 5-2.2" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M16 12.5l-2-5 5 2.5M32 12.5l2-5-5 2.5" fill="#dfe8ff"/>'
  )
};
const KIND_LABEL = {
  drop: "New drop",
  event: "Event",
  reward: "Reward",
  news: "News"
};
const KIND_COLOR = {
  drop: "#ff4fa3",
  event: "#36e3ff",
  reward: "#ffc42e",
  news: "#9b7bff"
};
const ROOM_ITEMS = {
  hub_cola_collectible: {
    title: "Eclipse Cola",
    sub: "Room piece",
    body: "The can that started it all. Every product you activate adds something to this room."
  },
  hub_trophy_colarun: {
    title: "Cola Run trophy",
    sub: "Room piece",
    body: "For the Cola Run regulars. Play a round from Bobo's computer any time.",
    action: "colarun"
  },
  hub_snowglobe_sf: {
    title: "San Francisco snow globe",
    sub: "Where's Bobo? souvenir",
    body: "Bobo was spotted at the Golden Gate. Every city on the globe is a place Bobo has been.",
    action: "globe"
  },
  hub_poster_colarun: {
    title: "Cola Run poster",
    sub: "Room poster",
    body: "Play Cola Run, record a run, and your clip can put your city on the Where's Bobo? globe.",
    action: "colarun"
  },
  hub_poster_bobo: {
    title: "Bobo poster",
    sub: "Room poster",
    body: "Bobo, chilling. As one does."
  },
  hub_window: {
    title: "Eclipse skyline",
    sub: "Window",
    body: "The night outside the can. The moon is always mid-eclipse here."
  },
  hub_sign_evade: {
    title: "EVADE sign",
    sub: "Loft rail",
    body: "Bobo's Hideout is EVADE's room in the MEDIALIFE Collector Hub."
  },
  hub_ladder: {
    title: "Loft ladder",
    sub: "Room piece",
    body: "Up to Bobo's desk and computer. Tap the screen to boot BOBO OS."
  },
  hub_rug: { title: "Bobo's rug", sub: "Room piece", body: "Where Bobo naps between runs." },
  hub_cat_bed: { title: "Bobo's bed", sub: "Room piece", body: "Where Bobo naps between runs." }
};
const ALIAS = {
  hub_alert_light: "hub_computer",
  hub_spawn_pad: "hub_portal",
  hub_keychain_case: "hub_collection",
  hub_keychain: "hub_collection"
};
const SPOT_COLOR = {
  cola: "#2ec5ff",
  red: "#ff3b4e",
  evade: "#ffc42e",
  bobo: "#6f86ff"
};
const SPOT_ICON = {
  pc: svg(
    '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="m8.5 10 2 2 4-4"/>'
  ),
  vault: ICON_GEM(),
  paw: svg(
    '<circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14" cy="6" r="1.8"/><circle cx="17.5" cy="10" r="1.8"/><path d="M12 11.5c-3 0-5.5 3.2-5.5 5.6 0 1.6 1.3 2.4 2.8 2.4 1.1 0 1.7-.6 2.7-.6s1.6.6 2.7.6c1.5 0 2.8-.8 2.8-2.4 0-2.4-2.5-5.6-5.5-5.6z"/>'
  ),
  play: svg('<path d="M8 5.5v13l10.5-6.5z"/>'),
  globe: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
  ),
  fizz: svg(
    '<circle cx="9" cy="15" r="4"/><circle cx="16" cy="8" r="2.6"/><circle cx="17" cy="16.5" r="1.6"/><circle cx="8.5" cy="5.5" r="1.3"/>'
  )
};
function ICON_GEM() {
  return svg('<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M12 21 8.5 9 12 3l3.5 6z"/>');
}
const SPOTS = [
  {
    id: "hub_bobo",
    label: "Bobo",
    color: SPOT_COLOR.bobo,
    icon: SPOT_ICON.paw,
    lift: 0.75,
    tour: {
      title: "Meet Bobo",
      body: "This is Bobo's room and he lives here. Tap him any time to say hi.",
      distance: 3
    }
  },
  {
    id: "hub_computer",
    label: "BOBO OS",
    color: SPOT_COLOR.cola,
    icon: SPOT_ICON.pc,
    tour: {
      title: "Bobo's computer",
      body: "BOBO OS has alerts from the EVADE team, the Where's Bobo? globe, the leaderboard and Cola Run. The monitor glows when there's something new.",
      distance: 3.2
    }
  },
  {
    id: "hub_collection",
    label: "Digital Collection",
    color: SPOT_COLOR.evade,
    icon: SPOT_ICON.vault,
    tour: {
      title: "Your Digital Collection",
      body: "Every EVADE piece you own lives in your vault. The ones you don't have yet show as holograms until you activate them.",
      distance: 3.2
    }
  },
  {
    id: "hub_trophy_colarun",
    label: "Cola Run",
    color: SPOT_COLOR.red,
    icon: SPOT_ICON.play,
    lift: 0.6,
    tour: {
      title: "Cola Run",
      body: "Play a round or record a clip from here. Your clips can put your city on the Where's Bobo? globe.",
      distance: 2.9
    }
  },
  {
    id: "hub_snowglobe_sf",
    label: "Where's Bobo?",
    color: SPOT_COLOR.cola,
    icon: SPOT_ICON.globe,
    lift: 0.6,
    tour: {
      title: "Where's Bobo?",
      body: "Every souvenir is a city Bobo has visited. Open the globe to see where fans have spotted him.",
      distance: 2.9
    }
  },
  { id: "hub_cola_lamp", label: "Fizz lamp", color: SPOT_COLOR.red, icon: SPOT_ICON.fizz }
];
const TOUR_INTRO = {
  title: "Welcome to Bobo's Hideout",
  body: "Your room lives inside a giant Eclipse can, and it grows with every EVADE piece you own. Here's a quick look around."
};
const TOUR_OUTRO = {
  title: "You're all set",
  body: "Tap any glowing dot to open it, or use the list button at the top for everything in the room. You can replay this tour from there too."
};
const REVEAL_COMMON = (
  /* glsl */
  `
uniform float uSolid; uniform float uWire; uniform float uGhost; uniform vec3 uOrigin; uniform vec3 uGlow;
uniform float uFloor;
varying vec3 vRevealPos;
float revealNoise(vec3 p) {
  vec3 q = floor(p * 12.0);
  return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}
// The wireframe draws out from the portal...
float revealDist(vec3 p) { return length(p - uOrigin) + (revealNoise(p) - 0.5) * 0.22; }
// ...then the room materialises floor to ceiling behind a glowing scan line.
float solidDist(vec3 p) { return (p.y - uFloor) + (revealNoise(p) - 0.5) * 0.08; }`
);
const REVEAL_VERT = (
  /* glsl */
  `
vec4 revealP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  revealP = instanceMatrix * revealP;
#endif
vRevealPos = (uRoomInv * modelMatrix * revealP).xyz;`
);
const HOLO_VERT = (
  /* glsl */
  `
uniform mat4 uRoomInv;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vY = (uRoomInv * wp).y;
  vN = normalize(normalMatrix * normal);
  vec4 mv = viewMatrix * wp;
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
);
const HOLO_FRAG = (
  /* glsl */
  `
uniform float uTime; uniform float uAlpha; uniform vec3 uColor;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
  float scan = 0.55 + 0.45 * sin(vY * 160.0 - uTime * 5.0);
  float flick = 0.88 + 0.12 * sin(uTime * 23.0) * sin(uTime * 7.3);
  float a = (0.16 + 0.7 * f) * scan * flick * uAlpha;
  gl_FragColor = vec4(uColor * (0.55 + 1.1 * f), a);
}`
);
const CARD_VERT = (
  /* glsl */
  `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
);
const CARD_FRAG = (
  /* glsl */
  `
uniform sampler2D uMap; uniform float uTime; uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  float scan = 0.86 + 0.14 * sin(vUv.y * 420.0 - uTime * 9.0);
  float sweep = smoothstep(0.06, 0.0, abs(fract(uTime * 0.35) * 1.4 - 0.2 - vUv.y)) * 0.35;
  float flick = 0.93 + 0.07 * sin(uTime * 31.0);
  vec3 col = c.rgb * scan * flick + vec3(0.21, 0.89, 1.0) * sweep * c.a;
  gl_FragColor = vec4(col, c.a * uAlpha);
}`
);
const BEAM_VERT = (
  /* glsl */
  `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
);
const BEAM_FRAG = (
  /* glsl */
  `
uniform float uTime; uniform float uAlpha;
varying vec2 vUv;
void main() {
  float stripes = 0.55 + 0.45 * sin(vUv.y * 40.0 - uTime * 14.0);
  float edge = 0.35 + 0.65 * pow(abs(sin(vUv.x * 3.14159 * 6.0)), 6.0);
  float fade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
  gl_FragColor = vec4(vec3(0.21, 0.89, 1.0) * 1.4, 0.24 * stripes * edge * fade * uAlpha);
}`
);
const CSS = (
  /* css */
  `
.mlh{position:absolute;inset:0;z-index:2000100;pointer-events:none!important;font:500 15px/1.5 ui-sans-serif,-apple-system,"SF Pro Text",Inter,"Segoe UI",Roboto,sans-serif;color:#eef3ff;-webkit-font-smoothing:antialiased;--cyan:#36e3ff;--pink:#ff4fa3;--gold:#ffc42e;--panel:rgba(9,14,36,.9);--line:rgba(130,200,255,.2);--muted:#a7b3d6}
.mlh *,.mlh *::before,.mlh *::after{box-sizing:border-box}
.mlh button{font:inherit;color:inherit;cursor:pointer}
.mlh [hidden]{display:none!important}
.mlh-live{pointer-events:auto!important}
.mlh-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.07);color:#eef3ff;font-weight:700;text-decoration:none;white-space:nowrap}
.mlh-btn:hover{background:rgba(255,255,255,.13)}
.mlh-btn:focus-visible,.mlh-icon:focus-visible,.mlh-dock button:focus-visible,.mlh-dicon:focus-visible,.mlh-dot:focus-visible,.mlh-link:focus-visible{outline:2px solid #fff;outline-offset:2px}
.mlh-btn.pri{background:linear-gradient(90deg,var(--cyan),#9af1ff 55%,var(--pink));border:0;color:#041824}
.mlh-btn.pri:hover{filter:brightness(1.06)}
.mlh-btn[disabled],.mlh-btn[aria-disabled="true"]{opacity:.5;pointer-events:none}
.mlh-btn svg{width:18px;height:18px}
.mlh-link{background:none;border:0;padding:6px 2px;color:var(--cyan);font-weight:700;text-decoration:underline;text-underline-offset:3px}
.mlh-icon{width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--panel);display:grid;place-items:center;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.mlh-icon svg{width:20px;height:20px}
.mlh-kicker{font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan)}

/* hud */
.mlh-hud{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px)) + 12px + var(--mlh-top,0px)) calc(14px + var(--mlh-hud-r,0px)) 0 calc(14px + var(--mlh-hud-l,0px));pointer-events:none!important;opacity:0;transform:translateY(-8px);transition:opacity .35s,transform .35s}
.mlh-hud.on{opacity:1;transform:none}
.mlh-hud.on>*{pointer-events:auto!important}
.mlh-title{display:flex;align-items:center;gap:10px;padding:8px 14px 8px 10px;border-radius:14px;border:1px solid var(--line);background:var(--panel);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);text-align:left;min-height:44px}
.mlh-title b{display:block;font-size:15px;line-height:1.2}
.mlh-title small{display:block;color:var(--muted);font-size:12px;line-height:1.3}
.mlh-ring{width:30px;height:30px;flex:none}
.mlh-actions{display:flex;gap:8px}
.mlh-prompt{position:absolute;left:50%;bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 22px);transform:translate(-50%,10px);display:flex;flex-direction:column;align-items:center;gap:10px;width:min(440px,calc(100% - 32px));text-align:center;opacity:0;transition:opacity .3s,transform .3s;pointer-events:none!important}
.mlh-prompt.on{opacity:1;transform:translate(-50%,0)}
.mlh-prompt.on .mlh-btn{pointer-events:auto!important}
.mlh-prompt p{margin:0;padding:9px 14px;border-radius:999px;background:var(--panel);border:1px solid var(--line);font-size:14px;color:#dfe7ff;backdrop-filter:blur(8px)}
.mlh-prompt .mlh-btn.pri{min-height:54px;padding:0 28px;border-radius:999px;font-size:17px;box-shadow:0 0 28px rgba(54,227,255,.4)}
.mlh-skip{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 22px);pointer-events:auto!important;background:var(--panel);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.mlh-mode{position:absolute;left:14px;bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + var(--mlh-mode-bottom,78px));display:flex;align-items:center;gap:0;height:48px;max-width:48px;padding:3px;overflow:hidden;border-radius:999px;border:1px solid rgba(54,227,255,.42);background:rgba(9,14,36,.8);color:#fff;font-weight:800;font-size:13.5px;text-align:left;white-space:nowrap;box-shadow:0 0 16px rgba(54,227,255,.22);pointer-events:auto!important;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:mlh-pop .4s cubic-bezier(.2,1.6,.4,1);transition:max-width .4s cubic-bezier(.2,1,.3,1),gap .4s,padding .4s}
.mlh-mode i{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--cyan),var(--pink));color:#041824}
.mlh-mode i svg{width:21px;height:21px}
.mlh-mode>span{opacity:0;transition:opacity .25s}
.mlh-mode small{display:block;font-size:11px;font-weight:600;color:var(--muted);line-height:1.2}
.mlh-mode.peek,.mlh-mode:focus-visible{max-width:280px;gap:10px;padding-right:16px}
.mlh-mode.peek>span,.mlh-mode:focus-visible>span{opacity:1}
@media (hover:hover){.mlh-mode:hover{max-width:280px;gap:10px;padding-right:16px}.mlh-mode:hover>span{opacity:1}}
.mlh-mode:focus-visible{outline:2px solid #fff;outline-offset:2px}
.mlh-mode.mlh-mode-t{bottom:auto;top:calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px)) + var(--mlh-mode-top,78px))}
.mlh-mode.mlh-mode-r{left:auto;right:17px;flex-direction:row-reverse;text-align:right}
.mlh-mode.mlh-mode-r.peek,.mlh-mode.mlh-mode-r:focus-visible{padding-right:3px;padding-left:16px}
@media (hover:hover){.mlh-mode.mlh-mode-r:hover{padding-right:3px;padding-left:16px}}
.mlh-toast{position:absolute;left:50%;top:calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px)) + 74px + var(--mlh-top,0px));transform:translate(-50%,-8px);opacity:0;padding:10px 16px;border-radius:999px;background:var(--panel);border:1px solid var(--line);font-weight:700;transition:opacity .25s,transform .25s;max-width:calc(100% - 32px);text-align:center;pointer-events:none!important}
.mlh-toast.on{opacity:1;transform:translate(-50%,0)}

/* layers (gate, sheet, collection, os) */
.mlh-layer{position:absolute;inset:0;display:grid;place-items:center;padding:16px;background:rgba(3,6,18,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;visibility:hidden;transition:opacity .22s,visibility 0s .22s;pointer-events:none!important}
.mlh-layer.open{opacity:1;visibility:visible;transition:opacity .22s;pointer-events:auto!important}
.mlh-card{position:relative;width:min(440px,100%);max-height:calc(100% - 8px);overflow:auto;background:linear-gradient(180deg,rgba(16,26,62,.97),rgba(8,13,34,.97));border:1px solid var(--line);border-radius:22px;padding:22px 20px 18px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(54,227,255,.06) inset;transform:translateY(12px) scale(.98);transition:transform .25s}
.mlh-layer.open .mlh-card{transform:none}
.mlh-card h2{margin:4px 40px 6px 0;font-size:22px;line-height:1.2}
.mlh-card p{margin:0 0 12px;color:#cfd8f3;font-size:14.5px}
.mlh-x{position:absolute;right:12px;top:12px;width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.05);display:grid;place-items:center}
.mlh-x svg{width:18px;height:18px}
.mlh-field{display:block;margin:12px 0 0}
.mlh-field span{display:block;font-size:13px;font-weight:700;color:#cfd8f3;margin-bottom:6px}
.mlh-field input{width:100%;height:50px;border-radius:12px;border:1px solid rgba(160,200,255,.28);background:rgba(4,8,22,.7);color:#fff;padding:0 14px;font:600 16px/1 inherit;outline:none}
.mlh-field input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(54,227,255,.2)}
.mlh-field input.code{font:700 21px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase}
.mlh-field input[aria-invalid="true"]{border-color:#ff6b8a}
.mlh-check{display:flex;gap:10px;align-items:flex-start;margin:14px 0 0;font-size:13.5px;color:#cfd8f3}
.mlh-check input{width:20px;height:20px;margin:1px 0 0;accent-color:#36e3ff;flex:none}
.mlh-err{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:rgba(255,80,120,.12);border:1px solid rgba(255,107,138,.4);color:#ffd2dc;font-size:14px}
.mlh-help{margin:10px 0 0;padding:12px;border-radius:12px;background:rgba(54,227,255,.07);border:1px solid rgba(54,227,255,.2);font-size:13.5px;color:#d6e6ff}
.mlh-help p{margin:0 0 6px;font-size:13.5px}
.mlh-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:16px}
.mlh-row .mlh-btn.pri{flex:1}
.mlh-test{margin-top:12px;font-size:12.5px;color:var(--muted)}
.mlh-test code{font:700 13px ui-monospace,Menlo,monospace;color:#fff;background:rgba(255,255,255,.08);padding:2px 6px;border-radius:6px}
.mlh-ok{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;margin:6px auto 12px;background:linear-gradient(135deg,var(--cyan),var(--pink));color:#041824;animation:mlh-pop .5s cubic-bezier(.2,1.6,.4,1)}
.mlh-ok svg{width:34px;height:34px;stroke-width:3}
.mlh-center{text-align:center}
.mlh-center h2{margin-right:0}
.mlh-keycode{display:inline-block;font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;padding:12px 16px;border-radius:12px;background:#16245a;border:1px solid var(--cyan);margin:4px 0 12px}
@keyframes mlh-pop{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}

/* item sheet */
.mlh-sheet{place-items:end center;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;padding-bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 16px)}
.mlh-pill{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:rgba(54,227,255,.14);color:#9cf0ff}
.mlh-sub{color:var(--muted);font-size:13.5px;margin:-2px 0 10px}

/* collection */
.mlh-col{width:min(680px,100%)}
.mlh-prog{display:flex;align-items:center;gap:12px;margin:6px 0 16px}
.mlh-bar{flex:1;height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
.mlh-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--cyan),var(--pink));transition:width .6s}
.mlh-prog b{font-size:14px;white-space:nowrap}
.mlh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.mlh-slot{position:relative;border-radius:16px;padding:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);min-height:150px;display:flex;flex-direction:column;gap:6px}
.mlh-slot .art{height:70px;border-radius:12px;display:grid;place-items:center;background:radial-gradient(circle at 50% 70%,rgba(54,227,255,.25),transparent 70%);color:var(--cyan)}
.mlh-slot .art svg{width:40px;height:40px}
.mlh-slot b{font-size:14px;line-height:1.25}
.mlh-slot small{color:var(--muted);font-size:12px;line-height:1.35}
.mlh-slot.owned{border-color:rgba(54,227,255,.55);background:linear-gradient(180deg,rgba(54,227,255,.12),rgba(255,79,163,.06))}
.mlh-slot.owned .art{background:radial-gradient(circle at 50% 60%,rgba(255,79,163,.3),transparent 70%);color:#fff}
.mlh-slot.locked .art{opacity:.75;animation:mlh-holo 2.6s ease-in-out infinite}
.mlh-slot .tag{position:absolute;top:10px;right:10px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.08);color:var(--muted)}
.mlh-slot.owned .tag{background:var(--cyan);color:#041824}
.mlh-reward{display:flex;gap:14px;align-items:center;margin-top:14px;padding:14px;border-radius:16px;border:1px dashed rgba(255,196,46,.5);background:linear-gradient(90deg,rgba(255,196,46,.1),rgba(255,196,46,.02))}
.mlh-reward .medal{width:54px;height:54px;flex:none;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#fff3c4,#ffc42e 45%,#a86a00);color:#3a2400;font-weight:900;font-size:22px;box-shadow:0 0 24px rgba(255,196,46,.35)}
.mlh-reward.done{border-style:solid}
.mlh-reward b{display:block}
.mlh-reward small{color:#e9dcb4;font-size:13px}
@keyframes mlh-holo{0%,100%{opacity:.55;filter:drop-shadow(0 0 0 rgba(54,227,255,0))}50%{opacity:.95;filter:drop-shadow(0 0 8px rgba(54,227,255,.7))}}

/* Digital Collection vault */
.mlh-vaultcard{width:min(1080px,100%)!important;padding:18px 18px 16px!important}
.mlh-vhead{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-right:44px}
.mlh-vhead h2{margin:2px 0 0!important}
.mlh-vhead .mlh-prog{min-width:220px;flex:0 1 300px;margin:0}
.mlh-vault{position:relative;margin:14px 0 10px;height:min(62vh,600px);border-radius:16px;overflow:hidden;background:#05080b;border:1px solid rgba(54,227,255,.25);box-shadow:0 0 40px -12px rgba(54,227,255,.45)}
.mlh-vnote{font-size:13px!important;color:#aab8d8!important;margin:0 0 10px!important}
.mlh-list summary{cursor:pointer;color:#9fe9ff;font-weight:700;font-size:13.5px;margin-bottom:10px}
.mlh-win .mlh-vwrap{display:flex;flex-direction:column;height:100%}
.mlh-win .mlh-vwrap .mlh-vault{flex:1;margin:0;height:auto;border-radius:0;border:0}
.mlh-win .mlh-vbar{display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;color:#cfd8f3}
.mlh-win .mlh-vbar .mlh-prog{flex:1;margin:0}
.mlh-win .mlh-vbar .mlh-btn{min-height:36px;padding:0 14px;font-size:13px}

/* BOBO OS v2: glass, depth and light */
.mlh-defs{position:absolute;width:0;height:0;overflow:hidden}
.mlh-layer.mlh-os{padding:0;background:rgba(3,6,18,var(--mlh-os-dim,.18));backdrop-filter:none;-webkit-backdrop-filter:none;--mlh-os-st:0px;--mlh-os-sb:0px}
.mlh-layer.mlh-os.full{--mlh-os-st:var(--safe-area-inset-top,env(safe-area-inset-top,0px));--mlh-os-sb:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))}
.mlh-screen{position:relative;width:min(1600px,calc(100% * var(--mlh-os-size,.8)));height:min(1000px,calc(100% * var(--mlh-os-size,.8)));border-radius:26px;overflow:hidden;isolation:isolate;background:rgba(5,8,23,calc(var(--mlh-os-alpha,.88) * .55));backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);
  box-shadow:0 0 0 1px rgba(140,220,255,.25),0 0 0 8px #070b19,0 0 0 9px rgba(255,255,255,.08),0 0 60px rgba(54,227,255,.18),0 50px 120px rgba(0,0,0,.7);
  transform:perspective(1400px) rotateX(6deg) scale(.94);opacity:0;transition:transform .5s cubic-bezier(.2,1,.25,1),opacity .3s}
.mlh-os.open .mlh-screen{transform:none;opacity:1}
.mlh-screen::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:30;border-radius:inherit;
  background:linear-gradient(180deg,rgba(255,255,255,.06),transparent 18%),repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px);mix-blend-mode:screen}
.mlh-wallp{position:absolute;inset:0;z-index:0;overflow:hidden;opacity:var(--mlh-os-alpha,.88);background:radial-gradient(120% 90% at 50% 120%,#1a0b3a,#060a1d 55%,#03050f)}
.mlh-wallp i{position:absolute;border-radius:50%;filter:blur(60px);opacity:.75;animation:mlh-drift 18s ease-in-out infinite alternate}
.mlh-wallp .a1{width:55%;height:60%;left:-10%;top:-15%;background:radial-gradient(circle,#00d5ff 0%,rgba(0,213,255,0) 70%)}
.mlh-wallp .a2{width:50%;height:55%;right:-12%;bottom:-10%;background:radial-gradient(circle,#ff3fa4 0%,rgba(255,63,164,0) 70%);animation-delay:-6s}
.mlh-wallp .a3{width:40%;height:40%;left:35%;top:25%;background:radial-gradient(circle,#6a3cff 0%,rgba(106,60,255,0) 70%);opacity:.5;animation-delay:-11s}
@keyframes mlh-drift{to{transform:translate(8%,6%) scale(1.15)}}
.mlh-wallp .floor{position:absolute;left:-50%;right:-50%;bottom:-8%;height:55%;transform:perspective(500px) rotateX(62deg);transform-origin:50% 100%;
  background-image:linear-gradient(rgba(54,227,255,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(54,227,255,.35) 1px,transparent 1px);background-size:56px 56px;
  -webkit-mask-image:linear-gradient(0deg,#000 10%,transparent 85%);mask-image:linear-gradient(0deg,#000 10%,transparent 85%);animation:mlh-floor 6s linear infinite}
@keyframes mlh-floor{to{background-position:0 56px}}
.mlh-wall{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font:900 clamp(70px,13vw,190px)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;color:transparent;-webkit-text-stroke:1px rgba(140,230,255,.13);pointer-events:none;user-select:none;white-space:nowrap}
.mlh-menubar{position:absolute;left:10px;right:10px;top:10px;height:40px;display:flex;align-items:center;gap:10px;padding:0 8px 0 12px;border-radius:14px;
  background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);font-size:13px;z-index:5;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.mlh-menubar .logo{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.14em;font-size:12.5px;color:#eaf6ff}
.mlh-menubar .logo b{font-weight:900;margin-left:3px;background:linear-gradient(90deg,#5df2ff,#ff5fb1);-webkit-background-clip:text;background-clip:text;color:transparent}
.mlh-menubar .lg-mark svg{width:22px;height:22px;display:block;filter:drop-shadow(0 0 6px rgba(93,242,255,.55))}
.mlh-menubar .app{font-weight:700;color:#cfe0ff;padding-left:10px;border-left:1px solid rgba(255,255,255,.14)}
.mlh-menubar .sp{flex:1}
.mlh-menubar .chip{display:flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:rgba(40,200,120,.12);border:1px solid rgba(80,240,160,.3);color:#9ff5c9;font-size:11.5px;font-weight:700;letter-spacing:.04em}
.mlh-menubar .chip i{width:7px;height:7px;border-radius:50%;background:#3dff9a;box-shadow:0 0 8px #3dff9a;animation:mlh-pulse 2s ease-in-out infinite}
@keyframes mlh-pulse{50%{opacity:.35}}
.mlh-menubar .tray{display:flex;align-items:center;gap:6px;color:#dbe6ff;font-variant-numeric:tabular-nums;font-weight:600}
.mlh-menubar .tray svg{width:16px;height:16px}
.mlh-menubar button.tb{position:relative;display:grid;place-items:center;width:34px;height:30px;border-radius:10px;border:0;background:transparent;color:#eef3ff}
.mlh-menubar button.tb:hover{background:rgba(255,255,255,.12)}
.mlh-menubar button.tb svg{width:17px;height:17px}
.mlh-badge{position:absolute;top:-2px;right:-2px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:linear-gradient(180deg,#ff5b93,#e0175c);color:#fff;font-size:10.5px;font-weight:800;line-height:17px;text-align:center;box-shadow:0 0 0 2px #0b1027,0 0 10px rgba(255,60,130,.6)}
.mlh-desk{position:absolute;left:0;right:0;top:56px;bottom:0;z-index:2}
.mlh-icons{position:absolute;left:18px;top:18px;display:grid;grid-template-columns:repeat(2,96px);grid-auto-rows:118px;gap:6px 8px;align-content:start}
.mlh-dicon{width:96px;height:116px;border:0;border-radius:18px;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;padding:8px 2px 4px;color:#f1f6ff;font-size:12px;line-height:1.2;font-weight:700;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,.8);transition:background .15s}
.mlh-dicon:hover{background:rgba(255,255,255,.07)}
.mlh-dicon:hover .mlh-tile{transform:translateY(-3px) rotateX(8deg)}
.mlh-tile{position:relative;flex:none;width:58px;height:58px;border-radius:17px;display:grid;place-items:center;color:#fff;
  background:radial-gradient(120% 90% at 30% 15%,rgba(255,255,255,.35),transparent 45%),linear-gradient(160deg,var(--a),var(--b));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -3px 6px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.12),0 10px 18px -6px rgba(0,0,0,.7),0 0 18px -4px var(--a);
  transition:transform .2s cubic-bezier(.2,1,.3,1);transform-style:preserve-3d}
.mlh-tile::after{content:"";position:absolute;left:8%;right:8%;top:4%;height:42%;border-radius:14px 14px 40% 40%;background:linear-gradient(180deg,rgba(255,255,255,.38),rgba(255,255,255,0));pointer-events:none}
.mlh-tile .g3{width:78%;height:78%;filter:drop-shadow(0 3px 3px rgba(0,0,0,.35));position:relative;z-index:1}
.mlh-tile.sm{width:40px;height:40px;border-radius:12px}
.mlh-tile .mlh-badge{top:-6px;right:-6px;z-index:2}
.mlh-widgets{position:absolute;right:18px;top:18px;width:268px;display:grid;gap:12px}
.mlh-wg{position:relative;padding:14px 16px;border-radius:20px;background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.13);backdrop-filter:blur(20px) saturate(1.3);-webkit-backdrop-filter:blur(20px) saturate(1.3);box-shadow:0 14px 30px rgba(0,0,0,.3);text-align:left;color:#eef4ff;width:100%;font:inherit}
button.mlh-wg{cursor:pointer;transition:transform .15s,border-color .15s}
button.mlh-wg:hover{transform:translateY(-2px);border-color:rgba(93,242,255,.45)}
.mlh-wg .k{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#8fe9ff;font-weight:800}
.mlh-wg .big{font:800 40px/1.05 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:4px}
.mlh-wg small{display:block;color:#b8c6e6;font-size:12.5px;margin-top:2px}
.mlh-wg .row{display:flex;align-items:center;gap:12px;margin-top:6px}
.mlh-ring{--p:0;width:58px;height:58px;flex:none;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#5df2ff calc(var(--p)*1%),#ff5fb1 calc(var(--p)*1%),rgba(255,255,255,.08) 0);-webkit-mask:radial-gradient(circle,transparent 21px,#000 22px);mask:radial-gradient(circle,transparent 21px,#000 22px)}
.mlh-ringwrap{position:relative;width:58px;height:58px;flex:none}
.mlh-ringwrap b{position:absolute;inset:0;display:grid;place-items:center;font-size:14px}
.mlh-wg .al{display:flex;gap:10px;align-items:flex-start;margin-top:8px}
.mlh-wg .al b{display:block;font-size:13.5px;line-height:1.3}
.mlh-dock{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:flex-end;gap:10px;padding:10px 12px;border-radius:24px;
  background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(22px) saturate(1.5);-webkit-backdrop-filter:blur(22px) saturate(1.5);z-index:4;max-width:calc(100% - 20px);box-shadow:0 20px 40px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.2)}
.mlh-dock::before{content:"";position:absolute;left:12%;right:12%;bottom:-14px;height:14px;background:radial-gradient(50% 100% at 50% 0,rgba(93,242,255,.35),transparent);filter:blur(4px);pointer-events:none}
.mlh-dock button{position:relative;border:0;background:transparent;padding:0;border-radius:17px;transition:transform .2s cubic-bezier(.2,1,.3,1)}
.mlh-dock button:hover{transform:translateY(-10px) scale(1.18)}
.mlh-dock button:hover::before{content:attr(aria-label);position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);padding:4px 9px;border-radius:8px;background:rgba(8,12,30,.9);border:1px solid rgba(255,255,255,.15);font-size:11.5px;font-weight:700;white-space:nowrap;color:#fff}
.mlh-dock button.run::after{content:"";position:absolute;left:50%;bottom:-7px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:#5df2ff;box-shadow:0 0 8px #5df2ff}
.mlh-win{position:absolute;display:flex;flex-direction:column;min-width:280px;border-radius:20px;overflow:hidden;
  background:linear-gradient(165deg,rgba(26,36,78,.92),rgba(10,14,36,.94));border:1px solid rgba(160,210,255,.2);box-shadow:0 30px 70px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.12);backdrop-filter:blur(24px) saturate(1.4);-webkit-backdrop-filter:blur(24px) saturate(1.4);animation:mlh-open .28s cubic-bezier(.2,1,.3,1);z-index:3}
.mlh-win::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(135deg,rgba(93,242,255,.0),rgba(93,242,255,0));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;transition:background .2s}
.mlh-win.focus{z-index:4;box-shadow:0 40px 90px rgba(0,0,0,.65),0 0 40px -10px rgba(93,242,255,.35),inset 0 1px 0 rgba(255,255,255,.14)}
.mlh-win.focus::before{background:linear-gradient(135deg,rgba(93,242,255,.8),rgba(255,95,177,.55) 60%,rgba(255,255,255,.1))}
.mlh-win.max{left:0!important;top:0!important;width:100%!important;height:100%!important;border-radius:0}
.mlh-win.closing{animation:mlh-close .16s ease-in forwards}
.mlh-bar2{flex:none;height:46px;display:flex;align-items:center;gap:10px;padding:0 14px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border-bottom:1px solid rgba(255,255,255,.08);cursor:grab;user-select:none;touch-action:none}
.mlh-bar2:active{cursor:grabbing}
.mlh-dots{display:flex;gap:8px}
.mlh-dot{width:13px;height:13px;padding:0;border-radius:50%;border:0;display:block;box-shadow:inset 0 1px 1px rgba(255,255,255,.5),0 0 6px currentColor}
.mlh-dot.c{background:#ff5f7a;color:rgba(255,95,122,.5)}.mlh-dot.m{background:#ffc94a;color:rgba(255,201,74,.45)}.mlh-dot.x{background:#3ddc97;color:rgba(61,220,151,.45)}
.mlh-bar2 .t{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13.5px;font-weight:700;color:#e6eeff;margin-right:62px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlh-bar2 .mi{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;flex:none;background:linear-gradient(160deg,var(--a),var(--b));box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
.mlh-bar2 .mi .g3{width:84%;height:84%}
.mlh-body{flex:1;overflow:auto;padding:18px;overscroll-behavior:contain}
.mlh-body.flush{padding:0;overflow:hidden}
.mlh-body h3{margin:0 0 4px;font-size:19px;letter-spacing:-.01em}
.mlh-body p{margin:0 0 10px;color:#cfd8f3;font-size:14px}
@keyframes mlh-open{from{transform:scale(.88) translateY(14px);opacity:0;filter:blur(6px)}to{transform:none;opacity:1;filter:none}}
@keyframes mlh-close{to{transform:scale(.9) translateY(8px);opacity:0;filter:blur(4px)}}
.mlh-notif{position:absolute;right:14px;top:62px;width:min(350px,calc(100% - 28px));display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:18px;background:linear-gradient(160deg,rgba(32,44,92,.95),rgba(14,20,48,.96));border:1px solid rgba(93,242,255,.4);box-shadow:0 20px 50px rgba(0,0,0,.55),0 0 30px -8px rgba(93,242,255,.5);z-index:6;text-align:left;transform:translateX(130%);transition:transform .4s cubic-bezier(.2,1,.3,1);color:#fff}
.mlh-notif.on{transform:none}
.mlh-notif b{display:block;font-size:14px}
.mlh-notif small{display:block;color:#cfd8f3;font-size:12.5px}
.mlh-boot{position:absolute;inset:0;display:grid;place-items:center;background:radial-gradient(60% 60% at 50% 45%,#0e1a44,#03050f);z-index:20;transition:opacity .4s}
.mlh-boot.off{opacity:0;visibility:hidden;pointer-events:none;transition:opacity .4s,visibility 0s .4s}
.mlh-boot .in{text-align:center}
.mlh-boot .mk svg{width:74px;height:74px;filter:drop-shadow(0 0 22px rgba(93,242,255,.6));animation:mlh-bootmk .9s cubic-bezier(.2,1,.3,1)}
@keyframes mlh-bootmk{from{transform:scale(.6);opacity:0}}
.mlh-boot .lg{margin-top:14px;font:800 30px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.3em;color:#eaf6ff}
.mlh-boot .lg b{background:linear-gradient(90deg,#5df2ff,#ff5fb1);-webkit-background-clip:text;background-clip:text;color:transparent}
.mlh-boot .ver{margin-top:8px;font-size:11px;letter-spacing:.3em;color:#7f92c4}
.mlh-boot .bb{width:200px;height:3px;border-radius:9px;background:rgba(255,255,255,.1);margin:20px auto 0;overflow:hidden}
.mlh-boot .bb i{display:block;height:100%;width:0;background:linear-gradient(90deg,#5df2ff,#ff5fb1);box-shadow:0 0 10px #5df2ff;animation:mlh-boot .8s ease-out forwards}
@keyframes mlh-boot{to{width:100%}}

/* app content */
.mlh-alert{display:flex;gap:12px;padding:12px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-bottom:10px}
.mlh-alert.unread{border-color:rgba(54,227,255,.4);background:rgba(54,227,255,.07)}
.mlh-alert.hl{animation:mlh-hl 1.6s ease-out}
@keyframes mlh-hl{0%{box-shadow:0 0 0 3px rgba(54,227,255,.8)}100%{box-shadow:0 0 0 0 rgba(54,227,255,0)}}
.mlh-alert .k{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:#fff}
.mlh-alert .k svg{width:22px;height:22px}
.mlh-alert b{display:block;font-size:15px;line-height:1.3}
.mlh-alert .meta{font-size:12px;color:var(--muted);margin:2px 0 6px}
.mlh-alert p{margin:0 0 8px;font-size:14px}
.mlh-alert .mlh-btn{min-height:36px;padding:0 12px;font-size:13.5px;border-radius:10px}
.mlh-empty{text-align:center;color:var(--muted);padding:30px 10px}
.mlh-empty svg{width:42px;height:42px;opacity:.6}
.mlh-frame{width:100%;height:100%;border:0;display:block;background:#05081a}
.mlh-load{display:grid;place-items:center;height:100%;color:var(--muted)}
.mlh-tabs{display:flex;gap:6px;padding:4px;border-radius:12px;background:rgba(255,255,255,.06);margin:10px 0 12px}
.mlh-tabs button{flex:1;min-height:36px;border:0;border-radius:9px;background:transparent;font-weight:700;font-size:13.5px;color:#cfd8f3}
.mlh-tabs button[aria-selected="true"]{background:rgba(54,227,255,.18);color:#fff}
.mlh-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.mlh-stats div{padding:10px;border-radius:12px;background:rgba(255,255,255,.05);text-align:center}
.mlh-stats b{display:block;font-size:20px}
.mlh-stats small{color:var(--muted);font-size:11.5px}
.mlh-lb{list-style:none;margin:0;padding:0}
.mlh-lb li{display:flex;align-items:center;gap:12px;padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.06)}
.mlh-lb .r{width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:13px;background:rgba(255,255,255,.08)}
.mlh-lb li:nth-child(1) .r{background:#ffc42e;color:#3a2400}.mlh-lb li:nth-child(2) .r{background:#cfd8e8;color:#1b2235}.mlh-lb li:nth-child(3) .r{background:#d58a4f;color:#2b1405}
.mlh-lb .f{font-size:22px;line-height:1}
.mlh-lb .n{flex:1;min-width:0}
.mlh-lb .n b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlh-lb .n small{color:var(--muted);font-size:12px}
.mlh-lb .s{font-weight:800;font-size:15px}
.mlh-hero{height:150px;border-radius:14px;margin:-2px 0 14px;display:grid;place-items:center;background:radial-gradient(circle at 30% 30%,rgba(255,91,91,.55),transparent 60%),radial-gradient(circle at 75% 70%,rgba(54,227,255,.5),transparent 60%),#121a44;font:900 30px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;text-align:center}
.mlh-hero small{display:block;font-size:12px;letter-spacing:.2em;color:#cfe;margin-top:6px}
.mlh-stack{display:grid;gap:10px}
.mlh-stack .mlh-btn{width:100%}
.mlh-me{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.mlh-av{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,var(--cyan),var(--pink));color:#041824;font-weight:900;font-size:22px}
.mlh-kv{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:14px}
.mlh-kv span{color:var(--muted)}

@media (max-width:440px){
  .mlh-actions{gap:6px}
  .mlh-hud .mlh-icon{width:40px;height:40px;border-radius:11px}
  .mlh-title{padding:6px 10px 6px 7px;gap:8px;min-height:40px}
  .mlh-title b{font-size:14px;white-space:nowrap}
  .mlh-title small{white-space:nowrap}
  .mlh-ring{width:26px;height:26px}
  /* The host's menu button sits in the top bar and offers the way out. */
  .mlh-hostmenu [data-r=exit]{display:none!important}
}
@media (max-width:700px){
  /* Phones keep the width (the desktop needs it) and take OS Size as the height. */
  .mlh-screen{width:max(calc(100% * var(--mlh-os-size,.8)),calc(100% - 24px));border-radius:20px;box-shadow:0 0 0 1px rgba(140,220,255,.25),0 30px 80px rgba(0,0,0,.6)}
  .mlh-os.full .mlh-screen{border-radius:0;box-shadow:none}
  .mlh-icons{grid-template-columns:repeat(4,1fr);grid-auto-rows:108px;left:10px;right:10px;top:176px}
  .mlh-menubar .app{display:none}
  .mlh-menubar .tray{white-space:nowrap}
  .mlh-wg{height:150px;overflow:hidden}
  .mlh-wg small{font-size:11.5px}
  .mlh-dicon{width:auto;height:98px}
  .mlh-widgets{left:12px;right:12px;top:12px;width:auto;grid-template-columns:1fr 1fr;gap:10px}
  .mlh-widgets .mlh-wg:nth-child(n+3){display:none}
  .mlh-wg{padding:10px 12px;border-radius:16px}
  .mlh-wg .big{font-size:28px}
  .mlh-menubar .chip{display:none}
  .mlh-screen{transform:none}
  .mlh-win{left:0!important;top:0!important;width:100%!important;height:100%!important;border-radius:0;min-width:0}
  .mlh-bar2{cursor:default;height:48px}
  .mlh-dot{width:18px;height:18px}
  .mlh-menubar{left:0;right:0;top:0;border-radius:0;border-width:0 0 1px;padding-top:var(--mlh-os-st);height:calc(44px + var(--mlh-os-st))}
  .mlh-desk{top:calc(44px + var(--mlh-os-st))}
  .mlh-dock{bottom:calc(10px + var(--mlh-os-sb));gap:6px;padding:6px}
  .mlh-dock{gap:7px;padding:8px}
  .mlh-dock .mlh-tile{width:40px;height:40px;border-radius:12px}
  .mlh-dock .mlh-tile::after{border-radius:10px 10px 40% 40%}
  .mlh-dock button:hover{transform:none}
  .mlh-dock button:hover::before{display:none}
  .mlh-title small{display:none}
}
/* \u2500\u2500 hotspots \u2500\u2500 */
.mlh-spots{position:absolute;inset:0;pointer-events:none!important;overflow:hidden}
.mlh-spot{position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#071022;
  background:radial-gradient(circle at 34% 28%,#fff 0,color-mix(in srgb,var(--c) 55%,#fff) 22%,var(--c) 62%,color-mix(in srgb,var(--c) 70%,#000) 100%);
  box-shadow:0 0 0 2.5px rgba(6,10,28,.7),0 0 0 4px color-mix(in srgb,var(--c) 55%,transparent),0 0 22px 2px color-mix(in srgb,var(--c) 70%,transparent),0 6px 14px rgba(0,0,0,.45);
  pointer-events:auto!important;transition:opacity .3s,width .25s,height .25s,margin .25s;will-change:transform}
.mlh-spot::before{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid var(--c);opacity:0;animation:mlh-ping 2.4s cubic-bezier(.2,.7,.3,1) infinite;pointer-events:none}
@keyframes mlh-ping{0%{transform:scale(.75);opacity:.85}80%,100%{transform:scale(1.75);opacity:0}}
.mlh-spot svg{width:17px;height:17px;stroke-width:2.3}
.mlh-spot span{position:absolute;left:calc(100% + 9px);top:50%;transform:translate(-4px,-50%);white-space:nowrap;padding:5px 11px;border-radius:999px;background:rgba(8,13,34,.88);
  border:1px solid color-mix(in srgb,var(--c) 55%,transparent);color:#fff;font-size:12.5px;font-weight:700;letter-spacing:.01em;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;
  box-shadow:0 6px 18px rgba(0,0,0,.35)}
.mlh-spot:hover span,.mlh-spot:focus-visible span,.mlh-spot.focus span{opacity:1;transform:translate(0,-50%)}
.mlh-spot:focus-visible{outline:2px solid #fff;outline-offset:3px}
.mlh-spot.gone{opacity:0;pointer-events:none!important}
.mlh-spots.off .mlh-spot{opacity:0;pointer-events:none!important}
.mlh-spots.touring .mlh-spot{opacity:.28;pointer-events:none!important}
.mlh-spots.touring .mlh-spot.focus{opacity:1;width:44px;height:44px;margin:-22px 0 0 -22px}
.mlh-spots.touring .mlh-spot.gone{opacity:0}
/* \u2500\u2500 welcome tour \u2500\u2500 */
.mlh-tour{position:absolute;left:50%;bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 20px);transform:translate(-50%,12px);width:min(470px,calc(100% - 28px));
  padding:16px 18px 14px;border-radius:20px;background:linear-gradient(160deg,rgba(26,38,84,.94),rgba(10,15,38,.95));border:1px solid rgba(110,200,255,.28);
  box-shadow:0 24px 60px rgba(0,0,0,.5),0 0 40px -12px rgba(54,227,255,.45);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  opacity:0;transition:opacity .3s,transform .3s;pointer-events:auto!important}
.mlh-tour.on{opacity:1;transform:translate(-50%,0)}
.mlh-tour[hidden]{display:block!important;visibility:hidden}
.mlh-tour .mlh-kicker{margin:0 0 4px}
.mlh-tour h3{margin:0 0 6px;font-size:19px;line-height:1.25;letter-spacing:-.01em}
.mlh-tour p{margin:0 0 14px;color:#c9d5f2;font-size:14.5px;line-height:1.5}
.mlh-tour-row{display:flex;align-items:center;gap:8px}
.mlh-tour-row .mlh-btn{min-height:42px}
.mlh-tour-row .mlh-btn.pri{min-width:96px}
.mlh-tour-skip{all:unset;cursor:pointer;color:#9fb0d8;font-size:13.5px;font-weight:600;padding:8px 4px;border-radius:8px}
.mlh-tour-skip:hover{color:#fff}
.mlh-tour-skip:focus-visible{outline:2px solid var(--cyan)}
.mlh-tour-dots{flex:1;display:flex;justify-content:center;gap:5px}
.mlh-tour-dots i{width:6px;height:6px;border-radius:99px;background:rgba(255,255,255,.22);transition:width .25s,background .25s}
.mlh-tour-dots i.on{width:18px;background:linear-gradient(90deg,var(--cyan),var(--pink))}
@media (max-width:520px){.mlh-tour{padding:14px 14px 12px}.mlh-tour h3{font-size:17px}.mlh-tour p{font-size:14px}.mlh-tour-dots{display:none}.mlh-tour-row .mlh-btn{flex:1}.mlh-spot span{display:none}.mlh-spot.focus span{display:block}}
/* \u2500\u2500 Home: BOBO OS as the game's home screen (setHome) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Same materials as the game's own menu (dark glass, hairline accent, white
   labels) so it reads as one product; each mode keeps the game's colour. */
.mlh{--hp:79,214,232;--hl:255,92,181;--hr:255,196,46;--ha:var(--hp)}
.mlh.mlh-m-lounge{--ha:var(--hl)}
.mlh.mlh-m-room{--ha:var(--hr)}
.mlh.mlh-homed [data-r="pc"],.mlh.mlh-homed [data-r="exit"]{display:none}
.mlh-hdock{position:absolute;right:16px;bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 18px);display:flex;align-items:flex-end;gap:14px;pointer-events:none!important}
.mlh-hdock.l{right:auto;left:16px;flex-direction:row-reverse}
.mlh-hdock>button{pointer-events:auto!important}
.mlh-homeb{position:relative;width:58px;height:58px;padding:0;border-radius:18px;display:grid;place-items:center;border:1px solid rgba(var(--ha),.42);background:rgba(20,22,26,.86);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 18px rgba(var(--ha),.18);transition:transform .18s,border-color .18s,box-shadow .18s}
.mlh-homeb::before{content:"";position:absolute;inset:10px;border-radius:50%;background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ha)) 38%,rgba(var(--ha),.4) 74%,transparent 100%);filter:blur(7px);opacity:.55;animation:mlh-hpulse 2.6s ease-in-out infinite}
.mlh-homeb svg{position:relative;width:32px;height:32px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4))}
.mlh-homeb:hover,.mlh-homeb.on{transform:scale(1.05);border-color:rgb(var(--ha));box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 22px rgba(var(--ha),.35)}
.mlh-homeb .mlh-badge{top:-5px;right:-5px}
@keyframes mlh-hpulse{0%,100%{transform:scale(1);opacity:.45}50%{transform:scale(1.14);opacity:.7}}
.mlh-act{position:relative;width:58px;height:58px;padding:0;border-radius:50%;display:grid;place-items:center;border:0;color:#fff;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.35),transparent 55%),linear-gradient(145deg,rgb(var(--ha)),rgba(var(--ha),.55));box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 0 3px rgba(20,22,26,.55),0 0 22px rgba(var(--ha),.45);transition:transform .2s cubic-bezier(.2,1.4,.4,1),box-shadow .2s}
.mlh-act svg{width:28px;height:28px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));transition:transform .25s,opacity .2s}
.mlh-act .x{position:absolute;opacity:0;transform:rotate(-90deg) scale(.6)}
.mlh-act[aria-expanded="true"]{transform:scale(.92)}
.mlh-act[aria-expanded="true"] .p{opacity:0;transform:rotate(90deg) scale(.6)}
.mlh-act[aria-expanded="true"] .x{opacity:1;transform:none}
.mlh-act:focus-visible,.mlh-homeb:focus-visible,.mlh-fan button:focus-visible,.mlh-hs button:focus-visible{outline:2px solid #fff;outline-offset:3px}
.mlh-fan{position:absolute;width:0;height:0;pointer-events:none!important}
.mlh-fan .it{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:4px;width:76px;margin:-26px 0 0 -38px;transform:translate(0,0) scale(.3);opacity:0;visibility:hidden;transition:transform .32s cubic-bezier(.2,1.5,.4,1),opacity .2s,visibility 0s .32s}
.mlh-fan.open .it{transform:translate(var(--x),var(--y)) scale(1);opacity:1;visibility:visible;transition-delay:calc(var(--i) * 35ms),calc(var(--i) * 35ms),0s}
.mlh-fan.open .it button{pointer-events:auto!important}
.mlh-fan button{width:52px;height:52px;padding:0;border-radius:50%;display:grid;place-items:center;color:#fff;border:1px solid rgba(var(--ha),.5);background:rgba(20,22,26,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 6px 18px rgba(0,0,0,.4)}
.mlh-fan button:hover,.mlh-fan button:active{border-color:rgb(var(--ha));background:rgba(var(--ha),.25)}
.mlh-fan button svg{width:24px;height:24px}
.mlh-fan .it span{max-width:76px;padding:2px 8px;border-radius:999px;background:rgba(10,12,16,.72);font-size:11.5px;font-weight:700;line-height:1.35;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.5)}
html.mlh-modal .crc-anchor,html.mlh-modal .mlh-hdock{visibility:hidden}
html.mlh-homed .crc-anchor.crc-tr,html.mlh-homed .crc-anchor.crc-tl{top:calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px)) + 12px + var(--crc-dy,0px))}
.mlh.mlh-docked .mlh-prompt{bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 92px)}
.mlh-layer.mlh-home{align-items:end;padding:0 8px calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 8px);background:rgba(3,6,12,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.mlh-hs{position:relative;width:min(440px,100%);max-height:calc(100% - var(--safe-area-inset-top,env(safe-area-inset-top,0px)) - 20px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:8px 16px 16px;border-radius:26px;color:#e8ecf2;border:1px solid rgba(var(--ha),.24);background:radial-gradient(120% 50% at 50% -12%,rgba(var(--ha),.17),transparent 62%),rgba(18,20,24,.975);box-shadow:0 26px 80px rgba(0,0,0,.72);transform:translateY(24px);transition:transform .32s cubic-bezier(.2,1,.3,1)}
.mlh-home.open .mlh-hs{transform:none}
.mlh-hs::before{content:"";position:absolute;top:0;left:12%;right:12%;height:1px;background:linear-gradient(90deg,transparent,rgb(var(--ha)),transparent);opacity:.85}
.mlh-hs-grab{width:40px;height:5px;margin:0 auto 6px;border-radius:99px;background:rgba(255,255,255,.22);touch-action:none}
.mlh-hs-head{display:flex;align-items:center;gap:12px;padding:4px 0 12px;touch-action:none}
.mlh-hs-head .mk{flex:none;width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}
.mlh-hs-head .mk svg{width:28px;height:28px}
.mlh-hs-head .t{flex:1;min-width:0}
.mlh-hs-head b{display:block;font-size:19px;font-weight:800;letter-spacing:.02em;line-height:1.2}
.mlh-hs-head b i{font-style:normal;background:linear-gradient(90deg,var(--cyan),var(--pink));-webkit-background-clip:text;background-clip:text;color:transparent}
.mlh-hs-head small{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:#98a2b1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlh-hs-head small::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;background:rgb(var(--ha));box-shadow:0 0 8px rgb(var(--ha))}
.mlh-hs-x{flex:none;width:44px;height:44px;border-radius:13px;border:1px solid #2a2f38;background:#1b1e24;display:grid;place-items:center}
.mlh-hs-x svg{width:20px;height:20px}
.mlh-hs-resume{display:flex;gap:8px;margin:0 0 12px}
.mlh-hs-resume button{flex:1;min-height:52px;border-radius:14px;border:1px solid rgba(var(--hp),.5);background:rgba(var(--hp),.2);font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px}
.mlh-hs-resume button+button{flex:0 0 auto;padding:0 18px;border-color:#2a2f38;background:#1b1e24;font-size:14px}
.mlh-hs-resume svg{width:18px;height:18px}
.mlh-hs-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.mlh-hs-modes button{position:relative;--c:var(--hp);display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:104px;padding:12px 10px 10px;border-radius:16px;text-align:left;border:1px solid rgba(var(--c),.3);background:linear-gradient(160deg,rgba(var(--c),.16),rgba(var(--c),.04) 70%),#17191e;transition:transform .15s,border-color .15s,background .15s}
.mlh-hs-modes button:active{transform:scale(.97)}
.mlh-hs-modes button[data-go="lounge"]{--c:var(--hl)}
.mlh-hs-modes button[data-go="room"]{--c:var(--hr)}
.mlh-hs-modes i{display:grid;place-items:center;width:36px;height:36px;margin-bottom:auto;border-radius:11px;color:#101215;background:rgb(var(--c));box-shadow:0 0 14px rgba(var(--c),.45)}
.mlh-hs-modes i svg{width:20px;height:20px}
.mlh-hs-modes b{margin-top:10px;font-size:14.5px;line-height:1.2}
.mlh-hs-modes small{font-size:11.5px;line-height:1.3;color:#98a2b1}
.mlh-hs-modes button.cur{border-color:rgb(var(--c));box-shadow:0 0 0 1px rgb(var(--c)) inset,0 0 18px rgba(var(--c),.22)}
.mlh-hs-modes button.cur::after{content:"Now";position:absolute;top:10px;right:10px;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#101215;background:rgb(var(--c))}
.mlh-hs-h{margin:16px 2px 8px;font-size:11.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7d8696}
.mlh-hs-apps{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 6px}
.mlh-hs-apps button{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 2px 6px;border:0;border-radius:14px;background:none;font-size:12.5px;font-weight:600;color:#dfe5ee;line-height:1.25;text-align:center}
.mlh-hs-apps button:active{background:rgba(255,255,255,.06)}
.mlh-hs-apps .mlh-tile{width:54px;height:54px}
.mlh-hs-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.mlh-hs-quick button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:72px;padding:8px 4px;border-radius:14px;border:1px solid #2a2f38;background:#1b1e24;font-size:11.5px;font-weight:600;color:#c9d1dc;line-height:1.2}
.mlh-hs-quick svg{width:22px;height:22px}
.mlh-hs-quick button[aria-pressed="true"]{color:#fff;border-color:rgba(var(--hp),.55);background:rgba(var(--hp),.16)}
.mlh-hs-quick button[aria-pressed="false"] svg{opacity:.45}
.mlh-hs-join{position:relative;width:100%;min-height:54px;margin-top:14px;border-radius:14px;border:1px solid rgba(var(--hp),.55);overflow:hidden;font-size:16px;font-weight:700;letter-spacing:.01em;background:linear-gradient(180deg,rgba(var(--hp),.42),rgba(var(--hp),.22));box-shadow:0 0 22px rgba(var(--hp),.22);display:flex;align-items:center;justify-content:center;gap:8px}
.mlh-hs-join svg{width:17px;height:17px;opacity:.85}
@media (min-width:700px) and (min-height:560px){.mlh-layer.mlh-home{align-items:center}}
@media (max-height:640px){.mlh-hs-modes button{min-height:88px}.mlh-hs-quick button{min-height:62px}.mlh-hs-h{margin-top:12px}}
@media (prefers-reduced-motion:reduce){
  .mlh *{animation:none!important;transition:none!important}
}
`
);
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647 | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
}
function vnoise(u, v, px, seed, py = px) {
  const x = u * px;
  const y = v * py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wx = (n) => (n % px + px) % px;
  const wy = (n) => (n % py + py) % py;
  const a = hash2(wx(x0), wy(y0), seed);
  const b = hash2(wx(x0 + 1), wy(y0), seed);
  const c = hash2(wx(x0), wy(y0 + 1), seed);
  const d = hash2(wx(x0 + 1), wy(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const HEIGHTS = {
  // brushed aluminium: long fine streaks
  brushed: (u, v) => 0.65 * vnoise(u, v, 3, 2, 220) + 0.35 * vnoise(u, v, 8, 3, 90),
  // painted plaster
  plaster: (u, v) => 0.55 * vnoise(u, v, 24, 4) + 0.3 * vnoise(u, v, 64, 5) + 0.15 * vnoise(u, v, 160, 6),
  // woven fabric
  fabric: (u, v) => {
    const a = Math.sin(u * Math.PI * 2 * 96) * 0.5 + 0.5;
    const b = Math.sin(v * Math.PI * 2 * 96) * 0.5 + 0.5;
    return 0.45 * (Math.floor(u * 96 + v * 96) % 2 ? a : b) + 0.55 * vnoise(u, v, 48, 7);
  },
  // satin plastic / lacquer: almost flat, a little orange peel
  peel: (u, v) => 0.7 * vnoise(u, v, 48, 8) + 0.3 * vnoise(u, v, 128, 9)
};
function heightField(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) h[y * size + x] = fn(x / size, y / size);
  return h;
}
function dataTexture(size, data) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.putImageData(new ImageData(data, size, size), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function detailMaps(size, h, rough) {
  const n = new Uint8ClampedArray(size * size * 4);
  const r = new Uint8ClampedArray(size * size * 4);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of h) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const at = (x, y) => h[(y + size) % size * size + (x + size) % size];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / span;
      const dy = (at(x, y + 1) - at(x, y - 1)) / span;
      const len = Math.hypot(dx * 6, dy * 6, 1);
      const i = (y * size + x) * 4;
      n[i] = -dx * 6 / len * 127 + 128;
      n[i + 1] = dy * 6 / len * 127 + 128;
      n[i + 2] = 1 / len * 127 + 128;
      n[i + 3] = 255;
      const k = (at(x, y) - lo) / span;
      const g = (rough[0] + (rough[1] - rough[0]) * k) * 255;
      r[i] = r[i + 1] = r[i + 2] = g;
      r[i + 3] = 255;
    }
  return { normal: dataTexture(size, n), rough: dataTexture(size, r) };
}
function normalFromImage(img, max = 512) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(4, Math.round(img.width * k));
  const hgt = Math.max(4, Math.round(img.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = hgt;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, hgt);
  const px = ctx.getImageData(0, 0, w, hgt).data;
  const lum = new Float32Array(w * hgt);
  for (let i = 0; i < w * hgt; i++)
    lum[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
  const out = new Uint8ClampedArray(w * hgt * 4);
  const rough = new Uint8ClampedArray(w * hgt * 4);
  const at = (x, y) => lum[(y + hgt) % hgt * w + (x + w) % w];
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out[i] = -dx / len * 127 + 128;
      out[i + 1] = dy / len * 127 + 128;
      out[i + 2] = 1 / len * 127 + 128;
      out[i + 3] = 255;
      const g = (0.62 - at(x, y) * 0.3) * 255;
      rough[i] = rough[i + 1] = rough[i + 2] = g;
      rough[i + 3] = 255;
    }
  const make = (d) => {
    const cc = document.createElement("canvas");
    cc.width = w;
    cc.height = hgt;
    cc.getContext("2d").putImageData(new ImageData(d, w, hgt), 0, 0);
    const t = new THREE.CanvasTexture(cc);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return { normal: make(out), rough: make(rough) };
}
function studioEnv() {
  const W = 512;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#2a3350");
  sky.addColorStop(0.48, "#121828");
  sky.addColorStop(0.52, "#0c0f19");
  sky.addColorStop(1, "#07080d");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const box = (x, y, w, h, col, a = 1) => {
    const gr = g.createRadialGradient(
      x + w / 2,
      y + h / 2,
      2,
      x + w / 2,
      y + h / 2,
      Math.max(w, h) * 0.75
    );
    gr.addColorStop(0, col);
    gr.addColorStop(0.55, col);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = a;
    g.fillStyle = gr;
    g.fillRect(x - w * 0.25, y - h * 0.25, w * 1.5, h * 1.5);
    g.globalAlpha = 1;
  };
  box(70, 40, 120, 60, "#fff4e6");
  box(330, 55, 90, 50, "#dfe9ff", 0.75);
  box(250, 6, 160, 18, "#ffffff", 0.55);
  g.fillStyle = "rgba(54,227,255,.85)";
  g.fillRect(0, 118, W, 3);
  g.fillStyle = "rgba(255,79,163,.7)";
  g.fillRect(200, 98, 46, 40);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  srgb(t);
  return t;
}
const PRODUCT_ICON = {
  keychain: svg('<circle cx="8" cy="8" r="4"/><path d="m11 11 9 9M17 17l2-2M15 15l2-2"/>'),
  hoodie: svg(
    '<path d="M8 4c0 2 1.8 3.5 4 3.5S16 6 16 4l4 3-2 4-1.5-.8V20H7.5v-9.8L6 11 4 7z"/><path d="M10 15h4"/>'
  ),
  tee: svg('<path d="M8 4c0 1.6 1.8 2.5 4 2.5S16 5.6 16 4l5 3-2 4-2-1v10H7V10l-2 1-2-4z"/>'),
  deskmat: svg(
    '<rect x="3" y="7" width="18" height="10" rx="2.5"/><circle cx="15.5" cy="12" r="2"/>'
  ),
  mystery: svg(
    '<path d="M9.2 9a3 3 0 1 1 4.2 2.8c-.9.4-1.4 1.1-1.4 2v.7"/><path d="M12 18.5h.01"/><rect x="3" y="3" width="18" height="18" rx="4"/>'
  )
};
class CollectorHub {
  constructor(opts) {
    __publicField(this, "root", new THREE.Group());
    __publicField(this, "opts");
    __publicField(this, "roomId");
    __publicField(this, "_state", "hidden");
    __publicField(this, "_room");
    __publicField(this, "_loaded");
    __publicField(this, "_disposed", false);
    /* reveal */
    __publicField(this, "_reveal", {
      uSolid: { value: 1e3 },
      uWire: { value: 1e3 },
      uGhost: { value: 0 },
      uOrigin: { value: new THREE.Vector3() },
      uFloor: { value: 0 },
      uGlow: { value: new THREE.Color(3597311) },
      uRoomInv: { value: new THREE.Matrix4() }
    });
    __publicField(this, "_maxDist", 6);
    /** The room's bounds in room space, and its outer radius on the floor. */
    __publicField(this, "_box", new THREE.Box3());
    __publicField(this, "_radius", 1.9);
    __publicField(this, "_buildSpeed", 1);
    __publicField(this, "_ghostFrom", 0);
    __publicField(this, "_warmed", false);
    /** Room height above uFloor: how far the materialise scan line travels. */
    __publicField(this, "_maxH", 3);
    __publicField(this, "_wireMat");
    __publicField(this, "_wires", []);
    __publicField(this, "_patched", []);
    __publicField(this, "_owned", []);
    // materials this core created (disposed with it)
    __publicField(this, "_geos", []);
    __publicField(this, "_texs", []);
    /* bobo + sequence */
    __publicField(this, "_bobo");
    __publicField(this, "_mixer");
    __publicField(this, "_actions", {});
    __publicField(this, "_current");
    __publicField(this, "_boboHome", { pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
    __publicField(this, "_walk");
    __publicField(this, "_seqT", 0);
    __publicField(this, "_walkIn", true);
    __publicField(this, "_leaveSpeed", 1);
    __publicField(this, "_peeked", false);
    __publicField(this, "_peekTimer");
    __publicField(this, "_look", {
      osSize: 0.8,
      osOpacity: 0.88,
      osDim: 0.18,
      hudInsetRight: 0,
      hudInsetLeft: 0,
      zIndex: 2000100,
      modeBottom: 78,
      modeCorner: "bottomLeft",
      modeTop: 78,
      modeAvoid: "",
      brightness: 1,
      exitButton: true,
      topOffset: 0,
      joystickSide: "left",
      accents: {}
    });
    /** The room's world scale and brightness the lights were last set for. */
    __publicField(this, "_lit", { scale: -1, brightness: -1 });
    __publicField(this, "_leaveResolve");
    __publicField(this, "_portalT", 0);
    __publicField(this, "_portalShut", false);
    __publicField(this, "_steps", []);
    /* room pieces */
    __publicField(this, "_portal");
    __publicField(this, "_pad");
    __publicField(this, "_swirl");
    __publicField(this, "_swirlAxis", new THREE.Vector3(0, 1, 0));
    __publicField(this, "_orbitCans");
    __publicField(this, "_alertMat");
    __publicField(this, "_screenMat");
    __publicField(this, "_screenBase", 1);
    __publicField(this, "_screenCenter", new THREE.Vector3());
    // room space
    __publicField(this, "_lampPos", new THREE.Vector3());
    // room space
    __publicField(this, "_pullTab");
    __publicField(this, "_pullRest", 0);
    __publicField(this, "_tabWiggle", 0);
    __publicField(this, "_fizz", []);
    __publicField(this, "_pickables", []);
    __publicField(this, "_lights", []);
    /** Height of the loft's floor in room units (for sizing the room to the viewer). */
    __publicField(this, "_loftY", 0);
    /** Bobo's bed: kept Bobo-sized in a room scaled up for people. */
    __publicField(this, "_bed");
    __publicField(this, "_bedScale", 1);
    /* collection */
    __publicField(this, "_holoMat");
    __publicField(this, "_holoUniforms", {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uColor: { value: new THREE.Color(3597311) },
      uRoomInv: this._reveal.uRoomInv
    });
    __publicField(this, "_slots", []);
    /* monitor + alerts */
    __publicField(this, "_screenCanvas");
    __publicField(this, "_screenTex");
    __publicField(this, "_screenImg");
    __publicField(this, "_screenDirty", true);
    __publicField(this, "_screenClock", "");
    __publicField(this, "_notifT", -1);
    // seconds since the monitor's pop-up started
    __publicField(this, "_notif");
    __publicField(this, "_alerts", []);
    __publicField(this, "_known", /* @__PURE__ */ new Set());
    __publicField(this, "_read", /* @__PURE__ */ new Set());
    __publicField(this, "_pollTimer");
    __publicField(this, "_greeted", false);
    __publicField(this, "_polled", false);
    /* hologram beam */
    __publicField(this, "_card");
    __publicField(this, "_cardTex");
    __publicField(this, "_cardCanvas");
    __publicField(this, "_beam");
    __publicField(this, "_cardU", {
      uMap: { value: null },
      uTime: { value: 0 },
      uAlpha: { value: 0 }
    });
    __publicField(this, "_beamU", { uTime: { value: 0 }, uAlpha: { value: 0 } });
    __publicField(this, "_beamAlert");
    __publicField(this, "_beamT", -1);
    __publicField(this, "_beamPhase", "out");
    __publicField(this, "_flash", 0);
    /* fizz burst */
    __publicField(this, "_burst");
    __publicField(this, "_bubbles", []);
    /* access */
    __publicField(this, "_token", null);
    __publicField(this, "_me", null);
    /* ui */
    __publicField(this, "_ui");
    __publicField(this, "_style");
    __publicField(this, "_el", {});
    __publicField(this, "_lastFocus", null);
    __publicField(this, "_toastTimer");
    __publicField(this, "_hintTimer");
    __publicField(this, "_gateResolve");
    __publicField(this, "_ac");
    __publicField(this, "_off", []);
    /* os */
    __publicField(this, "_wins", /* @__PURE__ */ new Map());
    __publicField(this, "_z", 10);
    __publicField(this, "_booted", false);
    __publicField(this, "_focused");
    __publicField(this, "_feed", null);
    __publicField(this, "_lbTab", "cities");
    __publicField(this, "_t", {
      v: new THREE.Vector3(),
      v2: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      m: new THREE.Matrix4()
    });
    __publicField(this, "_time", 0);
    __publicField(this, "_reduceMotion");
    /* hotspots + tour */
    __publicField(this, "_spots", []);
    __publicField(this, "_spotFrame", 0);
    __publicField(this, "_tourI", -1);
    __publicField(this, "_afterTour", null);
    /* home screen (setHome) */
    __publicField(this, "_home", null);
    __publicField(this, "_fanOpen", false);
    __publicField(this, "_dockKey", "");
    __publicField(this, "_homeMode", "");
    /** How far the last placeAround pushed the room back from Bobo's spot (parent units). */
    __publicField(this, "lastPush", new THREE.Vector3());
    __publicField(this, "_solidCache", {});
    __publicField(this, "_ray", new THREE.Raycaster());
    __publicField(this, "_ndc", new THREE.Vector2());
    this.opts = { lights: true, room: "evade", exitLabel: "Exit", ...opts };
    this.roomId = this.opts.room || "evade";
    this._ac = opts.audioContext ?? null;
    this._reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.root.name = "CollectorHub";
    this.root.visible = false;
    this.opts.parent.add(this.root);
    const saved = this._loadSession();
    this._token = saved?.token ?? null;
    this._me = saved?.me ?? null;
    try {
      this._known = new Set(JSON.parse(store.get(this._k("known")) || "[]"));
      this._read = new Set(JSON.parse(store.get(this._k("read")) || "[]"));
    } catch {
    }
    this._buildUI();
    this._bindTaps();
    this.configure({
      ...opts.modeBottom != null ? { modeBottom: opts.modeBottom } : {},
      ...opts.hudOffset ? { topOffset: opts.hudOffset } : {},
      ...opts.look
    });
    const os = this._el.os;
    const osClick = (e) => {
      if (e.target === os) this.closeOS();
    };
    os.addEventListener("click", osClick);
    this._off.push(() => os.removeEventListener("click", osClick));
  }
  /* ── public API ───────────────────────────────────────────────────── */
  get state() {
    return this._state;
  }
  get me() {
    return this._me;
  }
  get signedIn() {
    return !!this._token;
  }
  get loaded() {
    return !!this._room;
  }
  /** Height of the room's Bobo in room units (for matching the player's size). */
  boboHeight() {
    if (!this._bobo) return 0.78;
    const b = new THREE.Box3().setFromObject(this._bobo);
    const s = this.root.getWorldScale(this._t.v).y || 1;
    return (b.max.y - b.min.y) / s;
  }
  load() {
    this._loaded ?? (this._loaded = this.opts.loader.loadAsync(this.opts.modelUrl).then((g) => this._onLoaded(g)));
    return this._loaded;
  }
  /**
   * Make sure the fan can open the room: a saved key that still works, or
   * the unlock form. Resolves false if they close the form.
   */
  async ensureAccess() {
    const code = this.opts.hubCode ? checkCode(this.opts.hubCode) : null;
    const known = this._knownCodes();
    if (this._token && !(code?.ok && !known.includes(code.code))) {
      const ok = await this._refreshMe();
      if (ok) return true;
    }
    return this.openGate(this._token ? "add" : "unlock");
  }
  /** Show the unlock form. "add" = signed in already, adding another item. */
  openGate(mode = "unlock") {
    this._gateResolve?.(false);
    this._showGateForm(mode);
    this._open(this._el.gate);
    return new Promise((res) => this._gateResolve = res);
  }
  get _portalOn() {
    return this.opts.portal !== false;
  }
  get _ownBobo() {
    return this.opts.ownBobo !== false;
  }
  /** Everything hidden, room visible: the start of every build. */
  _arm(ghost) {
    this._closeAllLayers();
    if (this._tourI >= 0) this._tourEnd(false);
    this._el.spots.classList.add("off");
    this.root.visible = true;
    this._reveal.uSolid.value = -1;
    this._reveal.uWire.value = -1;
    this._reveal.uGhost.value = ghost;
    for (const w of this._wires) w.visible = true;
    if (this._bobo) this._bobo.visible = false;
    this._holoUniforms.uAlpha.value = 0;
    this._hideBeam(true);
    this._setShadows(false);
    this._hud(false);
    this._el.skip.hidden = true;
    this._startPolling();
  }
  /** Only the portal: the room is waiting to be built. (Without a portal: nothing yet.) */
  showPortal() {
    if (!this._room) return;
    this._arm(0);
    this._portalT = 0;
    if (!this._portalOn) this._portalScale(0);
    this._setState("portal");
  }
  /**
   * The room as a faint wireframe, nothing solid: while the host moves it
   * (AR re-placement: the outline follows the reticle with Bobo). enter()
   * builds it back from there.
   */
  preview() {
    if (!this._room) return;
    this._arm(0.3);
    this._portalScale(0);
    this.prompt(null);
    this._setState("preview");
  }
  /**
   * Build the room. With the portal, Bobo goes through it and the room builds
   * around him. Without it the wireframe races out from `origin` (a world
   * point, normally the host's Bobo), then the room materialises floor to
   * ceiling. quick: about twice as fast (a rebuild after moving the room).
   */
  enter(opts = {}) {
    if (!this._room || this._state === "building" || this._state === "live") return;
    this._ghostFrom = this._state === "preview" ? this._reveal.uGhost.value : 0;
    if (this._state === "hidden" || this._state === "preview" || this._state === "leaving") {
      this.showPortal();
      if (this._ghostFrom) this._reveal.uGhost.value = this._ghostFrom;
    }
    if (opts.origin) this._setOrigin(opts.origin);
    else if (this._portal) this._setOrigin(this._portal.getWorldPosition(this._t.v), 0.5);
    this._walkIn = opts.walk !== false && this._portalOn && this._ownBobo;
    this._buildSpeed = opts.quick ? 2 : 1;
    this._seqT = 0;
    this._portalShut = !this._portalOn;
    if (this._bobo) this._bobo.visible = false;
    this.prompt(null);
    this._setState("building");
    this._el.skip.hidden = false;
    this._sfx("whoosh");
    if (this._reduceMotion) this._buildSpeed = Math.max(this._buildSpeed, 2.2);
  }
  /** Where the wireframe draws out from (world point; lift in room units). */
  _setOrigin(world, lift = 0.4) {
    const room = this._room;
    if (!room) return;
    room.updateWorldMatrix(true, false);
    const o = this._reveal.uOrigin.value.copy(world).applyMatrix4(this._t.m.copy(room.matrixWorld).invert());
    o.y += lift;
    let d = 0;
    const b = this._box;
    for (const x of [b.min.x, b.max.x])
      for (const y of [b.min.y, b.max.y])
        for (const z of [b.min.z, b.max.z]) d = Math.max(d, this._t.v2.set(x, y, z).distanceTo(o));
    this._maxDist = d + 0.3;
  }
  /**
   * Compile the room's shaders and upload its textures ahead of time, so the
   * first build doesn't stall the frame (the "freeze, then the room pops in").
   * Call once the model has loaded, while the room is still hidden; pass the
   * scene it will render in, so the lights match. Safe to call more than once.
   */
  async warm(renderer, camera, scene) {
    if (this._warmed || !this._room || !renderer || !camera || this._disposed) return;
    this._warmed = true;
    let target = scene ?? null;
    for (let p = this.root; !target && p; p = p.parent)
      if (p.isScene) target = p;
    const flipped = [];
    this.root.traverse((o) => {
      if (!o.visible) {
        flipped.push(o);
        o.visible = true;
      }
    });
    let done = Promise.resolve();
    try {
      if (typeof renderer.compileAsync === "function")
        done = renderer.compileAsync(this.root, camera, target ?? this.root);
      else renderer.compile?.(this.root, camera, target ?? this.root);
    } catch (e) {
      console.warn("[CollectorHub] shader warm-up skipped", e);
    }
    for (const o of flipped) o.visible = false;
    await done.catch(() => void 0);
    if (typeof renderer.initTexture !== "function") return;
    const seen = /* @__PURE__ */ new Set();
    this.root.traverse((o) => {
      const mats = o.material ? Array.isArray(o.material) ? o.material : [o.material] : [];
      for (const m of mats)
        for (const k of Object.keys(m)) {
          const t = m[k];
          if (t && t.isTexture && !t.isRenderTargetTexture) seen.add(t);
        }
    });
    for (const t of seen) {
      if (this._disposed) return;
      try {
        renderer.initTexture(t);
      } catch {
      }
      await new Promise(
        (r) => typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => r()) : setTimeout(r, 16)
      );
    }
  }
  /** Jump to the finished room. */
  skip() {
    if (!this._room) return;
    this._finishBuild();
  }
  /**
   * Bobo walks back out and the room folds away into the portal.
   * fast: fold in about a second without the walk-out (the host shows its own
   * player straight away, e.g. because a round is starting).
   */
  leave(opts = {}) {
    if (this._state !== "live" && this._state !== "building") {
      return Promise.resolve();
    }
    if (opts.origin) this._setOrigin(opts.origin);
    this._leaveSpeed = opts.fast ? 3 : 1;
    if (opts.fast && this._bobo) this._bobo.visible = false;
    if (this._tourI >= 0) this._tourEnd(false);
    this._closeAllLayers();
    this._hideBeam(false);
    this._seqT = 0;
    this._el.skip.hidden = true;
    this._hud(false);
    this._setShadows(false);
    this._setState("leaving");
    const done = new Promise((res) => this._leaveResolve = res);
    if (this._reduceMotion) this._finishLeave();
    return done;
  }
  /**
   * The "Bobo's Hideout" mode button: a small round icon (bottom left) whose
   * label slides out the first time it appears, and on hover or focus.
   * Pass null to hide it.
   */
  modeButton(onClick, label = "Bobo's Hideout", sub) {
    const b = this._el.mode;
    const was = !b.hidden;
    b.hidden = !onClick;
    if (!onClick) {
      b.classList.remove("peek");
      return;
    }
    this._el.modeLabel.textContent = label;
    this._el.modeSub.textContent = sub ?? (this._token ? "Your room" : "Unlock with your code");
    b.setAttribute("aria-label", label);
    b.title = label;
    if (!was && !this._peeked) {
      this._peeked = true;
      b.classList.add("peek");
      clearTimeout(this._peekTimer);
      this._peekTimer = setTimeout(() => b.classList.remove("peek"), 3600);
    }
    b.onclick = () => {
      this._unlockAudio();
      onClick();
    };
    this._placeMode();
  }
  /**
   * Step the mode button past any modeAvoid button in its corner (stacked
   * under it at the top, over it at the bottom), measured on screen so it
   * follows that button's own nudges and safe areas.
   */
  /** Re-measure the mode button's spot (other buttons come and go). Cheap. */
  layoutModeButton() {
    if (this._el.mode && !this._el.mode.hidden) this._placeMode();
  }
  _placeMode() {
    const b = this._el.mode;
    const ui = this._ui;
    if (!b || !ui) return;
    b.style.top = "";
    b.style.bottom = "";
    const sel = this._look.modeAvoid;
    if (!sel || b.hidden || typeof document === "undefined") return;
    const top = this._look.modeCorner.startsWith("top");
    const host = ui.getBoundingClientRect();
    const mine = b.getBoundingClientRect();
    if (!mine.width) return;
    const others = Array.from(document.querySelectorAll(sel)).filter((el) => el !== b && !b.contains(el)).map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.visibility === "hidden" || cs.display === "none" ? null : r;
    }).filter((r) => !!r && r.width > 0 && r.height > 0).filter((r) => r.right > mine.left - 4 && r.left < mine.right + 4);
    let lo = mine.top;
    let hi = mine.bottom;
    let moved = false;
    for (let pass = 0; pass < 3; pass++)
      for (const r of others) {
        if (r.bottom + 10 <= lo || r.top - 10 >= hi) continue;
        const h = hi - lo;
        if (top) {
          lo = r.bottom + 10;
          hi = lo + h;
        } else {
          hi = r.top - 10;
          lo = hi - h;
        }
        moved = true;
      }
    if (!moved) return;
    if (top) b.style.top = `${lo - host.top}px`;
    else b.style.bottom = `${host.bottom - hi}px`;
  }
  /** Change the look and layout knobs (see HubLook) at any time. */
  configure(look) {
    const L = this._look;
    const num = (v, lo, hi, d) => typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
    if (look.osSize !== void 0) L.osSize = num(look.osSize, 0.5, 1, 0.8);
    if (look.osOpacity !== void 0) L.osOpacity = num(look.osOpacity, 0.4, 1, 0.88);
    if (look.osDim !== void 0) L.osDim = num(look.osDim, 0, 0.8, 0.18);
    if (look.hudInsetRight !== void 0) L.hudInsetRight = num(look.hudInsetRight, 0, 400, 0);
    if (look.hudInsetLeft !== void 0) L.hudInsetLeft = num(look.hudInsetLeft, 0, 400, 0);
    if (look.zIndex !== void 0) L.zIndex = Math.round(num(look.zIndex, 1, 2147483e3, 2000100));
    if (look.modeBottom !== void 0) L.modeBottom = num(look.modeBottom, 0, 600, 78);
    if (look.modeTop !== void 0) L.modeTop = num(look.modeTop, 0, 600, 78);
    if (look.modeCorner !== void 0)
      L.modeCorner = ["topLeft", "topRight", "bottomLeft", "bottomRight"].includes(look.modeCorner) ? look.modeCorner : "bottomLeft";
    if (look.brightness !== void 0) L.brightness = num(look.brightness, 0.5, 3, 1);
    if (look.modeAvoid !== void 0) L.modeAvoid = String(look.modeAvoid || "");
    if (look.exitButton !== void 0) L.exitButton = !!look.exitButton;
    if (look.topOffset !== void 0) L.topOffset = num(look.topOffset, 0, 400, 0);
    if (look.joystickSide !== void 0)
      L.joystickSide = look.joystickSide === "right" ? "right" : "left";
    if (look.accents) L.accents = { ...L.accents, ...look.accents };
    const ui = this._ui;
    if (!ui) return;
    for (const [k, v] of [
      ["--hp", L.accents.play],
      ["--hl", L.accents.lounge],
      ["--hr", L.accents.room]
    ]) {
      const rgb = v && rgbTriplet(v);
      if (rgb) ui.style.setProperty(k, rgb);
    }
    this._el.hdock?.classList.toggle("l", L.joystickSide === "right");
    this._dockKey = "";
    ui.style.setProperty("--mlh-os-size", String(L.osSize));
    ui.style.setProperty("--mlh-os-alpha", String(L.osOpacity));
    ui.style.setProperty("--mlh-os-dim", String(L.osDim));
    ui.style.setProperty("--mlh-hud-r", `${L.hudInsetRight}px`);
    ui.style.setProperty("--mlh-hud-l", `${L.hudInsetLeft}px`);
    ui.style.setProperty("--mlh-mode-bottom", `${L.modeBottom}px`);
    ui.style.setProperty("--mlh-mode-top", `${L.modeTop}px`);
    const mode = this._el.mode;
    if (mode) {
      mode.classList.toggle("mlh-mode-t", L.modeCorner.startsWith("top"));
      mode.classList.toggle("mlh-mode-r", L.modeCorner.endsWith("Right"));
      this._placeMode();
    }
    this._applyLights();
    ui.style.zIndex = String(L.zIndex);
    ui.classList.toggle("mlh-hostmenu", L.hudInsetRight > 0 || L.hudInsetLeft > 0);
    ui.style.setProperty("--mlh-top", `${L.topOffset}px`);
    this._el.os?.classList.toggle("full", L.osSize >= 0.97);
    if (this._el.exit) this._el.exit.hidden = !this.opts.exitLabel || !L.exitButton;
  }
  /** Remove the room from view (no animation). */
  hide() {
    if (this._tourI >= 0) this._tourEnd(false);
    this._fanToggle(false);
    this._closeAllLayers();
    this._el.spots.classList.add("off");
    this.root.visible = false;
    this._hud(false);
    this.prompt(null);
    this._el.skip.hidden = true;
    this._stopPolling();
    this._setState("hidden");
  }
  /** World position of the portal's mouth (on the floor in front of it). */
  portalPosition(target = new THREE.Vector3()) {
    if (!this._portal) return target.copy(this.root.position);
    return this._portal.getWorldPosition(target);
  }
  /**
   * Put the room so its portal stands `distance` in front of the player, on
   * the far side from the camera, facing the camera. scale = room units → world.
   */
  placeNear(playerWorld, cameraWorld, distance, scale) {
    const parent = this.root.parent;
    let player = playerWorld.clone();
    let cameraPos = cameraWorld.clone();
    let ps = 1;
    if (parent) {
      parent.updateMatrixWorld(true);
      ps = parent.getWorldScale(new THREE.Vector3()).x || 1;
      player = parent.worldToLocal(player);
      cameraPos = parent.worldToLocal(cameraPos);
    }
    scale /= ps;
    distance /= ps;
    const dir = this._t.v.set(cameraPos.x - player.x, 0, cameraPos.z - player.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    this.root.rotation.set(0, yaw, 0);
    this.root.scale.setScalar(scale);
    const portalLocal = this._portal ? this._portal.position.clone() : new THREE.Vector3(0, 0, 2);
    const off = portalLocal.multiplyScalar(scale).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const portalWorld = this._t.v2.copy(player).addScaledVector(dir, -distance);
    this.root.position.set(portalWorld.x - off.x, player.y - off.y, portalWorld.z - off.z);
    this.root.updateMatrixWorld(true);
  }
  /**
   * Stand the room around `center` (Bobo's spot, in `parent`'s space) with its
   * open side toward the camera, so the desk and the big screen face the
   * viewer. The room joins `parent`: in AR that's the space the placed scene
   * lives in, so the room is locked to the same anchor as Bobo and can't drift
   * away from him.
   *
   * scale: room units → parent units (the smallest the room may be).
   * wrapViewer: make room for the person holding the phone too. The room
   * slides toward them (Bobo ends up in the back half, by his desk) and grows,
   * up to maxScale, until both of them are inside it, so in AR it builds
   * around the viewer. It stays centred on the line from the camera to Bobo,
   * which is the middle of the screen at placement. Returns the scale used.
   */
  placeAround(o) {
    const parent = o.parent ?? this.root.parent;
    if (parent && this.root.parent !== parent) parent.add(this.root);
    parent?.updateMatrixWorld(true);
    const cam = parent ? parent.worldToLocal(o.cameraWorld.clone()) : o.cameraWorld.clone();
    const dx = cam.x - o.center.x;
    const dz = cam.z - o.center.z;
    const d = Math.hypot(dx, dz);
    const yaw = (d > 1e-6 ? Math.atan2(dx, dz) : 0) - OPEN_YAW;
    const inner = this._radius * 0.92;
    const max = Math.max(o.scale, o.maxScale ?? o.scale * 4);
    let s = Math.max(1e-4, o.scale);
    if (o.eyeLevel && this._loftY > 0) {
      const eye = cam.y - o.center.y + (o.drop ?? 0);
      if (eye > 1e-3) s = Math.min(max, Math.max(s, eye * o.eyeLevel / this._loftY));
    }
    const home = new THREE.Vector3();
    if (this._bed) home.set(this._bed.position.x, 0, this._bed.position.z);
    home.applyAxisAngle(UP, yaw);
    const pos = new THREE.Vector3();
    const spot = Math.min(1.1, Math.max(0.3, o.viewerSpot ?? 0.8));
    const place = () => {
      let shift = 0;
      if (o.wrapViewer && d > 1e-6) {
        const CAM = spot;
        const BOBO = 0.5;
        const R = inner * s;
        if (d > R * CAM) shift = Math.min(BOBO * R, Math.max(0, d - CAM * R));
      }
      pos.set(
        o.center.x + (d > 1e-6 ? dx / d * shift : 0) - home.x * s,
        o.center.y,
        o.center.z + (d > 1e-6 ? dz / d * shift : 0) - home.z * s
      );
      return Math.hypot(cam.x - pos.x, cam.z - pos.z) / (inner * s);
    };
    const sized = !!(o.eyeLevel && this._loftY > 0);
    let out = place();
    for (let i = 0; o.wrapViewer && !sized && out > spot && s < max && i < 40; i++) {
      s = Math.min(max, s * 1.06);
      out = place();
    }
    this.lastPush.set(0, 0, 0);
    if (o.wrapViewer && (out < spot || sized && out > spot)) {
      let vx = pos.x - cam.x;
      let vz = pos.z - cam.z;
      let len = Math.hypot(vx, vz);
      if (len < 1e-6 && d > 1e-6) {
        vx = -dx;
        vz = -dz;
        len = d;
      }
      if (len > 1e-6) {
        const extra = Math.max(-2 * inner * s, (spot - out) * inner * s);
        this.lastPush.set(vx / len * extra, 0, vz / len * extra);
        pos.add(this.lastPush);
      }
    }
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0);
    this.root.scale.setScalar(s);
    if (this._bed)
      this._bed.scale.setScalar(
        this._bedScale * Math.min(1, Math.max(0.15, (o.boboScale ?? s) / s))
      );
    this.root.updateMatrixWorld(true);
    this._applyLights();
    return s;
  }
  /**
   * Keep the room equally lit at any size and apply the brightness knob.
   * A point light's reach and falloff are in world units, not the room's,
   * so a room scaled up 4x would otherwise be lit like a quarter-size one:
   * reach grows with the scale and intensity with scale^decay.
   */
  _applyLights() {
    if (!this._room) return;
    const ws = this.root.getWorldScale(this._t.v).x || 1;
    const b = this._look.brightness;
    if (Math.abs(ws - this._lit.scale) < 1e-3 * ws && b === this._lit.brightness) return;
    const envChanged = b !== this._lit.brightness;
    this._lit.scale = ws;
    this._lit.brightness = b;
    for (const l of this._lights) {
      const base = l.userData.mlhBase;
      if (!base) continue;
      const pl = l;
      if (pl.isPointLight) {
        pl.distance = base.distance * ws;
        pl.intensity = base.intensity * b * Math.pow(ws, pl.decay || 0);
      } else l.intensity = base.intensity * b;
    }
    if (!envChanged) return;
    const env = Math.min(2, 0.6 + 0.4 * b);
    this._room.traverse((o) => {
      var _a;
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || m.envMapIntensity === void 0) continue;
        (_a = m.userData).mlhEnv ?? (_a.mlhEnv = m.envMapIntensity);
        m.envMapIntensity = m.userData.mlhEnv * env;
      }
    });
  }
  /** The room's inner floor radius, in the room parent's units (for keeping Bobo inside). */
  floorRadius() {
    return this._radius * 0.9 * this.root.scale.x;
  }
  /** Horizontal distance from a world point to the portal. */
  distanceToPortal(p) {
    const q = this.portalPosition(this._t.v);
    return Math.hypot(p.x - q.x, p.z - q.z);
  }
  /** A good look at the room for hosts that drive their own camera. */
  focus() {
    const target = this.root.localToWorld(new THREE.Vector3(-0.2, 1.25, 0.4));
    const radius = 3.6 * this.root.getWorldScale(this._t.v).x;
    return { target, radius, yaw: this.root.rotation.y };
  }
  /** A short message (and an optional button) at the bottom of the screen. */
  prompt(text, button) {
    const p = this._el.prompt;
    if (!text && !button) {
      p.classList.remove("on");
      return;
    }
    const msg = p.querySelector("p");
    msg.textContent = text || "";
    msg.hidden = !text;
    const b = p.querySelector("button");
    b.hidden = !button;
    if (button) {
      b.textContent = button.label;
      b.onclick = () => {
        this._unlockAudio();
        button.onClick();
      };
    }
    p.classList.add("on");
  }
  toast(msg) {
    const t = this._el.toast;
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("on"), 2400);
  }
  /* ── Home screen: BOBO OS as the host's home (see HubHome) ───────────── */
  /**
   * Make BOBO OS the host's home screen (null: back to a plain hideout).
   * The hub then draws one home button and Bobo's moves button in the
   * bottom corner away from the joystick; the host's own menu, sound and
   * reset buttons should step aside (they're all in the sheet).
   */
  setHome(home) {
    this._home = home;
    this._ui?.classList.toggle("mlh-homed", !!home);
    document.documentElement.classList.toggle("mlh-homed", !!home);
    if (!home) {
      this.closeHome(true);
      this._fanToggle(false);
    }
    this._dockKey = "";
    this.syncHome();
  }
  get homeOpen() {
    return !!this._el.home?.classList.contains("open");
  }
  /**
   * Bring the dock in line with the host (cheap: call it whenever the host
   * changes mode, or a few times a second).
   */
  syncHome() {
    this._syncModal();
    const h = this._home;
    const dock = this._el.hdock;
    if (!dock) return;
    const mode = h ? h.mode() : "";
    const moves = h && h.movesReady() && this._tourI < 0 ? h.moves() : [];
    const show = !!h && this._tourI < 0 && !this._el.gate.classList.contains("open");
    const key = `${show}|${mode}|${moves.map((m) => m.id + m.label).join(",")}`;
    if (key === this._dockKey) return;
    this._dockKey = key;
    if (mode !== this._homeMode) {
      this._homeMode = mode;
      this._ui.classList.toggle("mlh-m-lounge", mode === "lounge");
      this._ui.classList.toggle("mlh-m-room", mode === "room");
    }
    dock.hidden = !show;
    this._ui.classList.toggle("mlh-docked", show);
    this._el.act.hidden = !moves.length;
    if (!moves.length) this._fanToggle(false);
    this._renderFan(moves);
    if (this.homeOpen) this._renderHome();
  }
  openHome() {
    const h = this._home;
    if (!h) return;
    this._fanToggle(false);
    this.closeOS();
    if (this.homeOpen) return this._renderHome();
    this._closeLayer(this._el.sheet);
    this._closeLayer(this._el.col);
    this._renderHome();
    this._open(this._el.home);
    this._el.homeb.classList.add("on");
    this._el.homeb.setAttribute("aria-expanded", "true");
    this._sfx("click");
    h.opened?.();
  }
  /** quiet: closing on the way to something else (no closed() call, no focus return). */
  closeHome(quiet = false) {
    const el = this._el.home;
    if (!el?.classList.contains("open")) return;
    el.classList.remove("open");
    this._syncModal();
    this._el.homeb.classList.remove("on");
    this._el.homeb.setAttribute("aria-expanded", "false");
    if (quiet) return;
    this._lastFocus?.focus?.({ preventScroll: true });
    this._home?.closed?.();
  }
  _renderFan(moves) {
    const fan = this._el.fan;
    const n = moves.length;
    const left = this._look.joystickSide === "right";
    const R = n > 3 ? 128 : 112;
    const a0 = n > 2 ? 62 : 80;
    const a1 = n > 2 ? 158 : 140;
    fan.innerHTML = moves.map((m, i) => {
      const deg = n > 1 ? a0 + (a1 - a0) * i / (n - 1) : 90;
      const r = deg * Math.PI / 180;
      const x = Math.round(Math.cos(r) * R * (left ? -1 : 1));
      const y = Math.round(-Math.sin(r) * R);
      return `<div class="it" style="--x:${x}px;--y:${y}px;--i:${i}"><button type="button" role="menuitem" data-mv="${esc(m.id)}" aria-label="${esc(m.label)}" tabindex="-1">${m.svg}</button><span aria-hidden="true">${esc(m.label)}</span></div>`;
    }).join("");
    for (const b of fan.querySelectorAll("[data-mv]"))
      b.addEventListener("click", () => {
        this._fanToggle(false, true);
        this._sfx("click");
        this._home?.move(b.dataset.mv);
      });
    this._placeFan();
  }
  /** The fan is centred on the moves button. */
  _placeFan() {
    const fan = this._el.fan;
    const act = this._el.act;
    if (act.hidden) return;
    fan.style.left = `${act.offsetLeft + act.offsetWidth / 2}px`;
    fan.style.top = `${act.offsetTop + act.offsetHeight / 2}px`;
  }
  _fanToggle(open = !this._fanOpen, focusBack = false) {
    if (!this._el.fan) return;
    if (open && (!this._home || this._el.act.hidden)) open = false;
    if (open === this._fanOpen) return;
    this._fanOpen = open;
    this._placeFan();
    this._el.fan.classList.toggle("open", open);
    this._el.act.setAttribute("aria-expanded", String(open));
    this._el.act.setAttribute("aria-label", open ? "Close Bobo's moves" : "Bobo's moves");
    const items = this._el.fan.querySelectorAll("[data-mv]");
    items.forEach((b) => b.tabIndex = open ? 0 : -1);
    if (open) {
      this._sfx("click");
      setTimeout(() => items[0]?.focus({ preventScroll: true }), 60);
    } else if (focusBack) this._el.act.focus({ preventScroll: true });
  }
  _renderHome() {
    const h = this._home;
    const box = this._el.hs;
    if (!h || !box) return;
    const mode = h.mode();
    const au = h.audio();
    const join = h.join();
    const inRound = mode === "play" || mode === "paused";
    const modes = [
      {
        go: "play",
        name: "Cola Run",
        sub: inRound ? "Your round" : "Grab the cans",
        icon: ICON.play,
        cur: inRound
      },
      {
        go: "lounge",
        name: "Lounge",
        sub: "Hang out with Bobo",
        icon: ICON.paw,
        cur: mode === "lounge"
      },
      { go: "room", name: "My Room", sub: "Bobo's Hideout", icon: ICON.home, cur: mode === "room" }
    ];
    const apps = APPS.filter((a) => a.id !== "colarun");
    box.innerHTML = `
<div class="mlh-hs-grab" aria-hidden="true"></div>
<div class="mlh-hs-head">
  <span class="mk">${OS_MARK}</span>
  <div class="t"><b>BOBO <i>OS</i></b><small>${esc(h.status())}</small></div>
  <button type="button" class="mlh-hs-x" data-hx aria-label="Close BOBO OS">${ICON.close}</button>
</div>
${mode === "paused" ? `<div class="mlh-hs-resume"><button type="button" data-go="resume">${ICON.play}Resume round</button><button type="button" data-go="restart">Restart</button></div>` : ""}
<div class="mlh-hs-modes" role="group" aria-label="Modes">${modes.map(
      (m) => `<button type="button" data-go="${m.go}" class="${m.cur ? "cur" : ""}"${m.cur ? ' aria-current="true"' : ""}><i>${m.icon}</i><b>${m.name}</b><small>${m.sub}</small></button>`
    ).join("")}</div>
<div class="mlh-hs-h" id="mlh-hs-apps">Apps</div>
<div class="mlh-hs-apps" role="group" aria-labelledby="mlh-hs-apps">${apps.map(
      (a) => `<button type="button" data-app="${a.id}">${tileFor(a, a.id === "alerts")}<span>${esc(a.name)}</span></button>`
    ).join("")}</div>
<div class="mlh-hs-h" id="mlh-hs-q">Settings</div>
<div class="mlh-hs-quick" role="group" aria-labelledby="mlh-hs-q">
  <button type="button" data-q="music" aria-pressed="${au.music}">${ICON.music}Music</button>
  <button type="button" data-q="sound" aria-pressed="${au.sound}">${ICON.sound}Sound</button>
  <button type="button" data-q="move">${ICON.move}Move scene</button>
  <button type="button" data-q="help">${ICON.help}How to play</button>
</div>
${join ? `<button type="button" class="mlh-hs-join" data-q="join">${esc(join.label)}${ICON.external}</button>` : ""}`;
    this._renderTray();
    const go = (fn) => () => {
      this.closeHome(true);
      fn();
      this.syncHome();
    };
    box.querySelector("[data-hx]").addEventListener("click", () => this.closeHome());
    for (const b of box.querySelectorAll("[data-go]")) {
      const to = b.dataset.go;
      b.addEventListener(
        "click",
        to === "play" && inRound || to === "lounge" && mode === "lounge" || to === "room" && mode === "room" ? () => this.closeHome() : go(() => h.go(to))
      );
    }
    for (const b of box.querySelectorAll("[data-app]"))
      b.addEventListener("click", () => this.openOS(b.dataset.app));
    for (const b of box.querySelectorAll("[data-q]"))
      b.addEventListener("click", () => {
        const q = b.dataset.q;
        if (q === "music" || q === "sound") {
          const on = b.getAttribute("aria-pressed") !== "true";
          h.setAudio(q, on);
          b.setAttribute("aria-pressed", String(on));
          this._sfx("click");
        } else if (q === "move") go(() => h.replace())();
        else if (q === "help") go(() => h.howTo())();
        else if (q === "join") h.doJoin();
      });
    const head = box.querySelector(".mlh-hs-head");
    const grab = box.querySelector(".mlh-hs-grab");
    let y0 = -1;
    const down = (e) => {
      if (e.target.closest("button")) return;
      y0 = e.clientY;
      box.style.transition = "none";
      e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (y0 < 0) return;
      box.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`;
    };
    const up = (e) => {
      if (y0 < 0) return;
      const dy = e.clientY - y0;
      y0 = -1;
      box.style.transition = "";
      box.style.transform = "";
      if (dy > 70) this.closeHome();
    };
    for (const el of [head, grab]) {
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    }
  }
  openOS(app) {
    if (this._state !== "live" && !(this._home && this._token)) return;
    this.closeHome(true);
    this._hideBeam(false);
    this._closeLayer(this._el.sheet);
    this._closeLayer(this._el.col);
    const os = this._el.os;
    const first = !os.classList.contains("open");
    if (first) {
      this._lastFocus = document.activeElement;
      os.classList.add("open");
      this._syncModal();
      this._sfx("boot");
      this._emit("osOpen", void 0);
      const boot = this._el.boot;
      if (!this._booted && !this._reduceMotion) {
        boot.classList.remove("off");
        setTimeout(() => boot.classList.add("off"), 900);
      } else boot.classList.add("off");
      this._booted = true;
      this._el.os.querySelector(".mlh-dicon")?.focus({
        preventScroll: true
      });
    }
    this._renderTray();
    if (app)
      setTimeout(
        () => this._openApp(app),
        first && !this._reduceMotion && this._el.boot.classList.contains("off") === false ? 950 : 0
      );
  }
  closeOS() {
    const os = this._el.os;
    if (!os.classList.contains("open")) return;
    os.classList.remove("open");
    this._syncModal();
    for (const id of [...this._wins.keys()]) this._closeApp(id, true);
    this._emit("osClose", void 0);
    this._lastFocus?.focus?.({ preventScroll: true });
  }
  openCollection(focus) {
    if (this._state !== "live" && this._state !== "portal") return;
    this._closeLayer(this._el.sheet);
    this._renderCollection(this._el.colBody, focus);
    this._open(this._el.col);
  }
  signOut() {
    this._token = null;
    this._me = null;
    store.set(this._k("session"), null);
    this._applyOwnership();
    this._renderHud();
    this.closeOS();
    this._emit("signedOut", void 0);
  }
  /** Per frame, from the host's loop. dt in seconds. */
  update(dt) {
    if (this._disposed || !this._room || !this.root.visible) return;
    dt = Math.min(dt, 0.1);
    this._time += dt;
    this._room.updateWorldMatrix(true, false);
    this._reveal.uRoomInv.value.copy(this._room.matrixWorld).invert();
    this._applyLights();
    if (this._state === "portal") this._updatePortal(dt);
    else if (this._state === "building") this._updateBuild(dt);
    else if (this._state === "leaving") this._updateLeave(dt);
    if (this._spots.length) this._updateSpots();
    this._mixer?.update(dt);
    const still = this._reduceMotion;
    if (this._swirl && !still)
      this._swirl.rotateOnAxis(
        this._swirlAxis,
        dt * (this._state === "building" || this._state === "leaving" ? 4 : 1.4)
      );
    if (this._orbitCans && !still) this._orbitCans.rotation.y += dt * 0.18;
    if (!still)
      for (const f of this._fizz)
        f.o.position.y = f.y + Math.sin(this._time * 1.3 + f.phase) * f.amp;
    if (this._alertMat)
      this._alertMat.emissiveIntensity = this._unread() ? 1.4 + 1.4 * Math.sin(this._time * 5) : 0.5;
    if (this._tabWiggle > 0 && this._pullTab) {
      this._pullTab.rotation.z = this._pullRest + Math.sin(this._tabWiggle * 30) * 0.12 * this._tabWiggle;
      this._tabWiggle = Math.max(0, this._tabWiggle - dt * 1.2);
    }
    this._holoUniforms.uTime.value = this._time;
    const wantHolo = this._state === "live" ? 1 : 0;
    this._holoUniforms.uAlpha.value += (wantHolo - this._holoUniforms.uAlpha.value) * (1 - Math.exp(-3 * dt));
    if (!still)
      for (const s of this._slots) {
        if (!s.holo) continue;
        s.holo.rotation.y += dt * 0.7;
        s.holo.position.y = s.y + Math.sin(this._time * 1.6 + s.phase) * 0.012;
      }
    if (this._screenMat) {
      this._flash = Math.max(0, this._flash - dt * 1.8);
      this._screenMat.emissiveIntensity = this._screenBase * (1 + this._flash * 2.2);
    }
    this._updateScreen(dt);
    this._updateBeam(dt);
    this._updateBurst(dt);
  }
  /** Tap at a screen point. Returns true if it hit something in the room. */
  tap(clientX, clientY) {
    const id = this._pick(clientX, clientY);
    if (!id) return false;
    this._unlockAudio();
    this._onTap(id);
    return true;
  }
  dispose() {
    this._disposed = true;
    this._stopPolling();
    for (const off of this._off) off();
    document.documentElement.classList.remove("mlh-modal", "mlh-homed");
    this._gateResolve?.(false);
    this._leaveResolve?.();
    this.root.parent?.remove(this.root);
    this._room?.traverse((o) => {
      if (o.isMesh || o.isLine) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose();
          m.dispose();
        }
      }
    });
    for (const m of this._owned) m.dispose();
    for (const g of this._geos) g.dispose();
    for (const t of this._texs) t.dispose();
    this._ui.remove();
    this._style?.remove();
  }
  /* ── loading ──────────────────────────────────────────────────────── */
  _onLoaded(gltf) {
    if (this._disposed) return;
    const room = this._room = gltf.scene;
    this.root.add(room);
    room.updateMatrixWorld(true);
    const roomInv = new THREE.Matrix4().copy(room.matrixWorld).invert();
    const local = (o, out = new THREE.Vector3()) => o.getWorldPosition(out).applyMatrix4(roomInv);
    this._portal = room.getObjectByName("hub_portal");
    this._pad = room.getObjectByName("hub_spawn_pad");
    this._bobo = room.getObjectByName("hub_bobo");
    this._bed = room.getObjectByName("hub_cat_bed") ?? void 0;
    const loft = room.getObjectByName("Loft_Floor");
    if (loft) {
      room.updateMatrixWorld(true);
      const lb = new THREE.Box3().setFromObject(loft);
      this._loftY = lb.isEmpty() ? 1.85 : room.worldToLocal(new THREE.Vector3(0, lb.max.y, 0)).y;
    } else this._loftY = 1.85;
    if (this._bed) this._bedScale = this._bed.scale.x || 1;
    this._swirl = room.getObjectByName("Portal_Swirl");
    this._orbitCans = room.getObjectByName("hub_orbit_cans");
    this._pullTab = room.getObjectByName("hub_pull_tab");
    this._pullRest = this._pullTab?.rotation.z ?? 0;
    const lamp = room.getObjectByName("hub_cola_lamp");
    if (lamp) {
      const b = new THREE.Box3().setFromObject(lamp);
      b.getCenter(this._lampPos).applyMatrix4(roomInv);
    }
    if (this._portal) local(this._portal, this._reveal.uOrigin.value).y += 0.5;
    const box = new THREE.Box3().setFromObject(room).applyMatrix4(roomInv);
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          this._maxDist = Math.max(
            this._maxDist,
            this._t.v.set(x, y, z).distanceTo(this._reveal.uOrigin.value)
          );
    this._maxDist += 0.3;
    this._box.copy(box);
    const wall = room.getObjectByName("Can_Wall");
    const wb = wall ? new THREE.Box3().setFromObject(wall).applyMatrix4(roomInv) : box;
    this._radius = Math.max(-wb.min.x, wb.max.x, -wb.min.z, wb.max.z, 0.5);
    this._reveal.uFloor.value = box.min.y;
    this._maxH = box.max.y - box.min.y + 0.15;
    if (this._swirl && this._swirl.geometry) {
      const g = this._swirl.geometry;
      g.computeBoundingBox();
      const s = g.boundingBox.getSize(this._t.v);
      const dims = [s.x, s.y, s.z];
      this._swirlAxis.set(0, 0, 0).setComponent(dims.indexOf(Math.min(...dims)), 1);
    }
    const stepNodes = [0, 1, 2, 3].map((i) => room.getObjectByName("Step_" + i)).filter(Boolean);
    for (const n of [this._portal, this._pad, ...stepNodes])
      n?.traverse((o) => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      });
    if (this.opts.pbr !== false) this._upgradeMaterials(room);
    this._makeWireMaterial();
    this._makeHoloMaterial();
    const inSub = (o, n) => {
      for (let p = o; p; p = p.parent) if (p === n) return true;
      return false;
    };
    room.traverse((o) => {
      if (o.name?.startsWith("Fizz_"))
        this._fizz.push({
          o,
          y: o.position.y,
          phase: Math.random() * 6.28,
          amp: 0.05 + Math.random() * 0.07
        });
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.transmission > 0) {
          m.transmission = 0;
          m.transparent = true;
          m.opacity = Math.min(m.opacity, 0.28);
          m.depthWrite = false;
        }
        if (/^(Neon_|Lamp_Blob)/.test(m.name))
          m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 1, 2.2);
        if (m.name === "Bulb_Warm") m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 1, 3);
        if (m.name === "Portal_Swirl") m.emissiveIntensity = 1.3;
        if (m.name === "Sign_EVADE") m.emissiveIntensity = 1.2;
        if (m.name === "Porthole_Sky") m.emissiveIntensity = 0.9;
        if (m.name === "Hologram_Ghost")
          m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 1, 1.2);
        if (m.name === "Glass" || m.name === "Acrylic_Clear") {
          m.opacity = 0.1;
          m.roughness = 0.05;
        }
      }
      if (o.name === "hub_alert_light") {
        o.material = o.material.clone();
        this._alertMat = o.material;
        this._owned.push(o.material);
      }
      if (inSub(o, this._bobo)) {
        o.frustumCulled = false;
        if (this._ownBobo) this._pickables.push(o);
        return;
      }
      this._pickables.push(o);
      if (inSub(o, this._portal) || inSub(o, this._pad) || stepNodes.some((n) => inSub(o, n)))
        return;
      for (const m of mats) this._patch(m);
      if (!o.isSkinnedMesh && o.geometry.attributes.position.count < 6e4 && !/_Holo|Holo_/.test(o.parent?.name || "")) {
        const eg = new THREE.EdgesGeometry(o.geometry, 30);
        this._geos.push(eg);
        const line = new THREE.LineSegments(eg, this._wireMat);
        line.raycast = () => void 0;
        line.renderOrder = 2;
        o.add(line);
        this._wires.push(line);
      }
    });
    this._setupSlots();
    this._setupScreen(local);
    this._setupBeam();
    this._setupBurst();
    if (this.opts.lights) {
      const add = (l, p) => {
        l.position.copy(p);
        l.userData.mlhBase = { intensity: l.intensity, distance: l.distance ?? 0 };
        room.add(l);
        this._lights.push(l);
      };
      add(new THREE.HemisphereLight(16774116, 3812424, 0.85), new THREE.Vector3(0, 3, 0));
      add(new THREE.PointLight(16766896, 2.4, 6, 1.6), new THREE.Vector3(0, 1.4, 0.2));
      add(new THREE.PointLight(10480127, 1.6, 5, 1.6), new THREE.Vector3(-0.6, 3, -0.6));
      add(
        new THREE.PointLight(16736174, 1.4, 2.5, 1.6),
        this._lampPos.clone().add(new THREE.Vector3(0, 0.2, 0))
      );
    }
    this._mixer = new THREE.AnimationMixer(room);
    for (const clip of gltf.animations) this._actions[clip.name] = this._mixer.clipAction(clip);
    if (this._bobo) {
      this._boboHome.pos.copy(this._bobo.position);
      this._boboHome.quat.copy(this._bobo.quaternion);
    }
    this._buildWalk(local);
    if (!this._portalOn) {
      for (const n of [this._portal, this._pad, ...stepNodes]) if (n) n.visible = false;
      this._swirl = void 0;
    }
    if (!this._ownBobo && this._bobo) this._bobo.visible = false;
    this._applyOwnership();
    this._setShadows(false);
    this._buildSpots();
    this._renderHud();
  }
  /**
   * Make the room read more like real materials: shiny brushed aluminium,
   * a clear-coated printed can, real-feeling wood grain, plaster and fabric.
   */
  _upgradeMaterials(room) {
    const env = studioEnv();
    this._texs.push(env);
    const maps = {};
    const detail = (kind, rough, size = 256) => {
      const key = kind + rough.join();
      if (!maps[key]) {
        maps[key] = detailMaps(size, heightField(size, HEIGHTS[kind]), rough);
        this._texs.push(maps[key].normal, maps[key].rough);
      }
      return maps[key];
    };
    const swap = /* @__PURE__ */ new Map();
    const metal = (m, rough, tint) => {
      m.metalness = 1;
      m.roughness = rough;
      if (tint !== void 0) m.color.setHex(tint);
      const d = detail("brushed", [0.55, 1], 256);
      m.roughnessMap = d.rough;
      m.normalMap = d.normal;
      m.normalScale = new THREE.Vector2(0.12, 0.12);
      m.envMap = env;
      m.envMapIntensity = 1.15;
    };
    const surface = (m, kind, rough, n, rep = 4) => {
      const d = detail(kind, [0.7, 1]);
      const nm = d.normal.clone();
      const rm = d.rough.clone();
      nm.repeat.set(rep, rep);
      rm.repeat.set(rep, rep);
      nm.needsUpdate = rm.needsUpdate = true;
      this._texs.push(nm, rm);
      m.normalMap = nm;
      m.normalScale = new THREE.Vector2(n, n);
      m.roughnessMap = rm;
      m.roughness = rough;
      m.envMap = env;
      m.envMapIntensity = 0.5;
    };
    room.traverse((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const next = list.map((m) => {
        if (!m?.isMeshStandardMaterial) return m;
        if (swap.has(m)) return swap.get(m);
        let out = m;
        switch (m.name) {
          case "Can_Aluminium":
          case "Diorama_Rim":
            metal(m, 0.2, 14672874);
            break;
          case "Metal_Silver":
          case "Metal_Nickel":
            metal(m, 0.16);
            break;
          case "Metal_Nickel_Brushed":
            metal(m, 0.3);
            break;
          case "Gold":
          case "Trophy_Gold":
            metal(m, 0.18);
            break;
          case "Can_Label": {
            const p = new THREE.MeshPhysicalMaterial();
            THREE.MeshStandardMaterial.prototype.copy.call(p, m);
            p.metalness = 0.42;
            p.roughness = 0.24;
            p.clearcoat = 1;
            p.clearcoatRoughness = 0.05;
            p.envMap = env;
            p.envMapIntensity = 1.7;
            out = p;
            this._owned.push(p);
            break;
          }
          case "Wood_Floor":
          case "Wood_Dark": {
            const img = m.map?.image;
            if (img && img.width) {
              const d = normalFromImage(img);
              this._texs.push(d.normal, d.rough);
              d.normal.repeat.copy(m.map.repeat);
              d.rough.repeat.copy(m.map.repeat);
              d.normal.offset.copy(m.map.offset);
              d.rough.offset.copy(m.map.offset);
              m.normalMap = d.normal;
              m.normalScale = new THREE.Vector2(0.55, 0.55);
              m.roughnessMap = d.rough;
              m.roughness = 1;
            } else surface(m, "plaster", 0.55, 0.2);
            m.envMap = env;
            m.envMapIntensity = 0.6;
            break;
          }
          case "Wall_Inside_Navy":
          case "Wall_Wainscot":
            surface(m, "plaster", 0.82, 0.35, 6);
            break;
          case "Rug_White":
          case "Rug_Navy":
          case "Rug_Cyan":
          case "CatBed_Cream":
          case "CatBed_Blue":
          case "Beanbag_Purple":
          case "Felt_Case":
          case "Chair_Blue":
          case "Chair_Dark":
            surface(m, "fabric", 0.95, 0.45, 5);
            break;
          case "Desk_Black":
          case "Plastic_Dark":
            surface(m, "peel", 0.32, 0.08, 3);
            m.envMapIntensity = 0.8;
            break;
          case "Pot_Cream":
          case "Eclipse_Red":
          case "Eclipse_White":
          case "Eclipse_Blue":
          case "Bridge_Orange":
            m.roughness = Math.min(m.roughness, 0.3);
            m.envMap = env;
            m.envMapIntensity = 0.8;
            break;
          case "Leaf_Green":
            m.roughness = 0.45;
            m.envMap = env;
            m.envMapIntensity = 0.5;
            break;
          case "Glass":
          case "Acrylic_Clear":
          case "Rail_Glass":
          case "Lamp_Glass":
            m.envMap = env;
            m.envMapIntensity = 1.4;
            break;
          default:
            if (!m.envMap) {
              m.envMap = env;
              m.envMapIntensity = 0.45;
            }
        }
        m.needsUpdate = true;
        swap.set(m, out);
        return out;
      });
      o.material = Array.isArray(o.material) ? next : next[0];
    });
  }
  /**
   * The room casts shadows only once it is solid (the reveal's cut-away would
   * cast too). Receiving is always on, so every shader is compiled with shadows
   * up front and nothing stalls the moment the room finishes building.
   */
  _setShadows(on) {
    if (!this.opts.shadows || !this._room) return;
    this._room.traverse((o) => {
      if (!o.isMesh) return;
      const glass = o.material?.transparent;
      o.castShadow = on && !glass;
      o.receiveShadow = true;
    });
    if (this._bobo)
      this._bobo.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
  }
  _patch(material) {
    if (material.userData.mlhReveal) return;
    material.userData.mlhReveal = true;
    this._patched.push(material);
    const u = this._reveal;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, r) => {
      prev?.call(material, shader, r);
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform mat4 uRoomInv;\nvarying vec3 vRevealPos;"
      ).replace("#include <project_vertex>", "#include <project_vertex>\n" + REVEAL_VERT);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + REVEAL_COMMON).replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\n  float rd = solidDist(vRevealPos);\n  if (rd > uSolid) discard;"
      ).replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\n  float edge = 1.0 - smoothstep(0.0, 0.12, uSolid - rd);\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uGlow * 2.6, edge * 0.9);"
      );
    };
    material.customProgramCacheKey = () => "mlh-reveal";
    material.needsUpdate = true;
  }
  _makeWireMaterial() {
    const u = this._reveal;
    const m = this._wireMat = new THREE.LineBasicMaterial({
      color: 3597311,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this._owned.push(m);
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform mat4 uRoomInv;\nvarying vec3 vRevealPos;"
      ).replace("#include <project_vertex>", "#include <project_vertex>\n" + REVEAL_VERT);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + REVEAL_COMMON).replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
  float rd = revealDist(vRevealPos);
  float lit = step(rd, uWire);
  float front = 1.0 - smoothstep(0.0, 0.5, uWire - rd);
  float fade = 1.0 - smoothstep(0.0, 0.35, uSolid - solidDist(vRevealPos));
  float a = max(lit * (0.4 + 0.5 * front) * fade, uGhost * (1.0 - lit));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uGlow * (0.9 + 2.0 * front * lit), a);`
      );
    };
    m.customProgramCacheKey = () => "mlh-wire";
  }
  _makeHoloMaterial() {
    this._holoMat = new THREE.ShaderMaterial({
      uniforms: this._holoUniforms,
      vertexShader: HOLO_VERT,
      fragmentShader: HOLO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this._owned.push(this._holoMat);
  }
  /** Collection wall: unowned products are holograms, owned ones are solid. */
  _setupSlots() {
    const room = this._room;
    const ids = ["keychain", "hoodie", "tee", "deskmat", "mystery"];
    for (const id of ids) {
      const holo = id === "keychain" ? room.getObjectByName("hub_keychain_Asset") : room.getObjectByName(`hub_slot_${id}_Holo`);
      if (!holo) continue;
      const meshes = [];
      holo.traverse((o) => o.isMesh && meshes.push(o));
      this._slots.push({
        id,
        holo: id === "keychain" ? void 0 : holo,
        meshes,
        orig: meshes.map((m) => m.material),
        y: holo.position.y,
        phase: Math.random() * 6
      });
    }
  }
  _applyOwnership() {
    if (!this._room) return;
    const owned = new Set((this._me?.items || []).map((i) => i.product));
    for (const s of this._slots) {
      const has = owned.has(s.id);
      s.meshes.forEach((m, i) => {
        if (has) {
          m.material = s.id === "keychain" ? s.orig[i] : this._solidFor(s.id, s.orig[i]);
        } else m.material = this._holoMat;
        m.renderOrder = has ? 0 : 3;
      });
    }
  }
  _solidFor(id, orig) {
    const name = (Array.isArray(orig) ? orig[0] : orig)?.name || "";
    const key = id + name;
    if (!this._solidCache[key]) {
      const pink = /pink|logo/i.test(name);
      const m = new THREE.MeshStandardMaterial({
        color: pink ? 16732067 : 2768010,
        roughness: 0.6,
        emissive: pink ? 16732067 : 3597311,
        emissiveIntensity: pink ? 0.6 : 0.12
      });
      this._owned.push(m);
      this._patch(m);
      this._solidCache[key] = m;
    }
    return this._solidCache[key];
  }
  _buildWalk(local) {
    if (!this._bobo || !this._portal || !this._room) return;
    const space = this._bobo.parent || this._room;
    const toSpace = (roomP) => this._room.localToWorld(roomP.clone()).applyMatrix4(
      this._t.m.copy(space.matrixWorld).invert()
    );
    const portal = local(this._portal);
    const pts = [portal.clone()];
    const steps = [0, 1, 2, 3].map((i) => this._room.getObjectByName("Step_" + i)).filter(Boolean);
    this._steps.push(...steps);
    if (steps.length) {
      const first = local(steps[0]);
      pts.push(portal.clone().lerp(first, 0.55).setY(portal.y));
      for (const s of steps) pts.push(local(s).add(new THREE.Vector3(0, 0.03, 0)));
    }
    const home = this._boboHome.pos.clone();
    const last = pts[pts.length - 1];
    const entry = last.clone().lerp(home, 0.18).setY(0);
    pts.push(entry, home.clone().lerp(entry, 0.35).setY(0.02), home.clone());
    this._walk = new THREE.CatmullRomCurve3(
      pts.map((p, i) => i === pts.length - 1 ? p : toSpace(p)),
      false,
      "centripetal"
    );
  }
  /* ── sequences ────────────────────────────────────────────────────── */
  _setState(s) {
    if (this._state === s) return;
    this._state = s;
    this._emit("state", s);
  }
  _play(name, fade = 0.3, once = false) {
    const next = this._actions[name];
    if (!next || next === this._current) return next;
    next.reset();
    if (once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else next.setLoop(THREE.LoopRepeat, Infinity);
    next.enabled = true;
    next.fadeIn(fade).play();
    this._current?.fadeOut(fade);
    this._current = next;
    return next;
  }
  _updatePortal(dt) {
    this._portalT += dt;
    const p = clamp01(this._portalT / 0.7);
    this._portalScale(p < 1 ? backOut(p) : 1);
  }
  /** The portal only exists until Bobo is home: it opens, he steps through, it closes. */
  _portalScale(s, steps = s) {
    if (!this._portalOn) s = steps = 0;
    const on = s > 2e-3;
    this._steps.forEach((st, i) => {
      const k = clamp01(steps * this._steps.length - (this._steps.length - 1 - i));
      st.visible = k > 2e-3;
      st.scale.setScalar(Math.max(1e-3, k));
    });
    for (const n of [this._portal, this._pad]) {
      if (!n) continue;
      n.visible = on;
      n.scale.setScalar(Math.max(1e-3, s));
    }
  }
  _updateBuild(dt) {
    this._seqT += dt * this._buildSpeed;
    const t = this._seqT;
    const WIRE0 = 0.4, WIRE_T = 2, SOLID0 = 2.7, SOLID_T = 3.2;
    const u = this._reveal;
    u.uWire.value = ease(clamp01((t - WIRE0) / WIRE_T)) * this._maxDist;
    u.uSolid.value = smooth01(clamp01((t - SOLID0) / SOLID_T)) * this._maxH;
    u.uGhost.value = this._ghostFrom * (1 - clamp01((t - WIRE0) / 0.6));
    if (!this._ownBobo) {
      if (t >= SOLID0 + SOLID_T + 0.25) this._finishBuild();
      return;
    }
    const bobo = this._bobo;
    const POP = this._walkIn ? 0.5 : 0.1;
    const WALK0 = POP + 0.4;
    const WALK = 6.6;
    if (bobo && this._walk && t >= POP) {
      if (!bobo.visible) {
        bobo.visible = true;
        this._play("Walk", 0.15);
      }
      const p = clamp01((t - POP) / 0.35);
      bobo.scale.setScalar(p < 1 ? 0.2 + 0.8 * backOut(p) : 1);
      const w = clamp01((t - WALK0) / WALK);
      this._walk.getPointAt(w, bobo.position);
      if (w < 0.97) this._faceAlong(w, dt, false);
      else {
        bobo.quaternion.slerp(this._boboHome.quat, 1 - Math.pow(2e-3, dt));
        if (this._current !== this._actions.Sit) this._play("Sit", 0.5);
      }
    }
    const shut = clamp01((t - (WALK0 + WALK * 0.3)) / 0.8);
    const stepsGone = clamp01((t - (WALK0 + WALK * 0.62)) / 1);
    this._portalScale(shut <= 0 ? 1 : 1 - ease(shut), 1 - ease(stepsGone));
    if (shut > 0 && !this._portalShut) {
      this._portalShut = true;
      this._sfx("whoosh");
    }
    if (t >= 8.6) this._finishBuild();
  }
  _faceAlong(w, dt, reverse) {
    const bobo = this._bobo;
    this._walk.getTangentAt(w, this._t.v);
    if (reverse) this._t.v.negate();
    this._t.v.y = 0;
    if (this._t.v.lengthSq() < 1e-6) return;
    this._t.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(this._t.v.x, this._t.v.z));
    bobo.quaternion.slerp(this._t.q, 1 - Math.pow(1e-3, dt));
  }
  _finishBuild() {
    const u = this._reveal;
    u.uSolid.value = 1e3;
    u.uWire.value = 1e3;
    u.uGhost.value = 0;
    for (const w of this._wires) w.visible = false;
    this._portalScale(0);
    this._portalShut = true;
    this._setShadows(true);
    const bobo = this._ownBobo ? this._bobo : void 0;
    if (bobo) {
      bobo.visible = true;
      bobo.scale.setScalar(1);
      bobo.position.copy(this._boboHome.pos);
      bobo.quaternion.copy(this._boboHome.quat);
    }
    if (bobo) this._play("Sit", 0.4);
    this._el.skip.hidden = true;
    this._setState("live");
    this._hud(true);
    this._renderHud();
    const greet = () => {
      if (this._greeted) return;
      this._greeted = true;
      const fresh = this._alerts.find((a) => !this._read.has(a.id));
      if (fresh) setTimeout(() => this._state === "live" && this._beamAlertOut(fresh), 1400);
    };
    if (this.opts.tour !== false && store.get(this._k("toured")) !== "1") {
      this._afterTour = greet;
      setTimeout(() => this._state === "live" && this._tourI < 0 && this.startTour(), 900);
    } else {
      this._showHint();
      greet();
    }
  }
  _updateLeave(dt) {
    this._seqT += dt * this._leaveSpeed;
    const t = this._seqT;
    const DUR = 3.2;
    const u = this._reveal;
    u.uSolid.value = (1 - ease(clamp01(t / (DUR - 0.5)))) * this._maxH;
    u.uWire.value = (1 - ease(clamp01((t - 0.5) / (DUR - 0.5)))) * this._maxDist;
    for (const w of this._wires) w.visible = true;
    u.uGhost.value = 0;
    const open = clamp01(t / 0.7);
    this._portalScale(open < 1 ? backOut(open) : 1);
    const bobo = this._ownBobo ? this._bobo : void 0;
    if (bobo && this._walk && bobo.visible) {
      if (this._current !== this._actions.Walk) this._play("Walk", 0.2);
      const w = 1 - clamp01(t / (DUR - 0.2));
      this._walk.getPointAt(w, bobo.position);
      this._faceAlong(Math.min(0.999, w), dt, true);
      const shrink = clamp01((t - (DUR - 0.5)) / 0.4);
      bobo.scale.setScalar(Math.max(1e-3, 1 - shrink));
    }
    if (t >= DUR + 0.2) this._finishLeave();
  }
  _finishLeave() {
    if (this._bobo) this._bobo.visible = false;
    this._reveal.uSolid.value = -1;
    this._reveal.uWire.value = -1;
    if (this._portalOn) {
      this._setState("portal");
      this._portalT = 1;
      this._portalScale(1);
    } else this.hide();
    const r = this._leaveResolve;
    this._leaveResolve = void 0;
    r?.();
  }
  /* ── access ───────────────────────────────────────────────────────── */
  _k(name) {
    return `ml.collector.${this.roomId}.${name}`;
  }
  _loadSession() {
    try {
      const s = JSON.parse(store.get(this._k("session")) || "null");
      return s && typeof s.token === "string" ? s : null;
    } catch {
      return null;
    }
  }
  _knownCodes() {
    return this._loadSession()?.codes ?? [];
  }
  _saveSession(token, me, email, code) {
    const prev = this._loadSession();
    const codes = [.../* @__PURE__ */ new Set([...prev?.codes ?? [], ...code ? [code] : []])].slice(-20);
    store.set(
      this._k("session"),
      JSON.stringify({ token, me, email: email ?? prev?.email, codes })
    );
  }
  _url(path) {
    return (this.opts.api || "").replace(/\/+$/, "") + path;
  }
  /** Check the saved key against the site. Offline counts as fine. */
  async _refreshMe() {
    if (!this._token) return false;
    try {
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = setTimeout(() => ctl?.abort(), 7e3);
      const r = await fetch(
        this._url(`/api/collector/me?room=${encodeURIComponent(this.roomId)}`),
        {
          headers: { authorization: `Bearer ${this._token}` },
          signal: ctl?.signal
        }
      );
      clearTimeout(timer);
      if (r.status === 401) {
        this._token = null;
        this._me = null;
        store.set(this._k("session"), null);
        this._applyOwnership();
        return false;
      }
      if (!r.ok) return !!this._me;
      const j = await r.json();
      this._me = j.me;
      this._saveSession(this._token, j.me);
      this._applyOwnership();
      this._renderHud();
      return true;
    } catch {
      return !!this._me;
    }
  }
  /* ── UI scaffolding ───────────────────────────────────────────────── */
  _buildUI() {
    if (!document.getElementById("mlh-css")) {
      this._style = document.createElement("style");
      this._style.id = "mlh-css";
      this._style.textContent = CSS;
      document.head.appendChild(this._style);
    }
    const ui = this._ui = document.createElement("div");
    ui.className = "mlh";
    ui.style.setProperty("pointer-events", "none", "important");
    if (this.opts.host === document.body) ui.style.position = "fixed";
    if (this.opts.hudOffset) ui.style.setProperty("--mlh-top", `${this.opts.hudOffset}px`);
    if (this.opts.modeBottom != null)
      ui.style.setProperty("--mlh-mode-bottom", `${this.opts.modeBottom}px`);
    ui.innerHTML = `${DEFS}
<div class="mlh-hud" data-r="hud">
  <button type="button" class="mlh-title" data-r="title" aria-label="Your collection">
    <svg class="mlh-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="4"/><circle data-r="ring" cx="18" cy="18" r="15" fill="none" stroke="url(#mlhg)" stroke-width="4" stroke-linecap="round" stroke-dasharray="94.2" stroke-dashoffset="94.2" transform="rotate(-90 18 18)"/><defs><linearGradient id="mlhg"><stop offset="0" stop-color="#36e3ff"/><stop offset="1" stop-color="#ff4fa3"/></linearGradient></defs></svg>
    <span><b>Bobo's Hideout</b><small data-r="sub">EVADE \xB7 Collector Hub</small></span>
  </button>
  <div class="mlh-actions">
    <button type="button" class="mlh-icon" data-r="items" aria-label="Room items" title="Room items">${ICON.list}</button>
    <button type="button" class="mlh-icon" data-r="pc" aria-label="Open Bobo's computer" title="Bobo's computer">${ICON.colarun}</button>
    <button type="button" class="mlh-icon" data-r="exit" aria-label="Exit the hideout" title="Exit">${ICON.exit}</button>
  </div>
</div>
<div class="mlh-prompt" data-r="prompt"><p></p><button type="button" class="mlh-btn pri" hidden></button></div>
<button type="button" class="mlh-btn mlh-skip" data-r="skip" hidden>Skip</button>
<button type="button" class="mlh-mode" data-r="mode" hidden><i>${ICON.home}</i><span><span data-r="modeLabel">Bobo's Hideout</span><small data-r="modeSub">Your room</small></span></button>
<div class="mlh-toast" data-r="toast" role="status" aria-live="polite"></div>
<div class="mlh-spots" data-r="spots"></div>
<div class="mlh-tour" data-r="tour" role="dialog" aria-modal="false" aria-labelledby="mlh-tour-h" hidden>
  <div class="mlh-kicker" data-r="tourKick"></div>
  <h3 id="mlh-tour-h" data-r="tourTitle"></h3>
  <p data-r="tourBody"></p>
  <div class="mlh-tour-row">
    <button type="button" class="mlh-tour-skip" data-r="tourSkip">Skip tour</button>
    <span class="mlh-tour-dots" data-r="tourDots" aria-hidden="true"></span>
    <button type="button" class="mlh-btn" data-r="tourBack">Back</button>
    <button type="button" class="mlh-btn pri" data-r="tourNext">Next</button>
  </div>
</div>

<div class="mlh-layer" data-r="gate" role="dialog" aria-modal="true" aria-labelledby="mlh-gate-h">
  <div class="mlh-card" data-r="gateCard"></div>
</div>

<div class="mlh-layer mlh-sheet" data-r="sheet" role="dialog" aria-modal="false" aria-labelledby="mlh-sheet-h">
  <div class="mlh-card">
    <button type="button" class="mlh-x" data-close aria-label="Close">${ICON.close}</button>
    <span class="mlh-pill" data-r="sheetPill"></span>
    <h2 id="mlh-sheet-h" data-r="sheetTitle"></h2>
    <p class="mlh-sub" data-r="sheetSub"></p>
    <p data-r="sheetBody"></p>
    <div class="mlh-row" data-r="sheetRow"></div>
  </div>
</div>

<div class="mlh-layer" data-r="col" role="dialog" aria-modal="true" aria-labelledby="mlh-col-h">
  <div class="mlh-card mlh-col mlh-vaultcard">
    <button type="button" class="mlh-x" data-close aria-label="Close">${ICON.close}</button>
    <div data-r="colBody"></div>
  </div>
</div>

<!-- over the room's dots and the tour; under the computer -->
<div class="mlh-hdock" data-r="hdock" hidden>
  <div class="mlh-fan" data-r="fan" role="menu" aria-label="Bobo's moves"></div>
  <button type="button" class="mlh-act" data-r="act" aria-haspopup="menu" aria-expanded="false" aria-label="Bobo's moves" title="Bobo's moves"><span class="p">${ICON.paw}</span><span class="x">${ICON.close}</span></button>
  <button type="button" class="mlh-homeb" data-r="homeb" aria-haspopup="dialog" aria-label="Open BOBO OS" title="BOBO OS">${OS_MARK}<span class="mlh-badge" data-r="homeBadge" hidden></span></button>
</div>
<div class="mlh-layer mlh-home" data-r="home" role="dialog" aria-modal="true" aria-label="BOBO OS">
  <div class="mlh-hs" data-r="hs"></div>
</div>
<div class="mlh-layer mlh-os" data-r="os" role="dialog" aria-modal="true" aria-label="Bobo's computer">
  <div class="mlh-screen" data-r="screen">
    <div class="mlh-wallp" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="a3"></i><div class="floor"></div><div class="mlh-wall">\u03A3VAD\u03A3</div></div>
    <div class="mlh-menubar">
      <span class="logo"><span class="lg-mark">${OS_MARK}</span>BOBO<b>OS</b></span><span class="app" data-r="appName">Desktop</span>
      <span class="sp"></span>
      <span class="chip live"><i></i>Online</span>
      <span class="tray">${ICON.wifi}<span data-r="clock"></span></span>
      <button type="button" class="tb" data-r="bell" aria-label="Alerts">${ICON.alerts}<span class="mlh-badge" data-r="bellBadge" hidden></span></button>
      <button type="button" class="tb" data-r="power" aria-label="Turn off the computer" title="Back to the room">${ICON.power}</button>
    </div>
    <div class="mlh-desk" data-r="desk">
      <div class="mlh-icons" data-r="icons"></div>
      <aside class="mlh-widgets" data-r="widgets" aria-label="Widgets"></aside>
      <div class="mlh-dock" data-r="dock" role="toolbar" aria-label="Apps"></div>
    </div>
    <button type="button" class="mlh-notif" data-r="notif" aria-live="polite"></button>
    <div class="mlh-boot off" data-r="boot" aria-hidden="true"><div class="in"><div class="mk">${OS_MARK}</div><div class="lg">BOBO<b>OS</b></div><div class="ver">v2 \xB7 EVADE EDITION</div><div class="bb"><i></i></div></div></div>
  </div>
</div>`;
    for (const el of ui.querySelectorAll("[data-r]")) this._el[el.dataset.r] = el;
    this.opts.host.appendChild(ui);
    const icons = this._el.icons;
    const dock = this._el.dock;
    for (const a of APPS) {
      const tile = tileFor(a, a.id === "alerts");
      const d = document.createElement("button");
      d.type = "button";
      d.className = "mlh-dicon";
      d.innerHTML = `${tile}<span>${esc(a.name)}</span>`;
      d.addEventListener("click", () => this._openApp(a.id));
      icons.appendChild(d);
      const k = document.createElement("button");
      k.type = "button";
      k.dataset.app = a.id;
      k.setAttribute("aria-label", a.name);
      k.title = a.name;
      k.innerHTML = tile;
      k.addEventListener("click", () => this._openApp(a.id));
      dock.appendChild(k);
    }
    const on = (el, ev, fn) => {
      el.addEventListener(ev, fn);
      this._off.push(() => el.removeEventListener(ev, fn));
    };
    on(this._el.title, "click", () => this.openCollection());
    on(this._el.items, "click", () => this._openItems());
    on(this._el.pc, "click", () => this.openOS());
    on(this._el.exit, "click", () => this._emit("exit", void 0));
    on(this._el.skip, "click", () => this.skip());
    on(this._el.tourNext, "click", () => this._tourGo(this._tourI + 1));
    on(this._el.tourBack, "click", () => this._tourGo(this._tourI - 1));
    on(this._el.tourSkip, "click", () => this._tourEnd(true));
    on(this._el.bell, "click", () => this._openApp("alerts"));
    on(this._el.homeb, "click", () => this.homeOpen ? this.closeHome() : this.openHome());
    on(this._el.act, "click", () => this._fanToggle());
    on(this._el.home, "click", (e) => e.target === this._el.home && this.closeHome());
    const away = (e) => {
      if (!this._fanOpen) return;
      const t = e.target;
      if (t && (this._el.fan.contains(t) || this._el.act.contains(t))) return;
      this._fanToggle(false);
    };
    document.addEventListener("pointerdown", away, true);
    this._off.push(() => document.removeEventListener("pointerdown", away, true));
    on(this._el.power, "click", () => this.closeOS());
    on(this._el.os, "click", (e) => e.target === this._el.os && this.closeOS());
    on(
      this._el.col,
      "click",
      (e) => e.target === this._el.col && this._closeLayer(this._el.col)
    );
    on(
      this._el.sheet,
      "click",
      (e) => e.target === this._el.sheet && this._closeLayer(this._el.sheet)
    );
    on(this._el.notif, "click", () => {
      this._el.notif.classList.remove("on");
      this._openApp("alerts", this._el.notif.dataset.id);
    });
    for (const x of ui.querySelectorAll("[data-close]"))
      on(x, "click", () => this._closeLayer(x.closest(".mlh-layer")));
    on(window, "keydown", (e) => {
      if (this._tourI >= 0) {
        if (e.key === "Escape") this._tourEnd(true);
        else if (e.key === "ArrowRight") this._tourGo(this._tourI + 1);
        else if (e.key === "ArrowLeft") this._tourGo(this._tourI - 1);
        return;
      }
      if (e.key !== "Escape") return;
      if (this._fanOpen) return this._fanToggle(false, true);
      if (this.homeOpen && !this._el.os.classList.contains("open")) return this.closeHome();
      if (this._el.os.classList.contains("open")) {
        if (this._focused) this._closeApp(this._focused);
        else this.closeOS();
      } else if (this._el.gate.classList.contains("open")) this._cancelGate();
      else {
        this._closeLayer(this._el.col);
        this._closeLayer(this._el.sheet);
      }
    });
    const clock = () => {
      const s = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      this._el.clock.textContent = s;
      if (s !== this._screenClock) {
        this._screenClock = s;
        this._screenDirty = true;
        this._renderWidgets();
      }
    };
    clock();
    const ct = setInterval(clock, 15e3);
    this._off.push(() => clearInterval(ct));
    this._el.exit.hidden = !this.opts.exitLabel;
    if (this.opts.exitLabel) this._el.exit.setAttribute("aria-label", this.opts.exitLabel);
  }
  _emit(name, payload) {
    try {
      this.opts.on?.(name, payload);
    } catch (e) {
      console.error("[hub]", e);
    }
  }
  /**
   * While a hub dialog is open, a host's floating buttons (the record
   * button) step out of the way instead of sitting on its close button.
   */
  _syncModal() {
    const open = ["gate", "sheet", "col", "os", "home"].some(
      (k) => this._el[k]?.classList.contains("open")
    );
    document.documentElement.classList.toggle("mlh-modal", open);
  }
  _open(layer) {
    this._lastFocus = document.activeElement;
    layer.classList.add("open");
    this._syncModal();
    const f = layer.querySelector("input,button.mlh-btn.pri,button");
    setTimeout(() => f?.focus({ preventScroll: true }), 50);
  }
  _closeLayer(layer) {
    if (!layer.classList.contains("open")) return;
    if (layer === this._el.gate) return this._cancelGate();
    layer.classList.remove("open");
    this._syncModal();
    this._lastFocus?.focus?.({ preventScroll: true });
  }
  _closeAllLayers() {
    this.closeOS();
    this._closeLayer(this._el.sheet);
    this._closeLayer(this._el.col);
  }
  _hud(on) {
    this._el.hud.classList.toggle("on", on);
    this._el.hud.setAttribute("aria-hidden", String(!on));
    for (const b of this._el.hud.querySelectorAll("button"))
      b.tabIndex = on ? 0 : -1;
  }
  _renderHud() {
    const me = this._me;
    const total = me?.collection?.products.length ?? me?.total ?? 5;
    const owned = me?.owned ?? 0;
    this._el.sub.textContent = me ? `${owned} of ${total} collected` : "EVADE \xB7 Collector Hub";
    this._el.ring.setAttribute(
      "stroke-dashoffset",
      String(94.2 * (1 - owned / Math.max(1, total)))
    );
  }
  _showHint() {
    clearTimeout(this._hintTimer);
    this.prompt(
      this._spots.length ? "Tap a glowing dot, or anything in the room." : "Tap anything in the room. Tap the computer for BOBO OS."
    );
    this._hintTimer = setTimeout(() => this._state === "live" && this.prompt(null), 5500);
  }
  /* ── hotspots ─────────────────────────────────────────────────────── */
  _buildSpots() {
    if (this.opts.hotspots === false || !this._room) return;
    const box = new THREE.Box3();
    for (const def of SPOTS) {
      const node = this._room.getObjectByName(def.id);
      if (!node) continue;
      node.updateWorldMatrix(true, true);
      box.setFromObject(node);
      if (box.isEmpty()) continue;
      const c = box.getCenter(new THREE.Vector3());
      c.y += (box.max.y - c.y) * (def.lift ?? 0.35);
      const local = node.worldToLocal(c);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mlh-spot gone";
      el.style.setProperty("--c", def.color);
      el.setAttribute("aria-label", def.label);
      el.innerHTML = `${def.icon}<span>${esc(def.label)}</span>`;
      el.addEventListener("click", () => this._onTap(def.id));
      this._el.spots.appendChild(el);
      this._spots.push({ def, node, local, el, hidden: true });
    }
  }
  _layerOpen() {
    const e = this._el;
    return e.os.classList.contains("open") || e.col.classList.contains("open") || e.sheet.classList.contains("open") || e.gate.classList.contains("open");
  }
  _updateSpots() {
    const cam = this.opts.getCamera();
    const show = this._state === "live" && !!cam && !this._layerOpen();
    this._el.spots.classList.toggle("off", !show);
    if (!show || !cam) return;
    const r = this.opts.canvas.getBoundingClientRect();
    const host = this._el.spots.getBoundingClientRect();
    const check = this._spotFrame++ % this._spots.length;
    const camPos = cam.getWorldPosition(this._t.v2);
    const placed = [];
    this._spots.forEach((s, i) => {
      const w = s.node.localToWorld(this._t.v.copy(s.local));
      if (i === check || i === (check + 3) % this._spots.length) {
        const dir = w.clone().sub(camPos);
        const dist = dir.length();
        this._ray.set(camPos, dir.normalize());
        this._ray.far = dist - 0.05;
        let blocked = false;
        for (const hit of this._ray.intersectObjects(this._pickables, false)) {
          const o = hit.object;
          if (!o.visible || o.material?.transparent && o.material.opacity < 0.5) continue;
          if (this._isUnder(o, s.node)) break;
          if (hit.distance < dist - 0.25) blocked = true;
          break;
        }
        this._ray.far = Infinity;
        s.hidden = blocked;
      }
      const p = w.project(cam);
      let off = p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05 || s.hidden;
      const x = r.left - host.left + (p.x + 1) / 2 * r.width;
      const y = r.top - host.top + (1 - p.y) / 2 * r.height;
      if (!off && placed.some((q) => Math.hypot(q.x - x, q.y - y) < 40)) off = true;
      s.el.classList.toggle("gone", off);
      if (off) return;
      placed.push({ x, y });
      s.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    });
  }
  /* ── welcome tour ─────────────────────────────────────────────────── */
  /** Walk a first-timer round the room: a card per stop, the camera follows. */
  startTour() {
    if (this._state !== "live") return;
    this._closeAllLayers();
    this.prompt(null);
    clearTimeout(this._hintTimer);
    this._tourI = 0;
    this._el.tour.hidden = false;
    requestAnimationFrame(() => this._el.tour.classList.add("on"));
    this._el.spots.classList.add("touring");
    this._emit("tour", "start");
    this._tourGo(0);
  }
  _tourStops() {
    const stops = [TOUR_INTRO];
    for (const s of this._spots) if (s.def.tour) stops.push({ ...s.def.tour, spot: s });
    stops.push(TOUR_OUTRO);
    return stops;
  }
  _tourGo(i) {
    if (this._tourI < 0) return;
    const stops = this._tourStops();
    if (i >= stops.length) return this._tourEnd(true);
    i = Math.max(0, i);
    this._tourI = i;
    const st = stops[i];
    this._el.tourKick.textContent = `Welcome tour \xB7 ${i + 1} of ${stops.length}`;
    this._el.tourTitle.textContent = st.title;
    this._el.tourBody.textContent = st.body;
    this._el.tourBack.hidden = i === 0;
    this._el.tourNext.textContent = i === 0 ? "Show me" : i === stops.length - 1 ? "Start exploring" : "Next";
    this._el.tourDots.innerHTML = stops.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    for (const s of this._spots) s.el.classList.toggle("focus", s === st.spot);
    if (st.spot) {
      const scale = this.root.getWorldScale(this._t.v).x;
      const distance = (st.spot.def.tour?.distance ?? 3) * scale;
      const target = st.spot.node.localToWorld(st.spot.local.clone());
      target.y -= distance * 0.13;
      this._emit("focus", { target, distance });
      if (st.spot.def.id === "hub_bobo") this._tapBobo();
    } else this._emit("focus", null);
    this._sfx("click");
    setTimeout(() => this._el.tourNext.focus({ preventScroll: true }), 60);
  }
  _tourEnd(remember) {
    if (this._tourI < 0) return;
    this._tourI = -1;
    if (remember) store.set(this._k("toured"), "1");
    this._el.tour.classList.remove("on");
    setTimeout(() => this._tourI < 0 && (this._el.tour.hidden = true), 320);
    this._el.spots.classList.remove("touring");
    for (const s of this._spots) s.el.classList.remove("focus");
    this._emit("focus", null);
    this._emit("tour", "end");
    if (this._state === "live") {
      const after = this._afterTour;
      this._afterTour = null;
      after?.();
    }
  }
  /* ── unlock form ──────────────────────────────────────────────────── */
  _showGateForm(mode, error) {
    const saved = this._loadSession();
    const prefCode = this.opts.hubCode ? formatCodeInput(this.opts.hubCode) : "";
    const age = store.get(this._k("age")) === "1";
    const card = this._el.gateCard;
    card.innerHTML = `
<button type="button" class="mlh-x" data-cancel aria-label="Close">${ICON.close}</button>
<div class="mlh-kicker">Bobo's Hideout</div>
<h2 id="mlh-gate-h">${mode === "add" ? "Add an item to your room" : "Unlock your room"}</h2>
<p>${mode === "add" ? "Enter the code from your new item's card, with the email your room is linked to." : "Enter the code from the card that came with your EVADE merch, plus your email. After this, your code and email open your room on any device."}</p>
<form novalidate>
  <label class="mlh-field"><span>Code</span>
    <input class="code" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" maxlength="14" placeholder="BOBO-XXXX-XXXX" value="${esc(prefCode)}" aria-describedby="mlh-gate-err">
  </label>
  <label class="mlh-field"><span>Email</span>
    <input name="email" type="email" required autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(saved?.email || "")}" aria-describedby="mlh-gate-err">
  </label>
  <label class="mlh-check"${age ? " hidden" : ""}><input type="checkbox" name="age"${age ? " checked" : ""}> <span>I'm 13 or older, and it's OK to email me my key.</span></label>
  <div class="mlh-err" id="mlh-gate-err" role="alert"${error ? "" : " hidden"}>${esc(error || "")}</div>
  <div class="mlh-row">
    <button type="submit" class="mlh-btn pri">${mode === "add" ? "Add to my room" : "Unlock my room"}</button>
  </div>
  <button type="button" class="mlh-link" data-help aria-expanded="false">Where's my code?</button>
  <div class="mlh-help" hidden>
    <p><b>On the card in your merch box,</b> under the QR code. It starts with BOBO.</p>
    <p><b>Unlocked before?</b> Use the same code and email. They work as your password, on any device.</p>
    <p style="margin:0">Codes never use 0, 1, O, I or L, so there's nothing to mix up.</p>
  </div>
  ${this.opts.testHint ? `<div class="mlh-test">Testing? Use <code>${esc(this.opts.testHint)}</code> with any email.</div>` : ""}
</form>`;
    const form = card.querySelector("form");
    const codeIn = form.elements.namedItem("code");
    const emailIn = form.elements.namedItem("email");
    const ageIn = form.elements.namedItem("age");
    const err = card.querySelector(".mlh-err");
    const submit = form.querySelector("button[type=submit]");
    const showErr = (msg, field) => {
      err.textContent = msg;
      err.hidden = false;
      codeIn.removeAttribute("aria-invalid");
      emailIn.removeAttribute("aria-invalid");
      if (field) {
        field.setAttribute("aria-invalid", "true");
        field.focus();
      }
    };
    codeIn.addEventListener("input", () => {
      codeIn.value = formatCodeInput(codeIn.value);
      codeIn.removeAttribute("aria-invalid");
    });
    card.querySelector("[data-cancel]").addEventListener("click", () => this._cancelGate());
    const help = card.querySelector("[data-help]");
    help.addEventListener("click", () => {
      const box = card.querySelector(".mlh-help");
      box.hidden = !box.hidden;
      help.setAttribute("aria-expanded", String(!box.hidden));
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      this._unlockAudio();
      const c = checkCode(codeIn.value);
      if (!c.ok) return showErr(c.message, codeIn);
      const email = emailIn.value.trim().toLowerCase();
      if (!EMAIL_RE.test(email))
        return showErr("Enter the email you want your room linked to.", emailIn);
      if (!ageIn.checked) return showErr("Please confirm you're 13 or older.", ageIn);
      store.set(this._k("age"), "1");
      err.hidden = true;
      submit.disabled = true;
      submit.textContent = "Checking your code\u2026";
      try {
        const r = await fetch(this._url("/api/collector/unlock"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ room: this.roomId, code: c.code, email })
        });
        const j = await r.json().catch(() => ({ ok: false, message: "Something went wrong. Try again." }));
        if (!j.ok) {
          submit.disabled = false;
          submit.textContent = mode === "add" ? "Add to my room" : "Unlock my room";
          return showErr(
            j.message || "That didn't work. Try again.",
            j.error === "bad-email" ? emailIn : codeIn
          );
        }
        this._token = j.token;
        this._me = j.me;
        this._saveSession(j.token, j.me, email, j.code);
        this.opts.hubCode = null;
        this._applyOwnership();
        this._renderHud();
        this._sfx("unlock");
        this._emit("unlocked", { me: j.me, firstClaim: !!j.firstClaim, emailed: !!j.emailed });
        this._showGateDone(j, mode);
      } catch {
        submit.disabled = false;
        submit.textContent = mode === "add" ? "Add to my room" : "Unlock my room";
        showErr("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }
  _showGateDone(j, mode) {
    const card = this._el.gateCard;
    const item = j.me.items[j.me.items.length - 1];
    const prod = j.me.collection?.products.find((p) => p.id === item?.product);
    const welcomeBack = !j.firstClaim;
    const title = welcomeBack ? "Welcome back" : mode === "add" ? `${prod?.name || "New item"} added` : "Your room is unlocked";
    const line = welcomeBack ? `You're signed in as ${esc(j.me.email)}.` : j.emailed ? `We emailed your key to ${esc(j.me.email)}. Your code is your password, so keep it somewhere safe.` : `Your code is your password for this room, together with ${esc(j.me.email)}. Keep it somewhere safe.`;
    card.innerHTML = `
<div class="mlh-center">
  <div class="mlh-ok">${ICON.check}</div>
  <div class="mlh-kicker">Bobo's Hideout</div>
  <h2 id="mlh-gate-h">${esc(title)}</h2>
  ${welcomeBack ? "" : `<div class="mlh-keycode">${esc(j.code)}</div>`}
  <p>${line}</p>
  <div class="mlh-row"><button type="button" class="mlh-btn pri" data-go>${this._state === "live" ? "Back to my room" : "Open the portal"}</button></div>
</div>`;
    const go = card.querySelector("[data-go]");
    go.addEventListener("click", () => {
      this._el.gate.classList.remove("open");
      this._syncModal();
      const r = this._gateResolve;
      this._gateResolve = void 0;
      r?.(true);
      if (this._state === "live" && mode === "add" && j.firstClaim) {
        this._celebrate(prod?.name);
      }
    });
    setTimeout(() => go.focus({ preventScroll: true }), 50);
  }
  _cancelGate() {
    this._el.gate.classList.remove("open");
    this._syncModal();
    const r = this._gateResolve;
    this._gateResolve = void 0;
    r?.(false);
    this._lastFocus?.focus?.({ preventScroll: true });
  }
  _celebrate(name) {
    this.toast(`${name || "New item"} is in your collection!`);
    this._burstFizz(
      this._room?.getObjectByName("hub_collection") ? new THREE.Vector3(-0.6, 1.1, -1.2) : this._lampPos
    );
    const a = this._play("Excited", 0.2, true);
    if (a) this._backToSit(a);
  }
  /* ── room taps ────────────────────────────────────────────────────── */
  _bindTaps() {
    const c = this.opts.canvas;
    let down = null;
    const pd = (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    };
    const pu = (e) => {
      if (!down || e.pointerId !== down.id || !this.root.visible) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (moved > 10 || !quick) return;
      if (!this.tap(e.clientX, e.clientY) && this._state === "live")
        this._closeLayer(this._el.sheet);
    };
    const pm = (e) => {
      if (e.pointerType !== "mouse" || down || !this.root.visible || this._state !== "live") return;
      c.style.cursor = this._pick(e.clientX, e.clientY) ? "pointer" : "";
    };
    c.addEventListener("pointerdown", pd);
    c.addEventListener("pointerup", pu);
    c.addEventListener("pointermove", pm);
    this._off.push(() => {
      c.removeEventListener("pointerdown", pd);
      c.removeEventListener("pointerup", pu);
      c.removeEventListener("pointermove", pm);
    });
  }
  _pick(x, y) {
    const cam = this.opts.getCamera();
    if (!cam || !this._room || !this.root.visible) return null;
    const r = this.opts.canvas.getBoundingClientRect();
    this._ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, cam);
    if (this._card?.visible && this._ray.intersectObject(this._card, false).length)
      return "hub_hologram";
    for (const hit of this._ray.intersectObjects(this._pickables, false)) {
      const o = hit.object;
      if (!o.visible) continue;
      const isPortal = this._isUnder(o, this._portal) || this._isUnder(o, this._pad);
      if (isPortal && !this._portal?.visible) continue;
      if (this._state !== "live") {
        if (isPortal) return "hub_portal";
        continue;
      }
      if (o.material?.transparent && o.material.opacity < 0.4 && o.material !== this._holoMat)
        continue;
      const id = this._hubId(o);
      if (id) return id;
      return null;
    }
    return null;
  }
  _isUnder(o, n) {
    for (let p = o; p; p = p.parent) if (p === n) return true;
    return false;
  }
  _hubId(o) {
    for (let p = o; p; p = p.parent) {
      const n = p.name || "";
      if (n.startsWith("hub_")) {
        if (n.startsWith("hub_slot_")) return "hub_collection";
        const id = n.replace(/_(Asset|Art|Frame|Glow)$/, "");
        return ALIAS[id] || id;
      }
    }
    return null;
  }
  _onTap(id) {
    if (id === "hub_portal") {
      if (this._state === "portal") this._emit("portal", void 0);
      return;
    }
    if (this._state !== "live" || this._tourI >= 0) return;
    switch (id) {
      case "hub_hologram":
        return this.openOS("alerts");
      case "hub_bobo":
        return this._tapBobo();
      case "hub_computer":
        return this.openOS();
      case "hub_collection":
        return this.openCollection();
      case "hub_cola_lamp":
        this._burstFizz(this._lampPos);
        this._sfx("fizz");
        return this.toast("Fizz!");
      case "hub_pull_tab":
        this._tabWiggle = 1;
        this._burstFizz(new THREE.Vector3(0, 3.6, 0));
        this._sfx("fizz");
        return this.toast("Pssst!");
    }
    this._openSheet(id);
  }
  _tapBobo() {
    const lines = [
      "Mrrp!",
      "Purrrr\u2026",
      "Bobo approves.",
      "Bobo wants a cola.",
      "Bobo is plotting his next run."
    ];
    this.toast(lines[Math.floor(Math.random() * lines.length)]);
    this._sfx("mrrp");
    const a = this._play(Math.random() < 0.5 ? "Excited" : "Spin", 0.2, true);
    if (a) this._backToSit(a);
  }
  _backToSit(a) {
    const m = this._mixer;
    const back = (ev) => {
      if (ev.action !== a) return;
      m.removeEventListener("finished", back);
      if (this._state === "live") this._play("Sit", 0.4);
    };
    m.addEventListener("finished", back);
  }
  _openSheet(id) {
    const it = ROOM_ITEMS[id];
    if (!it) return;
    this._el.sheetPill.textContent = it.sub;
    this._el.sheetTitle.textContent = it.title;
    this._el.sheetSub.textContent = "";
    this._el.sheetSub.hidden = true;
    this._el.sheetBody.textContent = it.body;
    const row = this._el.sheetRow;
    row.replaceChildren();
    if (it.action) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mlh-btn pri";
      b.textContent = it.action === "globe" ? "Open Where's Bobo?" : it.action === "colarun" ? "Open Cola Run" : "My collection";
      b.onclick = () => {
        this._closeLayer(this._el.sheet);
        if (it.action === "collection") this.openCollection();
        else this.openOS(it.action);
      };
      row.appendChild(b);
    }
    row.hidden = !row.children.length;
    this._open(this._el.sheet);
  }
  /** Room items list: the keyboard / screen reader way to everything tappable. */
  _openItems() {
    this._el.sheetPill.textContent = "Your room";
    this._el.sheetTitle.textContent = "Room items";
    this._el.sheetSub.hidden = false;
    this._el.sheetSub.textContent = "Everything you can open in Bobo's Hideout";
    this._el.sheetBody.textContent = "";
    const row = this._el.sheetRow;
    row.replaceChildren();
    row.hidden = false;
    const add = (label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mlh-btn";
      b.textContent = label;
      b.onclick = () => {
        this._closeLayer(this._el.sheet);
        fn();
      };
      row.appendChild(b);
    };
    if (this.opts.tour !== false) add("Take the tour", () => this.startTour());
    add("Bobo's computer", () => this.openOS());
    add("My collection", () => this.openCollection());
    add("Bobo", () => this._tapBobo());
    for (const [id, it] of Object.entries(ROOM_ITEMS))
      if (id !== "hub_cat_bed") add(it.title, () => this._openSheet(id));
    this._open(this._el.sheet);
  }
  /* ── collection ───────────────────────────────────────────────────── */
  /** The vault page for this fan: owned pieces are real, the rest holograms. */
  _vaultSrc(focus) {
    const base = this.opts.vaultUrl || `${this.opts.api || ""}/evade/vault/index.html`;
    const items = this._me?.items || [];
    const owned = [...new Set(items.map((i) => i.product))].filter((p) => /^[a-z]+$/.test(p));
    const serials = items.filter((i) => /^[a-z]+$/.test(i.product)).map((i) => `${i.product}:${i.serial}`).join(",");
    const q = new URLSearchParams({ owned: owned.join(",") });
    if (serials) q.set("s", serials);
    if (focus) q.set("focus", focus);
    return `${base}?${q}`;
  }
  _renderCollection(box, focus) {
    const me = this._me;
    const col = me?.collection ?? {
      name: "EVADE Merch Collection",
      reward: "The Golden Bobo",
      rewardBlurb: "Collect the full set to unlock a golden Bobo for your room and early access to the next drop.",
      products: []
    };
    const owned = /* @__PURE__ */ new Map();
    for (const i of me?.items || []) if (!owned.has(i.product)) owned.set(i.product, i);
    const total = col.products.length || me?.total || 5;
    const n = me?.owned ?? owned.size;
    const cards = col.products.map((p) => {
      const it = owned.get(p.id);
      const tag = it ? "Owned" : p.released ? "Locked" : "Coming soon";
      const detail = it ? `#${String(it.serial).padStart(5, "0")}${it.test ? " \xB7 test unlock" : ""} \xB7 ${new Date(it.claimedAt).toLocaleDateString()}` : p.blurb;
      return `<div class="mlh-slot ${it ? "owned" : "locked"}" data-p="${esc(p.id)}">
  <span class="tag">${tag}</span>
  <div class="art">${PRODUCT_ICON[p.id] || ICON.collection}</div>
  <b>${esc(p.name)}</b><small>${esc(detail)}</small>
</div>`;
    }).join("");
    box.innerHTML = `
<div class="mlh-vhead">
  <div><div class="mlh-kicker">Bobo's Hideout \xB7 Vault</div>
  <h2 id="mlh-col-h">EVADE Digital Collection</h2></div>
  <div class="mlh-prog"><div class="mlh-bar"><i style="width:${Math.round(100 * n / Math.max(1, total))}%"></i></div><b>${n} of ${total}</b></div>
</div>
<div class="mlh-vault"><iframe class="mlh-frame" title="Your EVADE Digital Collection in 3D" src="${esc(this._vaultSrc(focus))}" allow="autoplay" loading="lazy"></iframe></div>
<p class="mlh-vnote">Every activated piece of EVADE merch lands here for real. Locked pieces show as holograms until you activate one. Collect the set for an exclusive reward.</p>
<details class="mlh-list"><summary>List view</summary><div class="mlh-grid">${cards}</div></details>
<div class="mlh-reward${me?.complete ? " done" : ""}">
  <div class="medal">${me?.complete ? "\u2605" : ICON.lock}</div>
  <div><b>${esc(col.reward)}${me?.complete ? " \xB7 unlocked!" : ""}</b><small>${esc(col.rewardBlurb)}</small></div>
</div>
<div class="mlh-row"><button type="button" class="mlh-btn" data-add>Add an item with a code</button></div>`;
    box.querySelector("[data-add]").addEventListener("click", () => {
      this._closeLayer(this._el.col);
      this.closeOS();
      this.openGate("add");
    });
    if (focus)
      box.querySelector(`[data-p="${focus}"]`)?.scrollIntoView({ block: "nearest" });
  }
  /* ── BOBO OS ──────────────────────────────────────────────────────── */
  _openApp(id, highlight) {
    if (!this._el.os.classList.contains("open")) return this.openOS(id);
    const existing = this._wins.get(id);
    if (existing) {
      existing.el.hidden = false;
      this._focusApp(id);
      if (id === "alerts") this._renderApp(id, existing.body, highlight);
      return;
    }
    const app = APPS.find((a) => a.id === id);
    const desk = this._el.desk.getBoundingClientRect();
    const narrow = desk.width < 700;
    const w = Math.min(app.w, desk.width - 24);
    const h = Math.min(app.h, desk.height - 100);
    const n = this._wins.size;
    const left = Math.max(
      12,
      Math.min(desk.width - w - 12, (desk.width - w) / 2 + (n - 1) * 28 + 40)
    );
    const top = Math.max(10, Math.min(desk.height - h - 80, (desk.height - h) / 2 - 30 + n * 24));
    const el = document.createElement("section");
    el.className = "mlh-win";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", app.name);
    el.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px`;
    el.innerHTML = `
<div class="mlh-bar2">
  <div class="mlh-dots"><button type="button" class="mlh-dot c" aria-label="Close ${esc(app.name)}"></button><button type="button" class="mlh-dot m" aria-label="Minimise"></button><button type="button" class="mlh-dot x" aria-label="Full size"></button></div>
  <div class="t"><span class="mi" style="--a:${app.g[0]};--b:${app.g[1]}">${ICON3D[id]}</span>${esc(app.name)}</div>
</div>
<div class="mlh-body${id === "globe" || id === "collection" ? " flush" : ""}"></div>`;
    const body = el.querySelector(".mlh-body");
    this._el.desk.appendChild(el);
    this._wins.set(id, { el, body });
    el.addEventListener("pointerdown", () => this._focusApp(id), true);
    el.querySelector(".mlh-dot.c").addEventListener("click", () => this._closeApp(id));
    el.querySelector(".mlh-dot.m").addEventListener("click", () => {
      el.hidden = true;
      this._focused = void 0;
      this._el.appName.textContent = "Desktop";
    });
    el.querySelector(".mlh-dot.x").addEventListener("click", () => el.classList.toggle("max"));
    const bar = el.querySelector(".mlh-bar2");
    bar.addEventListener("dblclick", () => el.classList.toggle("max"));
    if (!narrow) this._dragWindow(el, bar);
    this._renderApp(id, body, highlight);
    this._focusApp(id);
    this._renderTray();
    this._sfx("click");
  }
  _dragWindow(el, bar) {
    let start = null;
    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || el.classList.contains("max")) return;
      start = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, id: e.pointerId };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      const d = this._el.desk;
      const l = Math.max(
        -el.offsetWidth + 80,
        Math.min(d.clientWidth - 80, start.l + e.clientX - start.x)
      );
      const t = Math.max(0, Math.min(d.clientHeight - 40, start.t + e.clientY - start.y));
      el.style.left = l + "px";
      el.style.top = t + "px";
    });
    const end = (e) => {
      if (start && e.pointerId === start.id) start = null;
    };
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }
  _focusApp(id) {
    for (const [k, w2] of this._wins) w2.el.classList.toggle("focus", k === id);
    const w = this._wins.get(id);
    if (w) w.el.style.zIndex = String(++this._z);
    this._focused = id;
    this._el.appName.textContent = APPS.find((a) => a.id === id).name;
  }
  _closeApp(id, instant = false) {
    const w = this._wins.get(id);
    if (!w) return;
    this._wins.delete(id);
    if (this._focused === id) {
      this._focused = void 0;
      this._el.appName.textContent = "Desktop";
    }
    if (instant || this._reduceMotion) w.el.remove();
    else {
      w.el.classList.add("closing");
      setTimeout(() => w.el.remove(), 170);
    }
    this._renderTray();
  }
  _renderTray() {
    const n = this._unread();
    const bb = this._el.bellBadge;
    bb.textContent = String(n);
    bb.hidden = !n;
    const hb = this._el.homeBadge;
    if (hb) {
      hb.textContent = String(n);
      hb.hidden = !n;
    }
    for (const b of this._ui.querySelectorAll("[data-badge]")) {
      b.textContent = String(n);
      b.hidden = !n;
    }
    for (const b of this._el.dock.querySelectorAll("button"))
      b.classList.toggle("run", this._wins.has(b.dataset.app));
    this._renderWidgets();
  }
  /** Desktop widgets: time, collection progress, newest alert. */
  _renderWidgets() {
    const box = this._el.widgets;
    if (!box || !this._el.os.classList.contains("open")) return;
    const now = /* @__PURE__ */ new Date();
    const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const date = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    const me = this._me;
    const total = me?.collection?.products.length || me?.total || 5;
    const n = me?.owned ?? 0;
    const pct = Math.round(100 * n / Math.max(1, total));
    const latest = this._alerts[0];
    const unread = this._unread();
    box.innerHTML = `
<div class="mlh-wg"><div class="k">Bobo's Hideout</div><div class="big">${esc(time)}</div><small>${esc(date)} \xB7 Bobo is home</small></div>
<button type="button" class="mlh-wg" data-w="collection"><div class="k">Digital Collection</div>
  <div class="row"><div class="mlh-ringwrap"><div class="mlh-ring" style="--p:${pct}"></div><b>${n}/${total}</b></div>
  <div><b>${n} of ${total} collected</b><small>Collect all for an exclusive reward</small></div></div></button>
<button type="button" class="mlh-wg" data-w="alerts"><div class="k">${unread ? `${unread} new alert${unread > 1 ? "s" : ""}` : "Alerts"}</div>
  ${latest ? `<div class="al"><span class="mlh-tile sm" style="--a:${KIND_COLOR[latest.kind]};--b:#1a1440">${ICON3D.alerts}</span><div><b>${esc(latest.title)}</b><small>${esc(KIND_LABEL[latest.kind])} \xB7 ${esc(ago(latest.at))}</small></div></div>` : "<small>No alerts yet. New drops and events land here.</small>"}</button>`;
    box.querySelector('[data-w="collection"]').addEventListener("click", () => this._openApp("collection"));
    box.querySelector('[data-w="alerts"]').addEventListener("click", () => this._openApp("alerts"));
  }
  _renderApp(id, body, highlight) {
    switch (id) {
      case "alerts":
        return this._appAlerts(body, highlight);
      case "globe":
        body.innerHTML = `<iframe class="mlh-frame" title="Where's Bobo? globe" src="${esc(this.opts.globeUrl)}" loading="lazy" allow="fullscreen"></iframe>`;
        return;
      case "leaderboard":
        return this._appLeaderboard(body);
      case "colarun":
        body.innerHTML = `
<div class="mlh-hero">COLA RUN<small>EVADE \xD7 MEDIALIFE</small></div>
<h3>Grab the cans before the clock runs out</h3>
<p>Play a round, or record your run. Clips you send can put your city on the Where's Bobo? globe.</p>
<div class="mlh-stack">
  <button type="button" class="mlh-btn pri" data-play>Play Cola Run</button>
  <button type="button" class="mlh-btn" data-rec><span style="width:10px;height:10px;border-radius:50%;background:#ff3b4e;display:inline-block"></span> Record a run</button>
</div>`;
        body.querySelector("[data-play]").addEventListener("click", () => this._play2(false));
        body.querySelector("[data-rec]").addEventListener("click", () => this._play2(true));
        return;
      case "collection": {
        const me = this._me;
        const total = me?.collection?.products.length || me?.total || 5;
        const n = me?.owned ?? 0;
        body.innerHTML = `<div class="mlh-vwrap"><div class="mlh-vault"><iframe class="mlh-frame" title="Your EVADE Digital Collection in 3D" src="${esc(this._vaultSrc())}"></iframe></div>
<div class="mlh-vbar"><div class="mlh-prog"><div class="mlh-bar"><i style="width:${Math.round(100 * n / Math.max(1, total))}%"></i></div><b>${n} of ${total} collected \xB7 collect all for an exclusive reward</b></div><button type="button" class="mlh-btn" data-add>Add an item</button></div></div>`;
        body.querySelector("[data-add]").addEventListener("click", () => {
          this.closeOS();
          this.openGate("add");
        });
        return;
      }
      case "shop":
        body.innerHTML = `
<div class="mlh-empty">${ICON.shop}</div>
<h3>The shop opens soon</h3>
<p>Hoodie, tee and desk mat drops are on the way. You'll get an alert on Bobo's computer the moment they land.</p>
<div class="mlh-stack"><button type="button" class="mlh-btn" data-col>See what's in the collection</button></div>`;
        body.querySelector("[data-col]").addEventListener("click", () => this._openApp("collection"));
        return;
      case "me": {
        const me = this._me;
        body.innerHTML = me ? `<div class="mlh-me"><div class="mlh-av">${esc(me.email.slice(0, 1).toUpperCase())}</div><div><b>${esc(me.email)}</b><div style="color:var(--muted);font-size:13px">Owner of Bobo's Hideout</div></div></div>
<div class="mlh-kv"><span>Collected</span><b>${me.owned} of ${me.collection?.products.length ?? me.total}</b></div>
<div class="mlh-kv"><span>Sign in with</span><b>Your code + this email</b></div>
<div class="mlh-stack" style="margin-top:16px"><button type="button" class="mlh-btn" data-add>Add an item with a code</button><button type="button" class="mlh-btn" data-out>Sign out on this device</button></div>` : `<p>You're not signed in on this device.</p>`;
        body.querySelector("[data-add]")?.addEventListener("click", () => {
          this.closeOS();
          this.openGate("add");
        });
        body.querySelector("[data-out]")?.addEventListener("click", () => {
          this.signOut();
          this._emit("exit", void 0);
        });
        return;
      }
    }
  }
  _play2(record) {
    this.closeOS();
    this._emit("play", { record });
  }
  _appAlerts(body, highlight) {
    const list = this._alerts;
    if (!list.length) {
      body.innerHTML = `<div class="mlh-empty">${ICON.alerts}<p>No alerts yet. The EVADE team posts drops, events and rewards here, live.</p></div>`;
      return;
    }
    body.innerHTML = list.map((a) => {
      const link = safeLink(a.linkUrl);
      return `<article class="mlh-alert${this._read.has(a.id) ? "" : " unread"}${a.id === highlight ? " hl" : ""}" data-id="${esc(a.id)}">
  <div class="k" style="background:${KIND_COLOR[a.kind] || "#36e3ff"}">${a.kind === "reward" ? ICON.collection : a.kind === "event" ? ICON.globe : a.kind === "drop" ? ICON.shop : ICON.alerts}</div>
  <div style="min-width:0;flex:1"><b>${esc(a.title)}</b><div class="meta">${KIND_LABEL[a.kind] || "News"} \xB7 ${ago(a.at)}</div>
  ${a.body ? `<p>${esc(a.body)}</p>` : ""}
  ${link ? `<a class="mlh-btn" href="${esc(this._abs(link))}" target="_blank" rel="noopener">${esc(a.linkLabel || "Open")} ${ICON.external}</a>` : ""}</div>
</article>`;
    }).join("");
    if (highlight)
      body.querySelector(`[data-id="${CSS_escape(highlight)}"]`)?.scrollIntoView({ block: "nearest" });
    let changed = false;
    for (const a of list)
      if (!this._read.has(a.id)) {
        this._read.add(a.id);
        changed = true;
      }
    if (changed) {
      store.set(this._k("read"), JSON.stringify([...this._read].slice(-200)));
      this._screenDirty = true;
      this._renderTray();
    }
  }
  _abs(link) {
    return link.startsWith("/") && this.opts.api ? this._url(link) : link;
  }
  async _appLeaderboard(body) {
    if (!this._feed) {
      body.innerHTML = `<div class="mlh-load">Loading the board\u2026</div>`;
      try {
        const r = await fetch(this._url("/api/bobo/feed.json"));
        this._feed = await r.json();
      } catch {
        body.innerHTML = `<div class="mlh-empty"><p>Couldn't load the leaderboard. Check your connection.</p><button type="button" class="mlh-btn" data-retry>Try again</button></div>`;
        body.querySelector("[data-retry]").addEventListener("click", () => this._appLeaderboard(body));
        return;
      }
    }
    const f = this._feed;
    const places = f.places || [];
    const score = (p) => (p.media?.length || 0) * 10 + (p.events || 0);
    let rows;
    if (this._lbTab === "cities") {
      rows = places.map((p) => ({
        name: p.city || p.country,
        sub: [p.region, p.country].filter(Boolean).join(", "),
        flag: flag(p.countryCode),
        n: score(p)
      })).sort((a, b) => b.n - a.n);
    } else {
      const by = /* @__PURE__ */ new Map();
      for (const p of places) {
        const k = p.countryCode || p.country;
        const r = by.get(k) || {
          name: p.country,
          sub: "",
          flag: flag(p.countryCode),
          n: 0,
          cities: 0
        };
        r.n += score(p);
        r.cities++;
        r.sub = `${r.cities} ${r.cities === 1 ? "city" : "cities"}`;
        by.set(k, r);
      }
      rows = [...by.values()].sort((a, b) => b.n - a.n);
    }
    const s = f.stats || {};
    body.innerHTML = `
<h3>Where's Bobo? leaderboard</h3>
<p>Every clip and check-in puts a place on the board. Most Bobo sightings wins.</p>
<div class="mlh-stats"><div><b>${s.places ?? 0}</b><small>places</small></div><div><b>${s.countries ?? 0}</b><small>countries</small></div><div><b>${(s.km ?? 0).toLocaleString()}</b><small>km travelled</small></div></div>
<div class="mlh-tabs" role="tablist"><button type="button" role="tab" aria-selected="${this._lbTab === "cities"}" data-tab="cities">Top cities</button><button type="button" role="tab" aria-selected="${this._lbTab === "countries"}" data-tab="countries">Top countries</button></div>
${rows.length ? `<ol class="mlh-lb">${rows.slice(0, 20).map(
      (r, i) => `<li><span class="r">${i + 1}</span><span class="f" aria-hidden="true">${r.flag}</span><span class="n"><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></span><span class="s">${r.n}</span></li>`
    ).join("")}</ol>` : `<div class="mlh-empty"><p>No sightings yet. Be the first.</p></div>`}
<div class="mlh-stack" style="margin-top:14px"><button type="button" class="mlh-btn pri" data-rec>Put your city on the board</button><button type="button" class="mlh-btn" data-globe>Open the globe</button></div>`;
    for (const b of body.querySelectorAll("[data-tab]"))
      b.addEventListener("click", () => {
        this._lbTab = b.dataset.tab;
        this._appLeaderboard(body);
      });
    body.querySelector("[data-rec]").addEventListener("click", () => this._play2(true));
    body.querySelector("[data-globe]").addEventListener("click", () => this._openApp("globe"));
  }
  /* ── alerts ───────────────────────────────────────────────────────── */
  _unread() {
    return this._alerts.filter((a) => !this._read.has(a.id)).length;
  }
  _startPolling() {
    if (this._pollTimer) return;
    this._poll();
    this._pollTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      this._poll();
    }, 15e3);
  }
  _stopPolling() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = void 0;
  }
  /** Fetch the alerts feed now (also used by tests). */
  async pollAlerts() {
    await this._poll();
  }
  async _poll() {
    try {
      const r = await fetch(
        this._url(`/api/collector/alerts.json?room=${encodeURIComponent(this.roomId)}`)
      );
      if (!r.ok) return;
      const j = await r.json();
      const list = Array.isArray(j.alerts) ? j.alerts : [];
      const firstLoad = !this._polled && !this._known.size;
      this._polled = true;
      const fresh = list.filter((a) => !this._known.has(a.id));
      this._alerts = list;
      for (const a of list) this._known.add(a.id);
      store.set(this._k("known"), JSON.stringify([...this._known].slice(-200)));
      this._screenDirty = true;
      this._renderTray();
      const w = this._wins.get("alerts");
      if (w && !fresh.length) this._appAlerts(w.body);
      if (!fresh.length || firstLoad) return;
      const newest = fresh[0];
      this._emit("alert", newest);
      this._sfx("ping");
      this._notif = newest;
      this._notifT = 0;
      if (this._el.os.classList.contains("open")) {
        if (w) this._appAlerts(w.body, newest.id);
        else this._osNotify(newest);
      } else if (this._state === "live") this._beamAlertOut(newest);
    } catch {
    }
  }
  _osNotify(a) {
    const n = this._el.notif;
    n.dataset.id = a.id;
    n.innerHTML = `<span class="mlh-tile sm" style="--a:${KIND_COLOR[a.kind]};--b:#1a1440">${ICON3D.alerts}</span><span><b>${esc(a.title)}</b><small>${esc(a.body || KIND_LABEL[a.kind])}</small></span>`;
    n.classList.add("on");
    setTimeout(() => n.classList.remove("on"), 6e3);
  }
  /* ── monitor ──────────────────────────────────────────────────────── */
  _setupScreen(local) {
    const mesh = this._room.getObjectByName("Monitor_Screen");
    if (!mesh) return;
    const mat = mesh.material.clone();
    mesh.material = mat;
    delete mat.userData.mlhReveal;
    this._patch(mat);
    this._owned.push(mat);
    this._screenMat = mat;
    this._screenBase = Math.min(mat.emissiveIntensity || 1, 1.1);
    const b = new THREE.Box3().setFromObject(mesh);
    b.getCenter(this._screenCenter).applyMatrix4(this._t.m.copy(this._room.matrixWorld).invert());
    void local;
    const img = mat.map?.image || mat.emissiveMap?.image;
    if (!img || !img.width) return;
    const scale = Math.min(1, 1600 / img.width);
    const c = this._screenCanvas = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    this._screenImg = img;
    const tex = this._screenTex = new THREE.CanvasTexture(c);
    tex.flipY = mat.map ? mat.map.flipY : false;
    srgb(tex);
    this._texs.push(tex);
    if (mat.map) mat.map = tex;
    if (mat.emissiveMap) mat.emissiveMap = tex;
    mat.needsUpdate = true;
    this._screenDirty = true;
  }
  /** Redraw the monitor: live alerts tile, clock, and the pop-up card. */
  _updateScreen(dt) {
    const c = this._screenCanvas;
    if (!c || !this._screenImg) return;
    let animating = false;
    if (this._notifT >= 0) {
      this._notifT += dt;
      animating = this._notifT < 0.6 || this._notifT > 7.4 && this._notifT < 8.2;
      if (this._notifT > 8.2) {
        this._notifT = -1;
        this._screenDirty = true;
      }
    }
    if (!this._screenDirty && !animating) return;
    this._screenDirty = false;
    const g = c.getContext("2d");
    const W = c.width;
    const H = c.height;
    const k = W / 1600;
    g.drawImage(this._screenImg, 0, 0, W, H);
    const S = (v) => v * k;
    const font = (w, px) => `${w} ${Math.round(S(px))}px ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif`;
    const rr = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(S(x + r), S(y));
      g.arcTo(S(x + w), S(y), S(x + w), S(y + h), S(r));
      g.arcTo(S(x + w), S(y + h), S(x), S(y + h), S(r));
      g.arcTo(S(x), S(y + h), S(x), S(y), S(r));
      g.arcTo(S(x), S(y), S(x + w), S(y), S(r));
      g.closePath();
    };
    g.fillStyle = "rgb(5,9,24)";
    g.fillRect(S(1400), 0, S(200), S(54));
    g.fillStyle = "#dce6ff";
    g.font = font(600, 26);
    g.textAlign = "right";
    g.textBaseline = "middle";
    g.fillText(this._screenClock, S(1572), S(28));
    g.textAlign = "left";
    rr(40, 90, 520, 470, 26);
    g.fillStyle = "rgb(10,18,44)";
    g.fill();
    g.lineWidth = S(3);
    g.strokeStyle = "rgba(54,227,255,.7)";
    g.stroke();
    g.fillStyle = "#fff";
    g.font = font(800, 44);
    g.textBaseline = "alphabetic";
    g.fillText("ALERTS", S(72), S(160));
    const n = this._unread();
    if (n) {
      g.fillStyle = "#ff4fa3";
      g.beginPath();
      g.arc(S(295), S(143), S(27), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.font = font(800, 34);
      g.textAlign = "center";
      g.fillText(String(Math.min(n, 9)), S(295), S(155));
      g.textAlign = "left";
    }
    const items = this._alerts.slice(0, 2);
    if (!items.length) {
      g.fillStyle = "#9fb0dc";
      g.font = font(600, 28);
      g.fillText("No alerts yet", S(72), S(250));
    }
    items.forEach((a, i) => {
      const y = 210 + i * 160;
      rr(70, y, 460, 132, 18);
      g.fillStyle = this._read.has(a.id) ? "rgb(20,32,70)" : "rgb(30,52,110)";
      g.fill();
      g.fillStyle = KIND_COLOR[a.kind] || "#36e3ff";
      g.beginPath();
      g.arc(S(120), S(y + 66), S(30), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.font = font(800, 32);
      g.fillText(this._clip(g, a.title, S(330)), S(172), S(y + 58));
      g.fillStyle = "#b4c4ec";
      g.font = font(600, 24);
      g.fillText(this._clip(g, a.body || KIND_LABEL[a.kind], S(330)), S(172), S(y + 98));
    });
    if (this._notifT >= 0 && this._notif) {
      const t = this._notifT;
      const inK = backOut(clamp01(t / 0.6));
      const outK = 1 - ease(clamp01((t - 7.4) / 0.8));
      const y = -150 + 220 * Math.min(inK, 1) * outK + (inK > 1 ? (inK - 1) * 40 : 0);
      const x = 900;
      g.save();
      g.shadowColor = "rgba(0,0,0,.6)";
      g.shadowBlur = S(30);
      rr(x, y, 660, 150, 24);
      g.fillStyle = "rgba(16,26,66,.97)";
      g.fill();
      g.restore();
      rr(x, y, 660, 150, 24);
      g.lineWidth = S(4);
      g.strokeStyle = KIND_COLOR[this._notif.kind] || "#36e3ff";
      g.stroke();
      g.fillStyle = KIND_COLOR[this._notif.kind] || "#36e3ff";
      g.font = font(800, 22);
      g.fillText(KIND_LABEL[this._notif.kind].toUpperCase() + "  \xB7  NEW", S(x + 30), S(y + 44));
      g.fillStyle = "#fff";
      g.font = font(800, 36);
      g.fillText(this._clip(g, this._notif.title, S(600)), S(x + 30), S(y + 90));
      g.fillStyle = "#c4d2f4";
      g.font = font(600, 24);
      g.fillText(
        this._clip(g, this._notif.body || "Tap the computer to read it", S(600)),
        S(x + 30),
        S(y + 126)
      );
    }
    if (this._screenTex) this._screenTex.needsUpdate = true;
  }
  _clip(g, s, w) {
    if (g.measureText(s).width <= w) return s;
    let t = s;
    while (t.length > 1 && g.measureText(t + "\u2026").width > w) t = t.slice(0, -1);
    return t.trimEnd() + "\u2026";
  }
  /* ── hologram beam (the wow) ──────────────────────────────────────── */
  _setupBeam() {
    const cc = this._cardCanvas = document.createElement("canvas");
    cc.width = 1024;
    cc.height = 600;
    const tex = this._cardTex = new THREE.CanvasTexture(cc);
    srgb(tex);
    this._texs.push(tex);
    this._cardU.uMap.value = tex;
    const geo = new THREE.PlaneGeometry(1.5, 1.5 * (600 / 1024));
    this._geos.push(geo);
    const mat = new THREE.ShaderMaterial({
      uniforms: this._cardU,
      vertexShader: CARD_VERT,
      fragmentShader: CARD_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this._owned.push(mat);
    this._card = new THREE.Mesh(geo, mat);
    this._card.visible = false;
    this._card.renderOrder = 10;
    this._room.add(this._card);
    const bg = new THREE.CylinderGeometry(0.62, 0.08, 1, 32, 1, true);
    bg.translate(0, 0.5, 0);
    this._geos.push(bg);
    const bm = new THREE.ShaderMaterial({
      uniforms: this._beamU,
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this._owned.push(bm);
    this._beam = new THREE.Mesh(bg, bm);
    this._beam.visible = false;
    this._beam.renderOrder = 9;
    this._beam.raycast = () => void 0;
    this._room.add(this._beam);
  }
  _drawCard(a) {
    const c = this._cardCanvas;
    const g = c.getContext("2d");
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    const col = KIND_COLOR[a.kind] || "#36e3ff";
    const rr = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "rgba(10,30,70,.88)");
    grad.addColorStop(1, "rgba(40,10,60,.88)");
    rr(16, 16, W - 32, H - 32, 44);
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = "rgba(54,227,255,.95)";
    g.shadowColor = "#36e3ff";
    g.shadowBlur = 26;
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = col;
    g.lineWidth = 10;
    for (const [x, y, dx, dy] of [
      [40, 40, 1, 1],
      [W - 40, 40, -1, 1],
      [40, H - 40, 1, -1],
      [W - 40, H - 40, -1, -1]
    ]) {
      g.beginPath();
      g.moveTo(x, y + dy * 50);
      g.lineTo(x, y);
      g.lineTo(x + dx * 50, y);
      g.stroke();
    }
    const F = (w, px) => `${w} ${px}px ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif`;
    g.fillStyle = col;
    rr(70, 70, 250, 54, 27);
    g.fill();
    g.fillStyle = "#061226";
    g.font = F(800, 28);
    g.textBaseline = "middle";
    g.fillText(KIND_LABEL[a.kind].toUpperCase(), 92, 98);
    g.fillStyle = "#9cf0ff";
    g.font = F(700, 26);
    g.textAlign = "right";
    g.fillText("INCOMING \xB7 BOBO OS", W - 70, 98);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillStyle = "#ffffff";
    g.font = F(800, 64);
    const lines = (text, max, n) => {
      const words = text.split(/\s+/);
      const out = [];
      let line = "";
      for (const w of words) {
        const t = line ? line + " " + w : w;
        if (g.measureText(t).width > max && line) {
          out.push(line);
          line = w;
          if (out.length === n) break;
        } else line = t;
      }
      if (out.length < n && line) out.push(line);
      if (out.length === n && words.join(" ") !== out.join(" "))
        out[n - 1] = this._clip(g, out[n - 1] + " \u2026", max);
      return out;
    };
    const tl = lines(a.title, W - 140, 2);
    tl.forEach((l, i) => g.fillText(l, 70, 210 + i * 72));
    g.fillStyle = "#d4def8";
    g.font = F(600, 36);
    const by = 210 + tl.length * 72 + 10;
    lines(a.body || "", W - 140, 2).forEach((l, i) => g.fillText(l, 70, by + i * 48));
    g.fillStyle = "#36e3ff";
    g.font = F(800, 30);
    g.fillText("Tap to open  \u2192", 70, H - 66);
    this._cardTex.needsUpdate = true;
  }
  _beamAlertOut(a) {
    if (!this._card || !this._room || this._reduceMotion) {
      this.toast(`New alert: ${a.title}`);
      return;
    }
    this._beamAlert = a;
    this._drawCard(a);
    this._beamT = 0;
    this._beamPhase = "out";
    this._card.visible = true;
    this._beam.visible = true;
    this._flash = 1;
    this._burstFizz(this._screenCenter.clone().add(new THREE.Vector3(0, 0, 0.15)));
    this._sfx("beam");
    const act = this._play("Excited", 0.2, true);
    if (act) this._backToSit(act);
    this.prompt(`New alert: ${a.title}`, {
      label: "Read it",
      onClick: () => this.openOS("alerts")
    });
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this._state === "live" && this.prompt(null), 7e3);
  }
  _hideBeam(instant) {
    if (!this._card?.visible) return;
    if (instant) {
      this._card.visible = false;
      this._beam.visible = false;
      this._beamT = -1;
      return;
    }
    if (this._beamPhase !== "in") {
      this._beamPhase = "in";
      this._beamT = 0;
    }
  }
  _updateBeam(dt) {
    if (!this._card || !this._card.visible || this._beamT < 0) return;
    this._beamT += dt;
    this._cardU.uTime.value += dt;
    this._beamU.uTime.value += dt;
    const from = this._screenCenter;
    const to = this._t.v2.set(0.25, 1.6, 2.05);
    let k;
    if (this._beamPhase === "out") {
      k = clamp01(this._beamT / 1);
      if (k >= 1) {
        this._beamPhase = "hold";
        this._beamT = 0;
      }
    } else if (this._beamPhase === "hold") {
      k = 1;
      if (this._beamT > 9) {
        this._beamPhase = "in";
        this._beamT = 0;
      }
    } else {
      k = 1 - clamp01(this._beamT / 0.7);
      if (k <= 0) {
        this._card.visible = false;
        this._beam.visible = false;
        this._beamT = -1;
        return;
      }
    }
    const e = this._beamPhase === "in" ? ease(k) : backOut(k);
    const pos = this._t.v.copy(from).lerp(to, e);
    pos.y += Math.sin(Math.PI * k) * 0.25 + (this._beamPhase === "hold" ? Math.sin(this._time * 1.8) * 0.03 : 0);
    this._card.position.copy(pos);
    this._card.scale.setScalar(Math.max(0.02, Math.min(e, 1.08)));
    const cam = this.opts.getCamera();
    if (cam) {
      const cw = cam.getWorldPosition(new THREE.Vector3());
      this._room.worldToLocal(cw);
      this._card.rotation.set(0, Math.atan2(cw.x - pos.x, cw.z - pos.z), 0);
    }
    this._cardU.uAlpha.value = Math.min(1, k * 1.6);
    const dir = new THREE.Vector3().subVectors(pos, from);
    const len = dir.length();
    const beam = this._beam;
    beam.position.copy(from);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    beam.scale.set(0.9 * e + 0.1, Math.max(1e-3, len), 0.9 * e + 0.1);
    this._beamU.uAlpha.value = this._beamPhase === "hold" ? 0.55 + 0.25 * Math.sin(this._time * 3) : k;
  }
  /* ── fizz burst ───────────────────────────────────────────────────── */
  _setupBurst() {
    const g = new THREE.SphereGeometry(0.025, 10, 8);
    const m = new THREE.MeshBasicMaterial({
      color: 12577535,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    this._geos.push(g);
    this._owned.push(m);
    const b = this._burst = new THREE.InstancedMesh(g, m, 48);
    b.count = 0;
    b.frustumCulled = false;
    b.raycast = () => void 0;
    this._room.add(b);
  }
  _burstFizz(from) {
    this._bubbles.length = 0;
    for (let i = 0; i < 48; i++)
      this._bubbles.push({
        p: from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.1, (Math.random() - 0.5) * 0.15)),
        v: new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          0.5 + Math.random() * 0.8,
          (Math.random() - 0.5) * 0.4
        ),
        life: 1.2 + Math.random() * 0.8,
        s: 0.5 + Math.random()
      });
  }
  _updateBurst(dt) {
    const b = this._burst;
    if (!b) return;
    let n = 0;
    const m = this._t.m;
    for (const p of this._bubbles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.v.y += dt * 0.3;
      p.p.addScaledVector(p.v, dt);
      m.makeScale(p.s, p.s, p.s).setPosition(p.p);
      b.setMatrixAt(n++, m);
    }
    b.count = n;
    b.instanceMatrix.needsUpdate = true;
  }
  /* ── sound ────────────────────────────────────────────────────────── */
  _unlockAudio() {
    if (this._ac) {
      if (this._ac.state === "suspended") this._ac.resume().catch(() => void 0);
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this._ac = new AC();
    } catch {
    }
  }
  _sfx(kind) {
    const ac = this._ac;
    if (!ac || ac.state !== "running") return;
    const t = ac.currentTime;
    const tone = (f, at, d, type = "sine", v = 0.12, f2) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t + at);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + at + d);
      g.gain.setValueAtTime(1e-4, t + at);
      g.gain.exponentialRampToValueAtTime(v, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(1e-4, t + at + d);
      o.connect(g).connect(ac.destination);
      o.start(t + at);
      o.stop(t + at + d + 0.05);
    };
    switch (kind) {
      case "ping":
        tone(988, 0, 0.18, "sine", 0.14);
        tone(1480, 0.09, 0.3, "sine", 0.12);
        break;
      case "beam":
        tone(220, 0, 0.9, "sawtooth", 0.035, 1760);
        tone(1320, 0.5, 0.4, "sine", 0.1);
        tone(1976, 0.62, 0.5, "sine", 0.08);
        break;
      case "boot":
        tone(523, 0, 0.16, "triangle", 0.1);
        tone(784, 0.12, 0.16, "triangle", 0.1);
        tone(1047, 0.24, 0.35, "triangle", 0.1);
        break;
      case "click":
        tone(1400, 0, 0.05, "square", 0.03);
        break;
      case "fizz":
        tone(2400, 0, 0.25, "sawtooth", 0.02, 600);
        break;
      case "unlock":
        tone(660, 0, 0.14, "sine", 0.12);
        tone(880, 0.1, 0.14, "sine", 0.12);
        tone(1320, 0.2, 0.4, "sine", 0.12);
        break;
      case "whoosh":
        tone(120, 0, 1.2, "sawtooth", 0.03, 900);
        break;
      case "mrrp":
        tone(520, 0, 0.18, "triangle", 0.08, 760);
        break;
    }
  }
}
function CSS_escape(s) {
  return s.replace(/["\\\]]/g, "\\$&");
}
export {
  CollectorHub,
  HIDEOUT_VERSION,
  checkCode,
  formatCodeInput
};
