import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  extractConcreteFactExcerpt,
  hasConcreteFact,
  leadStartsWithImplication,
} from "./news-publish-quality.mjs";

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = String(process.env.DEEPSEEK_API_KEY || "").trim();
const SOURCE_FETCH_TIMEOUT_MS = Number(process.env.NEWS_SOURCE_FETCH_TIMEOUT_MS || 12_000);
const AI_TIMEOUT_MS = Number(process.env.NEWS_EDITORIAL_AI_TIMEOUT_MS || 30_000);

const SOURCE_NAME_OVERRIDES = new Map([
  ["businessinsider", "Business Insider"],
  ["therobotreport", "The Robot Report"],
  ["techcrunch", "TechCrunch"],
]);
const COMPETITOR_SOURCE_KEYS = new Set([
  "therobotreport",
  "roboticsbusinessreview",
  "robotics247",
]);

const stripHtml = (value) =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();

const countWords = (value) => normalizeWhitespace(value).split(" ").filter(Boolean).length;

const splitSentences = (value = "") =>
  normalizeWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);

const safeSentence = (value, maxLength = 280) => {
  const text = normalizeWhitespace(value);
  if (!text) return "";
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const breakpoint = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("; "), clipped.lastIndexOf(", "));
  return `${(breakpoint > 120 ? clipped.slice(0, breakpoint + 1) : clipped).trimEnd()}...`;
};

const titleCaseSource = (source) => {
  const normalized = normalizeWhitespace(source);
  if (!normalized) return "the source report";
  const key = normalized.toLowerCase().replace(/[^a-z]/g, "");
  return SOURCE_NAME_OVERRIDES.get(key) || normalized;
};
const sourceReference = (source) => {
  const normalized = normalizeWhitespace(source);
  if (!normalized) return "public reporting";
  const key = normalized.toLowerCase().replace(/[^a-z]/g, "");
  if (COMPETITOR_SOURCE_KEYS.has(key)) return "recent industry reporting";
  return titleCaseSource(source);
};

const hashString = (value) => {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const pickVariant = (value, options) => {
  if (!options.length) return "";
  return options[hashString(value) % options.length];
};

const extractMeta = (html, pattern) => {
  const match = html.match(pattern);
  return match ? stripHtml(match[1]) : "";
};

const extractImageUrl = (html, baseUrl = "") => {
  const candidates = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const pattern of candidates) {
    const value = extractMeta(html, pattern);
    if (!value) continue;
    try {
      return new URL(value, baseUrl || undefined).toString();
    } catch {
      continue;
    }
  }
  return "";
};

const extractParagraphs = (html) => {
  const mainSectionMatch =
    html.match(/<article[\s\S]*?<\/article>/i) ||
    html.match(/<main[\s\S]*?<\/main>/i) ||
    html.match(/<body[\s\S]*?<\/body>/i);
  const scope = mainSectionMatch ? mainSectionMatch[0] : html;
  const paragraphs = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1]))
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 70)
    .filter((paragraph) => !/subscribe|newsletter|advertisement|cookie|sign up|all rights reserved/i.test(paragraph))
    .filter((paragraph) => !/^©|^copyright/i.test(paragraph));
  return [...new Set(paragraphs)].slice(0, 6);
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = SOURCE_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
};

export const blocksFromParagraphs = (paragraphs = []) =>
  (Array.isArray(paragraphs) ? paragraphs : [])
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean)
    .map((paragraph, index) => ({
      _type: "block",
      _key: `body-${index}-${hashString(paragraph).toString(36).slice(0, 6)}`,
      style: "normal",
      markDefs: [],
      children: [
        {
          _type: "span",
          _key: `span-${index}-${hashString(`${paragraph}-${index}`).toString(36).slice(0, 6)}`,
          text: paragraph,
        },
      ],
    }));

const themeFromHeadline = (headline = "") => {
  const text = headline.toLowerCase();
  if (/(funding|raises|valuation|series [abc]|stealth|backed)/.test(text)) return "capital formation";
  if (/(warehouse|fulfillment|logistics|distribution center)/.test(text)) return "warehouse operations";
  if (/(inspection|data center|power plant|oil|gas|infrastructure)/.test(text)) return "inspection operations";
  if (/(factory|manufacturing|assembly|automotive|production)/.test(text)) return "factory automation";
  if (/(humanoid|biped|figure|optimus|digit|apollo)/.test(text)) return "humanoid deployment";
  if (/(quadruped|robot dog|spot)/.test(text)) return "field robotics";
  if (/(chip|nvidia|qualcomm|jetson|compute|semiconductor)/.test(text)) return "robotics compute";
  if (/(summit|conference|expo|keynote)/.test(text)) return "industry events";
  if (/(policy|pentagon|military|security|regulation|standards)/.test(text)) return "policy and governance";
  return "robotics commercialization";
};

