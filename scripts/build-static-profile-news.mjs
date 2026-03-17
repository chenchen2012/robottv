#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.ROBOTTV_ROOT || process.cwd();
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || "lumv116w";
const SANITY_DATASET = process.env.SANITY_DATASET || "production";
const PROFILE_NEWS_QUERY =
  '*[_type=="post"] | order(publishedAt desc)[0...200]{title,excerpt,publishedAt,"slug":slug.current,"cats":categories[]->title}';
const PROFILE_NEWS_ENDPOINT = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2023-10-01/data/query/${SANITY_DATASET}?query=${encodeURIComponent(PROFILE_NEWS_QUERY)}`;
const EXCLUDED_NEWS_SLUGS = new Set([
  "11-women-shaping-the-future-of-robotics",
  "2026-robotics-summit-early-bird-registration-ends-march-2",
  "agility-boston-dynamics-astm-to-discuss-the-state-of-humanoid-robotics",
  "alphabet-owned-robotics-software-company-intrinsic-joins-google",
  "amazon-halts-blue-jay-robotics-project-after-less-than-6-months",
  "aw-2026-features-korea-humanoid-debuts-as-industry-seeks-digital-transformation",
  "breakingviews-hyundai-motors-robots-herald-hardware-reboot",
  "chinas-dancing-robots-how-worried-should-we-be",
  "dancing-robots-bring-support-company-to-barcelona-elderly",
  "hyundai-motor-to-unveil-multi-billion-dollar-investment-in-south-korea-source-says",
  "hyundai-to-show-mobed-at-aw-as-robotics-ai-expand-in-manufacturing",
  "robotics-medal-and-rising-star-winners-reflect-on-their-work-advancing-women-in-robotics",
  "tesollo-commercializes-its-lightweight-compact-robotic-hand-for-humanoids",
  "the-biggest-robot-news-today",
  "the-cows-beat-the-shit-out-of-the-robots-the-first-day-the-tech-revolution-designed-to-imp",
]);

const RELATED_KEYWORD_MAP = {
  "company-agility": ["agility", "digit", "warehouse", "logistics"],
  "company-apptronik": ["apptronik", "apollo", "humanoid"],
  "asimo": ["asimo", "honda", "humanoid"],
  "anymal": ["anymal", "quadruped", "inspection"],
  "digit": ["digit", "agility", "logistics", "warehouse"],
  "apollo": ["apollo", "apptronik", "humanoid"],
  "handle": ["handle", "boston dynamics", "warehouse"],
  "thr3": ["thr3", "toyota", "humanoid"],
  "yumi": ["yumi", "abb", "industrial"],
};

const escapeHtml = (value) =>
  String(value || "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[char]));

const toText = (value) => String(value || "").toLowerCase();
const toPostUrl = (slug) => (slug ? `https://news.robot.tv/${slug}/` : "https://news.robot.tv/");

const formatDate = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getAttr = (tag, attr) => {
  const match = tag.match(new RegExp(`${attr}="([^"]*)"`, "i"));
  return match ? match[1] : "";
};

const scorePost = (post, keywords) => {
  const haystack = toText([post?.title, post?.excerpt, ...(post?.cats || [])].join(" "));
  return keywords.reduce((sum, keyword) => sum + (haystack.includes(toText(keyword)) ? 1 : 0), 0);
};

const pickPosts = (posts, keywords, limit) => {
  const ranked = posts
    .map((post) => ({ post, score: scorePost(post, keywords) }))
    .filter((entry) => entry.post?.slug)
    .sort((a, b) => b.score - a.score || String(b.post?.publishedAt || "").localeCompare(String(a.post?.publishedAt || "")))
    .filter((entry) => entry.score > 0);

  const picks = [];
  const seen = new Set();
  for (const entry of ranked) {
    if (seen.has(entry.post.slug)) continue;
    seen.add(entry.post.slug);
    picks.push(entry.post);
    if (picks.length >= limit) break;
  }
  return picks;
};

