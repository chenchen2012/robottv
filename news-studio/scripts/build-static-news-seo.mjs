import fs from "node:fs/promises";
import path from "node:path";

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID || "lumv116w";
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || "production";
const siteUrl = "https://news.robot.tv";
const staticDir = path.resolve("static");
const postDir = path.join(staticDir, "post");
const sitemapPath = path.join(staticDir, "sitemap.xml");
const legacyHtmlAliasSlugs = new Set([
  "chinese-robotics-firms-showcase-advanced-quadruped-robots-for-practical-applications",
]);
const editorialPinnedPosts = [
  {
    title: "Chinese robotics firms showcase advanced quadruped robots for practical applications",
    excerpt:
      "Chinese robotics firms are showing advanced quadruped robots in practical industrial and field scenarios, signaling stronger real-world deployment readiness.",
    publishedAt: "2025-01-01T00:00:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=X2UxtKLZnNo",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "This restored briefing tracks how Chinese robotics firms are positioning quadruped platforms for practical applications beyond demonstrations.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Why it matters: commercialization momentum depends on reliability, uptime, and repeatable task performance in real operating environments.",
          },
        ],
      },
    ],
    slug: "chinese-robotics-firms-showcase-advanced-quadruped-robots-for-practical-applications",
    author: "Chen Chen",
    categories: ["Quadrupeds", "Robotics News", "Operations"],
  },
  {
    title: "Humanoid warehouse rollouts are shifting from pilot to operations in 2026",
    excerpt:
      "A growing share of warehouse humanoid programs are moving from proof-of-concept demos to measured operational deployment plans in 2026.",
    publishedAt: "2026-03-07T08:30:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=2zCh_6GO49c",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "Editorial brief: 2026 deployment signals suggest warehouse humanoids are being evaluated against throughput, safety, and task reliability metrics rather than demo novelty.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Why it matters: this shift from pilot headlines to operations benchmarks is where long-term robotics adoption and recurring budget decisions are made.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "robot.tv will continue tracking execution milestones, site-level rollout pacing, and clear evidence of repeatable workflow impact.",
          },
        ],
      },
    ],
    slug: "humanoid-warehouse-rollouts-shift-from-pilot-to-operations-2026",
    author: "Chen Chen",
    categories: ["Humanoid Robots", "Operations", "Robotics News"],
  },
];
const videoOverridesBySlug = {
  "11-women-shaping-the-future-of-robotics": "https://www.youtube.com/watch?v=uVJeI60glTE",
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[ch] || ch;
  });

const toPlainText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeSlug = (slug) => String(slug || "").trim().replace(/^\/+|\/+$/g, "");

const videoIdFromUrl = (url) => {
  const value = String(url || "").trim();
  if (!value) return "";
  const short = value.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (short) return short[1];
  const watch = value.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watch) return watch[1];
  const embed = value.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embed) return embed[1];
  return "";
};

const youtubeThumb = (url) => {
  const id = videoIdFromUrl(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "https://robot.tv/images/robot_logo.png";
};

const formatDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
};

const formatDateOnly = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
};

const blocksToParagraphs = (body) => {
  if (!Array.isArray(body)) return [];
  return body
    .filter((b) => b && b._type === "block" && Array.isArray(b.children))
    .map((b) => b.children.map((c) => c?.text || "").join("").trim())
    .map((p) => toPlainText(p))
    .filter((p) => p.length > 0)
    .filter((p) => !/^status:/i.test(p))
    .filter((p) => !/^original coverage link:/i.test(p))
    .filter((p) => !/news\.google\.com\/rss\/articles/i.test(p))
    .slice(0, 12);
};

