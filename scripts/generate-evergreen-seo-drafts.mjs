#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "scripts", "seo-evergreen-manifest.json");
const OUTPUT_DIR = path.join(ROOT, "ops-private", "reports", "seo", "deepseek-evergreen-drafts");
const NEWS_ROOT = path.join(ROOT, "news-studio", "static");
const API_URL = "https://api.deepseek.com/chat/completions";
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_TIMEOUT_MS = 45_000;
const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const pageFilters = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--page" && args[i + 1]) {
    pageFilters.push(args[i + 1]);
    i += 1;
  }
}

const stripHtml = (value) =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractTag = (html, pattern) => {
  const match = html.match(pattern);
  return match ? stripHtml(match[1]) : "";
};

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));

const collectNewsDocs = async () => {
  const entries = await fs.readdir(NEWS_ROOT, { withFileTypes: true });
  const docs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const articlePath = path.join(NEWS_ROOT, entry.name, "index.html");
    try {
      const html = await fs.readFile(articlePath, "utf8");
      docs.push({
        slug: entry.name,
        title: extractTag(html, /<title>([\s\S]*?)<\/title>/i),
        description: extractTag(html, /<meta\s+name="description"\s+content="([^"]*)"/i),
      });
    } catch {
      // Ignore directories without article HTML.
    }
  }
  return docs;
};

const pickNews = (newsDocs, keywords, limit = 5) => {
  const lowered = keywords.map((keyword) => keyword.toLowerCase());
  return newsDocs
    .map((doc) => {
      const haystack = `${doc.title} ${doc.description}`.toLowerCase();
      const score = lowered.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0);
      return { ...doc, score };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, limit)
    .map((doc) => ({
      title: doc.title,
      url: `https://news.robot.tv/${doc.slug}/`,
      description: doc.description,
    }));
};

const compactContext = ({ manifestEntry, pageHtml, relatedNews }) => {
  const title = extractTag(pageHtml, /<title>([\s\S]*?)<\/title>/i);
  const metaDescription = extractTag(pageHtml, /<meta\s+name="description"\s+content="([^"]*)"/i);
  const h1 = extractTag(pageHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i);

  return {
    file: manifestEntry.file,
    pageType: manifestEntry.pageType,
    primaryIntent: manifestEntry.primaryIntent,
    title,
    metaDescription,
    h1,
    requiredAngles: manifestEntry.requiredAngles,
    approvedFacts: manifestEntry.approvedFacts,
    officialSources: manifestEntry.officialSources,
    internalLinks: manifestEntry.internalLinks,
    relatedNews: relatedNews.slice(0, 3),
  };
};

const parseLooseJsonObject = (raw) => {
  const value = String(raw || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(value.slice(start, end + 1));
    }
    throw new Error(`Unable to parse JSON object from model output: ${value.slice(0, 400)}`);
  }
};

const buildBasePrompt = (context) =>
  [
    "You are an SEO editor improving a robotics evergreen page for robot.tv.",
    "Rules:",
    "- Use only the supplied facts, internal links, and page context.",
    "- Do not invent product specs, dates, partnerships, pricing, or deployment claims.",
    "- Keep the tone analytical, concise, operator-aware, and non-hype.",
    "- Prefer short concrete sentences over broad marketing language.",
    `File: ${context.file}`,
    `Page type: ${context.pageType}`,
    `Primary intent: ${context.primaryIntent}`,
    `Title: ${context.title}`,
    `Meta description: ${context.metaDescription}`,
    `H1: ${context.h1}`,
    `Required angles: ${context.requiredAngles.join("; ")}`,
    `Approved facts: ${context.approvedFacts.join(" | ")}`,
    `Preferred internal links: ${context.internalLinks.join(" | ")}`,
    `Related newsroom coverage: ${context.relatedNews.map((item) => `${item.title} (${item.url})`).join(" | ") || "None"}`,
  ].join("\n");

