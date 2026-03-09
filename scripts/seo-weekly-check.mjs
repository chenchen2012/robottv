#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.ROBOTTV_ROOT || process.cwd();
const REPORT_DIR = path.join(ROOT, "ops-private", "reports", "seo");
const REPORT_JSON = path.join(REPORT_DIR, "weekly-seo-check.json");
const REPORT_MD = path.join(REPORT_DIR, "weekly-seo-check.md");

const REQUIRED_FILES = ["robots.txt", "sitemap.xml", "_redirects", "404.html", "index.html"];
const REQUIRED_SUPPORT_FILES = [
  path.join("news-studio", "scripts", "build-public-dist.mjs"),
  path.join(".github", "workflows", "deploy-news-studio.yml")
];
const NEWS_STATIC_INDEX = path.join("news-studio", "static", "index.html");
const NEWS_PRELOAD_SCRIPT = path.join("news-studio", "static", "scripts", "preloaded-news-posts.js");
const NEWS_STATIC_HOME_START = "<!-- STATIC_NEWS_HOME_START -->";
const NEWS_STATIC_HOME_END = "<!-- STATIC_NEWS_HOME_END -->";
const CONFIG_SNIPPET_CHECKS = [
  {
    label: "root legacy-news redirects",
    relPath: "_redirects",
    requiredSnippets: [
      "/:year/:month/:day/*.html https://news.robot.tv/:splat/     301!",
      "/:year/:month/*.html      https://news.robot.tv/:splat/     301!",
      "/post/*                   https://news.robot.tv/:splat/     301!",
      "/post/*.html              https://news.robot.tv/:splat/     301!"
    ],
    forbiddenSnippets: [
      "/:year/:month/:day/*     /.netlify/functions/legacy-news-redirect  200!",
      "/:year/:month/*          /.netlify/functions/legacy-news-redirect  200!",
      "/post/*                  /.netlify/functions/legacy-news-redirect  200!"
    ]
  },
  {
    label: "news legacy redirects",
    relPath: path.join("news-studio", "static", "_redirects"),
    requiredSnippets: [
      "/post/*.html                  /:splat/  301!",
      "/post/*                       /:splat/  301!",
      "/:year/:month/:day/*.html     /:splat/  301!",
      "/:year/:month/:slug           /:slug/  301!",
      "/feed       /feed.xml    301!"
    ],
    forbiddenSnippets: [
      "/post/:slug/    /static/post/:slug/index.html   200",
      "/post/*         /404.html                        404",
      "/post/*.html                  /post/:splat  301!",
      "/:year/:month/:slug           /post/:slug  301!",
      "/wp-admin/*    /404.html  410",
      "/*  /404.html  404"
    ]
  },
  {
    label: "news studio host config",
    relPath: path.join("news-studio", "sanity.cli.ts"),
    requiredSnippets: [
      "const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'lumv116w'",
      "const dataset = process.env.SANITY_STUDIO_DATASET || 'production'",
      "const studioHost = process.env.SANITY_STUDIO_HOSTNAME || 'robottv'",
      "studioHost,"
    ],
    forbiddenSnippets: [
      "YOUR_PROJECT_ID"
    ]
  },
  {
    label: "news studio base path config",
    relPath: path.join("news-studio", "sanity.config.ts"),
    requiredSnippets: [
      "const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'lumv116w'",
      "basePath: '/'"
    ],
    forbiddenSnippets: [
      "basePath: '/studio'",
      "YOUR_PROJECT_ID"
    ]
  }
];
const HIGH_VALUE_PAGES = [
  "home.html",
  "humanoid-robots.html",
  "companies.html",
  "china-humanoid-robots.html",
  "warehouse-humanoid-robots.html",
  "industrial-inspection-robots.html",
  "robotics-startup-execution.html",
  "physical-ai-robot-learning.html",
  "collaborative-robot-integration.html",
  "company-unitree.html",
  "unitree-robots.html",
  "company-boston-dynamics.html",
  "company-figure.html",
  "company-tesla.html",
  "tesla-optimus.html",
  "company-agility.html",
  "company-apptronik.html",
  "get-featured.html",
  "partner.html",
  "pricing.html",
  "contact.html",
  "about.html",
  "privacy.html",
  "terms.html"
];
const ALLOWED_NOINDEX_PAGES = new Set([
  "404.html",
  "anymal.html",
  "apollo.html",
  "chenchen.html",
  "contact-success.html",
  "digit.html",
  "handle.html",
  "mediakit-print.html",
  "news.html",
  "sales.html",
  "thr3.html",
  "unitreeb2.html",
  "unitreeg1.html",
  "unitreego2.html",
  "unitreeh1.html",
  "unitreeh2.html",
  "wooshe.html"
  ,
  "yumi.html"
]);

