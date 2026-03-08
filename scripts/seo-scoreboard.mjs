#!/usr/bin/env node

const token = process.env.GSC_TOKEN;
const quotaProject = process.env.GSC_QUOTA_PROJECT || "ebuyesell";

if (!token) {
  console.error("Missing GSC_TOKEN. Example:");
  console.error("GSC_TOKEN=$(gcloud auth application-default print-access-token) node scripts/seo-scoreboard.mjs");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "x-goog-user-project": quotaProject,
  "Content-Type": "application/json",
};

const targets = [
  { siteUrl: "sc-domain:robot.tv", url: "https://robot.tv/" },
  { siteUrl: "sc-domain:robot.tv", url: "https://robot.tv/news.html" },
  { siteUrl: "https://news.robot.tv/", url: "https://news.robot.tv/" },
  { siteUrl: "https://news.robot.tv/", url: "https://news.robot.tv/post/chinas-dancing-robots-how-worried-should-we-be/" },
];

const sitemapTargets = [
  { siteUrl: "sc-domain:robot.tv", url: "https://robot.tv/sitemap.xml" },
  { siteUrl: "https://news.robot.tv/", url: "https://news.robot.tv/sitemap.xml" },
];

const inspect = async (siteUrl, inspectionUrl) => {
  const resp = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers,
    body: JSON.stringify({ siteUrl, inspectionUrl, languageCode: "en-US" }),
  });
  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
};

const listSitemap = async (siteUrl) => {
  const encoded = encodeURIComponent(siteUrl);
  const resp = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/sitemaps`, {
    headers,
  });
  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
};

const run = async () => {
  console.log("SEO Scoreboard");
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log("");

  console.log("URL Inspection");
  for (const t of targets) {
    const r = await inspect(t.siteUrl, t.url);
    if (!r.ok) {
      console.log(`- ${t.url}`);
      console.log(`  ERROR ${r.status}: ${JSON.stringify(r.data)}`);
      continue;
    }
    const s = r.data?.inspectionResult?.indexStatusResult || {};
    console.log(`- ${t.url}`);
    console.log(`  coverage=${s.coverageState || "n/a"}; verdict=${s.verdict || "n/a"}; lastCrawl=${s.lastCrawlTime || "n/a"}; canonical=${s.googleCanonical || "n/a"}`);
  }

  console.log("");
  console.log("Sitemap Status");
  const grouped = new Map();
  for (const t of sitemapTargets) {
    if (!grouped.has(t.siteUrl)) grouped.set(t.siteUrl, await listSitemap(t.siteUrl));
  }

  for (const t of sitemapTargets) {
    const g = grouped.get(t.siteUrl);
    const entries = g?.data?.sitemap || [];
    const row = entries.find((x) => x.path === t.url);
    console.log(`- ${t.url}`);
    if (!row) {
      console.log("  not found in property list");
      continue;
    }
    const content = Array.isArray(row.contents) && row.contents.length ? row.contents[0] : {};
    console.log(`  submitted=${row.lastSubmitted || "n/a"}; downloaded=${row.lastDownloaded || "n/a"}; pending=${row.isPending}; errors=${row.errors}; warnings=${row.warnings}; webSubmitted=${content.submitted || "n/a"}; webIndexed=${content.indexed || "n/a"}`);
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
