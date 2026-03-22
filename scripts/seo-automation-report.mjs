#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_DIR = path.join(ROOT, "ops-private", "reports", "seo");
const REPORT_JSON = path.join(REPORT_DIR, "seo-automation-report.json");
const REPORT_MD = path.join(REPORT_DIR, "seo-automation-report.md");
const MANIFEST_PATH = path.join(ROOT, "scripts", "seo-evergreen-manifest.json");

const FAQ_THRESHOLD = 4;
const INTERNAL_LINK_THRESHOLD = 3;
const WORD_COUNT_THRESHOLD = 700;

const stripTags = (value) =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const countOccurrences = (html, pattern) => (html.match(pattern) || []).length;

const pickPrimaryKeyword = (entry) => String(entry.keywords?.[0] || "").trim();

const deriveArticleIdeas = (entry, missingLinks) => {
  const base = pickPrimaryKeyword(entry);
  const ideas = [];

  if (entry.pageType === "company") {
    ideas.push(`${base} deployment proof and commercialization watch`);
    ideas.push(`${base} vs competitors: what actually matters now`);
  } else if (entry.pageType === "topic-hub") {
    ideas.push(`${base} market map: what changed this quarter`);
    ideas.push(`best ${base} signals to watch next`);
  } else if (entry.pageType === "comparison-guide") {
    ideas.push(`${base} buyer guide and comparison checklist`);
    ideas.push(`${base} lineup explained by workflow`);
  } else {
    ideas.push(`${base} deployment signals and proof checklist`);
    ideas.push(`${base} vs alternatives: where it actually fits`);
  }

  if (missingLinks.length) {
    ideas.push(`${base} internal-link support article for ${missingLinks[0].replace(/\.html$/, "")}`);
  }

  return ideas.slice(0, 3);
};

const deriveAutomationOpportunities = (issues) => {
  const opportunities = [];
  const thinCount = issues.filter((i) => i.flags.includes("thin_content")).length;
  const faqCount = issues.filter((i) => i.flags.includes("weak_faq_coverage")).length;
  const internalLinkCount = issues.filter((i) => i.flags.includes("weak_internal_linking")).length;
  const newsCount = issues.filter((i) => i.flags.includes("missing_news_connection")).length;

  if (internalLinkCount > 0) {
    opportunities.push({
      priority: "HIGH",
      automation: "Internal linking automation",
      detail: `At least ${internalLinkCount} evergreen pages are under-linked against their manifest targets. Add a script that injects or recommends missing high-value internal links before publish.`,
    });
  }
  if (faqCount > 0) {
    opportunities.push({
      priority: "HIGH",
      automation: "SEO outline / FAQ generator",
      detail: `${faqCount} pages are below the FAQ target. Auto-generate People Also Ask style FAQ candidates from page keywords and page type.`,
    });
  }
  if (thinCount > 0) {
    opportunities.push({
      priority: "MEDIUM",
      automation: "Thin content detector",
      detail: `${thinCount} pages are below the working word-count threshold. Flag these weekly and attach 2-3 expansion angles automatically.`,
    });
  }
  if (newsCount > 0) {
    opportunities.push({
      priority: "MEDIUM",
      automation: "News-to-evergreen support automation",
      detail: `${newsCount} pages lack a visible related-news or entity-news block. Auto-suggest or inject support stories based on page keywords.`,
    });
  }

  opportunities.push({
    priority: "HIGH",
    automation: "Keyword clustering pipeline",
    detail: "Use the companion keyword clustering script to turn raw keyword exports into pillar, company, robot, and support-article queues.",
  });

  return opportunities;
};

