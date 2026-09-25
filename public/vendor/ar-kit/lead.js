/* ar-kit/lead.js: "Book a call" for the activated-retail pages.
 *
 *   <script defer src="/vendor/ar-kit/lead.js"></script>
 *   ARLead.open({ source: 'tour_end', demo: 'roblox', title?: 'Book a call', intro?: '…' });
 *   ARLead.close();  ARLead.isOpen
 *
 * An accessible modal form (name, work email, company, optional message) that posts urlencoded
 * to /__forms.html as the Netlify form "activated-retail-lead". The form is declared statically in
 * public/__forms.html for Netlify's deploy-time scan: keep the field names in sync with it. Hidden
 * fields carry the demo, the personal-link code and client name (ARTrack.link), the page URL and
 * where the dialog was opened from. Name, email and company are remembered on this device for next
 * time; the message is not. ARTrack events: cta_open {source}, lead_submit {source, company}.
 * Self-contained (injected CSS picks up the page's --accent, --display, --body, --mono), never throws.
 */
(function () {
  "use strict";
  if (window.ARLead) return;

  var FORM = "activated-retail-lead",
    POST_URL = "/__forms.html",
    EMAIL = "hello@medialife.ai",
    STORE = "ml-ar-lead";
  var TITLE = "Book a call";
  var INTRO = "Tell us how to reach you and we’ll find a time to walk through a pilot for your IP.";
  var ui = null,
    cur = null,
    sending = false,
    linkInfo = null;
  var reduce = false;
  try {
    reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  function track(n, p) {
    try {
      if (window.ARTrack) window.ARTrack.event(n, p);
    } catch (e) {}
  }
  function warn(e) {
    try {
      console.warn("ARLead", e);
    } catch (_) {}
  }
  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) {}
    return null;
  }

  var CSS = [
    // accent tokens follow the page's --accent live (the demos re-tint it per featured property)
    ".arl{--arl-accent:var(--accent,#9270ff);--arl-ring:rgba(146,112,255,.3);--arl-soft:#c8b8ff;}",
    "@supports (color:color-mix(in srgb,red,blue)){.arl{--arl-ring:color-mix(in srgb,var(--accent,#9270ff) 32%,transparent);--arl-soft:color-mix(in srgb,var(--accent,#9270ff) 50%,#fff);}}",
    ".arl{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;",
    '  color:#f5f3fb;font:15px/1.5 var(--body,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif);-webkit-font-smoothing:antialiased;}',
    ".arl[hidden]{display:none!important;}",
    ".arl *,.arl *::before,.arl *::after{box-sizing:border-box;}",
    ".arl-scrim{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(12,10,24,.5),rgba(5,4,10,.78));-webkit-backdrop-filter:blur(10px) saturate(130%);backdrop-filter:blur(10px) saturate(130%);opacity:0;transition:opacity .25s ease;}",
    ".arl.is-open .arl-scrim{opacity:1;}",
    ".arl-card{position:relative;width:min(500px,100%);margin:auto;padding:28px 28px 24px;border-radius:26px;",
    "  background:linear-gradient(165deg,rgba(255,255,255,.1),rgba(255,255,255,.03) 45%),rgba(16,13,32,.96);border:1px solid rgba(255,255,255,.14);",
    "  box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 28px 70px rgba(0,0,0,.55);opacity:0;transform:translateY(14px) scale(.985);transition:opacity .25s ease,transform .3s cubic-bezier(.2,.8,.2,1);}",
    ".arl.is-open .arl-card{opacity:1;transform:none;}",
    ".arl-x{position:absolute;top:16px;right:16px;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#fff;",
    "  border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.05));transition:background .2s;}",
    ".arl-x:hover{background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.09));}",
    ".arl-eyebrow{font:500 10.5px/1.3 var(--mono,ui-monospace,Menlo,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--arl-soft);padding-right:48px;}",
    ".arl h2{font:700 24px/1.15 var(--display,inherit);letter-spacing:-.015em;margin:10px 0 8px;padding-right:40px;text-wrap:balance;outline:none;}",
    ".arl-intro{margin:0 0 20px;color:#c9c4dc;font-size:14.5px;}",
    ".arl-client{margin:-10px 0 18px;font-size:13px;color:#b6b1cc;}",
    ".arl-client b{color:#fff;font-weight:600;}",
    ".arl form{display:flex;flex-direction:column;gap:14px;margin:0;}",
    ".arl-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}",
    ".arl-field{display:flex;flex-direction:column;gap:6px;min-width:0;}",
    ".arl label{font:600 13px/1.3 var(--body,inherit);color:#e8e4f6;}",
    ".arl label span{font-weight:500;color:#9994b3;}",
    ".arl input,.arl textarea{width:100%;font:500 16px/1.35 var(--body,inherit);color:#fff;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);outline:none;",
    "  transition:border-color .2s,box-shadow .2s,background .2s;-webkit-appearance:none;appearance:none;}",
    ".arl textarea{resize:vertical;min-height:84px;max-height:40vh;}",
    ".arl input::placeholder,.arl textarea::placeholder{color:#8c87a6;}",
    ".arl input:focus,.arl textarea:focus{border-color:var(--arl-accent);box-shadow:0 0 0 3px var(--arl-ring);background:rgba(255,255,255,.08);}",
    '.arl [aria-invalid="true"]{border-color:#ff8fa3;}',
    '.arl [aria-invalid="true"]:focus{box-shadow:0 0 0 3px rgba(255,143,163,.28);}',
    ".arl-err{margin:0;font-size:12.5px;line-height:1.35;color:#ffa3b3;}",
    ".arl-err:empty{display:none;}",
    ".arl-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden;}",
    ".arl-status{margin:0;font-size:13.5px;color:#ffa3b3;}",
    ".arl-status:empty{display:none;}",
    ".arl a{color:var(--arl-soft);text-underline-offset:3px;}",
    ".arl-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:4px;}",
    ".arl-go{position:relative;border:0;border-radius:999px;min-height:50px;padding:0 26px;font:700 15px/1 var(--body,inherit);cursor:pointer;color:#0b0a12;display:inline-flex;align-items:center;justify-content:center;gap:9px;",
    "  background:linear-gradient(180deg,rgba(255,255,255,.4) 0%,rgba(255,255,255,.08) 48%,rgba(255,255,255,0) 52%),var(--arl-accent);",
    "  box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 6px 22px var(--arl-ring),0 1px 2px rgba(0,0,0,.25);transition:transform .18s,filter .2s,opacity .2s;}",
    ".arl-go:hover{filter:brightness(1.07);}",
    ".arl-go:active{transform:scale(.97);}",
    ".arl-go[disabled]{opacity:.7;cursor:progress;}",
    '.arl-go[aria-busy="true"]::before{content:"";width:15px;height:15px;border-radius:50%;border:2px solid rgba(11,10,18,.3);border-top-color:#0b0a12;animation:arlSpin .7s linear infinite;}',
    "@keyframes arlSpin{to{transform:rotate(360deg);}}",
    ".arl-alt{margin:0;font-size:13px;color:#9994b3;}",
    ".arl-fine{margin:6px 0 0;font-size:12px;color:#8c87a6;}",
    ".arl :focus-visible{outline:2px solid #fff;outline-offset:2px;}",
    ".arl input:focus-visible,.arl textarea:focus-visible{outline:none;}",
    ".arl-done{text-align:center;padding:10px 4px 2px;}",
    ".arl-done h2{padding:0;margin-top:14px;}",
    ".arl-done p{margin:0 auto 22px;max-width:36ch;color:#c9c4dc;}",
    ".arl-check{width:68px;height:68px;margin:6px auto 0;border-radius:50%;display:grid;place-items:center;background:rgba(60,239,177,.12);box-shadow:inset 0 0 0 2px rgba(60,239,177,.45),0 0 30px rgba(60,239,177,.25);}",
    ".arl-check svg{width:32px;height:32px;fill:none;stroke:#3cefb1;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;}",
    ".arl-done .arl-go{min-width:160px;}",
    "html.arl-lock,html.arl-lock body{overflow:hidden;}",
    "@media (max-width:540px){",
    "  .arl{padding-left:max(12px,env(safe-area-inset-left,0px));padding-right:max(12px,env(safe-area-inset-right,0px));padding-bottom:max(12px,env(safe-area-inset-bottom,0px));}",
    "  .arl-card{margin:auto 0 0;padding:22px 18px 18px;border-radius:24px;}",
    "  .arl h2{font-size:21px;}",
    "  .arl-intro{font-size:14px;margin-bottom:16px;}",
    "  .arl-row{grid-template-columns:1fr;}",
    "  .arl form{gap:12px;}",
    "  .arl-go{width:100%;}",
    "  .arl-actions{flex-direction:column;align-items:stretch;gap:10px;}",
    "  .arl-alt{text-align:center;}",
    "}",
    "@media (max-height:640px){.arl textarea{min-height:64px;}}",
    "@media (prefers-reduced-motion:reduce){.arl-scrim,.arl-card{transition:none;} .arl-card{transform:none;}}",
  ].join("\n");

  var X =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function build() {
    if (ui) return ui;
    var st = document.createElement("style");
    st.id = "ar-lead-css";
    st.textContent = CSS;
    document.head.appendChild(st);
    var root = document.createElement("div");
    root.className = "arl";
    root.id = "arLead";
    root.hidden = true;
    root.innerHTML =
      '<div class="arl-scrim" data-close></div>' +
      '<div class="arl-card" role="dialog" aria-modal="true" aria-labelledby="arlTitle" aria-describedby="arlIntro">' +
      '<button type="button" class="arl-x" data-close aria-label="Close">' +
      X +
      "</button>" +
      '<div class="arl-view" data-v="form">' +
      '<div class="arl-eyebrow">MEDIALIFE® · Activated retail</div>' +
      '<h2 id="arlTitle" tabindex="-1"></h2>' +
      '<p class="arl-intro" id="arlIntro"></p>' +
      '<p class="arl-client" hidden>Prepared for <b></b></p>' +
      '<form name="' +
      FORM +
      '" method="post" action="' +
      POST_URL +
      '" novalidate>' +
      '<input type="hidden" name="form-name" value="' +
      FORM +
      '">' +
      '<input type="hidden" name="demo"><input type="hidden" name="link"><input type="hidden" name="client"><input type="hidden" name="page"><input type="hidden" name="source">' +
      '<p class="arl-hp" aria-hidden="true"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>' +
      '<div class="arl-field"><label for="arlName">Name</label>' +
      '<input id="arlName" name="contact-name" type="text" autocomplete="name" autocapitalize="words" enterkeyhint="next" maxlength="120" required aria-describedby="arlNameErr">' +
      '<p class="arl-err" id="arlNameErr"></p></div>' +
      '<div class="arl-row">' +
      '<div class="arl-field"><label for="arlEmail">Work email</label>' +
      '<input id="arlEmail" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="200" required aria-describedby="arlEmailErr">' +
      '<p class="arl-err" id="arlEmailErr"></p></div>' +
      '<div class="arl-field"><label for="arlCompany">Company</label>' +
      '<input id="arlCompany" name="company" type="text" autocomplete="organization" enterkeyhint="next" maxlength="120" required aria-describedby="arlCompanyErr">' +
      '<p class="arl-err" id="arlCompanyErr"></p></div>' +
      "</div>" +
      '<div class="arl-field"><label for="arlNotes">Message <span>(optional)</span></label>' +
      '<textarea id="arlNotes" name="notes" rows="3" maxlength="2000" placeholder="Which IP, launch or stores are you thinking about?"></textarea></div>' +
      '<p class="arl-status" role="alert"></p>' +
      '<div class="arl-actions"><button type="submit" class="arl-go">Request a call</button>' +
      '<p class="arl-alt">Or email <a href="mailto:' +
      EMAIL +
      '">' +
      EMAIL +
      "</a></p></div>" +
      '<p class="arl-fine">We only use these details to reply to you.</p>' +
      "</form>" +
      "</div>" +
      '<div class="arl-view arl-done" data-v="done" hidden>' +
      '<div class="arl-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
      '<h2 id="arlDoneTitle" tabindex="-1">Thanks, we’ll be in touch</h2>' +
      '<p id="arlDoneText">We’ll reply within one business day to find a time. Prefer email? Write to <a href="mailto:' +
      EMAIL +
      '">' +
      EMAIL +
      "</a>.</p>" +
      '<button type="button" class="arl-go" data-close>Done</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(root);
    var q = function (s) {
      return root.querySelector(s);
    };
    ui = {
      root: root,
      card: q(".arl-card"),
      form: q("form"),
      title: q("#arlTitle"),
      intro: q("#arlIntro"),
      client: q(".arl-client"),
      status: q(".arl-status"),
      go: q(".arl-go"),
      vForm: q('[data-v="form"]'),
      vDone: q('[data-v="done"]'),
      doneTitle: q("#arlDoneTitle"),
      name: q("#arlName"),
      email: q("#arlEmail"),
      company: q("#arlCompany"),
      notes: q("#arlNotes"),
      hp: q('[name="bot-field"]'),
    };
    root.addEventListener("click", function (e) {
      try {
        if (e.target.closest && e.target.closest("[data-close]")) close();
      } catch (err) {
        warn(err);
      }
    });
    ui.form.addEventListener("submit", function (e) {
      e.preventDefault();
      submit();
    });
    // after a first attempt, errors clear as they are fixed
    [ui.name, ui.email, ui.company].forEach(function (el) {
      el.addEventListener("input", function () {
        if (el.getAttribute("aria-invalid") === "true") check(el);
      });
      el.addEventListener("blur", function () {
        if (ui.form.dataset.tried) check(el);
      });
    });
    return ui;
  }

  // ---- validation ----
  var EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  function problem(el) {
    var v = el.value.trim();
    if (el === ui.name) return v ? "" : "Enter your name.";
    if (el === ui.company) return v ? "" : "Enter your company.";
    if (el === ui.email)
      return !v
        ? "Enter your email address."
        : EMAIL_RE.test(v)
          ? ""
          : "Enter a valid email address, like name@company.com.";
    return "";
  }
  function check(el) {
    var msg = problem(el),
      err = document.getElementById(el.getAttribute("aria-describedby"));
    if (err) err.textContent = msg;
    if (msg) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
    return !msg;
  }

  // ---- focus ----
  function focusables() {
    var list = ui.card.querySelectorAll(
      'button:not([disabled]), input:not([type="hidden"]):not([tabindex="-1"]), textarea, a[href], [tabindex]:not([tabindex="-1"])',
    );
    return Array.prototype.filter.call(list, function (el) {
      return el.getClientRects().length > 0 && !el.closest("[hidden]");
    });
  }
  function visible(el) {
    try {
      return !!(
        el &&
        el !== document.body &&
        el.isConnected &&
        el.getClientRects().length &&
        (typeof el.checkVisibility !== "function" ||
          el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
      );
    } catch (e) {
      return false;
    }
  }
  addEventListener(
    "keydown",
    function (e) {
      try {
        if (!cur) return;
        if (e.key === "Escape" || e.key === "Esc") {
          e.preventDefault();
          e.stopImmediatePropagation();
          close();
          return;
        }
        if (e.key === "Tab") {
          var f = focusables();
          if (!f.length) return;
          var i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) {
            e.preventDefault();
            f[f.length - 1].focus();
          } else if (!e.shiftKey && (i === -1 || i === f.length - 1)) {
            e.preventDefault();
            f[0].focus();
          }
        }
        // typing in the form never drives the page underneath (shortcuts, walk keys…)
        e.stopPropagation();
      } catch (err) {
        warn(err);
      }
    },
    true,
  );
  addEventListener(
    "keyup",
    function (e) {
      if (cur && e.key !== "Escape") e.stopPropagation();
    },
    true,
  );

  // ---- open / close ----
  function view(v) {
    ui.vForm.hidden = v !== "form";
    ui.vDone.hidden = v !== "done";
    ui.card.setAttribute("aria-labelledby", v === "done" ? "arlDoneTitle" : "arlTitle");
    ui.card.setAttribute("aria-describedby", v === "done" ? "arlDoneText" : "arlIntro");
  }
  function remembered() {
    try {
      var o = JSON.parse(ls(STORE) || "null");
      return o && typeof o === "object" ? o : {};
    } catch (e) {
      return {};
    }
  }
  function greet(l) {
    linkInfo = l || null;
    var name = l && l.name ? String(l.name).slice(0, 80) : "";
    if (!ui) return;
    ui.client.hidden = !name;
    ui.client.querySelector("b").textContent = name;
  }
  function open(opts) {
    try {
      opts = opts || {};
      build();
      var source = String(opts.source || "unknown").slice(0, 40),
        demo = String(opts.demo || "").slice(0, 64);
      if (cur) {
        cur.source = source;
        cur.demo = demo;
        return;
      }
      cur = { source: source, demo: demo, opener: document.activeElement };
      ui.title.textContent = opts.title || TITLE;
      ui.intro.textContent = opts.intro || INTRO;
      ui.status.textContent = "";
      view("form");
      var r = remembered();
      [
        ["name", ui.name],
        ["email", ui.email],
        ["company", ui.company],
      ].forEach(function (p) {
        if (!p[1].value && typeof r[p[0]] === "string") p[1].value = r[p[0]].slice(0, 200);
      });
      greet(linkInfo);
      try {
        if (window.ARTrack && window.ARTrack.link && window.ARTrack.link.then)
          window.ARTrack.link.then(greet, function () {});
      } catch (e) {}
      ui.root.hidden = false;
      document.documentElement.classList.add("arl-lock");
      void ui.root.offsetWidth;
      ui.root.classList.add("is-open");
      // focus moves into the dialog: the first field still to fill in, or on touch screens the
      // heading, so the on-screen keyboard doesn't cover the dialog before it has been read
      var coarse = false;
      try {
        coarse = matchMedia("(pointer: coarse)").matches;
      } catch (e) {}
      var first = coarse
        ? ui.title
        : [ui.name, ui.email, ui.company].filter(function (el) {
            return !el.value.trim();
          })[0] || ui.notes;
      try {
        first.focus({ preventScroll: true });
      } catch (e) {}
      track("cta_open", { source: source });
    } catch (e) {
      warn(e);
    }
  }
  function close() {
    try {
      if (!cur) return;
      var c = cur;
      cur = null;
      ui.root.classList.remove("is-open");
      document.documentElement.classList.remove("arl-lock");
      setTimeout(
        function () {
          if (!cur) ui.root.hidden = true;
        },
        reduce ? 0 : 260,
      );
      if (visible(c.opener)) c.opener.focus({ preventScroll: true });
      else if (document.activeElement && ui.root.contains(document.activeElement))
        document.activeElement.blur();
    } catch (e) {
      warn(e);
    }
  }

  // ---- submit ----
  function setBusy(on) {
    sending = on;
    ui.go.disabled = on;
    ui.go.setAttribute("aria-busy", on ? "true" : "false");
    ui.go.textContent = on ? "Sending…" : "Request a call";
  }
  function fail() {
    ui.status.innerHTML = "";
    ui.status.appendChild(
      document.createTextNode("We couldn’t send your request. Try again, or email "),
    );
    var a = document.createElement("a");
    a.href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent("Activated retail: book a call");
    a.textContent = EMAIL;
    ui.status.appendChild(a);
    ui.status.appendChild(document.createTextNode("."));
  }
  function done(c) {
    try {
      ls(
        STORE,
        JSON.stringify({
          name: ui.name.value.trim(),
          email: ui.email.value.trim(),
          company: ui.company.value.trim(),
        }),
      );
    } catch (e) {}
    ui.notes.value = "";
    delete ui.form.dataset.tried;
    var first = ui.name.value.trim().split(/\s+/)[0];
    ui.doneTitle.textContent = first
      ? "Thanks, " + first + ". We’ll be in touch"
      : "Thanks, we’ll be in touch";
    // the thank-you only shows if the dialog is still open; an unsent draft is kept, a sent one is not
    if (cur !== c) return;
    view("done");
    setTimeout(function () {
      try {
        if (cur === c) ui.doneTitle.focus({ preventScroll: true });
      } catch (e) {}
    }, 30);
  }
  function submit() {
    try {
      if (!cur || sending) return;
      var c = cur;
      ui.form.dataset.tried = "1";
      ui.status.textContent = "";
      var bad = [ui.name, ui.email, ui.company].filter(function (el) {
        return !check(el);
      });
      if (bad.length) {
        bad[0].focus();
        return;
      }
      var company = ui.company.value.trim().slice(0, 120);
      // a filled honeypot is a bot: act as if it worked and send nothing
      if (ui.hp.value) {
        done(c);
        return;
      }
      var set = function (n, v) {
        var el = ui.form.querySelector('input[type="hidden"][name="' + n + '"]');
        if (el) el.value = v == null ? "" : String(v);
      };
      set("demo", c.demo);
      set("source", c.source);
      set("link", linkInfo && linkInfo.code ? linkInfo.code : "");
      set("client", linkInfo && linkInfo.name ? linkInfo.name : "");
      set("page", location.origin + location.pathname + location.search);
      var body = new URLSearchParams();
      Array.prototype.forEach.call(ui.form.elements, function (el) {
        if (el.name) body.append(el.name, el.name === "bot-field" ? "" : String(el.value).trim());
      });
      setBusy(true);
      var ctl = typeof AbortController === "function" ? new AbortController() : null;
      var t = setTimeout(function () {
        try {
          if (ctl) ctl.abort();
        } catch (e) {}
      }, 15000);
      fetch(POST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: ctl ? ctl.signal : undefined,
      })
        .then(function (res) {
          clearTimeout(t);
          setBusy(false);
          if (!res.ok) throw new Error("status " + res.status);
          track("lead_submit", { source: c.source, company: company });
          done(c);
        })
        .catch(function (err) {
          clearTimeout(t);
          setBusy(false);
          warn(err);
          if (cur === c) fail();
        });
    } catch (e) {
      setBusy(false);
      warn(e);
      fail();
    }
  }

  window.ARLead = {
    open: open,
    close: close,
    get isOpen() {
      return !!cur;
    },
  };
})();
