(() => {
  const SANITY_PROJECT_ID = "lumv116w";
  const SANITY_DATASET = "production";
  const SANITY_URL = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2023-10-01/data/query/${SANITY_DATASET}`;
  const QUERY = '*[_type=="post" && defined(youtubeUrl)] | order(publishedAt desc)[0...10]{title,excerpt,youtubeUrl,"slug":slug.current,publishedAt}';

  const toPostUrl = (slug) => slug ? `https://news.robot.tv/post/${slug}` : "https://news.robot.tv/";

  const videoIdFromUrl = (url) => {
    const text = String(url || "");
    return (
      (text.match(/[?&]v=([^&]+)/) || [])[1] ||
      (text.match(/youtu\.be\/([^?&]+)/) || [])[1] ||
      ""
    );
  };

  const toPlaylistEmbedUrl = (ids) => {
    const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!cleanIds.length) return "";
    const first = cleanIds[0];
    const playlist = cleanIds.join(",");
    return `https://www.youtube.com/embed/${first}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=${playlist}`;
  };

  const queuedPlayers = [];

  const ensureYouTubeApi = () => {
    if (window.YT && window.YT.Player) {
      initQueuedPlayers();
      return;
    }
    if (!document.querySelector('script[data-youtube-iframe-api="1"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.dataset.youtubeIframeApi = "1";
      document.head.appendChild(tag);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      initQueuedPlayers();
    };
  };

  const queuePlayer = (selector, ids) => {
    const frame = document.querySelector(selector);
    if (!frame || !ids.length) return;
    if (!frame.id) frame.id = `robot-tv-live-${selector.replace(/[^a-z0-9]/gi, "")}`;
    queuedPlayers.push({ id: frame.id, ids });
  };

  const initQueuedPlayers = () => {
    if (!(window.YT && window.YT.Player)) return;
    queuedPlayers.forEach(({ id, ids }) => {
      const frame = document.getElementById(id);
      if (!frame || frame.dataset.playerReady === "1") return;
      frame.dataset.playerReady = "1";
      const first = ids[0];
      const playlist = ids.join(",");
      frame.src = `https://www.youtube.com/embed/${first}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&playlist=${playlist}`;

      const player = new window.YT.Player(id, {
        events: {
          onReady: (event) => {
            try {
              event.target.mute();
              event.target.loadPlaylist(ids, 0, 0, "default");
              event.target.playVideo();
            } catch (_) {}
          },
          onStateChange: (event) => {
            if (event.data !== window.YT.PlayerState.ENDED) return;
            try {
              const list = event.target.getPlaylist() || ids;
              const idx = Number(event.target.getPlaylistIndex() || 0);
              if (idx >= list.length - 1) {
                event.target.playVideoAt(0);
              } else {
                event.target.nextVideo();
              }
            } catch (_) {}
          }
        }
      });
      void player;
    });
  };

  const setFrame = (selector, src, title) => {
    const frame = document.querySelector(selector);
    if (!frame || !src) return;
    frame.src = src;
    if (title) frame.title = title;
  };

  const setText = (selector, text) => {
    const el = document.querySelector(selector);
    if (!el || !text) return;
    el.textContent = text;
  };

  const setLink = (selector, href, text) => {
    const link = document.querySelector(selector);
    if (!link || !href) return;
    link.href = href;
    if (text) link.textContent = text;
  };

  const setNextUp = (items) => {
    const list = document.querySelector("[data-live-next-up]");
    if (!list) return;
    const picks = items.slice(1, 4);
    if (!picks.length) {
      list.innerHTML = '<li><a href="https://news.robot.tv/">Open latest robotics briefings</a></li>';
      return;
    }
    list.innerHTML = picks.map((item) => {
      const title = String(item.title || "Latest robotics update");
      const href = toPostUrl(item.slug);
      return `<li><a href="${href}">${title}</a></li>`;
    }).join("");
  };

  const hydrate = (items) => {
    if (!items.length) {
      setText("[data-live-spotlight-title]", "Robot.tv Live Feed");
      setText("[data-live-spotlight-desc]", "No newsroom video is available yet. Check back shortly.");
      setText("[data-live-main-title]", "robot.tv Live Feed");
      setText("[data-live-main-sub]", "No newsroom video is available yet. Check back shortly.");
      setLink("[data-live-source-link]", "https://news.robot.tv/", "news.robot.tv");
      setLink("[data-live-main-source-link]", "https://news.robot.tv/", "news.robot.tv");
      setNextUp([]);
      return;
    }

    const ids = items.map((item) => videoIdFromUrl(item.youtubeUrl)).filter(Boolean);
    const embed = toPlaylistEmbedUrl(ids);
    const primary = items[0];
    const headline = primary.title || "Robot.tv Live Feed";
    const sourceHref = primary.slug ? toPostUrl(primary.slug) : "https://news.robot.tv/";
    const sourceText = primary.slug ? "Latest video from news.robot.tv" : "news.robot.tv";

    setFrame("[data-live-preview-frame]", embed, `${headline} live preview`);
    setFrame("[data-live-main-frame]", embed, `${headline} livestream`);
    queuePlayer("[data-live-preview-frame]", ids);
    queuePlayer("[data-live-main-frame]", ids);
    ensureYouTubeApi();
    setText("[data-live-spotlight-title]", headline);
    setText("[data-live-spotlight-desc]", "Playing the robot.tv newsroom feed.");
    setLink("[data-live-source-link]", sourceHref, sourceText);
    setText("[data-live-main-title]", "robot.tv Live Feed");
    setText("[data-live-main-sub]", "This feed rotates through the latest YouTube videos published in the robot.tv newsroom.");
    setLink("[data-live-main-source-link]", sourceHref, sourceText);
    setNextUp(items);
  };

  fetch(`${SANITY_URL}?query=${encodeURIComponent(QUERY)}`)
    .then((r) => r.json())
    .then((d) => {
      const rows = Array.isArray(d?.result) ? d.result : [];
      const withVideo = rows.filter((item) => videoIdFromUrl(item?.youtubeUrl));
      hydrate(withVideo);
    })
    .catch(() => hydrate([]));
})();
