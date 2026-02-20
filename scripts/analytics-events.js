(function () {
  const hasGtag = function () {
    return typeof window !== "undefined" && typeof window.gtag === "function";
  };

  const sendEvent = function (eventName, payload) {
    if (!hasGtag()) return;
    window.gtag("event", eventName, payload || {});
  };

  document.addEventListener("click", function (event) {
    const target = event.target.closest("[data-analytics-click]");
    if (!target) return;

    const label = target.getAttribute("data-analytics-click") || "unknown";
    const location = target.getAttribute("data-analytics-location") || "unknown";
    const destination = target.getAttribute("href") || "";

    sendEvent("robot_tv_cta_click", {
      cta_label: label,
      cta_location: location,
      destination: destination
    });
  });

  document.addEventListener("submit", function (event) {
    const form = event.target.closest("form[data-analytics-submit]");
    if (!form) return;

    const label = form.getAttribute("data-analytics-submit") || "form_submit";
    const location = form.getAttribute("data-analytics-location") || "unknown";

    sendEvent("robot_tv_form_submit", {
      form_label: label,
      form_location: location
    });
  });
})();
