#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = "/Users/cc801/Documents/New project/robottv";
const REPORT_DIR = path.join(ROOT, "ops-private", "reports", "seo");
const REPORT_JSON = path.join(REPORT_DIR, "weekly-seo-check.json");
const REPORT_MD = path.join(REPORT_DIR, "weekly-seo-check.md");

const REQUIRED_FILES = ["robots.txt", "sitemap.xml", "_redirects", "404.html", "index.html"];
const HIGH_VALUE_PAGES = [
  "companies.html",
  "robot-companies.html",
  "company-unitree.html",
  "company-boston-dynamics.html",
  "company-figure.html",
  "company-tesla.html",
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
  "chenchen.html",
  "contact-success.html",
  "mediakit-print.html",
  "news.html",
  "sales.html",
  "wooshe.html"
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

function hasCanonical(html) {
  return /rel=["']canonical["']/i.test(html);
}

function hasNoindex(html) {
  return /noindex/i.test(html);
}

async function run() {
  const timestamp = toIsoNow();
  const htmlFiles = await listHtmlFiles();
  const allFilesSet = new Set(await fs.readdir(ROOT));

  const requiredMissing = REQUIRED_FILES.filter((f) => !allFilesSet.has(f));
  const highValueMissing = HIGH_VALUE_PAGES.filter((f) => !allFilesSet.has(f));

  const canonicalMissing = [];
  const noindexDetected = [];
  const unexpectedNoindex = [];
  const brokenLocalLinks = [];

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

  const failedChecks = [];
  const warnings = [];

  if (requiredMissing.length > 0) {
    failedChecks.push(`Missing required SEO files: ${requiredMissing.join(", ")}`);
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

  const status = failedChecks.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";

  const report = {
    timestamp,
    status,
    summary: {
      htmlPagesScanned: htmlFiles.length,
      requiredMissing: requiredMissing.length,
      highValueMissing: highValueMissing.length,
      canonicalMissing: canonicalMissing.length,
      noindexDetected: noindexDetected.length,
      unexpectedNoindex: unexpectedNoindex.length,
      brokenLocalLinks: brokenLocalLinks.length
    },
    failedChecks,
    warnings,
    details: {
      requiredMissing,
      highValueMissing,
      canonicalMissing,
      noindexDetected,
      unexpectedNoindex,
      brokenLocalLinks: brokenLocalLinks.slice(0, 60)
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
    `- Missing high-value pages: ${report.summary.highValueMissing}`,
    `- Missing canonical tags: ${report.summary.canonicalMissing}`,
    `- Pages with noindex (all): ${report.summary.noindexDetected}`,
    `- Unexpected noindex pages: ${report.summary.unexpectedNoindex}`,
    `- Broken local links: ${report.summary.brokenLocalLinks}`,
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
