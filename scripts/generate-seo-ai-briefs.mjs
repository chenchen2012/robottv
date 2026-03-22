#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPORT_PATH = path.join(ROOT, "ops-private", "reports", "seo", "seo-automation-report.json");
const DEFAULT_OUT_DIR = path.join(ROOT, "ops-private", "reports", "seo");
const DEFAULT_OUTPUT_JSON = path.join(DEFAULT_OUT_DIR, "seo-ai-briefs.json");
const DEFAULT_OUTPUT_MD = path.join(DEFAULT_OUT_DIR, "seo-ai-briefs.md");
const API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/chat/completions";
const API_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const API_KEY = String(process.env.DEEPSEEK_API_KEY || "").trim();

const args = process.argv.slice(2);
const readArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
};

const REPORT_PATH = path.resolve(readArg("--report") || DEFAULT_REPORT_PATH);
const OUTPUT_DIR = path.resolve(readArg("--output-dir") || DEFAULT_OUT_DIR);
const LIMIT = Math.max(1, Number.parseInt(readArg("--limit") || "5", 10) || 5);
const OUTPUT_JSON = path.join(OUTPUT_DIR, "seo-ai-briefs.json");
const OUTPUT_MD = path.join(OUTPUT_DIR, "seo-ai-briefs.md");

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toTitleCase = (value) =>
  String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function buildFallbackBrief(page) {
  const primary = page.primaryKeyword || page.file.replace(/\.html$/, "");
  const humanKeyword = toTitleCase(primary);
  const missingNews = page.flags?.includes("missing_news_connection");
  const weakFaq = page.flags?.includes("weak_faq_coverage");
  const weakKeyword = page.flags?.includes("weak_keyword_targeting");

  return {
    summary: `Focus this page on ${primary} as a durable ranking asset by tightening search-intent phrasing, reinforcing internal routing, and keeping it visibly connected to newsroom freshness.`,
    impactLevel: page.priorityScore >= 2 ? "HIGH" : "MEDIUM",
    seoTitles: [
      `${humanKeyword} Guide: Market Signals, Comparison, and Deployment Context | robot.tv`,
      `${humanKeyword}: What Matters Now for Buyers, Builders, and Operators | robot.tv`,
      `${humanKeyword} Analysis: Market Context, Use Cases, and Key Signals | robot.tv`,
    ],
    metaDescriptions: [
      `Track ${primary}, deployment signals, comparison context, and the most useful internal paths on robot.tv.`,
      `Use robot.tv to understand ${primary}, key market signals, and the next pages to open for deeper analysis.`,
    ],
    h2Ideas: [
      `What ${primary} searchers usually want to know`,
      `${humanKeyword} market and deployment signals to watch`,
      `Best next internal paths after this page`,
    ],
    faqCandidates: [
      `What should readers compare first when evaluating ${primary}?`,
      `What makes ${primary} more than a short-term demo story?`,
      `Which robot.tv pages should support this topic cluster next?`,
    ],
    internalLinkSuggestions: (page.missingLinks || []).slice(0, 4).map((href) => ({
      href,
      reason: `Add this link to route ${primary} readers into a stronger evergreen support page.`,
    })),
    contentExpansionAngles: [
      "Deployment proof and operating reality",
      "Comparison criteria readers can actually use",
      "Market context that larger publishers often leave thin",
    ],
    newsBlockStrategy: missingNews
      ? "Add a visible related-news or latest-intelligence block that points to 3 current newsroom stories feeding this evergreen page."
      : "Keep the visible news block current so the page continues absorbing freshness from the newsroom.",
    automationHooks: [
      weakFaq ? "Use this page in the FAQ generator queue." : "FAQ coverage is already healthy; prioritize maintenance only.",
      weakKeyword ? "Re-run keyword-targeting checks after title/meta edits." : "Use this page as a model for future intent-aligned title/meta patterns.",
      "Feed this page into the weekly AI brief workflow after each newsroom refresh.",
    ],
  };
}

