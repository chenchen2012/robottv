import path from "node:path";
import process from "node:process";
import os from "node:os";
import { buildEditorialPackage, blocksFromParagraphs, writeEditorialReport } from "./lib/news-editorial-content.mjs";

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || "production";
const token = process.env.SANITY_API_TOKEN || "";
const defaultLimit = Number(process.env.BACKFILL_LIMIT || 18);
const dryRun = process.env.DRY_RUN === "1";
const reportDir = path.join(process.cwd(), "..", "ops-private", "reports", "seo", "news-post-enrichment");

if (!projectId || !token) {
  console.error("Missing required env: SANITY_PROJECT_ID (or SANITY_STUDIO_PROJECT_ID) and SANITY_API_TOKEN");
  process.exit(1);
}

const args = process.argv.slice(2);
let limit = defaultLimit;
let includeDrafts = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--limit" && args[i + 1]) {
    limit = Number(args[i + 1]) || defaultLimit;
    i += 1;
  } else if (args[i] === "--include-drafts") {
    includeDrafts = true;
  }
}

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();
const countWords = (value) => normalizeWhitespace(value).split(" ").filter(Boolean).length;

const blocksToParagraphs = (body) => {
  if (!Array.isArray(body)) return [];
  return body
    .filter((block) => block && block._type === "block" && Array.isArray(block.children))
    .map((block) => block.children.map((child) => child?.text || "").join("").trim())
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);
};

const isMetaParagraph = (paragraph) => {
  const text = normalizeWhitespace(paragraph);
  if (!text) return true;
  if (/^status:/i.test(text)) return true;
  if (/^source:/i.test(text)) return true;
  if (/^coverage source:/i.test(text)) return true;
  if (/^original coverage link:/i.test(text)) return true;
  if (/^original article:/i.test(text)) return true;
  return /news\.google\.com\/rss\/articles/i.test(text);
};

const isThinPost = (post) => {
  const renderableParagraphs = blocksToParagraphs(post.body).filter((paragraph) => !isMetaParagraph(paragraph));
  const bodyWords = renderableParagraphs.reduce((sum, paragraph) => sum + countWords(paragraph), 0);
  const excerptWords = countWords(post.excerpt || "");
  return bodyWords < 45 || excerptWords < 18;
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
};

const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
};

const query = `*[_type=="post" && defined(slug.current) ${includeDrafts ? "" : '&& !(_id in path("drafts.**"))'}] | order(publishedAt desc)[0...80]{
  _id,
  title,
  excerpt,
  videoSummary,
  body,
  sourceName,
  sourceUrl,
  sourcePublishedAt,
  "slug": slug.current
}`;

const queryUrl = `https://${projectId}.api.sanity.io/v2023-10-01/data/query/${dataset}?query=${encodeURIComponent(query)}`;
const result = await fetchJson(queryUrl);
const posts = (Array.isArray(result.result) ? result.result : []).filter(isThinPost).slice(0, limit);

if (!posts.length) {
  console.log("No recent thin posts found for enrichment.");
  process.exit(0);
}

console.log(`Enriching ${posts.length} thin news posts${dryRun ? " (dry run)" : ""}...`);

const mutations = [];

for (const post of posts) {
  const editorial = await buildEditorialPackage({
    headline: post.title,
    source: post.sourceName,
    sourceUrl: post.sourceUrl,
    pubDate: post.sourcePublishedAt,
  });

  const body = blocksFromParagraphs(editorial.bodyParagraphs);
  mutations.push({
    patch: {
      id: post._id,
      set: {
        excerpt: editorial.excerpt,
        videoSummary: editorial.videoSummary,
        body,
      },
    },
  });

  const reportFile = path.join(reportDir, `${post.slug}.md`);
  await writeEditorialReport(reportFile, {
    title: post.title,
    source: post.sourceName,
    editorialPackage: editorial,
  });

  console.log(`- ${post.slug} (${editorial.generationMode})`);
}

if (dryRun) {
  console.log("Dry run only; no Sanity documents were patched.");
  process.exit(0);
}

const mutateUrl = `https://${projectId}.api.sanity.io/v2023-10-01/data/mutate/${dataset}`;
const chunkSize = 20;
for (let i = 0; i < mutations.length; i += chunkSize) {
  const batch = mutations.slice(i, i + chunkSize);
  await postJson(mutateUrl, { mutations: batch });
  console.log(`Patched batch ${Math.floor(i / chunkSize) + 1}: ${batch.length} posts`);
}

console.log(`Thin-post enrichment complete.${os.EOL}Reports: ${reportDir}`);