const buildArticleHtml = (post) => {
  const slug = normalizeSlug(post.slug);
  const title = toPlainText(post.title || "robot.tv News");
  const excerpt = toPlainText(post.excerpt || "robot.tv News coverage.");
  const author = toPlainText(post.author || "robot.tv");
  const categories = Array.isArray(post.categories) ? post.categories.map(toPlainText).filter(Boolean) : [];
  const publishedAtIso = formatDate(post.publishedAt || new Date().toISOString());
  const publishedDateDisplay = publishedAtIso
    ? new Date(publishedAtIso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "";
  const canonicalUrl = `${siteUrl}/post/${encodeURIComponent(slug)}`;
  const thumb = youtubeThumb(post.youtubeUrl);
  const paragraphs = blocksToParagraphs(post.body);
  const embedId = videoIdFromUrl(post.youtubeUrl);
  const embedUrl = embedId
    ? `https://www.youtube.com/embed/${embedId}?rel=0&modestbranding=1&playsinline=1`
    : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description: excerpt,
    datePublished: publishedAtIso || new Date().toISOString(),
    dateModified: publishedAtIso || new Date().toISOString(),
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
    image: [thumb],
    author: {
      "@type": "Person",
      name: author,
    },
    publisher: {
      "@type": "Organization",
      name: "robot.tv",
      logo: {
        "@type": "ImageObject",
        url: "https://robot.tv/images/robot_logo.png",
      },
    },
  };

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "robot.tv",
    url: "https://robot.tv/",
    logo: "https://robot.tv/images/robot_logo.png",
    sameAs: ["https://news.robot.tv/"],
  };

  const siteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "robot.tv News",
    url: "https://news.robot.tv/",
    publisher: {
      "@type": "Organization",
      name: "robot.tv",
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "robot.tv",
        item: "https://robot.tv/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "News",
        item: "https://news.robot.tv/",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: title,
        item: canonicalUrl,
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(excerpt)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="robot.tv News">
  <meta property="og:title" content="${escapeHtml(title)} | robot.tv News">
  <meta property="og:description" content="${escapeHtml(excerpt)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(thumb)}">
  <meta property="article:published_time" content="${escapeHtml(publishedAtIso || new Date().toISOString())}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)} | robot.tv News">
  <meta name="twitter:description" content="${escapeHtml(excerpt)}">
  <meta name="twitter:image" content="${escapeHtml(thumb)}">
  <title>${escapeHtml(title)} | robot.tv News</title>
  <script type="application/ld+json">${JSON.stringify(orgJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(siteJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    :root { --bg:#05070b; --panel:#0d131d; --panel2:#111a27; --text:#f3f6fb; --muted:#97a5bc; --line:#233048; --red:#ef2d52; --blue:#5e84ff; }
    * { box-sizing:border-box; } html,body { margin:0; padding:0; min-height:100%; } body { font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--text); background:var(--bg); overflow-x:hidden; }
    a { color:inherit; text-decoration:none; } .container { position:relative; z-index:2; width:min(1180px,94vw); margin:0 auto; padding:1rem 0 2rem; }
    .bg-grid { position:fixed; inset:0; z-index:0; background:linear-gradient(to right, rgba(255,255,255,.03) 1px, transparent 1px),linear-gradient(to bottom, rgba(255,255,255,.03) 1px, transparent 1px); background-size:28px 28px; mask-image:radial-gradient(circle at center, #000 30%, transparent 82%); }
    .bg-glow { position:fixed; width:520px; height:520px; filter:blur(80px); z-index:1; opacity:.23; pointer-events:none; }
    .red { background:var(--red); top:-170px; left:-120px; } .blue { background:var(--blue); right:-170px; top:20%; }
    .panel { border:1px solid var(--line); border-radius:12px; background:linear-gradient(160deg,var(--panel),var(--panel2)); }
    .header { display:flex; align-items:center; justify-content:space-between; gap:1rem; border:1px solid var(--line); background:linear-gradient(135deg, rgba(10,15,24,.95), rgba(12,18,29,.95)); border-radius:10px; padding:.8rem 1rem; }
    .brand img { width:150px; display:block; }
    .nav { display:flex; gap:1rem; flex-wrap:wrap; color:var(--muted); font-weight:600; }
    .nav a { transition:color .2s ease; }
    .nav a:hover { color:#d3deef; }
    .nav a.is-active { border:1px solid #5c80bb; border-radius:999px; padding:.22rem .62rem; color:#f4f8ff; background:linear-gradient(120deg, rgba(94,132,255,.32), rgba(94,132,255,.16)); box-shadow:0 0 0 1px rgba(94,132,255,.28) inset, 0 4px 14px rgba(28,52,96,.34); }
    .cta { border:1px solid #46597a; border-radius:999px; padding:.45rem .9rem; font-weight:700; font-size:.88rem; }
    article { margin-top:1rem; border:1px solid var(--line); border-radius:12px; padding:1rem; background:linear-gradient(160deg,var(--panel),var(--panel2)); }
    h1 { margin:.3rem 0 0; line-height:1.2; font-size:clamp(1.3rem,3.8vw,2rem); }
    .meta { margin:.55rem 0 0; color:var(--muted); font-size:.9rem; }
    .excerpt { margin:.75rem 0 0; color:#c3d0e4; line-height:1.7; }
    .video { margin:.9rem 0 0; width:100%; aspect-ratio:16/9; border:1px solid #24344f; border-radius:10px; overflow:hidden; background:#000; }
    .video iframe { width:100%; height:100%; border:0; display:block; }
    .body p { margin:.9rem 0 0; color:#c6d2e8; line-height:1.8; }
    .tags { margin:.9rem 0 0; padding:0; list-style:none; display:flex; flex-wrap:wrap; gap:.45rem; }
    .tags li { border:1px solid #2a3f5d; border-radius:999px; padding:.22rem .55rem; color:#c6d2e8; font-size:.8rem; }
    .footer { margin-top:1.2rem; padding:1rem; display:flex; justify-content:space-between; gap:.8rem; flex-wrap:wrap; color:#a7b7d1; font-size:.9rem; }
    .footer-links { display:flex; gap:.9rem; flex-wrap:wrap; }
    @media (max-width:760px){ .header{flex-direction:column; align-items:flex-start;} }
  </style>
</head>
<body>
  <div class="bg-grid" aria-hidden="true"></div>
  <div class="bg-glow red" aria-hidden="true"></div>
  <div class="bg-glow blue" aria-hidden="true"></div>
  <div class="container">
    <header class="header">
      <a class="brand" href="https://robot.tv" aria-label="robot.tv home"><img src="https://robot.tv/images/robot_logo.png" alt="robot.tv"></a>
      <nav class="nav">
        <a href="https://robot.tv">Home</a>
        <a href="https://robot.tv/home.html">Robot Index</a>
        <a href="https://robot.tv/companies.html">Companies</a>
        <a href="https://robot.tv/live.html">Live Now</a>
        <a class="is-active" href="/">News</a>
        <a href="https://robot.tv/partner.html">Partner</a>
        <a href="https://robot.tv/about.html">About</a>
      </nav>
      <a class="cta" href="https://robot.tv/get-featured">Get Featured</a>
    </header>
    <article>
      <p style="margin:0;color:#acbcd7;letter-spacing:.08em;font-size:.75rem;text-transform:uppercase;font-weight:700;">Robotics News</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">${escapeHtml(publishedDateDisplay)}</p>
      <p class="excerpt">${escapeHtml(excerpt)}</p>
      ${embedUrl ? `<div class="video"><iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(title)} video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>` : ""}
      <section class="body">
        ${(paragraphs.length ? paragraphs : ["This article is part of robot.tv's video-first robotics coverage."])
          .map((p) => `<p>${escapeHtml(p)}</p>`)
          .join("")}
      </section>
      ${categories.length ? `<ul class="tags">${categories.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>` : ""}
    </article>
    <footer class="panel footer">
      <div>robot.tv News | Real-time robotics briefings</div>
      <div class="footer-links">
        <a href="https://robot.tv">robot.tv</a>
        <a href="https://robot.tv/home.html">Robot Index</a>
        <a href="https://robot.tv/companies.html">Companies</a>
        <a href="https://robot.tv/live.html">Live</a>
        <a href="https://robot.tv/partner.html">Partner</a>
        <a href="https://robot.tv/about.html">About</a>
      </div>
    </footer>
  </div>
</body>
</html>`;
};

const fetchPosts = async () => {
  const query =
    '*[_type=="post" && defined(slug.current)] | order(publishedAt desc)[0...500]{title,excerpt,publishedAt,youtubeUrl,body,"slug":slug.current,"author":author->name,"categories":categories[]->title}';
  const url = `https://${projectId}.apicdn.sanity.io/v2023-10-01/data/query/${dataset}?query=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`Failed to fetch posts from Sanity: HTTP ${resp.status}`);
  const json = await resp.json();
  const posts = Array.isArray(json.result) ? json.result : [];
  const merged = [...editorialPinnedPosts, ...posts];
  const unique = [];
  const seen = new Set();
  for (const post of merged) {
    const slug = normalizeSlug(post.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const overrideYoutubeUrl = videoOverridesBySlug[slug];
    unique.push({ ...post, slug, youtubeUrl: overrideYoutubeUrl || post.youtubeUrl });
  }
  return unique;
};

const writeSitemap = async (posts) => {
  const items = [
    {
      loc: `${siteUrl}/`,
      lastmod: formatDateOnly(new Date().toISOString()),
      changefreq: "daily",
      priority: "0.9",
    },
    ...posts.map((p) => ({
      loc: `${siteUrl}/post/${encodeURIComponent(normalizeSlug(p.slug))}`,
      lastmod: formatDateOnly(p.publishedAt),
      changefreq: "weekly",
      priority: "0.8",
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items
  .map(
    (u) =>
      `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  )
  .join("\n")}
</urlset>
`;

  await fs.writeFile(sitemapPath, xml, "utf8");
};

const ensureCleanPostDir = async () => {
  await fs.rm(postDir, { recursive: true, force: true });
  await fs.mkdir(postDir, { recursive: true });
};

const writePosts = async (posts) => {
  for (const post of posts) {
    const slug = normalizeSlug(post.slug);
    const html = buildArticleHtml(post);
    const primaryDir = path.join(postDir, slug);
    await fs.mkdir(primaryDir, { recursive: true });
    await fs.writeFile(path.join(primaryDir, "index.html"), html, "utf8");

    if (legacyHtmlAliasSlugs.has(slug)) {
      const aliasDir = path.join(postDir, `${slug}.html`);
      await fs.mkdir(aliasDir, { recursive: true });
      await fs.writeFile(path.join(aliasDir, "index.html"), html, "utf8");
    }
  }
};

const main = async () => {
  const posts = await fetchPosts();
  await ensureCleanPostDir();
  await writePosts(posts);
  await writeSitemap(posts);
  console.log(`Generated ${posts.length} static post pages and updated sitemap.xml`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