const sourceSentences = (sourceContext = {}) => {
  const candidates = [
    sourceContext.metaDescription || "",
    sourceContext.ogDescription || "",
    ...(Array.isArray(sourceContext.paragraphs) ? sourceContext.paragraphs : []),
    sourceContext.pageTitle || "",
  ];
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    for (const sentence of splitSentences(candidate)) {
      const key = sentence.toLowerCase();
      if (!sentence || seen.has(key)) continue;
      seen.add(key);
      unique.push(sentence);
    }
  }
  return unique;
};

const firstFactSentence = ({ headline, sourceContext }) => {
  const sentences = sourceSentences(sourceContext);
  return (
    sentences.find((sentence) => hasConcreteFact(sentence, { title: headline })) ||
    extractConcreteFactExcerpt(
      [sourceContext.metaDescription, sourceContext.ogDescription, ...(sourceContext.paragraphs || [])]
        .filter(Boolean)
        .join(" "),
      { title: headline }
    ) ||
    ""
  );
};

const firstSourceSentence = ({ headline, sourceContext }) => {
  const factSentence = firstFactSentence({ headline, sourceContext });
  if (factSentence) return factSentence;
  return (
    sourceSentences(sourceContext).find((sentence) => !leadStartsWithImplication(sentence)) ||
    safeSentence(sourceContext.pageTitle || headline || "", 180)
  );
};

const supportSentence = ({ headline, sourceContext, exclude = "" }) =>
  sourceSentences(sourceContext).find((sentence) => {
    if (!sentence || sentence === exclude) return false;
    if (leadStartsWithImplication(sentence)) return false;
    return hasConcreteFact(sentence, { title: headline }) || countWords(sentence) >= 12;
  }) || "";

const significanceLine = (headline, source, sourceContext) => {
  const theme = themeFromHeadline(headline);
  if (theme === "humanoid deployment") {
    return "The real test is whether the system can hold up in repeatable factory, warehouse, or service workflows rather than isolated demos.";
  }
  if (theme === "inspection operations") {
    return "For buyers, the key question is whether the robot lowers inspection cost, reduces risk, and fits routine asset-management work.";
  }
  if (theme === "robotics compute") {
    return "For robotics teams, the implication is practical: compute choices shape latency, on-robot autonomy, and deployment cost.";
  }
  if (theme === "capital formation") {
    return "The useful signal is whether fresh capital turns into product milestones, customer wins, and scaled deployments.";
  }
  if (theme === "industry events") {
    return "The useful signal is which demos, customer references, or roadmap details hold up once the event cycle passes.";
  }
  if (sourceContext.paragraphs?.length) {
    return `For operators, the point is whether this update leads to clearer deployment proof in ${theme}.`;
  }
  return `${sourceReference(source)} points to a concrete development in ${theme}, not just another robotics narrative.`;
};

const watchLine = (headline, sourceContext) => {
  const theme = themeFromHeadline(headline);
  const sourceText = normalizeWhitespace(
    [sourceContext.metaDescription, sourceContext.ogDescription, ...(sourceContext.paragraphs || [])].join(" ")
  );
  if (/pilot|deployment|contract|customer|fleet/i.test(sourceText)) {
    return "Watch for follow-on deployments, named customers, or contract expansion that proves the update is more than a one-off.";
  }
  if (/launch|release|version|model/i.test(sourceText)) {
    return "Watch for performance data, customer uptake, or deployment evidence that shows the release is landing beyond the announcement cycle.";
  }
  if (theme === "humanoid deployment") {
    return "Watch for repeatable uptime, safety integration, and task-level productivity rather than another short demo cycle.";
  }
  if (theme === "inspection operations") {
    return "Watch for contracted fleet rollouts, software attach rates, and evidence that operators keep the robots in routine use.";
  }
  if (theme === "capital formation") {
    return "Watch how quickly the company converts the headline into hiring, product milestones, signed customers, and on-site deployments.";
  }
  if (theme === "industry events") {
    return "Watch which demos, customer references, or roadmap details still matter once the event buzz fades.";
  }
  return "Watch whether the headline turns into sustained customer adoption, stronger system performance, and repeatable deployment proof.";
};

