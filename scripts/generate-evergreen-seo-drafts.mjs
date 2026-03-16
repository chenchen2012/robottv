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
const API_TIMEOUT_MS = 45000;
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
      // Ignore non-article directories.
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

const buildPrompt = ({ manifestEntry, pageHtml, relatedNews }) => {
  const title = extractTag(pageHtml, /<title>([\s\S]*?)<\/title>/i);
  const metaDescription = extractTag(pageHtml, /<meta\s+name="description"\s+content="([^"]*)"/i);
  const h1 = extractTag(pageHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i);

  return [
    "You are an SEO editor improving a robotics evergreen page for robot.tv.",
    "Rules:",
    "- Use only the supplied facts, source notes, and internal context.",
    "- Do not invent product specs, dates, partnerships, pricing, or deployment claims.",
    "- Keep the tone analytical, concise, operator-aware, and non-hype.",
    "- Focus on search usefulness, internal linking, and content depth.",
    "- Output valid JSON only.",
    "",
    "Return this exact JSON shape:",
    '{',
    '  "file": "string",',
    '  "summary": "1-2 sentence editorial summary",',
    '  "sections": [',
    '    { "heading": "string", "paragraphs": ["string", "string"], "bullets": ["string"] }',
    "  ],",
    '  "faq": [',
    '    { "question": "string", "answer": "string" }',
    "  ],",
    '  "internalLinks": [',
    '    { "href": "string", "reason": "string" }',
    "  ]",
    '}',
    "",
    `File: ${manifestEntry.file}`,
    `Page type: ${manifestEntry.pageType}`,
    `Primary intent: ${manifestEntry.primaryIntent}`,
    `Current title: ${title}`,
    `Current meta description: ${metaDescription}`,
    `Current H1: ${h1}`,
    `Required angles: ${manifestEntry.requiredAngles.join("; ")}`,
    `Approved facts: ${manifestEntry.approvedFacts.join(" | ")}`,
    `Official sources: ${manifestEntry.officialSources.join(" | ")}`,
    `Preferred internal links: ${manifestEntry.internalLinks.join(" | ")}`,
    `Related internal newsroom coverage: ${relatedNews.slice(0, 3).map((item) => `${item.title} (${item.url})`).join(" | ") || "None"}`,
  ].join("\n");
};

const callDeepSeek = async (prompt) => {
  if (!API_KEY) {
    throw new Error("Missing DEEPSEEK_API_KEY.");
  }

  const requestBody = JSON.stringify({
    model: "deepseek-chat",
    temperature: 0.4,
    max_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a precise robotics SEO editor. You never invent facts and you only return strict JSON.",
      },
      {
        role: "user",
        content: prompt,
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
  return JSON.parse(content);
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
    if ((section.bullets || []).length) lines.push("");
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
    const prompt = buildPrompt({ manifestEntry: entry, pageHtml, relatedNews });
    const draft = await callDeepSeek(prompt);

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