const setHiddenOnOpeningTag = (prefix, shouldHide) =>
  prefix.replace(/<(section|article)\b([^>]*)>/i, (match, tag, attrs) => {
    const cleanedAttrs = attrs.replace(/\s+hidden(?:="[^"]*")?/i, "");
    return shouldHide ? `<${tag}${cleanedAttrs} hidden>` : `<${tag}${cleanedAttrs}>`;
  });

const renderEntityItems = (posts, indent) =>
  posts
    .map((post) => {
      const title = escapeHtml(post.title || "Latest robotics update");
      const excerpt = escapeHtml(post.excerpt || "");
      const date = formatDate(post.publishedAt);
      const href = toPostUrl(post.slug);

      return [
        `${indent}<article class="entity-news-item">`,
        `${indent}    <h3><a href="${href}">${title}</a></h3>`,
        date ? `${indent}    <p class="entity-news-date">${date}</p>` : "",
        excerpt ? `${indent}    <p class="entity-news-excerpt">${excerpt}</p>` : "",
        `${indent}</article>`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

const renderRelatedItems = (posts, indent) =>
  posts
    .map((post) => {
      const title = escapeHtml(post.title || "Latest robotics update");
      const date = formatDate(post.publishedAt);
      const href = toPostUrl(post.slug);

      return [
        `${indent}<li class="related-news-item">`,
        `${indent}    <a href="${href}">`,
        `${indent}        <h3>${title}</h3>`,
        date ? `${indent}        <p>${date}</p>` : "",
        `${indent}    </a>`,
        `${indent}</li>`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

const upsertEntityNewsLists = (html, posts) => {
  let changed = false;

  const updated = html.replace(
    /(<(section|article)\b[^>]*\bdata-entity-news\b[^>]*>[\s\S]*?)([ \t]*)<div class="entity-news-list" data-entity-news-list(?:\s+data-static-entity-news="true")?[^>]*>[\s\S]*?<\/div>/gi,
    (match, prefix, _tag, listIndent) => {
      const openTag = prefix.slice(0, prefix.indexOf(">") + 1);
      const keywords = getAttr(openTag, "data-keywords")
        .split(",")
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean);
      const configuredLimit = Number.parseInt(getAttr(openTag, "data-limit") || "", 10);
      const limit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 4;
      const picks = pickPosts(posts, keywords, limit);

      changed = true;
      if (!keywords.length || !picks.length) {
        const hiddenPrefix = setHiddenOnOpeningTag(prefix, true);
        return `${hiddenPrefix}${listIndent}<div class="entity-news-list" data-entity-news-list></div>`;
      }

      const visiblePrefix = setHiddenOnOpeningTag(prefix, false);
      const itemIndent = `${listIndent}    `;
      const renderedItems = renderEntityItems(picks, itemIndent);
      return `${visiblePrefix}${listIndent}<div class="entity-news-list" data-entity-news-list data-static-entity-news="true">\n${renderedItems}\n${listIndent}</div>`;
    }
  );

  return { html: updated, changed };
};

const upsertRelatedNewsSection = (html, pageKey, posts) => {
  const keywords = RELATED_KEYWORD_MAP[pageKey];
  if (!Array.isArray(keywords) || !keywords.length) {
    return { html, changed: false };
  }

  const picks = pickPosts(posts, keywords, 3);
  if (!picks.length) {
    if (/<section class="panel related-news-panel" data-static-related-news="true">/i.test(html)) {
      return {
        html: html.replace(/([ \t]*)<section class="panel related-news-panel" data-static-related-news="true">[\s\S]*?<\/section>\s*/i, ""),
        changed: true,
      };
    }
    return { html, changed: false };
  }

  const footerMatch = html.match(/([ \t]*)<footer class="site-footer">/i);
  if (!footerMatch) {
    return { html, changed: false };
  }

  const indent = footerMatch[1] || "        ";
  const itemIndent = `${indent}        `;
  const section = [
    `${indent}<section class="panel related-news-panel" data-static-related-news="true">`,
    `${indent}    <p class="kicker">RELATED COVERAGE</p>`,
    `${indent}    <h2>Latest Intelligence For This Profile</h2>`,
    `${indent}    <ul class="related-news-list">`,
    renderRelatedItems(picks, itemIndent),
    `${indent}    </ul>`,
    `${indent}</section>`,
    "",
  ].join("\n");

  if (/<section class="panel related-news-panel" data-static-related-news="true">/i.test(html)) {
    return {
      html: html.replace(
        /([ \t]*)<section class="panel related-news-panel" data-static-related-news="true">[\s\S]*?<\/section>\s*/i,
        section
      ),
      changed: true,
    };
  }

  return {
    html: html.replace(/([ \t]*)<footer class="site-footer">/i, `${section}$1<footer class="site-footer">`),
    changed: true,
  };
};

const fetchPosts = async () => {
  const response = await fetch(PROFILE_NEWS_ENDPOINT);
  if (!response.ok) {
    throw new Error(`Sanity query failed: HTTP ${response.status}`);
  }
  const payload = await response.json();
  return (Array.isArray(payload?.result) ? payload.result : []).filter(
    (post) => post?.slug && !EXCLUDED_NEWS_SLUGS.has(String(post.slug || "").trim())
  );
};

const main = async () => {
  const posts = await fetchPosts();
  if (!posts.length) {
    throw new Error("No newsroom posts returned for static profile news build.");
  }

  const htmlFiles = (await fs.readdir(ROOT))
    .filter((file) => file.endsWith(".html"))
    .sort((a, b) => a.localeCompare(b));

  let changedCount = 0;
  for (const file of htmlFiles) {
    const filePath = path.join(ROOT, file);
    const original = await fs.readFile(filePath, "utf8");
    const entityResult = upsertEntityNewsLists(original, posts);
    const relatedResult = upsertRelatedNewsSection(entityResult.html, file.replace(/\.html$/i, "").toLowerCase(), posts);
    if (relatedResult.html === original) continue;

    await fs.writeFile(filePath, relatedResult.html, "utf8");
    changedCount += 1;
  }

  console.log(`Static profile news refreshed for ${changedCount} page(s).`);
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
