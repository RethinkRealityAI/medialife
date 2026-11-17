// Bobo's Arcade: round "Back to Bobo's Hub" home button (icon only, 40px + 4px touch slop, so it clears the centred logos) on every EVADE experience opened from BOBO OS.
// Shows only when the page was opened from the hub (?from=hub), and stays for the rest of the tab's visit
// (sessionStorage) so a reload or an in-page link keeps it. Include with:
//   <script src="/evade/arcade/back.js" defer></script>
(() => {
  const KEY = "evade-from-hub";
  const HUB = "/evade/cola-run/?mode=arcade";
  let on = new URLSearchParams(location.search).get("from") === "hub";
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else on = sessionStorage.getItem(KEY) === "1";
  } catch {
    /* private mode: query string only */
  }
  if (!on) return;
  const css = document.createElement("style");
  css.textContent = `
  .evade-hub-back{position:fixed;z-index:2147483000;left:calc(env(safe-area-inset-left,0px) + 10px);top:calc(env(safe-area-inset-top,0px) + 10px);
    display:grid;place-items:center;width:40px;height:40px;min-height:0;padding:0;margin:0;border-radius:50%;border:1px solid rgba(255,255,255,.22);
    background:rgba(16,18,21,.78);color:#fff;font:700 13px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;
    -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);-webkit-tap-highlight-color:transparent}
  .evade-hub-back svg{width:20px;height:20px}
  .evade-hub-back::after{content:"";position:absolute;inset:-4px}
  .evade-hub-back:focus-visible{outline:3px solid #fff;outline-offset:2px}`;
  document.head.appendChild(css);
  const b = document.createElement("button");
  b.type = "button";
  b.className = "evade-hub-back";
  b.setAttribute("aria-label", "Back to Bobo's Hub");
  b.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>';
  b.title = "Back to Bobo's Hub";
  b.addEventListener("click", () => location.assign(HUB));
  const add = () => document.body.appendChild(b);
  if (document.body) add();
  else addEventListener("DOMContentLoaded", add, { once: true });
})();