const buildFallbackBodyParagraphs = ({ headline, source, sourceContext }) => {
  const factSentence = safeSentence(firstSourceSentence({ headline, sourceContext }), 210);
  const evidenceSentence = safeSentence(
    supportSentence({ headline, sourceContext, exclude: factSentence }) || sourceContext.paragraphs[1] || "",
    210
  );
  const implicationSentence = safeSentence(significanceLine(headline, source, sourceContext), 180);
  const watchSentence = safeSentence(watchLine(headline, sourceContext), 180);

  const paragraphOne = normalizeWhitespace(
    [factSentence || safeSentence(`${headline}.`, 160), evidenceSentence && evidenceSentence !== factSentence ? evidenceSentence : ""]
      .filter(Boolean)
      .join(" ")
  );
  const paragraphTwo = normalizeWhitespace([implicationSentence].filter(Boolean).join(" "));
  const paragraphThree = normalizeWhitespace([watchSentence].filter(Boolean).join(" "));

  return [paragraphOne, paragraphTwo, paragraphThree].filter((paragraph) => countWords(paragraph) >= 10);
};

const buildFallbackExcerpt = ({ headline, source, sourceContext }) => {
  const factLead = safeSentence(firstSourceSentence({ headline, sourceContext }) || headline, 145);
  const implication = safeSentence(significanceLine(headline, source, sourceContext), 96);
  const composed = normalizeWhitespace(
    [
      factLead,
      implication && !leadStartsWithImplication(factLead) ? implication : "",
    ]
      .filter(Boolean)
      .join(" ")
  );
  if (composed) return composed.length > 240 ? `${composed.slice(0, 237).trimEnd()}...` : composed;
  const fallbackLead = safeSentence(`${headline}.`, 140);
  return fallbackLead.length > 240 ? `${fallbackLead.slice(0, 237).trimEnd()}...` : fallbackLead;
};

const buildFallbackVideoSummary = ({ headline, source, sourceContext, excerpt }) => {
  const opener = excerpt || buildFallbackExcerpt({ headline, source, sourceContext });
  const visualContext = pickVariant(headline, [
    "The embedded video helps readers judge how much of the story is product theater versus operational proof.",
    "The embedded video gives a clearer read on the capability, deployment setting, or market signal behind the headline.",
    "The embedded video adds the visual evidence needed to evaluate whether the claim points to real robotics progress.",
  ]);
  const combined = normalizeWhitespace([opener, visualContext].join(" "));
  return combined.length > 320 ? `${combined.slice(0, 317).trimEnd()}...` : combined;
};

const parseJsonResponse = async (response) => {
  const payload = await response.json();
  if (payload?.error) {
    throw new Error(JSON.stringify(payload.error));
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned no content.");
  }
  const trimmed = String(content).trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed);
};

const fetchSourceContext = async (sourceUrl) => {
  const fallback = {
    pageTitle: "",
    metaDescription: "",
    ogDescription: "",
    imageUrl: "",
    paragraphs: [],
  };
  const url = String(sourceUrl || "").trim();
  if (!url) return fallback;

  try {
    const response = await fetchWithTimeout(url, {}, SOURCE_FETCH_TIMEOUT_MS);
    if (!response.ok) return fallback;
    const html = await response.text();
    return {
      pageTitle: extractMeta(html, /<title>([\s\S]*?)<\/title>/i),
      metaDescription: extractMeta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"]+)["']/i),
      ogDescription: extractMeta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"]+)["']/i),
      imageUrl: extractImageUrl(html, url),
      paragraphs: extractParagraphs(html),
    };
  } catch {
    return fallback;
  }
};

const isValidExcerpt = (excerpt) => {
  const text = normalizeWhitespace(excerpt);
  return text.length >= 120 && text.length <= 260 && countWords(text) >= 18;
};

const isValidVideoSummary = (summary) => {
  const text = normalizeWhitespace(summary);
  return text.length >= 130 && text.length <= 340 && countWords(text) >= 18;
};

const isValidBodyParagraphs = (paragraphs) =>
  Array.isArray(paragraphs) &&
  paragraphs.length >= 3 &&
  paragraphs.length <= 4 &&
  paragraphs.every((paragraph) => {
    const text = normalizeWhitespace(paragraph);
    return countWords(text) >= 24 && text.length <= 700 && !/^source:/i.test(text);
  });

