#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = "/Users/cc801/Documents/New project/robottv";
const REPORT_DIR = path.join(ROOT, "ops-private", "reports", "seo");
const REPORT_JSON = path.join(REPORT_DIR, "weekly-content-refresh-report.json");
const REPORT_MD = path.join(REPORT_DIR, "weekly-content-refresh-report.md");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const CONTENT_PLAN_PATH = path.join(ROOT, "content-plan.md");

const CLOSED_QUEUE_STATUSES = new Set(["published", "done", "complete", "completed", "live", "shipped"]);

const toDateOnly = (d) => d.toISOString().slice(0, 10);

const ageDays = (lastmod, now) => {
  const ts = Date.parse(lastmod);
  if (Number.isNaN(ts)) return null;
  return Math.floor((now.getTime() - ts) / 86400000);
};

const parseSitemap = (xml) => {
  const rows = [];
  const re = /<url>\s*<loc>(.*?)<\/loc>\s*<lastmod>(.*?)<\/lastmod>[\s\S]*?<\/url>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    rows.push({ loc: m[1].trim(), lastmod: m[2].trim() });
  }
  return rows;
};

const parseQueueLine = (line) => {
  const clean = line.replace(/^\s*-\s*/, "").trim();
  if (!clean || !clean.includes("|")) return null;
  const parts = clean.split("|").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 3) return null;

  const date = parts[0];
  const lang = parts[1];
  const title = parts[2];
  const statusPart = parts.find((p) => /^status\s*:/i.test(p)) || "";
  const ownerPart = parts.find((p) => /^owner\s*:/i.test(p)) || "";
  const status = statusPart.replace(/^status\s*:/i, "").trim().toLowerCase() || "unknown";
  const owner = ownerPart.replace(/^owner\s*:/i, "").trim() || "unassigned";
  return { raw: clean, date, lang, title, status, owner };
};

const parseContentPlan = async () => {
  try {
    const raw = await fs.readFile(CONTENT_PLAN_PATH, "utf8");
    return raw
      .split(/\r?\n/)
      .map(parseQueueLine)
      .filter(Boolean);
  } catch {
    return [];
  }
};

async function run() {
  const now = new Date();
  const today = toDateOnly(now);
  const xml = await fs.readFile(SITEMAP_PATH, "utf8");
  const urls = parseSitemap(xml).map((u) => ({ ...u, ageDays: ageDays(u.lastmod, now) }));
  const validUrls = urls.filter((u) => u.ageDays !== null);

  const overdue = validUrls.filter((u) => u.ageDays > 45).sort((a, b) => b.ageDays - a.ageDays);
  const warning = validUrls.filter((u) => u.ageDays >= 30 && u.ageDays <= 45).sort((a, b) => b.ageDays - a.ageDays);

  const queueAll = await parseContentPlan();
  const openQueue = queueAll.filter((q) => !CLOSED_QUEUE_STATUSES.has(q.status));

  const report = {
    timestamp: now.toISOString(),
    date: today,
    totals: {
      indexedDocsChecked: validUrls.length,
      overduePages: overdue.length,
      warningPages: warning.length,
      openQueueItems: openQueue.length
    },
    overduePages: overdue.slice(0, 25),
    warningPages: warning.slice(0, 25),
    publishingQueue: openQueue.slice(0, 25),
    recommendations: [
      overdue.length > 0
        ? `Refresh at least ${Math.min(3, overdue.length)} overdue pages this week.`
        : "No overdue pages detected; keep cadence by updating high-value pages.",
      openQueue.length > 0
        ? `Publish at least ${Math.min(2, openQueue.length)} queued pages from content plan.`
        : "Add at least 2 pages to content queue to maintain refresh velocity.",
      "After publishing, update lastmod in sitemap.xml and add 2-3 internal links from high-authority pages."
    ]
  };

  const lines = [
    `# robot.tv SEO Content Refresh Report (${today})`,
    "",
    `- Total indexed docs checked: ${report.totals.indexedDocsChecked}`,
    `- Overdue (>45 days): ${report.totals.overduePages}`,
    `- Warning (30-45 days): ${report.totals.warningPages}`,
    `- Open queue items: ${report.totals.openQueueItems}`,
    "",
    "## Overdue pages",
    ""
  ];

  if (!report.overduePages.length) {
    lines.push("- None.", "");
  } else {
    for (const p of report.overduePages) {
      lines.push(`- ${p.lastmod} | ${p.ageDays}d | ${p.loc}`);
    }
    lines.push("");
  }

  lines.push("## Warning pages", "");
  if (!report.warningPages.length) {
    lines.push("- None.", "");
  } else {
    for (const p of report.warningPages) {
      lines.push(`- ${p.lastmod} | ${p.ageDays}d | ${p.loc}`);
    }
    lines.push("");
  }

  lines.push("## Publishing queue (from content-plan.md)", "");
  if (!report.publishingQueue.length) {
    lines.push("- None.", "");
  } else {
    for (const q of report.publishingQueue) {
      lines.push(`- ${q.date} | ${q.lang} | ${q.title} | status: ${q.status} | owner: ${q.owner}`);
    }
    lines.push("");
  }

  lines.push("## Recommended actions this week", "");
  report.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  lines.push("");

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(REPORT_MD, `${lines.join("\n")}\n`, "utf8");

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) await fs.appendFile(summaryPath, `${lines.join("\n")}\n`, "utf8");

  console.log(JSON.stringify(report, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
