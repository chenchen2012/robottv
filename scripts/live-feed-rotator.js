(() => {
  const SANITY_PROJECT_ID = "lumv116w";
  const SANITY_DATASET = "production";
  const SANITY_URL = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2023-10-01/data/query/${SANITY_DATASET}`;
  const QUERY = '*[_type=="post" && defined(youtubeUrl)] | order(publishedAt desc)[0...18]{title,excerpt,youtubeUrl,"slug":slug.current,publishedAt}';
  const REMOVED_VIDEO_IDS = new Set([
    "qhxDNu1OGf4",
  ]);
  const LIVE_PRIORITY_VIDEO_IDS = [
    "2zCh_6GO49c",
    "s4SmxpIO2qk",
    "b8BDUa-xbyA",
    "sa2qSF9f9Ks",
    "XGcfdbOu_uc",
  ];
  const PINNED_LIVE_ITEMS = [
    {
      title: "Toyota Motor Manufacturing Canada to deploy Agility Robotics Digit humanoids",
      excerpt:
        "A practical warehouse deployment story stays at the front of the live room so the feed opens on a reliable robotics video instead of an unstable latest upload.",
      youtubeUrl: "https://www.youtube.com/watch?v=2zCh_6GO49c",
      slug: "toyota-motor-manufacturing-canada-to-deploy-agility-robotics-digit-humanoids",
      publishedAt: "2026-03-07T08:30:00.000Z",
    },
    {
      title: "Why China’s humanoid robot industry is winning the early market",
      excerpt:
        "This analysis remains near the front of the live sequence because it is current, high-signal, and already proven to load cleanly.",
      youtubeUrl: "https://www.youtube.com/watch?v=s4SmxpIO2qk",
      slug: "why-chinas-humanoid-robot-industry-is-winning-the-early-market",
      publishedAt: "2026-03-02T12:54:50.780Z",
    },
    {
      title: "6 lessons I learned watching a robotics startup die from the inside",
      excerpt:
        "An evergreen operator-focused story gives the live room another known-good video before it falls back to the latest newsroom uploads.",
      youtubeUrl: "https://www.youtube.com/watch?v=b8BDUa-xbyA",
      slug: "6-lessons-i-learned-watching-a-robotics-startup-die-from-the-inside",
      publishedAt: "2026-03-03T01:59:57.756Z",
    },
    {
      title: "How to integrate collaborative robots into existing production lines without disruption",
      excerpt:
        "The live page keeps one practical factory deployment briefing in the lead rotation to reduce the chance of landing on an unplayable embed.",
      youtubeUrl: "https://www.youtube.com/watch?v=sa2qSF9f9Ks",
      slug: "how-to-integrate-collaborative-robots-into-existing-production-lines-without-disruption",
      publishedAt: "2026-02-28T12:41:25.915Z",
    },
  ];
  const TOUCH_FIRST_DEVICE = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const DESKTOP_AUTO_PREVIEW = !TOUCH_FIRST_DEVICE && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const toPostUrl = (slug) => slug ? `https://news.robot.tv/post/${slug}/` : "https://news.robot.tv/";
  const thumbFromVideo = (url) => {
    const id = videoIdFromUrl(url);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "images/robot_logo.png";
  };

  const videoIdFromUrl = (url) => {
    const text = String(url || "").trim();
    return (
      (text.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || [])[1] ||
      (text.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
      (text.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
      (text.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
      (text.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
      ""
    );
  };

  const toPlaylistEmbedUrl = (ids) => {
    const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!cleanIds.length) return "";
    const first = cleanIds[0];
    const playlist = cleanIds.join(",");
    return `https://www.youtube.com/embed/${first}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=1&loop=1&playlist=${playlist}`;
  };

  const queuedPlayers = [];
  const embedWatchers = new WeakMap();
  let cleanupHomepagePreview = null;
  let liveFallbackTimer = null;

  const setPreviewPoster = (title, note) => {
    const titleEl = document.querySelector("[data-live-preview-poster-title]");
    const noteEl = document.querySelector("[data-live-preview-poster-note]");
    if (titleEl && title) titleEl.textContent = title;
    if (noteEl && note) noteEl.textContent = note;
  };

  const previewEmbedUrlFromVideo = (url) => {
    const id = videoIdFromUrl(url);
    if (!id) return "";
    return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&controls=0&rel=0&modestbranding=1&loop=1&playlist=${id}&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
  };

  const runtimeRejectedVideoIds = new Set();
  const getPriorityRank = (id) => {
    const index = LIVE_PRIORITY_VIDEO_IDS.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const publishedAtValue = (item) => {
    const value = Date.parse(String(item?.publishedAt || ""));
    return Number.isFinite(value) ? value : 0;
  };
  const normalizeLiveItems = (items) => {
    const seen = new Set();
    return (items || []).filter((item) => {
      const id = videoIdFromUrl(item?.youtubeUrl || "");
      const key = `${String(item?.slug || "")}|${id}`;
      if (!id || REMOVED_VIDEO_IDS.has(id) || runtimeRejectedVideoIds.has(id) || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => {
      const aId = videoIdFromUrl(a?.youtubeUrl || "");
      const bId = videoIdFromUrl(b?.youtubeUrl || "");
      const rankDiff = getPriorityRank(aId) - getPriorityRank(bId);
      if (rankDiff !== 0) return rankDiff;
      return publishedAtValue(b) - publishedAtValue(a);
    });
  };

  const setEmbedState = (wrap, state) => {
    if (!wrap) return;
    wrap.classList.remove("embed-loading", "embed-loaded", "embed-failed");
    if (state) wrap.classList.add(state);
  };

  const clearEmbedWatcher = (frame) => {
    const cleanup = embedWatchers.get(frame);
    if (cleanup) {
      cleanup();
      embedWatchers.delete(frame);
    }
  };

  const watchEmbedLoad = (frame, wrap, onFail) => {
    if (!frame || !wrap) return;
    clearEmbedWatcher(frame);
    setEmbedState(wrap, "embed-loading");
    let settled = false;
    const onLoad = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      setEmbedState(wrap, "embed-loaded");
      frame.removeEventListener("load", onLoad);
      embedWatchers.delete(frame);
    };
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setEmbedState(wrap, "embed-failed");
      frame.removeEventListener("load", onLoad);
      embedWatchers.delete(frame);
      if (typeof onFail === "function") onFail();
    }, 4500);
    frame.addEventListener("load", onLoad, { once: true });
    embedWatchers.set(frame, () => {
      settled = true;
      window.clearTimeout(timeoutId);
      frame.removeEventListener("load", onLoad);
    });
  };

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
      const getCurrentVideoId = (player) => {
        try {
          return String(player?.getVideoData?.().video_id || "");
        } catch (_) {
          return "";
        }
      };
      const getPlayableIds = (player) => {
        const raw = Array.from(new Set((player?.getPlaylist?.() && player.getPlaylist()) || ids || []));
        return raw.filter((id) => id && !REMOVED_VIDEO_IDS.has(id) && !runtimeRejectedVideoIds.has(id));
      };
      const markPlayerHealthy = () => {
        frame.dataset.errorAttempts = "0";
      };
      const loadPlayableVideo = (player, isError) => {
        const currentId = getCurrentVideoId(player);
        if (isError && currentId) {
          runtimeRejectedVideoIds.add(currentId);
        }

        const list = getPlayableIds(player);
        if (!list.length) return false;

        let nextIndex = 0;
        if (!isError && currentId) {
          const currentIndex = list.indexOf(currentId);
          if (currentIndex !== -1) {
            nextIndex = list.length === 1 ? currentIndex : (currentIndex + 1) % list.length;
          }
        } else if (isError && currentId) {
          const failedIndex = list.indexOf(currentId);
          if (failedIndex !== -1) {
            nextIndex = failedIndex % list.length;
          }
        }

        try {
          player.loadPlaylist(list, nextIndex, 0, "default");
          player.playVideo();
          return true;
        } catch (_) {
          try {
            player.loadVideoById(list[nextIndex]);
            return true;
          } catch (_) {
            return false;
          }
        }
      };
      frame.src = `https://www.youtube.com/embed/${first}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;

      const player = new window.YT.Player(id, {
        events: {
          onReady: (event) => {
            try {
              markPlayerHealthy();
              event.target.mute();
              event.target.loadPlaylist(ids, 0, 0, "default");
              event.target.playVideo();
            } catch (_) {}
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              markPlayerHealthy();
              return;
            }
            if (event.data !== window.YT.PlayerState.ENDED) return;
            loadPlayableVideo(event.target, false);
          },
          onError: (event) => {
            const advanced = loadPlayableVideo(event.target, true);
            if (advanced) return;
            try {
              frame.dispatchEvent(new CustomEvent("robot-tv-live-exhausted"));
            } catch (_) {}
            try {
              event.target.stopVideo();
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

  const loadWatchedFrame = (frame, wrap, src, title, onFail) => {
    if (!frame || !src) return;
    if (title) frame.title = title;
    watchEmbedLoad(frame, wrap, onFail);
    frame.src = src;
  };

  const setText = (selector, text) => {
    const el = document.querySelector(selector);
    if (!el || !text) return;
    el.textContent = text;
  };

  const setImage = (selector, src, alt) => {
    const img = document.querySelector(selector);
    if (!img || !src) return;
    img.src = src;
    if (alt) img.alt = alt;
  };

  const startHomepagePreview = (youtubeUrl, headline) => {
    const frame = document.querySelector("[data-live-preview-frame]");
    const wrap = frame?.closest(".live-preview");
    if (!frame || !wrap) return;

    if (typeof cleanupHomepagePreview === "function") {
      cleanupHomepagePreview();
      cleanupHomepagePreview = null;
    }

    if (!DESKTOP_AUTO_PREVIEW) {
      frame.src = "about:blank";
      setEmbedState(wrap, "");
      return;
    }

    const embedUrl = previewEmbedUrlFromVideo(youtubeUrl);
    if (!embedUrl) {
      frame.src = "about:blank";
      setEmbedState(wrap, "");
      return;
    }

    setEmbedState(wrap, "embed-loading");

    let settled = false;
    const handleMessage = (event) => {
      if (settled) return;
      let hostname = "";
      try {
        hostname = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (!/(\.|^)youtube(-nocookie)?\.com$/.test(hostname)) return;

      let payload = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || payload.id !== frame.id) return;

      if (payload.event === "onReady") {
        settled = true;
        cleanupHomepagePreview?.();
        cleanupHomepagePreview = null;
        setEmbedState(wrap, "embed-loaded");
        setPreviewPoster(headline, "Muted autoplay preview on desktop. Open the live room for the full feed.");
        return;
      }

      if (payload.event === "onError") {
        settled = true;
        cleanupHomepagePreview?.();
        cleanupHomepagePreview = null;
        frame.src = "about:blank";
        setEmbedState(wrap, "embed-failed");
        setPreviewPoster(headline, "Autoplay preview unavailable here. Open the live room for the full stream.");
      }
    };

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanupHomepagePreview?.();
      cleanupHomepagePreview = null;
      frame.src = "about:blank";
      setEmbedState(wrap, "embed-failed");
      setPreviewPoster(headline, "Autoplay preview unavailable here. Open the live room for the full stream.");
    }, 5000);

    cleanupHomepagePreview = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
    };

    window.addEventListener("message", handleMessage);
    frame.src = embedUrl;
  };

  const setLink = (selector, href, text) => {
    const link = document.querySelector(selector);
    if (!link || !href) return;
    link.href = href;
    if (text) link.textContent = text;
  };

  const clearLiveFallbackRotation = () => {
    if (liveFallbackTimer) {
      window.clearInterval(liveFallbackTimer);
      liveFallbackTimer = null;
    }
  };

  const renderLiveFallbackItem = (items, index) => {
    if (!Array.isArray(items) || !items.length) return;
    const item = items[index % items.length];
    const title = String(item?.title || "Latest robot.tv newsroom update");
    const excerpt = String(item?.excerpt || "Showing the latest newsroom story cards because the embedded video stream is currently unavailable.");
    const href = toPostUrl(item?.slug);
    const image = thumbFromVideo(item?.youtubeUrl);

    setImage("[data-live-fallback-image]", image, title);
    setText("[data-live-fallback-title]", title);
    setText("[data-live-fallback-copy]", excerpt);
    setLink("[data-live-fallback-link]", href, "Open Story");
    setText("[data-live-fallback-note]", `Auto-rotating newsroom item ${index + 1} of ${items.length}.`);
  };

  const activateLiveFallback = (items, startIndex = 0) => {
    const wrap = document.querySelector(".live-embed");
    if (!wrap || !Array.isArray(items) || !items.length) return;
    clearLiveFallbackRotation();
    wrap.classList.add("fallback-mode");
    renderLiveFallbackItem(items, startIndex);
    if (items.length > 1) {
      let index = startIndex;
      liveFallbackTimer = window.setInterval(() => {
        index = (index + 1) % items.length;
        renderLiveFallbackItem(items, index);
      }, 7000);
    }
  };

  const setNextUp = (items) => {
    const list = document.querySelector("[data-live-next-up]");
    if (!list) return;
    const section = list.closest(".live-next");
    const seen = new Set();
    const picks = [];
    for (let i = 1; i < items.length; i += 1) {
      const item = items[i];
      const key = `${String(item?.slug || "")}|${videoIdFromUrl(item?.youtubeUrl || "")}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      picks.push(item);
      if (picks.length >= 3) break;
    }
    if (!picks.length) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    list.innerHTML = picks.map((item) => {
      const title = String(item.title || "Latest robotics update");
      const href = toPostUrl(item.slug);
      return `<li><a href="${href}">${title}</a></li>`;
    }).join("");
  };

  const hydrate = (items) => {
    if (!items.length) {
      startHomepagePreview("", "");
      setPreviewPoster("robot.tv live room", "Open the live room if the inline player is slow or unavailable.");
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
    const embed = ids[0] ? `https://www.youtube.com/embed/${ids[0]}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=1` : "";
    const primary = items[0];
    const headline = primary.title || "Robot.tv Live Feed";
    const sourceHref = primary.slug ? toPostUrl(primary.slug) : "https://news.robot.tv/";
    const sourceText = primary.slug ? "Latest video from news.robot.tv" : "news.robot.tv";
    const coverImage = thumbFromVideo(primary.youtubeUrl);

    setImage("[data-live-preview-image]", coverImage, headline);
    setPreviewPoster(headline, "Open the live room for the full stream and latest newsroom video rotation.");
    startHomepagePreview(primary.youtubeUrl, headline);

    const mainFrame = document.querySelector("[data-live-main-frame]");
    const mainEmbedWrap = mainFrame?.closest(".live-embed");
    const mainTapCta = document.querySelector("[data-live-main-tap-play]");
    const useTapToPlayMain = Boolean(mainFrame && mainEmbedWrap && mainTapCta && TOUCH_FIRST_DEVICE);
    const activateMainFallback = () => activateLiveFallback(items);

    if (mainFrame && mainFrame.dataset.fallbackBound !== "1") {
      mainFrame.dataset.fallbackBound = "1";
      mainFrame.addEventListener("robot-tv-live-exhausted", activateMainFallback);
    }

    if (useTapToPlayMain) {
      mainFrame.src = "about:blank";
      mainFrame.title = `${headline} livestream`;
      mainEmbedWrap.classList.remove("is-playing");
      mainEmbedWrap.classList.remove("fallback-mode");

      const startMainPlayback = (event) => {
        event.preventDefault();
        if (mainEmbedWrap.classList.contains("is-playing")) return;
        mainEmbedWrap.classList.add("is-playing");
        loadWatchedFrame(mainFrame, mainEmbedWrap, embed, `${headline} livestream`, activateMainFallback);
        queuePlayer("[data-live-main-frame]", ids);
        ensureYouTubeApi();
      };

      mainTapCta.addEventListener("click", startMainPlayback);
      mainTapCta.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          startMainPlayback(event);
        }
      });
    } else {
      mainEmbedWrap.classList.remove("fallback-mode");
      loadWatchedFrame(mainFrame, mainEmbedWrap, embed, `${headline} livestream`, activateMainFallback);
      queuePlayer("[data-live-main-frame]", ids);
    }

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
      const merged = [...PINNED_LIVE_ITEMS, ...rows];
      const withVideo = normalizeLiveItems(merged);
      hydrate(withVideo);
    })
    .catch(() => hydrate([]));
})();
