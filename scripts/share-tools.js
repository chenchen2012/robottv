(function () {
  const els = Array.from(document.querySelectorAll("[data-share-x], [data-share-linkedin], [data-share-copy]"));
  if (!els.length) return;

  const getUrl = (el) => el.getAttribute("data-share-url") || window.location.href.split("#")[0];
  const getTitle = (el) => el.getAttribute("data-share-title") || document.title || "robot.tv";

  document.querySelectorAll("[data-share-x]").forEach((el) => {
    const url = getUrl(el);
    const text = getTitle(el);
    const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    el.setAttribute("href", intent);
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener");
  });

  document.querySelectorAll("[data-share-linkedin]").forEach((el) => {
    const url = getUrl(el);
    const intent = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    el.setAttribute("href", intent);
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener");
  });

  document.querySelectorAll("[data-share-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = getUrl(btn);
      const scope = btn.closest("[data-share-scope]") || document;
      const status = scope.querySelector("[data-share-copy-status]");
      try {
        await navigator.clipboard.writeText(url);
        if (status) status.textContent = "Link copied.";
      } catch {
        if (status) status.textContent = "Copy failed. Please copy from the address bar.";
      }
      window.setTimeout(() => {
        if (status) status.textContent = "";
      }, 2200);
    });
  });
})();
