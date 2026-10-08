/* Masti overlay: deterministic sprite stepping for rendered video.
 *
 * Two ways to drive it, and they must not be mixed in one render:
 *
 *   1. Frame-stepping renderers (screenshot per tick): call
 *        MastiOverlay.seek(ms)
 *      before each capture. The frame shown is floor(ms / delay) mod frames,
 *      so the same timeline always yields the same pixels.
 *
 *   2. Real-time capture (page.video, screen recording): call
 *        MastiOverlay.play()
 *      once, and it advances on requestAnimationFrame from performance.now().
 *
 * Elements: every [data-masti] with data-frames / data-frame-w / data-frame-h /
 * data-delay (from sprites/<mood>.json) and data-height (the rendered height
 * in px). Optional data-start (ms) offsets that element's timeline, so two
 * Mastis do not step in lock-step.
 */
(function (global) {
  "use strict";

  function nodes() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-masti]"));
  }

  function layout(el) {
    var frames = +el.getAttribute("data-frames") || 1;
    var fw = +el.getAttribute("data-frame-w") || 300;
    var fh = +el.getAttribute("data-frame-h") || 375;
    var h = +el.getAttribute("data-height") || fh;
    var scale = h / fh;
    el.style.width = Math.round(fw * scale) + "px";
    el.style.height = Math.round(fh * scale) + "px";
    el.style.backgroundSize = Math.round(fw * frames * scale) + "px " + Math.round(fh * scale) + "px";
    el.classList.add("masti", "masti--" + el.getAttribute("data-masti"));
    return { frames: frames, fw: fw, scale: scale, delay: +el.getAttribute("data-delay") || 50 };
  }

  function setFrame(el, frame) {
    var l = el.__masti || (el.__masti = layout(el));
    var f = ((frame % l.frames) + l.frames) % l.frames;
    el.style.backgroundPosition = -Math.round(f * l.fw * l.scale) + "px 0";
    el.setAttribute("data-frame", String(f));
  }

  function seek(ms) {
    nodes().forEach(function (el) {
      var l = el.__masti || (el.__masti = layout(el));
      var start = +el.getAttribute("data-start") || 0;
      var t = Math.max(0, ms - start);
      setFrame(el, Math.floor(t / l.delay));
    });
  }

  var raf = null;
  var t0 = 0;
  function play() {
    if (raf !== null) return;
    t0 = performance.now();
    var tick = function (now) {
      seek(now - t0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  }

  /** Swap an element's mood mid-timeline (countdown → reveal). Frame 0 next seek. */
  function setMood(el, mood, info) {
    el.classList.remove("masti--" + el.getAttribute("data-masti"));
    el.setAttribute("data-masti", mood);
    if (info) {
      el.setAttribute("data-frames", info.frames);
      el.setAttribute("data-frame-w", info.frameWidth);
      el.setAttribute("data-frame-h", info.frameHeight);
      el.setAttribute("data-delay", info.delayMs);
    }
    el.__masti = null;
    setFrame(el, 0);
  }

  // Frame zero is on screen before any script runs: the board rule applies
  // to Masti too, so lay everything out immediately and show frame 0.
  function init() {
    nodes().forEach(function (el) { setFrame(el, 0); });
    nodes().forEach(function (el) {
      if (el.hasAttribute("data-autoplay")) play();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  global.MastiOverlay = { seek: seek, play: play, pause: pause, setFrame: setFrame, setMood: setMood, init: init };
})(window);