function toIsoNow() {
  return new Date().toISOString();
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseHrefs(html) {
  const hrefs = [];
  const re = /href=["']([^"']+)["']/g;
  for (let m = re.exec(html); m; m = re.exec(html)) hrefs.push(m[1]);
  return hrefs;
}

function normalizeLocalTarget(href) {
  if (!href) return null;
  if (href.includes("${") || href.includes("{{")) return null;
  if (href.startsWith("#")) return null;
  if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return null;
  if (/^[a-z]+:\/\//i.test(href)) return null;

  let clean = href.split("#")[0].split("?")[0].trim();
  if (!clean) return null;
  if (clean.startsWith("/")) clean = clean.slice(1);
  if (!clean) return "index.html";
  if (clean.endsWith("/")) clean += "index.html";
  return clean;
}

async function listHtmlFiles() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => e.name)
    .sort();
}

async function readFileSafe(rel) {
  return fs.readFile(path.join(ROOT, rel), "utf8");
}

async function readOptionalFile(rel) {
  try {
    return await readFileSafe(rel);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

function parseSitemapLocs(xml) {
  const urls = [];
  const re = /<loc>([^<]+)<\/loc>/gi;
  for (let m = re.exec(xml); m; m = re.exec(xml)) urls.push(m[1]);
  return urls;
}

function normalizeSitemapUrlToLocal(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "robot.tv" && parsed.hostname !== "www.robot.tv") return null;
    let pathname = parsed.pathname || "/";
    if (pathname === "/") return "index.html";
    pathname = pathname.replace(/^\/+/, "");
    if (!pathname) return "index.html";
    if (pathname.endsWith("/")) pathname += "index.html";
    return pathname;
  } catch {
    return null;
  }
}

function hasCanonical(html) {
  return /rel=["']canonical["']/i.test(html);
}

function hasNoindex(html) {
  return /noindex/i.test(html);
}

function extractBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) return null;
  return content.slice(start + startMarker.length, end);
}