const buildAiPrompt = ({ headline, source, sourceUrl, pubDate, sourceContext, categoryHint }) =>
  [
    "You are editing a robotics news post for robot.tv.",
    "Write richer but compact editorial copy that feels human, informed, and grounded.",
    "Rules:",
    "- Use only the supplied facts and context.",
    "- Do not invent specs, dates, customer names, product capabilities, or partnerships.",
    "- Do not quote the source article.",
    "- Avoid robotic phrases like 'Why it matters:' or 'this update may change market momentum'.",
    "- Keep the tone analytical, confident, and readable for robotics operators, founders, and investors.",
    "- Do not mention the source by name in the excerpt.",
    "- For robotics trade publications, avoid naming the outlet in body paragraphs unless essential for clarity.",
    "- For major general, business, or international outlets, naming the source once in the body is acceptable when it adds credibility.",
    "- Lead with the most concrete fact available, then explain one implication.",
    "- The excerpt should contain one concrete fact and one implication when possible.",
    "- Paragraph 1 must be fact-first and source-grounded.",
    "- Paragraph 2 should explain why the development matters operationally.",
    "- Paragraph 3 should only include a watch-next line if the source context justifies it.",
    "- Focus on what happened, why it matters operationally, and what readers should watch next.",
    "",
    `Headline: ${headline}`,
    `Source: ${titleCaseSource(source)}`,
    `Source URL: ${sourceUrl || "n/a"}`,
    `Source published date: ${pubDate || "n/a"}`,
    `Category hint: ${categoryHint || themeFromHeadline(headline)}`,
    `Source page title: ${sourceContext.pageTitle || "n/a"}`,
    `Source meta description: ${sourceContext.metaDescription || "n/a"}`,
    `Source og description: ${sourceContext.ogDescription || "n/a"}`,
    `Source extracted paragraphs: ${sourceContext.paragraphs.join(" || ") || "n/a"}`,
    "",
    "Return strict JSON only in this shape:",
    '{',
    '  "excerpt": "1-2 sentences, 120-240 characters total",',
    '  "videoSummary": "2 compact sentences, 140-320 characters total",',
    '  "bodyParagraphs": ["paragraph 1", "paragraph 2", "paragraph 3"]',
    '}',
    "Body paragraph rules:",
    "- exactly 3 paragraphs",
    "- 35 to 85 words each",
    "- paragraph 1 explains the development with at least one concrete fact",
    "- paragraph 2 explains why it matters for deployment, commercialization, or product strategy",
    "- paragraph 3 explains what readers should watch next only if justified by the source context",
  ].join("\n");

const callDeepSeekEditorial = async (prompt) => {
  if (!DEEPSEEK_API_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: 0.45,
        max_tokens: 750,
        messages: [
          {
            role: "system",
            content:
              "You are a precise robotics news editor. You do not invent facts and you only return strict JSON.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`DeepSeek HTTP ${response.status}`);
    }
    return await parseJsonResponse(response);
  } finally {
    clearTimeout(timer);
  }
};

const normalizeAiPackage = (value) => {
  if (!value || typeof value !== "object") return null;
  const excerpt = normalizeWhitespace(value.excerpt || "");
  const videoSummary = normalizeWhitespace(value.videoSummary || "");
  const bodyParagraphs = (Array.isArray(value.bodyParagraphs) ? value.bodyParagraphs : [])
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);
  if (!isValidExcerpt(excerpt) || !isValidVideoSummary(videoSummary) || !isValidBodyParagraphs(bodyParagraphs)) {
    return null;
  }
  return { excerpt, videoSummary, bodyParagraphs };
};

export const buildEditorialPackage = async ({
  headline,
  source,
  sourceUrl,
  pubDate,
  categoryHint = "",
}) => {
  const sourceContext = await fetchSourceContext(sourceUrl);

  const excerpt = buildFallbackExcerpt({ headline, source, sourceContext });
  return {
    excerpt,
    videoSummary: buildFallbackVideoSummary({ headline, source, sourceContext, excerpt }),
    bodyParagraphs: buildFallbackBodyParagraphs({ headline, source, sourceContext }),
    sourceContext,
    generationMode: "fallback",
  };
};

export const renderEditorialReport = ({ title, editorialPackage, source }) => {
  const lines = [
    `# ${title}`,
    "",
    `Mode: ${editorialPackage.generationMode}`,
    `Source: ${titleCaseSource(source)}`,
    "",
    "## Excerpt",
    editorialPackage.excerpt,
    "",
    "## Video Summary",
    editorialPackage.videoSummary,
    "",
    "## Body",
  ];

  editorialPackage.bodyParagraphs.forEach((paragraph, index) => {
    lines.push(`${index + 1}. ${paragraph}`);
  });

  lines.push("", "## Source Context");
  const context = editorialPackage.sourceContext || {};
  if (context.pageTitle) lines.push(`- Title: ${context.pageTitle}`);
  if (context.metaDescription) lines.push(`- Description: ${context.metaDescription}`);
  for (const paragraph of context.paragraphs || []) {
    lines.push(`- Paragraph: ${paragraph}`);
  }
  return `${lines.join(os.EOL)}${os.EOL}`;
};

export const writeEditorialReport = async (targetFile, payload) => {
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  await fs.writeFile(targetFile, renderEditorialReport(payload), "utf8");
};
