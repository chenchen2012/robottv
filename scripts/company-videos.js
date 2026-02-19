(function () {
  const canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!canHover) return;

  const videoId = (u) => {
    const s = String(u || '');
    return (s.match(/[?&]v=([^&]+)/) || s.match(/youtu\.be\/([^?&]+)/) || [])[1] || '';
  };

  const embedUrl = (u) => {
    const id = videoId(u);
    return id
      ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`
      : '';
  };

  const thumbUrl = (u) => {
    const id = videoId(u);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
  };

  document.querySelectorAll('.js-company-video').forEach((card) => {
    const url = card.dataset.video || '';
    const wrap = card.querySelector('.thumb-wrap');
    const img = wrap ? wrap.querySelector('img') : null;

    if (!wrap || !url) return;
    if (img && !img.getAttribute('src')) img.src = thumbUrl(url);

    const start = () => {
      if (wrap.classList.contains('previewing')) return;
      const src = embedUrl(url);
      if (!src) return;
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = 'Video preview';
      iframe.loading = 'lazy';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      wrap.appendChild(iframe);
      wrap.classList.add('previewing');
    };

    const stop = () => {
      const iframe = wrap.querySelector('iframe');
      if (iframe) iframe.remove();
      wrap.classList.remove('previewing');
    };

    card.addEventListener('mouseenter', start);
    card.addEventListener('mouseleave', stop);
    card.addEventListener('blur', stop);
  });
})();