function sanitizeAiJson(raw) {
  const value = String(raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(value.slice(start, end + 1));
  return JSON.parse(value);
}

async function callDeepSeek(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek request failed (${response.status}): ${text.slice(0, 400)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned no content.");
  return sanitizeAiJson(content);
}

function buildPrompt(candidate) {
  return [
    "You are an elite robotics SEO strategist helping robot.tv improve Google rankings.",
    "Use only the supplied page facts and issue list. Do not invent facts, metrics, or claims.",
    "Return strict JSON only.",
    "JSON shape:",
    '{',
    '  "summary": "string",',
    '  "impactLevel": "HIGH|MEDIUM|LOW",',
    '  "seoTitles": ["string", "string", "string"],',
    '  "metaDescriptions": ["string", "string"],',
    '  "h2Ideas": ["string", "string", "string"],',
    '  "faqCandidates": ["string", "string", "string"],',
    '  "internalLinkSuggestions": [{"href":"string","reason":"string"}],',
    '  "contentExpansionAngles": ["string", "string", "string"],',
    '  "newsBlockStrategy": "string",',
    '  "automationHooks": ["string", "string", "string"]',
    '}',
    "Rules:",
    "- Focus on practical ranking improvements, not theory.",
    "- Keep titles under roughly 70 characters when possible.",
    "- Keep meta descriptions under roughly 160 characters when possible.",
    "- Only suggest internal links from the provided missing links when any exist.",
    "- If there are no missing links, return an empty internalLinkSuggestions array.",
    "",
    `File: ${candidate.file}`,
    `Page type: ${candidate.pageType}`,
    `Primary intent: ${candidate.primaryIntent}`,
    `Primary keyword: ${candidate.primaryKeyword}`,
    `Current title: ${candidate.title}`,
    `Current meta description: ${candidate.metaDescription}`,
    `Flags: ${(candidate.flags || []).join(", ") || "none"}`,
    `Suggested upgrades from report: ${(candidate.suggestedUpgrades || []).join(" | ") || "none"}`,
    `Missing internal links: ${(candidate.missingLinks || []).join(" | ") || "none"}`,
    `Suggested article ideas: ${(candidate.suggestedArticleIdeas || []).join(" | ") || "none"}`,
  ].join("\n");
}

async function buildBrief(candidate) {
  if (!API_KEY) {
    return {
      ...buildFallbackBrief(candidate),
      generationMode: "fallback",
    };
  }

  try {
    const aiResult = await callDeepSeek({
      model: API_MODEL,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: "You are a precise robotics SEO operator. You return strict JSON and never invent facts.",
        },
        {
          role: "user",
          content: buildPrompt(candidate),
        },
      ],
    });
    return {
      ...aiResult,
      generationMode: "deepseek",
    };
  } catch (error) {
    return {
      ...buildFallbackBrief(candidate),
      generationMode: "fallback",
      generationError: error.message,
    };
  }
}

async function main() {
  const report = JSON.parse(await fs.readFile(REPORT_PATH, "utf8"));
  const candidates = Array.isArray(report.topUpgradeCandidates) ? report.topUpgradeCandidates.slice(0, LIMIT) : [];
  const briefs = [];

  for (const candidate of candidates) {
    briefs.push({
      file: candidate.file,
      primaryKeyword: candidate.primaryKeyword,
      flags: candidate.flags || [],
      brief: await buildBrief(candidate),
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    reportPath: REPORT_PATH,
    generationMode: API_KEY ? "deepseek_or_fallback" : "fallback_only",
    candidatesAnalyzed: briefs.length,
    briefs,
  };

  const md = [
    "# robot.tv AI SEO Briefs",
    "",
    `Generated: ${output.generatedAt}`,
    `Source report: ${output.reportPath}`,
    `Candidates analyzed: ${output.candidatesAnalyzed}`,
    `Generation mode: ${output.generationMode}`,
    "",
  ];

  for (const item of briefs) {
    md.push(`## ${item.file}`);
    md.push(`- Primary keyword: ${item.primaryKeyword}`);
    md.push(`- Flags: ${item.flags.join(", ") || "none"}`);
    md.push(`- Brief mode: ${item.brief.generationMode}`);
    if (item.brief.generationError) md.push(`- Brief fallback reason: ${item.brief.generationError}`);
    md.push(`- Summary: ${item.brief.summary}`);
    md.push(`- Impact: ${item.brief.impactLevel}`);
    for (const title of item.brief.seoTitles || []) md.push(`- SEO title: ${title}`);
    for (const meta of item.brief.metaDescriptions || []) md.push(`- Meta description: ${meta}`);
    for (const h2 of item.brief.h2Ideas || []) md.push(`- H2 idea: ${h2}`);
    for (const faq of item.brief.faqCandidates || []) md.push(`- FAQ candidate: ${faq}`);
    for (const link of item.brief.internalLinkSuggestions || []) md.push(`- Internal link: ${link.href} | ${link.reason}`);
    for (const angle of item.brief.contentExpansionAngles || []) md.push(`- Expansion angle: ${angle}`);
    md.push(`- News block strategy: ${item.brief.newsBlockStrategy}`);
    for (const hook of item.brief.automationHooks || []) md.push(`- Automation hook: ${hook}`);
    md.push("");
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await fs.writeFile(OUTPUT_MD, `${md.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({
    reportPath: REPORT_PATH,
    outputJson: OUTPUT_JSON,
    outputMd: OUTPUT_MD,
    candidatesAnalyzed: briefs.length,
    generationMode: output.generationMode,
    briefModes: briefs.map((item) => ({ file: item.file, mode: item.brief.generationMode })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
