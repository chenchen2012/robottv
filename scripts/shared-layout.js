(function () {
  const includes = Array.from(document.querySelectorAll('[data-include]'));
  if (!includes.length) {
    window.dispatchEvent(new Event('robotTvLayoutReady'));
    return;
  }

  const loadOne = async (el) => {
    const key = el.getAttribute('data-include');
    if (!key) return;
    const url = key === 'site-header' ? '/partials/header.html' : key === 'site-footer' ? '/partials/footer.html' : '';
    if (!url) return;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(String(res.status));
      el.innerHTML = await res.text();
    } catch (err) {
      console.error('Layout include failed for', key, err);
      el.remove();
    }
  };

  Promise.all(includes.map(loadOne)).finally(() => {
    window.dispatchEvent(new Event('robotTvLayoutReady'));
  });
})();
