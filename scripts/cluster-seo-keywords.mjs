#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = path.join(ROOT, "ops-private", "reports", "seo");

const args = process.argv.slice(2);
const readArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
};

const inputPath = readArg("--input");
const outputDir = readArg("--output-dir") || DEFAULT_OUT_DIR;

if (!inputPath) {
  console.error("Usage: node scripts/cluster-seo-keywords.mjs --input <txt|csv|json> [--output-dir <dir>]");
  process.exit(1);
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "best", "top", "guide",
  "what", "how", "why", "is", "are", "vs", "versus", "robot", "robots"
]);

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value) =>
  normalize(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token));

const inferIntent = (keyword) => {
  const value = normalize(keyword);
  if (/companies|company|maker|manufacturer/.test(value)) return "company";
  if (/compare|comparison|vs|versus|best/.test(value)) return "comparison";
  if (/how|what|why|guide|explained/.test(value)) return "informational";
  if (/price|cost|buy/.test(value)) return "commercial";
  return "topic";
};

const inferPageType = (tokens) => {
  if (tokens.some((t) => ["company", "maker", "manufacturer"].includes(t))) return "company-page";
  if (tokens.some((t) => ["compare", "comparison", "versus"].includes(t))) return "comparison-page";
  if (tokens.some((t) => ["unitree", "tesla", "figure", "atlas", "digit", "apollo", "spot", "stretch"].includes(t))) {
    return "robot-or-company-page";
  }
  return "topic-hub";
};

const parseInput = async (filePath) => {
  const raw = await fs.readFile(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    if (Array.isArray(parsed.keywords)) return parsed.keywords.map(String).filter(Boolean);
  }
  if (filePath.endsWith(".csv")) {
    return raw
      .split(/\r?\n/)
      .flatMap((line) => line.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return raw
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
};

const clusterKeywords = (keywords) => {
  const clusters = new Map();

  for (const keyword of keywords) {
    const tokens = tokenize(keyword);
    const anchor = tokens.slice(0, 2).join(" ") || normalize(keyword);
    if (!clusters.has(anchor)) {
      clusters.set(anchor, {
        anchor,
        keywords: [],
        tokens: new Map(),
        intents: new Map(),
      });
    }
    const cluster = clusters.get(anchor);
    cluster.keywords.push(keyword);
    cluster.intents.set(inferIntent(keyword), (cluster.intents.get(inferIntent(keyword)) || 0) + 1);
    for (const token of tokens) cluster.tokens.set(token, (cluster.tokens.get(token) || 0) + 1);
  }

  return Array.from(clusters.values())
    .map((cluster) => {
      const sortedTokens = Array.from(cluster.tokens.entries()).sort((a, b) => b[1] - a[1]);
      const labelTokens = sortedTokens.slice(0, 4).map(([token]) => token);
      const primaryKeyword = cluster.keywords.sort((a, b) => a.length - b.length)[0];
      const dominantIntent = Array.from(cluster.intents.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "topic";
      return {
        label: labelTokens.join(" ") || cluster.anchor,
        primaryKeyword,
        dominantIntent,
        suggestedPageType: inferPageType(labelTokens),
        keywords: Array.from(new Set(cluster.keywords)).sort(),
        articleIdeas: [
          `${primaryKeyword} guide and current market context`,
          `${primaryKeyword} comparison and buyer questions`,
          `${primaryKeyword} news and deployment signals`,
        ],
      };
    })
    .sort((a, b) => b.keywords.length - a.keywords.length || a.label.localeCompare(b.label));
};

async function main() {
  const keywords = await parseInput(inputPath);
  const clusters = clusterKeywords(keywords);
  const timestamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(outputDir, `keyword-clusters-${timestamp}.json`);
  const mdPath = path.join(outputDir, `keyword-clusters-${timestamp}.md`);

  const report = {
    generatedAt: new Date().toISOString(),
    inputPath: path.resolve(inputPath),
    keywordCount: keywords.length,
    clusterCount: clusters.length,
    clusters,
  };

  const md = [
    `# Keyword Clusters (${timestamp})`,
    ``,
    `- Input: ${report.inputPath}`,
    `- Keywords: ${report.keywordCount}`,
    `- Clusters: ${report.clusterCount}`,
    ``,
  ];

  for (const cluster of clusters) {
    md.push(`## ${cluster.label}`);
    md.push(`- Primary keyword: ${cluster.primaryKeyword}`);
    md.push(`- Dominant intent: ${cluster.dominantIntent}`);
    md.push(`- Suggested page type: ${cluster.suggestedPageType}`);
    md.push(`- Keywords: ${cluster.keywords.join(" | ")}`);
    for (const idea of cluster.articleIdeas) md.push(`- Article idea: ${idea}`);
    md.push("");
  }

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, `${md.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({
    keywordCount: report.keywordCount,
    clusterCount: report.clusterCount,
    jsonPath,
    mdPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