async function analyzeEntry(entry) {
  const filePath = path.join(ROOT, entry.file);
  const raw = await fs.readFile(filePath, "utf8");
  const text = stripTags(raw);
  const normalizedHtml = normalize(raw);
  const normalizedText = normalize(text);
  const titleMatch = raw.match(/<title>([\s\S]*?)<\/title>/i);
  const metaMatch = raw.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i);
  const title = titleMatch ? titleMatch[1].trim() : "";
  const metaDescription = metaMatch ? metaMatch[1].trim() : "";
  const primaryKeyword = pickPrimaryKeyword(entry);
  const normalizedPrimary = normalize(primaryKeyword);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const faqCount = countOccurrences(raw, /<div class="faq-item">|<article class="faq-item">|<article class="faq-card">/g);
  const internalLinks = (entry.internalLinks || []).filter((link) => raw.includes(`href="${link}"`) || raw.includes(`href='${link}'`));
  const missingLinks = (entry.internalLinks || []).filter((link) => !internalLinks.includes(link));
  const hasEntityNews = /data-entity-news|related-news-panel|Latest Intelligence|Latest Coverage/i.test(raw);
  const titleHasPrimary = normalizedPrimary ? normalize(title).includes(normalizedPrimary) : true;
  const metaHasPrimary = normalizedPrimary ? normalize(metaDescription).includes(normalizedPrimary) : true;
  const textHasPrimary = normalizedPrimary ? normalizedText.includes(normalizedPrimary) : true;

  const flags = [];
  if (!titleHasPrimary || !metaHasPrimary) flags.push("weak_keyword_targeting");
  if (faqCount < FAQ_THRESHOLD) flags.push("weak_faq_coverage");
  if (internalLinks.length < Math.min(INTERNAL_LINK_THRESHOLD, (entry.internalLinks || []).length || INTERNAL_LINK_THRESHOLD)) {
    flags.push("weak_internal_linking");
  }
  if (wordCount < WORD_COUNT_THRESHOLD) flags.push("thin_content");
  if (!hasEntityNews) flags.push("missing_news_connection");
  if (!textHasPrimary) flags.push("primary_keyword_weak_in_body");

  const score =
    flags.length * 2 +
    (missingLinks.length ? 1 : 0) +
    (wordCount < WORD_COUNT_THRESHOLD ? 1 : 0);

  return {
    file: entry.file,
    pageType: entry.pageType,
    primaryIntent: entry.primaryIntent,
    primaryKeyword,
    title,
    metaDescription,
    wordCount,
    faqCount,
    linkedTargetCount: internalLinks.length,
    missingLinks,
    hasEntityNews,
    flags,
    priorityScore: score,
    suggestedArticleIdeas: deriveArticleIdeas(entry, missingLinks),
    suggestedUpgrades: [
      faqCount < FAQ_THRESHOLD ? `Add ${FAQ_THRESHOLD - faqCount} more FAQ items targeting proof, comparison, or buyer intent.` : null,
      missingLinks.length ? `Add internal links to: ${missingLinks.slice(0, 4).join(", ")}.` : null,
      wordCount < WORD_COUNT_THRESHOLD ? `Expand with at least ${WORD_COUNT_THRESHOLD - wordCount} more words of structured comparison or deployment context.` : null,
      !hasEntityNews ? "Add a related-news or entity-news block so the page keeps absorbing newsroom freshness." : null,
      !titleHasPrimary || !metaHasPrimary ? "Tighten title/meta so the primary keyword appears naturally in both." : null,
    ].filter(Boolean),
  };
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  const analyses = [];

  for (const entry of manifest) {
    try {
      analyses.push(await analyzeEntry(entry));
    } catch (error) {
      analyses.push({
        file: entry.file,
        pageType: entry.pageType,
        primaryIntent: entry.primaryIntent,
        primaryKeyword: pickPrimaryKeyword(entry),
        error: error.message,
        flags: ["analysis_failed"],
        priorityScore: 99,
        suggestedArticleIdeas: [],
        suggestedUpgrades: ["Fix missing or unreadable page before next SEO pass."],
      });
    }
  }

  analyses.sort((a, b) => b.priorityScore - a.priorityScore || a.file.localeCompare(b.file));

  const topUpgradeCandidates = analyses.slice(0, 12);
  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      pagesAnalyzed: analyses.length,
      thinContentCandidates: analyses.filter((a) => a.flags.includes("thin_content")).length,
      weakFaqCandidates: analyses.filter((a) => a.flags.includes("weak_faq_coverage")).length,
      weakInternalLinkCandidates: analyses.filter((a) => a.flags.includes("weak_internal_linking")).length,
      missingNewsConnectionCandidates: analyses.filter((a) => a.flags.includes("missing_news_connection")).length,
    },
    topUpgradeCandidates,
    automationOpportunities: deriveAutomationOpportunities(analyses),
    analyses,
  };

  const md = [
    `# robot.tv SEO Automation Report`,
    ``,
    `Generated: ${report.generatedAt}`,
    ``,
    `## Totals`,
    ``,
    `- Pages analyzed: ${report.totals.pagesAnalyzed}`,
    `- Thin content candidates: ${report.totals.thinContentCandidates}`,
    `- Weak FAQ candidates: ${report.totals.weakFaqCandidates}`,
    `- Weak internal-link candidates: ${report.totals.weakInternalLinkCandidates}`,
    `- Missing news-connection candidates: ${report.totals.missingNewsConnectionCandidates}`,
    ``,
    `## Top Upgrade Candidates`,
    ``,
  ];

  for (const item of topUpgradeCandidates) {
    md.push(`### ${item.file}`);
    md.push(`- Primary keyword: ${item.primaryKeyword || "n/a"}`);
    md.push(`- Flags: ${item.flags.join(", ") || "none"}`);
    md.push(`- Word count: ${item.wordCount ?? "n/a"}`);
    md.push(`- FAQ count: ${item.faqCount ?? "n/a"}`);
    md.push(`- Missing internal links: ${item.missingLinks?.join(", ") || "none"}`);
    for (const upgrade of item.suggestedUpgrades || []) md.push(`- Upgrade: ${upgrade}`);
    for (const idea of item.suggestedArticleIdeas || []) md.push(`- Support article idea: ${idea}`);
    md.push("");
  }

  md.push("## Automation Opportunities", "");
  for (const item of report.automationOpportunities) {
    md.push(`- [${item.priority}] ${item.automation}: ${item.detail}`);
  }
  md.push("");

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(REPORT_MD, `${md.join("\n")}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
