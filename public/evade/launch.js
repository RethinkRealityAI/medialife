// EVADE launch page extras: the framed globe and the Bobo's Hideout panels.
(function () {
  // Touch screens: the globe sits under a cover until it's tapped, so a swipe
  // scrolls the page. The cover comes back once the globe leaves the screen.
  var ge = document.getElementById("globeEmbed");
  var cover = document.getElementById("geCover");
  if (ge && cover) {
    cover.addEventListener("click", function () {
      ge.classList.add("is-live");
      var f = ge.querySelector("iframe");
      if (f) f.focus();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) ge.classList.remove("is-live");
      }).observe(ge);
    }
  }

  // The hideout panels lean towards the pointer (desktop, motion allowed).
  var stage = document.getElementById("hideoutStage");
  if (!stage) return;
  if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var raf = 0, mx = 0, my = 0;
  window.addEventListener("pointermove", function (e) {
    var r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    mx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
    my = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
    if (!raf) raf = requestAnimationFrame(function () {
      raf = 0;
      stage.style.setProperty("--mx", mx.toFixed(3));
      stage.style.setProperty("--my", my.toFixed(3));
    });
  }, { passive: true });
})();
