(function () {
  const canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const videoId = (u) => {
    const s = String(u || '');
    return (s.match(/[?&]v=([^&]+)/) || s.match(/youtu\.be\/([^?&]+)/) || [])[1] || '';
  };

  const embedUrl = (u) => {
    const id = videoId(u);
    return id
      ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&controls=0&rel=0&modestbranding=1&loop=1&playlist=${id}&iv_load_policy=3`
      : '';
  };

  const thumbUrl = (u) => {
    const id = videoId(u);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
  };

  const ensureModal = () => {
    let modal = document.getElementById('video-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'video-modal';
    modal.className = 'video-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="video-modal-backdrop" data-close="1"></div>
      <div class="video-modal-panel" role="dialog" aria-modal="true" aria-label="Company video">
        <button id="video-close" class="video-close" type="button" aria-label="Close video">Close</button>
        <div class="video-frame-wrap">
          <iframe
            id="video-frame"
            src=""
            title="Company video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen>
          </iframe>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  };

  const openModalVideo = (url) => {
    const modal = ensureModal();
    const frame = document.getElementById('video-frame');
    const src = embedUrl(url);
    if (!frame || !src) return;
    frame.src = src;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  const closeModalVideo = () => {
    const modal = document.getElementById('video-modal');
    const frame = document.getElementById('video-frame');
    if (!modal || !frame) return;
    modal.hidden = true;
    frame.src = '';
    document.body.style.overflow = '';
  };

  document.addEventListener('click', (event) => {
    const closeTarget = event.target.closest('[data-close="1"], #video-close');
    if (!closeTarget) return;
    closeModalVideo();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModalVideo();
  });

  const previewCards = [];
  const HOVER_DELAY_MS = 120;

  document.querySelectorAll('.js-company-video').forEach((card) => {
    const url = card.dataset.video || '';
    const wrap = card.querySelector('.thumb-wrap');
    const img = wrap ? wrap.querySelector('img') : null;
    let hoverTimer = null;

    if (!wrap || !url) return;
    if (img && !img.getAttribute('src')) img.src = thumbUrl(url);
    if (!wrap.querySelector('.preview-chip')) {
      const chip = document.createElement('span');
      chip.className = 'preview-chip';
      chip.textContent = 'Hover Preview';
      wrap.appendChild(chip);
    }

    const start = () => {
      if (wrap.querySelector('iframe')) return;
      const src = embedUrl(url);
      if (!src) return;
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = 'Video preview';
      iframe.loading = 'lazy';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.setAttribute('tabindex', '-1');
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      wrap.appendChild(iframe);
      // Make preview visible immediately; some browsers/extensions delay or block iframe load events.
      wrap.classList.add('preview-ready');
    };

    const stop = () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      const iframe = wrap.querySelector('iframe');
      if (iframe) iframe.remove();
      wrap.classList.remove('preview-ready');
    };

    if (canHover) {
      card.addEventListener('mouseenter', () => {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          hoverTimer = null;
          start();
        }, HOVER_DELAY_MS);
      });
      card.addEventListener('mouseleave', stop);
      card.addEventListener('blur', stop);
    }

    if (card.classList.contains('js-company-modal')) {
      card.addEventListener('click', (event) => {
        event.preventDefault();
        openModalVideo(url);
      });
    }

    previewCards.push({ stop });
  });

  if (canHover) {
    window.addEventListener('scroll', () => {
      previewCards.forEach((c) => c.stop());
    }, { passive: true });
  }
})();
