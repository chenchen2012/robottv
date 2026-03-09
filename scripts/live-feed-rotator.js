(() => {
  const SANITY_PROJECT_ID = "lumv116w";
  const SANITY_DATASET = "production";
  const SANITY_URL = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2023-10-01/data/query/${SANITY_DATASET}`;
  const QUERY = '*[_type=="post" && defined(youtubeUrl)] | order(publishedAt desc)[0...16]{title,excerpt,youtubeUrl,"slug":slug.current,publishedAt}';
  const PINNED_LIVE_ITEMS = [];
  const TOUCH_FIRST_DEVICE = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const INLINE_PREVIEW_ENABLED = !TOUCH_FIRST_DEVICE;
  const OEMBED_TIMEOUT_MS = 2500;

  const toPostUrl = (slug) => slug ? `https://news.robot.tv/${slug}/` : "https://news.robot.tv/";

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

  const toPlayerEmbedUrl = (id) => {
    if (!id) return "";
    return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
  };

  const isLikelyEmbeddableVideo = async (videoId) => {
    if (!videoId) return false;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller
      ? window.setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS)
      : 0;
    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
        {
          mode: "cors",
          credentials: "omit",
          signal: controller?.signal
        }
      );
      return response.ok;
    } catch (_) {
      return true;
    } finally {
      if (timeout) window.clearTimeout(timeout);
    }
  };

  const filterEmbeddableItems = async (items) => {
    const checked = await Promise.all(
      (items || []).map(async (item) => ({
        item,
        ok: await isLikelyEmbeddableVideo(videoIdFromUrl(item?.youtubeUrl || ""))
      }))
    );
    const passed = checked.filter(({ ok }) => ok).map(({ item }) => item);
    return passed.length ? passed : items;
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

  const queuePlayer = (selector, ids, options = {}) => {
    const frame = document.querySelector(selector);
    if (!frame || !ids.length) return;
    if (!frame.id) frame.id = `robot-tv-live-${selector.replace(/[^a-z0-9]/gi, "")}`;
    queuedPlayers.push({ id: frame.id, ids, ...options });
  };

  const initQueuedPlayers = () => {
    if (!(window.YT && window.YT.Player)) return;
    queuedPlayers.forEach(({ id, ids, onPlayable, onFailure, onVideoChange }) => {
      const frame = document.getElementById(id);
      if (!frame || frame.dataset.playerReady === "1") return;
      frame.dataset.playerReady = "1";
      let activeIds = Array.from(new Set((ids || []).filter(Boolean)));
      let currentIndex = 0;
      let playableNotified = false;
      let playbackProbe = 0;
      let playbackProbeTimeout = 0;
      const stopPlaybackProbe = () => {
        if (playbackProbe) {
          window.clearInterval(playbackProbe);
          playbackProbe = 0;
        }
        if (playbackProbeTimeout) {
          window.clearTimeout(playbackProbeTimeout);
          playbackProbeTimeout = 0;
        }
      };
      const notifyPlayable = () => {
        if (playableNotified) return;
        playableNotified = true;
        stopPlaybackProbe();
        if (typeof onPlayable === "function") onPlayable();
      };
      const startPlaybackProbe = (player) => {
        stopPlaybackProbe();
        playbackProbe = window.setInterval(() => {
          try {
            const state = Number(player.getPlayerState());
            const loadedFraction = Number(
              typeof player.getVideoLoadedFraction === "function"
                ? player.getVideoLoadedFraction()
                : 0
            );
            if (
              state === window.YT.PlayerState.PLAYING ||
              state === window.YT.PlayerState.BUFFERING ||
              (loadedFraction > 0.01 && state !== window.YT.PlayerState.UNSTARTED)
            ) {
              notifyPlayable();
            }
          } catch (_) {}
        }, 350);
        playbackProbeTimeout = window.setTimeout(() => {
          stopPlaybackProbe();
        }, 12000);
      };
      const getCurrentId = () => activeIds[currentIndex] || activeIds[0] || "";
      const announceCurrentVideo = () => {
        const currentId = getCurrentId();
        if (currentId && typeof onVideoChange === "function") onVideoChange(currentId);
      };
      const playCurrentVideo = (player) => {
        const currentId = getCurrentId();
        if (!currentId) return;
        try {
          player.mute();
          player.loadVideoById(currentId);
          player.playVideo();
        } catch (_) {}
        announceCurrentVideo();
      };
      const playNextVideo = (player) => {
        if (!activeIds.length) return;
        currentIndex = (currentIndex + 1) % activeIds.length;
        playableNotified = false;
        startPlaybackProbe(player);
        playCurrentVideo(player);
      };
      const removeFailedVideo = (failedId, player) => {
        const failedIndex = activeIds.findIndex((candidate) => candidate === failedId);
        if (failedIndex !== -1) {
          activeIds.splice(failedIndex, 1);
          if (failedIndex < currentIndex) {
            currentIndex -= 1;
          }
        } else {
          activeIds = activeIds.filter((candidate) => candidate && candidate !== failedId);
        }
        if (currentIndex >= activeIds.length) currentIndex = 0;
        if (activeIds.length) {
          playableNotified = false;
          startPlaybackProbe(player);
          playCurrentVideo(player);
          return;
        }
        stopPlaybackProbe();
        frame.src = "about:blank";
        frame.dataset.playerReady = "0";
        if (typeof onFailure === "function") onFailure();
      };

      const first = getCurrentId();
      if (!first) {
        frame.dataset.playerReady = "0";
        if (typeof onFailure === "function") onFailure();
        return;
      }
      frame.src = toPlayerEmbedUrl(first);
      announceCurrentVideo();

      const player = new window.YT.Player(id, {
        events: {
          onReady: (event) => {
            playableNotified = false;
            startPlaybackProbe(event.target);
            playCurrentVideo(event.target);
          },
          onStateChange: (event) => {
            if (
              event.data === window.YT.PlayerState.PLAYING ||
              event.data === window.YT.PlayerState.BUFFERING
            ) {
              notifyPlayable();
              return;
            }
            if (event.data !== window.YT.PlayerState.ENDED) return;
            playNextVideo(event.target);
          },
          onError: (event) => {
            const failedId = (() => {
              try {
                return event.target.getVideoData()?.video_id || getCurrentId() || "";
              } catch (_) {
                return getCurrentId() || "";
              }
            })();
            removeFailedVideo(failedId, event.target);
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

  const setPoster = (selector, src, alt) => {
    const img = document.querySelector(selector);
    if (!img || !src) return;
    img.src = src;
    if (alt) img.alt = alt;
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
    const previewFrame = document.querySelector("[data-live-preview-frame]");
    const previewLink = previewFrame?.closest(".live-preview");
    const previewTapCta = document.querySelector("[data-live-preview-tap-play]");
    const useTapToPlayPreview = Boolean(
      INLINE_PREVIEW_ENABLED && previewFrame && previewLink && previewTapCta && TOUCH_FIRST_DEVICE
    );

    if (previewLink) {
      previewLink.classList.remove("has-video", "is-playing", "tap-ready");
    }

    if (previewTapCta) {
      previewTapCta.hidden = !INLINE_PREVIEW_ENABLED || !TOUCH_FIRST_DEVICE;
    }

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

    const ids = Array.from(new Set(items.map((item) => videoIdFromUrl(item.youtubeUrl)).filter(Boolean)));
    const embed = toPlayerEmbedUrl(ids[0]);
    const primary = items[0];
    const headline = primary.title || "Robot.tv Live Feed";
    const sourceHref = primary.slug ? toPostUrl(primary.slug) : "https://news.robot.tv/";
    const sourceText = primary.slug ? "Latest video from news.robot.tv" : "news.robot.tv";
    const primaryVideoId = videoIdFromUrl(primary.youtubeUrl);

    if (primaryVideoId) {
      setPoster(
        "[data-live-preview-poster]",
        `https://i.ytimg.com/vi/${primaryVideoId}/hqdefault.jpg`,
        `${headline} poster`
      );
      setPoster(
        "[data-live-main-poster]",
        `https://i.ytimg.com/vi/${primaryVideoId}/hqdefault.jpg`,
        `${headline} poster`
      );
    }

    if (useTapToPlayPreview) {
      previewFrame.src = "about:blank";
      previewFrame.title = `${headline} live preview`;
      previewLink.classList.add("tap-ready");
      previewLink.classList.remove("is-playing");

      const startPreviewPlayback = (event) => {
        if (previewLink.classList.contains("is-playing")) return;
        event.preventDefault();
        previewLink.classList.add("is-playing");
        previewFrame.src = embed;
        queuePlayer("[data-live-preview-frame]", ids, {
          onPlayable: () => previewLink.classList.add("has-video"),
          onFailure: () => {
            previewLink.classList.remove("has-video", "is-playing");
          }
        });
        ensureYouTubeApi();
      };

      previewLink.addEventListener("click", startPreviewPlayback);
      previewTapCta.addEventListener("click", startPreviewPlayback);
      previewTapCta.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          startPreviewPlayback(event);
        }
      });
    } else if (INLINE_PREVIEW_ENABLED) {
      setFrame("[data-live-preview-frame]", embed, `${headline} live preview`);
      queuePlayer("[data-live-preview-frame]", ids, {
        onPlayable: () => previewLink?.classList.add("has-video"),
        onFailure: () => {
          previewLink?.classList.remove("has-video", "is-playing");
        }
      });
    } else if (previewFrame) {
      previewFrame.src = "about:blank";
      previewFrame.title = `${headline} live preview`;
    }

    const mainFrame = document.querySelector("[data-live-main-frame]");
    const mainEmbedWrap = mainFrame?.closest(".live-embed");
    const mainTapCta = document.querySelector("[data-live-main-tap-play]");
    const useTapToPlayMain = Boolean(mainFrame && mainEmbedWrap && mainTapCta && TOUCH_FIRST_DEVICE);

    if (mainEmbedWrap) {
      mainEmbedWrap.classList.remove("has-video", "is-playing");
    }

    if (useTapToPlayMain) {
      mainFrame.src = "about:blank";
      mainFrame.title = `${headline} livestream`;

      const startMainPlayback = (event) => {
        event.preventDefault();
        if (mainEmbedWrap.classList.contains("is-playing")) return;
        mainEmbedWrap.classList.add("is-playing");
        mainFrame.src = embed;
        queuePlayer("[data-live-main-frame]", ids, {
          onPlayable: () => mainEmbedWrap.classList.add("has-video"),
          onFailure: () => mainEmbedWrap.classList.remove("has-video", "is-playing")
        });
        ensureYouTubeApi();
      };

      mainTapCta.addEventListener("click", startMainPlayback);
      mainTapCta.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          startMainPlayback(event);
        }
      });
    } else {
      setFrame("[data-live-main-frame]", embed, `${headline} livestream`);
      queuePlayer("[data-live-main-frame]", ids, {
        onPlayable: () => mainEmbedWrap?.classList.add("has-video"),
        onFailure: () => mainEmbedWrap?.classList.remove("has-video", "is-playing")
      });
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
    .then(async (d) => {
      const rows = Array.isArray(d?.result) ? d.result : [];
      const seen = new Set();
      const merged = [...PINNED_LIVE_ITEMS, ...rows];
      const withVideo = merged.filter((item) => {
        const key = `${String(item?.slug || "")}|${videoIdFromUrl(item?.youtubeUrl || "")}`;
        if (!videoIdFromUrl(item?.youtubeUrl) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const embeddable = await filterEmbeddableItems(withVideo);
      hydrate(embeddable);
    })
    .catch(() => hydrate([]));
})();
