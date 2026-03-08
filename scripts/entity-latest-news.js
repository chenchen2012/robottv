(function () {
  const blocks = Array.from(document.querySelectorAll("[data-entity-news]"));
  if (!blocks.length) return;
  const pendingBlocks = blocks.filter((block) => {
    const list = block.querySelector("[data-entity-news-list]");
    return list && !list.querySelector(".entity-news-item");
  });
  if (!pendingBlocks.length) return;

  const sanityProjectId = "lumv116w";
  const sanityDataset = "production";
  const sanityUrl = `https://${sanityProjectId}.api.sanity.io/v2023-10-01/data/query/${sanityDataset}`;
  const query = '*[_type == "post"] | order(publishedAt desc)[0...200]{title,excerpt,publishedAt,"slug":slug.current,youtubeUrl,categories[]->title}';

  const escapeHtml = (s) => String(s || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const toPostUrl = (slug) => slug ? `https://news.robot.tv/post/${slug}/` : "https://news.robot.tv/";
  const toDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  const textOfPost = (post) => {
    const cats = Array.isArray(post?.categories) ? post.categories.join(" ") : "";
    return `${post?.title || ""} ${post?.excerpt || ""} ${cats}`.toLowerCase();
  };

  const findMatches = (posts, keywords, limit) => {
    if (!keywords.length) return [];
    const picks = [];
    const seen = new Set();
    const max = Number.isFinite(limit) && limit > 0 ? limit : 4;
    for (const post of posts) {
      if (!post?.slug || seen.has(post.slug)) continue;
      const hay = textOfPost(post);
      const matched = keywords.some((k) => hay.includes(k));
      if (!matched) continue;
      seen.add(post.slug);
      picks.push(post);
      if (picks.length >= max) break;
    }
    return picks;
  };

  const render = (block, posts) => {
    const list = block.querySelector("[data-entity-news-list]");
    if (!list) return;
    if (!posts.length) {
      block.hidden = true;
      return;
    }
    block.hidden = false;
    list.innerHTML = posts.map((post) => {
      const title = escapeHtml(post.title || "Latest robotics update");
      const href = toPostUrl(post.slug);
      const date = toDate(post.publishedAt);
      const excerpt = escapeHtml(post.excerpt || "");
      return `<article class="entity-news-item">
        <h3><a href="${href}">${title}</a></h3>
        ${date ? `<p class="entity-news-date">${date}</p>` : ""}
        ${excerpt ? `<p class="entity-news-excerpt">${excerpt}</p>` : ""}
      </article>`;
    }).join("");
  };

  fetch(`${sanityUrl}?query=${encodeURIComponent(query)}`)
    .then((r) => r.json())
    .then((d) => {
      const posts = Array.isArray(d?.result) ? d.result : [];
      pendingBlocks.forEach((block) => {
        const raw = String(block.getAttribute("data-keywords") || "");
        const keywords = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        const configuredLimit = Number.parseInt(block.getAttribute("data-limit") || "", 10);
        const matches = findMatches(posts, keywords, configuredLimit);
        render(block, matches);
      });
    })
    .catch(() => {
      pendingBlocks.forEach((block) => { block.hidden = true; });
    });
})();
