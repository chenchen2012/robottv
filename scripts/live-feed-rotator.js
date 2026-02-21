(() => {
  const SANITY_PROJECT_ID = "lumv116w";
  const SANITY_DATASET = "production";
  const SANITY_URL = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2023-10-01/data/query/${SANITY_DATASET}`;
  const QUERY = '*[_type=="post" && defined(youtubeUrl)] | order(publishedAt desc)[0...10]{title,excerpt,youtubeUrl,"slug":slug.current,publishedAt}';

  const FALLBACK = {
    title: "Robot.tv livestream",
    excerpt: "BattleBots stream is currently featured as fallback.",
    youtubeUrl: "https://www.youtube.com/watch?v=G6ERanEbzEE",
    slug: null
  };

  const toPostUrl = (slug) => slug ? `https://news.robot.tv/post/${slug}` : "https://news.robot.tv/";

  const videoIdFromUrl = (url) => {
    const text = String(url || "");
    return (
      (text.match(/[?&]v=([^&]+)/) || [])[1] ||
      (text.match(/youtu\.be\/([^?&]+)/) || [])[1] ||
      ""
    );
  };

  const toEmbedUrl = (url) => {
    const id = videoIdFromUrl(url);
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` : "";
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
    const primary = items[0] || FALLBACK;
    const embed = toEmbedUrl(primary.youtubeUrl) || toEmbedUrl(FALLBACK.youtubeUrl);
    const headline = primary.title || "Robot.tv Live Feed";
    const sourceHref = primary.slug ? toPostUrl(primary.slug) : FALLBACK.youtubeUrl;
    const sourceText = primary.slug ? "Latest video from news.robot.tv" : "Robot.tv livestream";

    setFrame("[data-live-preview-frame]", embed, `${headline} live preview`);
    setFrame("[data-live-main-frame]", embed, `${headline} livestream`);
    setText("[data-live-spotlight-title]", headline);
    setText("[data-live-spotlight-desc]", "Auto-rotating from the latest newsroom videos.");
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
      hydrate(withVideo.length ? withVideo : [FALLBACK]);
    })
    .catch(() => hydrate([FALLBACK]));
})();