const callDeepSeek = async ({ userPrompt, maxTokens = 350, temperature = 0.3, expectJson = true }) => {
  if (!API_KEY) {
    throw new Error("Missing DEEPSEEK_API_KEY.");
  }

  const requestBody = JSON.stringify({
    model: "deepseek-chat",
    temperature,
    max_tokens: maxTokens,
    messages: [
      {
        role: "system",
        content: "You are a precise robotics SEO editor. You never invent facts and you only return strict JSON.",
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const { stdout, stderr } = await execFileAsync(
    "curl",
    [
      "--silent",
      "--show-error",
      "--max-time",
      String(Math.ceil(API_TIMEOUT_MS / 1000)),
      "-X",
      "POST",
      API_URL,
      "-H",
      "Content-Type: application/json",
      "-H",
      `Authorization: Bearer ${API_KEY}`,
      "-d",
      requestBody,
    ],
    { maxBuffer: 8 * 1024 * 1024 }
  );

  if (stderr) {
    throw new Error(`DeepSeek API stderr: ${stderr.slice(0, 400)}`);
  }

  const payload = JSON.parse(stdout);
  if (payload?.error) {
    throw new Error(`DeepSeek API failed: ${JSON.stringify(payload.error).slice(0, 400)}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek API returned no content.");
  }
  return expectJson ? parseLooseJsonObject(content) : String(content).trim();
};

const buildSectionPrompt = (context, angle, index) =>
  [
    buildBasePrompt(context),
    "",
    "Task:",
    `Write one evergreen section for angle ${index + 1}: ${angle}`,
    "Return strict JSON only in this shape:",
    '{ "heading": "string", "paragraphs": ["string", "string"], "bullets": ["string", "string", "string"] }',
    "Use exactly 2 paragraphs and exactly 3 bullets.",
    "Bullets should describe evaluation criteria, comparison logic, or what readers should watch next.",
  ].join("\n");

const buildSummaryPrompt = (context) =>
  [
    buildBasePrompt(context),
    "",
    "Task:",
    "Write a concise 2-sentence editorial summary for this evergreen page.",
    "Return plain text only. No JSON. No bullet points.",
  ].join("\n");

const buildFaqPrompt = (context) =>
  [
    buildBasePrompt(context),
    "",
    "Task:",
    "Write 3 FAQ items for this evergreen page.",
    "Return plain text only in this format:",
    "Q: question",
    "A: answer",
    "",
    "Q: question",
    "A: answer",
    "",
    "Q: question",
    "A: answer",
    "Keep answers practical and fact-grounded.",
  ].join("\n");

const buildLinksPrompt = (context) =>
  [
    buildBasePrompt(context),
    "",
    "Task:",
    "Recommend 4 internal links from the preferred internal link list.",
    "Return plain text only with one line per link in this format:",
    "href | reason",
    "Only use href values from the preferred internal links list.",
  ].join("\n");

const parseFaqText = (raw) => {
  const lines = String(raw || "").split(/\r?\n/).map((line) => line.trim());
  const faq = [];
  for (let i = 0; i < lines.length; i += 1) {
    const q = lines[i];
    const a = lines[i + 1];
    if (!q?.startsWith("Q:") || !a?.startsWith("A:")) continue;
    faq.push({
      question: q.replace(/^Q:\s*/, "").trim(),
      answer: a.replace(/^A:\s*/, "").trim(),
    });
  }
  return faq.filter((item) => item.question && item.answer);
};

const parseLinksText = (raw, allowedHrefs) => {
  const allowed = new Set(allowedHrefs);
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [href, reason] = line.split("|").map((part) => (part || "").trim());
      return { href, reason };
    })
    .filter((item) => item.href && item.reason && allowed.has(item.href))
    .slice(0, 4);
};

const toMarkdown = (draft) => {
  const lines = [`# ${draft.file}`, "", draft.summary || "", ""];

  for (const section of draft.sections || []) {
    lines.push(`## ${section.heading}`, "");
    for (const paragraph of section.paragraphs || []) {
      lines.push(paragraph, "");
    }
    for (const bullet of section.bullets || []) {
      lines.push(`- ${bullet}`);
    }
    lines.push("");
  }

  if ((draft.faq || []).length) {
    lines.push("## FAQ", "");
    for (const item of draft.faq) {
      lines.push(`- **${item.question}** ${item.answer}`);
    }
    lines.push("");
  }

  if ((draft.internalLinks || []).length) {
    lines.push("## Internal links", "");
    for (const item of draft.internalLinks) {
      lines.push(`- ${item.href} — ${item.reason}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
};

const generateDraft = async ({ entry, pageHtml, relatedNews }) => {
  const context = compactContext({ manifestEntry: entry, pageHtml, relatedNews });
  const sections = [];

  for (const [index, angle] of context.requiredAngles.entries()) {
    console.log(`  section ${index + 1}/${context.requiredAngles.length}: ${angle}`);
    const section = await callDeepSeek({
      userPrompt: buildSectionPrompt(context, angle, index),
      maxTokens: 260,
      expectJson: true,
    });
    sections.push({
      heading: section.heading || `Section ${index + 1}`,
      paragraphs: Array.isArray(section.paragraphs) ? section.paragraphs.slice(0, 2) : [],
      bullets: Array.isArray(section.bullets) ? section.bullets.slice(0, 3) : [],
    });
  }

  console.log("  summary");
  const summaryPayload = await callDeepSeek({
    userPrompt: buildSummaryPrompt(context),
    maxTokens: 120,
    temperature: 0.2,
    expectJson: false,
  });

  console.log("  faq");
  const faqPayload = await callDeepSeek({
    userPrompt: buildFaqPrompt(context),
    maxTokens: 220,
    expectJson: false,
  });

  console.log("  internal links");
  const linksPayload = await callDeepSeek({
    userPrompt: buildLinksPrompt(context),
    maxTokens: 180,
    temperature: 0.2,
    expectJson: false,
  });

  return {
    file: entry.file,
    summary: summaryPayload,
    sections,
    faq: parseFaqText(faqPayload).slice(0, 3),
    internalLinks: parseLinksText(linksPayload, context.internalLinks),
  };
};

const main = async () => {
  const manifest = await readJson(MANIFEST_PATH);
  const filtered = pageFilters.length
    ? manifest.filter((entry) => pageFilters.includes(entry.file))
    : manifest;

  if (!filtered.length) {
    throw new Error("No manifest entries matched the requested pages.");
  }

  const newsDocs = await collectNewsDocs();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const entry of filtered) {
    console.log(`Preparing draft for ${entry.file}...`);
    const pagePath = path.join(ROOT, entry.file);
    const pageHtml = await fs.readFile(pagePath, "utf8");
    const relatedNews = pickNews(newsDocs, entry.keywords, 5);
    const draft = await generateDraft({ entry, pageHtml, relatedNews });
    const baseName = entry.file.replace(/\.html$/i, "");

    await fs.writeFile(path.join(OUTPUT_DIR, `${baseName}.json`), `${JSON.stringify(draft, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(OUTPUT_DIR, `${baseName}.md`), toMarkdown(draft), "utf8");
    console.log(`Generated DeepSeek draft for ${entry.file}`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
