(function () {
  var GA_ID = "G-WC8XB1DN1E";
  var LOAD_DELAY_MS = 8000;
  var POST_LOAD_DELAY_MS = 1200;
  var IDLE_TIMEOUT_MS = 12000;

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__robotTvGaLazyInitialized) return;
  window.__robotTvGaLazyInitialized = true;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }

  if (!window.__robotTvGaConfigured) {
    window.__robotTvGaConfigured = true;
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
  }

  var started = false;

  var loadAnalytics = function () {
    if (started) return;
    started = true;

    var script = document.createElement("script");
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    script.async = true;
    document.head.appendChild(script);
  };

  var scheduleDeferredLoad = function () {
    window.setTimeout(function () {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(function () {
          loadAnalytics();
        }, { timeout: IDLE_TIMEOUT_MS });
        return;
      }
      loadAnalytics();
    }, LOAD_DELAY_MS);
  };

  if (document.readyState === "complete") {
    window.setTimeout(scheduleDeferredLoad, POST_LOAD_DELAY_MS);
  } else {
    window.addEventListener("load", function () {
      window.setTimeout(scheduleDeferredLoad, POST_LOAD_DELAY_MS);
    }, { once: true });
  }

  ["pointerdown", "keydown", "touchstart", "scroll"].forEach(function (eventName) {
    window.addEventListener(eventName, loadAnalytics, { once: true, passive: true });
  });
})();