async function run() {
  const timestamp = toIsoNow();
  const htmlFiles = await listHtmlFiles();
  const allFilesSet = new Set(await fs.readdir(ROOT));

  const requiredMissing = REQUIRED_FILES.filter((f) => !allFilesSet.has(f));
  const requiredSupportMissing = [];
  for (const relPath of REQUIRED_SUPPORT_FILES) {
    if (!(await fileExists(path.join(ROOT, relPath)))) {
      requiredSupportMissing.push(relPath);
    }
  }
  const highValueMissing = HIGH_VALUE_PAGES.filter((f) => !allFilesSet.has(f));

  const canonicalMissing = [];
  const noindexDetected = [];
  const unexpectedNoindex = [];
  const brokenLocalLinks = [];
  const sitemapNoindexUrls = [];
  const redirectConfigIssues = [];
  const newsHomepageIssues = [];

  for (const htmlFile of htmlFiles) {
    const html = await readFileSafe(htmlFile);
    if (!hasCanonical(html)) canonicalMissing.push(htmlFile);
    if (hasNoindex(html)) {
      noindexDetected.push(htmlFile);
      if (!ALLOWED_NOINDEX_PAGES.has(htmlFile)) unexpectedNoindex.push(htmlFile);
    }

    const hrefs = parseHrefs(html);
    for (const href of hrefs) {
      const local = normalizeLocalTarget(href);
      if (!local) continue;
      if (local.includes("news.robot.tv")) continue;

      if (local.endsWith(".html") || !local.includes(".")) {
        const target = local.endsWith(".html") ? local : `${local}.html`;
        if (!(await fileExists(path.join(ROOT, target)))) {
          brokenLocalLinks.push({
            source: htmlFile,
            href,
            resolvedTarget: target
          });
        }
      }
    }
  }

  if (await fileExists(path.join(ROOT, "sitemap.xml"))) {
    const sitemapXml = await readFileSafe("sitemap.xml");
    const sitemapLocs = parseSitemapLocs(sitemapXml);
    for (const loc of sitemapLocs) {
      const local = normalizeSitemapUrlToLocal(loc);
      if (!local) continue;
      if (!(await fileExists(path.join(ROOT, local)))) continue;
      const html = await readFileSafe(local);
      if (hasNoindex(html)) {
        sitemapNoindexUrls.push({
          url: loc,
          file: local
        });
      }
    }
  }

  for (const ruleCheck of CONFIG_SNIPPET_CHECKS) {
    const content = await readOptionalFile(ruleCheck.relPath);
    if (!content) {
      redirectConfigIssues.push({
        label: ruleCheck.label,
        relPath: ruleCheck.relPath,
        issue: "missing file"
      });
      continue;
    }
    for (const snippet of ruleCheck.requiredSnippets) {
      if (!content.includes(snippet)) {
        redirectConfigIssues.push({
          label: ruleCheck.label,
          relPath: ruleCheck.relPath,
          issue: `missing required redirect snippet: ${snippet}`
        });
      }
    }
    for (const snippet of ruleCheck.forbiddenSnippets) {
      if (content.includes(snippet)) {
        redirectConfigIssues.push({
          label: ruleCheck.label,
          relPath: ruleCheck.relPath,
          issue: `found deprecated redirect snippet: ${snippet}`
        });
      }
    }
  }

  const newsStaticIndexHtml = await readOptionalFile(NEWS_STATIC_INDEX);
  const newsPreloadScript = await readOptionalFile(NEWS_PRELOAD_SCRIPT);
  if (!newsStaticIndexHtml) {
    newsHomepageIssues.push(`Missing news static homepage template: ${NEWS_STATIC_INDEX}`);
  } else {
    if (!newsStaticIndexHtml.includes('<script src="scripts/preloaded-news-posts.js">')) {
      newsHomepageIssues.push("News homepage template is missing the preloaded posts script include");
    }
    const staticHomeBlock = extractBetween(
      newsStaticIndexHtml,
      NEWS_STATIC_HOME_START,
      NEWS_STATIC_HOME_END
    );
    if (!staticHomeBlock) {
      newsHomepageIssues.push("News homepage template is missing the static homepage fallback markers");
    } else {
      const articleHrefMatches = [...staticHomeBlock.matchAll(/href="\/([^"?#]+)\/"/g)]
        .map((match) => match[1])
        .filter((slug) => slug && !slug.includes("${"));
      const uniqueArticleSlugs = new Set(articleHrefMatches);
      if (uniqueArticleSlugs.size < 1) {
        newsHomepageIssues.push("News homepage static fallback does not include any crawlable article links");
      }
      if (staticHomeBlock.includes("/post/")) {
        newsHomepageIssues.push("News homepage static fallback still contains legacy /post/ links");
      }
      if (/\?page=\d+/i.test(staticHomeBlock)) {
        newsHomepageIssues.push("News homepage static fallback exposes query pagination links");
      }
    }
  }
  if (!newsPreloadScript) {
    newsHomepageIssues.push(`Missing news homepage preload script: ${NEWS_PRELOAD_SCRIPT}`);
  } else {
    if (!newsPreloadScript.includes("window.__ROBOTTV_PRELOADED_POSTS__ = [")) {
      newsHomepageIssues.push("News homepage preload script is missing the expected post payload");
    }
    if (newsPreloadScript.includes("/post/")) {
      newsHomepageIssues.push("News homepage preload script still contains legacy /post/ URLs");
    }
  }

  const failedChecks = [];
  const warnings = [];

  if (requiredMissing.length > 0) {
    failedChecks.push(`Missing required SEO files: ${requiredMissing.join(", ")}`);
  }
  if (requiredSupportMissing.length > 0) {
    failedChecks.push(`Missing SEO support files: ${requiredSupportMissing.join(", ")}`);
  }
  if (redirectConfigIssues.length > 0) {
    failedChecks.push(`Redirect config regression detected: ${redirectConfigIssues.length}`);
  }
  if (newsHomepageIssues.length > 0) {
    failedChecks.push(`News homepage crawlability regression detected: ${newsHomepageIssues.length}`);
  }
  if (brokenLocalLinks.length > 0) {
    warnings.push(`Broken local links found: ${brokenLocalLinks.length}`);
  }
  if (canonicalMissing.length > 0) {
    warnings.push(`HTML pages missing canonical tag: ${canonicalMissing.length}`);
  }
  if (unexpectedNoindex.length > 0) {
    warnings.push(`Unexpected noindex pages: ${unexpectedNoindex.length}`);
  }
  if (highValueMissing.length > 0) {
    warnings.push(`High-value pages missing: ${highValueMissing.length}`);
  }
  if (sitemapNoindexUrls.length > 0) {
    warnings.push(`Sitemap includes noindex pages: ${sitemapNoindexUrls.length}`);
  }

  const status = failedChecks.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";

  const report = {
    timestamp,
    status,
    summary: {
      htmlPagesScanned: htmlFiles.length,
      requiredMissing: requiredMissing.length,
      requiredSupportMissing: requiredSupportMissing.length,
      highValueMissing: highValueMissing.length,
      canonicalMissing: canonicalMissing.length,
      noindexDetected: noindexDetected.length,
      unexpectedNoindex: unexpectedNoindex.length,
      brokenLocalLinks: brokenLocalLinks.length,
      sitemapNoindexUrls: sitemapNoindexUrls.length,
      redirectConfigIssues: redirectConfigIssues.length,
      newsHomepageIssues: newsHomepageIssues.length
    },
    failedChecks,
    warnings,
    details: {
      requiredMissing,
      requiredSupportMissing,
      highValueMissing,
      canonicalMissing,
      noindexDetected,
      unexpectedNoindex,
      brokenLocalLinks: brokenLocalLinks.slice(0, 60),
      sitemapNoindexUrls,
      redirectConfigIssues,
      newsHomepageIssues
    }
  };

  const mdLines = [
    "# Weekly SEO Check",
    "",
    `- Timestamp: ${timestamp}`,
    `- Status: **${status.toUpperCase()}**`,
    "",
    "## Summary",
    `- HTML pages scanned: ${report.summary.htmlPagesScanned}`,
    `- Missing required SEO files: ${report.summary.requiredMissing}`,
    `- Missing SEO support files: ${report.summary.requiredSupportMissing}`,
    `- Missing high-value pages: ${report.summary.highValueMissing}`,
    `- Missing canonical tags: ${report.summary.canonicalMissing}`,
    `- Pages with noindex (all): ${report.summary.noindexDetected}`,
    `- Unexpected noindex pages: ${report.summary.unexpectedNoindex}`,
    `- Broken local links: ${report.summary.brokenLocalLinks}`,
    `- Sitemap URLs pointing to noindex pages: ${report.summary.sitemapNoindexUrls}`,
    `- Redirect config issues: ${report.summary.redirectConfigIssues}`,
    `- News homepage crawlability issues: ${report.summary.newsHomepageIssues}`,
    ""
  ];

  if (failedChecks.length) {
    mdLines.push("## Failed Checks", ...failedChecks.map((x) => `- ${x}`), "");
  }
  if (warnings.length) {
    mdLines.push("## Warnings", ...warnings.map((x) => `- ${x}`), "");
  }

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(REPORT_MD, `${mdLines.join("\n")}\n`, "utf8");

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    await fs.appendFile(summaryPath, `${mdLines.join("\n")}\n`, "utf8");
  }

  console.log(JSON.stringify(report, null, 2));
  if (status === "fail") process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
