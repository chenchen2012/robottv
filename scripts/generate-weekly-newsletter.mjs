import fs from "node:fs/promises";
import path from "node:path";

const FEED_URL = process.env.NEWSLETTER_FEED_URL || "https://news.robot.tv/feed.xml";
const FEED_PATH = process.env.NEWSLETTER_FEED_PATH;
const MAX_ITEMS = Number(process.env.NEWSLETTER_MAX_ITEMS || 5);
const OUTPUT_DIR = process.env.NEWSLETTER_OUTPUT_DIR || "newsletters";
const SITE_URL = process.env.NEWSLETTER_SITE_URL || "https://robot.tv";
const TIME_ZONE = process.env.NEWSLETTER_TIMEZONE || "America/Los_Angeles";
const LOCALE = process.env.NEWSLETTER_LOCALE || "en-US";
const ISSUE_PREFIX = process.env.NEWSLETTER_SLUG_PREFIX || "robot-weekly";
const REPORT_DIR = process.env.NEWSLETTER_REPORT_DIR || path.join("ops-private", "reports", "newsletter");
const ARCHIVE_PATH = "newsletters";

const decodeHtml = (input) =>
  String(input || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8220;|&#8221;/g, '"');

const stripHtml = (input) =>
  decodeHtml(String(input || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const escapeHtml = (input) =>
  String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeXml = (input) =>
  String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeWhitespace = (input) => String(input || "").replace(/\s+/g, " ").trim();
const countWords = (input) => normalizeWhitespace(input).split(" ").filter(Boolean).length;

const normalizeSummarySentence = (input) => {
  const text = normalizeWhitespace(input).replace(/\s+\./g, ".").replace(/\s+,/g, ",");
  if (!text) return "";
  if (/[.!?]$/.test(text)) return text;
  return `${text}.`;
};

const cleanFeedDescription = (input) => {
  const text = stripHtml(input)
    .replace(/^google news\s*/i, "")
    .replace(/^read more\s*/i, "")
    .replace(/\b(click here|watch here)\b/gi, "")
    .trim();
  return normalizeSummarySentence(text);
};

const parseRssItems = (xml) => {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  return items.map((itemXml) => {
    const titleRaw = (itemXml.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1];
    const link = stripHtml((itemXml.match(/<link>([\s\S]*?)<\/link>/) || [, ""])[1]);
    const pubDate = stripHtml((itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ""])[1]);
    const source = stripHtml((itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [, ""])[1]);
    const descriptionRaw = (itemXml.match(/<description>([\s\S]*?)<\/description>/) || [, ""])[1];
    const contentRaw = (itemXml.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) || [, ""])[1];
    const description = cleanFeedDescription(contentRaw || descriptionRaw);
    const title = stripHtml(titleRaw).replace(/\s+-\s+[^-]+$/, "").trim();
    return { title, link, pubDate, source, description };
  });
};

const formatDate = (date) =>
  new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeZone: TIME_ZONE,
  }).format(date);

const formatArchiveDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDate(date);
};

const sentenceFromDescription = (item, fallback) => {
  const description = normalizeWhitespace(item.description || "");
  if (description && countWords(description) >= 10) return normalizeSummarySentence(description);
  return fallback;
};

const buildFallbackIssue = (items) => {
  const highlights = items.map((item, index) => {
    const summary = sentenceFromDescription(
      item,
      "This story stood out as a meaningful robotics signal for operators, builders, and investors."
    );
    const whyItMatters =
      index === 0
        ? "It helps explain where robotics adoption is getting more real, not just more visible."
        : "It offers a useful read on where deployment, platform strategy, or market momentum may move next.";
    return {
      title: item.title,
      link: item.link,
      source: item.source,
      summary,
      whyItMatters,
    };
  });

  return {
    subject: `Robot Weekly | ${formatDate(new Date())}`,
    preheader: "A concise weekly brief on robotics deployments, company moves, and what matters next.",
    intro:
      "I pulled this week’s note around the developments that feel most useful for understanding where robotics is getting more commercial, more operational, and easier to evaluate in real terms.",
    leadTitle: highlights[0]?.title || "The week in robotics",
    leadLink: highlights[0]?.link || "",
    leadSummary:
      highlights[0]?.summary ||
      "This week’s lead story points to where robotics execution is becoming easier to evaluate in practical terms.",
    leadWhyItMatters:
      highlights[0]?.whyItMatters ||
      "That matters because the market is rewarding proof of execution more than broad platform claims.",
    highlights,
    closing:
      "The next thing I’ll be watching is whether these signals turn into repeatable deployments, clearer category leaders, and better evidence that robotics buyers are moving from curiosity to operating habit.",
  };
};

const parseJsonPayload = (content) => {
  const value = String(content || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("DeepSeek response did not include a JSON object.");
  }
  return JSON.parse(value.slice(start, end + 1));
};

const normalizeAiIssue = (payload, items) => {
  if (!payload || typeof payload !== "object") return null;
  const itemsByLink = new Map(items.map((item) => [item.link, item]));
  const highlights = (Array.isArray(payload.highlights) ? payload.highlights : [])
    .slice(0, Math.min(items.length, MAX_ITEMS))
    .map((item, index) => {
      const link = normalizeWhitespace(item.link || items[index]?.link || "");
      const matched = itemsByLink.get(link) || items[index] || {};
      return {
        title: normalizeWhitespace(item.title || matched.title || ""),
        link,
        source: (() => {
          const value = normalizeWhitespace(item.source || matched.source || "");
          return /^unknown$/i.test(value) ? "" : value;
        })(),
        summary: normalizeSummarySentence(item.summary || ""),
        whyItMatters: normalizeSummarySentence(item.whyItMatters || ""),
      };
    })
    .filter((item) => item.title && item.link && countWords(item.summary) >= 10 && countWords(item.whyItMatters) >= 8);

  if (!highlights.length) return null;

  const leadLink = normalizeWhitespace(payload.leadLink || highlights[0].link);
  const matchedLead = itemsByLink.get(leadLink) || highlights.find((item) => item.link === leadLink) || highlights[0];

  const normalized = {
    subject: normalizeWhitespace(payload.subject || ""),
    preheader: normalizeWhitespace(payload.preheader || ""),
    intro: normalizeSummarySentence(payload.intro || ""),
    leadTitle: normalizeWhitespace(payload.leadTitle || matchedLead.title || highlights[0].title),
    leadLink,
    leadSummary: normalizeSummarySentence(payload.leadSummary || matchedLead.summary || highlights[0].summary),
    leadWhyItMatters: normalizeSummarySentence(payload.leadWhyItMatters || matchedLead.whyItMatters || highlights[0].whyItMatters),
    highlights,
    closing: normalizeSummarySentence(payload.closing || ""),
  };

  if (countWords(normalized.subject) < 3) return null;
  if (countWords(normalized.preheader) < 8) return null;
  if (countWords(normalized.intro) < 18) return null;
  if (countWords(normalized.closing) < 12) return null;
  return normalized;
};

const buildAiIssue = async (items) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const apiUrl = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/chat/completions";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  const prompt = [
    "You are editing Robot Weekly, the weekly email briefing for robot.tv.",
    "Write concise, high-signal editorial copy for robotics operators, founders, and investors.",
    "Rules:",
    "- Use only the supplied items.",
    "- Do not invent facts, numbers, customers, or partnerships.",
    "- Avoid robotic phrases and corporate filler.",
    "- Write in a human editorial voice, as if Chen Chen is briefing readers directly.",
    "- Keep the tone sharp, human, and professional.",
    "- Keep each title matched to the linked story.",
    "- Summaries should explain the development.",
    "- whyItMatters lines should explain the practical implication.",
    "- Prefer plain English over hype.",
    "- Do not sound like a marketing campaign.",
    "- Return strict JSON only.",
    "",
    "Return this shape:",
    "{",
    '  "subject": "string <= 80 chars",',
    '  "preheader": "string <= 140 chars",',
    '  "intro": "2-3 sentences in first person singular",',
    '  "leadTitle": "string",',
    '  "leadLink": "one of the supplied links",',
    '  "leadSummary": "2 sentences",',
    '  "leadWhyItMatters": "1-2 sentences",',
    '  "highlights": [',
    '    { "title": "string", "link": "string", "source": "string", "summary": "1-2 sentences", "whyItMatters": "1 sentence" }',
    "  ],",
    '  "closing": "2 sentences in first person singular"',
    "}",
    "",
    "ITEMS:",
    ...items.map(
      (item, index) =>
        `${index + 1}. ${item.title}\nSource: ${item.source || "Unknown"}\nLink: ${item.link}\nDescription: ${item.description || "n/a"}`
    ),
  ].join("\n");

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a precise robotics newsletter editor. You only use supplied facts and you only return strict JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.35,
      max_tokens: 1400,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return normalizeAiIssue(parseJsonPayload(content), items);
};

const buildIssueHtml = ({
  subject,
  preheader,
  intro,
  leadTitle,
  leadLink,
  leadSummary,
  leadWhyItMatters,
  highlights,
  closing,
  issueDate,
  issueUrl,
  archiveUrl,
}) => {
  const highlightCards = highlights
    .map(
      (item) => `
      <li>
        <h3><a href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(item.summary)}</p>
        <p class="why">${escapeHtml(item.whyItMatters)}</p>
      </li>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <meta name="description" content="${escapeHtml(preheader)}">
  <script src="/scripts/ga-lazy.js?v=20260309-ga-v1" defer></script>
  <style>
    body { margin:0; padding:0; background:#eef2f7; color:#182230; font-family:Arial,sans-serif; }
    .shell { width:100%; padding:24px 12px; }
    .card { max-width:680px; margin:0 auto; border:1px solid #d5deea; border-radius:18px; background:#ffffff; overflow:hidden; }
    .hero { padding:28px 28px 20px; background:linear-gradient(180deg,#f7fafd 0%,#eef4fb 100%); border-bottom:1px solid #dbe5f0; }
    .eyebrow { margin:0 0 8px; color:#6a7f97; font-size:12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; }
    h1 { margin:0; font-size:30px; line-height:1.18; color:#0f1824; }
    .meta { margin-top:10px; color:#6b7b90; font-size:14px; }
    .preheader { margin-top:14px; color:#324458; line-height:1.65; font-size:16px; }
    .body { padding:0 28px 28px; }
    .editor-line { padding-top:20px; color:#607389; font-size:14px; }
    .section { padding-top:24px; }
    .section h2 { margin:0 0 12px; font-size:20px; color:#132033; }
    .section p { margin:0; color:#2b3b4d; line-height:1.72; }
    .lead { border:1px solid #d8e2ee; border-radius:14px; padding:18px; background:#f8fbff; }
    .lead h3 { margin:0 0 10px; font-size:21px; line-height:1.3; }
    .lead .why { margin-top:12px; color:#40556d; }
    ul { list-style:none; padding:0; margin:0; display:grid; gap:12px; }
    li { border:1px solid #dbe4ef; border-radius:14px; padding:16px; background:#ffffff; }
    li h3 { margin:0 0 10px; font-size:18px; line-height:1.35; }
    li h3 a { color:#142033; text-decoration:none; }
    li p { margin:0; color:#304153; line-height:1.68; }
    li .why { margin-top:10px; color:#4a5f76; }
    .closing { border-top:1px solid #dde6ef; margin-top:24px; padding-top:24px; }
    .footer { margin-top:24px; color:#607389; font-size:13px; line-height:1.7; }
    .footer p { margin:0 0 10px; }
    a { color:#245ea8; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <div class="hero">
        <p class="eyebrow">Robot Weekly</p>
        <h1>${escapeHtml(subject)}</h1>
        <div class="meta">${escapeHtml(issueDate)}</div>
        <p class="preheader">${escapeHtml(preheader)}</p>
      </div>
      <div class="body">
        <div class="editor-line">From Chen Chen, Editor at robot.tv</div>
        <section class="section">
          <h2>Editorial Note</h2>
          <p>${escapeHtml(intro)}</p>
        </section>
        <section class="section">
          <h2>Lead Signal</h2>
          <div class="lead">
            <h3><a href="${escapeHtml(leadLink || highlights[0]?.link || issueUrl)}">${escapeHtml(leadTitle)}</a></h3>
            <p>${escapeHtml(leadSummary)}</p>
            <p class="why">${escapeHtml(leadWhyItMatters)}</p>
          </div>
        </section>
        <section class="section">
          <h2>What Else Mattered</h2>
          <ul>${highlightCards}</ul>
        </section>
        <section class="section closing">
          <h2>What To Watch</h2>
          <p>${escapeHtml(closing)}</p>
          <div class="footer">
            <p>You’re receiving this because you signed up for Robot Weekly at robot.tv.</p>
            <p>Read more at <a href="https://news.robot.tv">news.robot.tv</a>.</p>
            <p>Browse every issue at <a href="${escapeHtml(archiveUrl)}">${escapeHtml(archiveUrl)}</a>.</p>
            <p>Issue archive: <a href="${escapeHtml(issueUrl)}">${escapeHtml(issueUrl)}</a></p>
            <p>robot.tv, 8 The Green, Suite 4000, Dover, DE 19901, USA</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</body>
</html>`;
};

const buildIssueText = ({
  subject,
  intro,
  leadTitle,
  leadLink,
  leadSummary,
  leadWhyItMatters,
  highlights,
  closing,
  issueDate,
  issueUrl,
  archiveUrl,
}) => {
  const lines = [
    subject,
    issueDate,
    "",
    "From Chen Chen, Editor at robot.tv",
    "",
    "EDITORIAL NOTE",
    intro,
    "",
    "LEAD SIGNAL",
    leadTitle,
    leadSummary,
    leadWhyItMatters,
    leadLink || highlights[0]?.link || issueUrl,
    "",
    "WHAT ELSE MATTERED",
  ];

  for (const item of highlights) {
    lines.push(`- ${item.title}`);
    lines.push(`  ${item.summary}`);
    lines.push(`  ${item.whyItMatters}`);
    if (item.source) lines.push(`  Source: ${item.source}`);
    lines.push(`  ${item.link}`);
    lines.push("");
  }

  lines.push("WHAT TO WATCH");
  lines.push(closing);
  lines.push("");
  lines.push("You’re receiving this because you signed up for Robot Weekly at robot.tv.");
  lines.push("Read more: https://news.robot.tv");
  lines.push(`Browse every issue: ${archiveUrl}`);
  lines.push(`Archive: ${issueUrl}`);
  lines.push("robot.tv, 8 The Green, Suite 4000, Dover, DE 19901, USA");

  return `${lines.join("\n")}\n`;
};

const buildArchiveHtml = ({ items, archiveUrl, feedUrl, siteUrl }) => {
  const cards = items
    .map((item, index) => {
      const dateLabel = formatArchiveDate(item.pubDate);
      const itemDescription = normalizeWhitespace(item.description || "Weekly robotics briefing from robot.tv.");
      return `      <article class="issue-card${index === 0 ? " issue-card-featured" : ""}">
        <p class="issue-label">${index === 0 ? "Latest issue" : "Archive issue"}</p>
        <h2><a href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a></h2>
        <p class="issue-date">${escapeHtml(dateLabel)}</p>
        <p class="issue-summary">${escapeHtml(itemDescription)}</p>
        <div class="issue-actions">
          <a class="issue-link" href="${escapeHtml(item.link)}">Read issue</a>
        </div>
      </article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robot Weekly Archive | robot.tv</title>
  <meta name="description" content="Browse the full Robot Weekly archive from robot.tv, with the latest issue and past editions in one place.">
  <link rel="canonical" href="${escapeHtml(archiveUrl)}">
  <script src="/scripts/ga-lazy.js?v=20260309-ga-v1" defer></script>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f6fb;
      --panel: #ffffff;
      --panel-alt: #eef4fb;
      --text: #112033;
      --muted: #5f7288;
      --line: #d7e1eb;
      --accent: #1f5ea8;
      --accent-soft: #e8f1fb;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: radial-gradient(circle at top, #ffffff 0%, var(--bg) 58%); color: var(--text); }
    .shell { max-width: 960px; margin: 0 auto; padding: 32px 16px 56px; }
    .hero { padding: 28px; border: 1px solid var(--line); border-radius: 24px; background: linear-gradient(180deg, #ffffff 0%, var(--panel-alt) 100%); }
    .eyebrow { margin: 0 0 10px; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 40px; line-height: 1.05; }
    .hero p { margin: 14px 0 0; max-width: 720px; color: #314255; line-height: 1.7; font-size: 18px; }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
    .hero-actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px; border-radius: 999px; text-decoration: none; font-weight: 700; }
    .hero-actions .primary { background: var(--accent); color: #ffffff; }
    .hero-actions .secondary { background: var(--accent-soft); color: var(--accent); }
    .issues { display: grid; gap: 16px; margin-top: 24px; }
    .issue-card { padding: 22px; border: 1px solid var(--line); border-radius: 20px; background: var(--panel); }
    .issue-card-featured { background: linear-gradient(180deg, #ffffff 0%, #f6faff 100%); }
    .issue-label { margin: 0 0 10px; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .issue-card h2 { margin: 0; font-size: 26px; line-height: 1.2; }
    .issue-card h2 a { color: inherit; text-decoration: none; }
    .issue-date { margin: 10px 0 0; color: var(--muted); font-size: 14px; }
    .issue-summary { margin: 14px 0 0; color: #304153; line-height: 1.7; }
    .issue-actions { margin-top: 16px; }
    .issue-link { color: var(--accent); font-weight: 700; text-decoration: none; }
    .footer { margin-top: 28px; color: var(--muted); font-size: 14px; line-height: 1.7; }
    .footer p { margin: 0 0 8px; }
    @media (max-width: 640px) {
      h1 { font-size: 32px; }
      .hero p { font-size: 16px; }
      .issue-card h2 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Robot Weekly</p>
      <h1>Newsletter archive</h1>
      <p>Every Robot Weekly issue lives here. Use this page to catch up on the latest briefing, revisit past editions, or subscribe via the RSS archive feed.</p>
      <div class="hero-actions">
        <a class="primary" href="${escapeHtml(items[0]?.link || siteUrl)}">Read latest issue</a>
        <a class="secondary" href="${escapeHtml(feedUrl)}">Open RSS feed</a>
      </div>
    </section>
    <section class="issues">
${cards}
    </section>
    <div class="footer">
      <p>Robot Weekly is the weekly briefing from robot.tv for builders, operators, and investors.</p>
      <p>Daily coverage lives at <a href="https://news.robot.tv">news.robot.tv</a>.</p>
    </div>
  </main>
</body>
</html>`;
};

const buildFeedXml = ({ items, siteUrl, feedUrl }) => {
  const feedItems = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid>${escapeXml(item.guid || item.link)}</guid>
      <pubDate>${escapeXml(item.pubDate)}</pubDate>
      <description>${escapeXml(item.description || "")}</description>
      <content:encoded><![CDATA[${item.content}]]></content:encoded>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Robot Weekly</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>Weekly robotics briefing from robot.tv</description>
    <language>en-us</language>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${feedItems}
  </channel>
</rss>`;
};

const loadExistingFeedItems = async (feedPath) => {
  try {
    const xml = await fs.readFile(feedPath, "utf8");
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
    return items.map((itemXml) => ({
      title: stripHtml((itemXml.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1]),
      link: stripHtml((itemXml.match(/<link>([\s\S]*?)<\/link>/) || [, ""])[1]),
      guid: stripHtml((itemXml.match(/<guid>([\s\S]*?)<\/guid>/) || [, ""])[1]),
      pubDate: stripHtml((itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ""])[1]),
      description: stripHtml((itemXml.match(/<description>([\s\S]*?)<\/description>/) || [, ""])[1]),
      content: (itemXml.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) || [, ""])[1],
    }));
  } catch {
    return [];
  }
};

const run = async () => {
  let xml = "";
  let feedStatus = 200;
  if (FEED_PATH) {
    xml = await fs.readFile(FEED_PATH, "utf8");
  } else {
    const feedResponse = await fetch(FEED_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
      },
    });
    feedStatus = feedResponse.status;
    xml = await feedResponse.text();
  }

  const items = parseRssItems(xml).filter((item) => item.title && item.link);
  if (!items.length) {
    const snippet = xml.slice(0, 280).replace(/\s+/g, " ").trim();
    throw new Error(`No items found in feed. Status ${feedStatus}. Snippet: ${snippet}`);
  }

  const selected = items.slice(0, MAX_ITEMS);
  let issue = null;
  let generationMode = "fallback";
  try {
    issue = await buildAiIssue(selected);
    if (issue) generationMode = "deepseek";
  } catch (err) {
    console.warn(`DeepSeek newsletter generation failed, using fallback. ${err?.message || err}`);
  }
  if (!issue) issue = buildFallbackIssue(selected);

  const now = new Date();
  const issueDate = formatDate(now);
  const issueSlug = `${ISSUE_PREFIX}-${now.toISOString().slice(0, 10)}`;
  const issueUrl = `${SITE_URL}/${OUTPUT_DIR}/${issueSlug}.html`;
  const archiveUrl = `${SITE_URL}/${ARCHIVE_PATH}`;
  const issueHtml = buildIssueHtml({ ...issue, issueDate, issueUrl, archiveUrl });
  const issueText = buildIssueText({ ...issue, issueDate, issueUrl, archiveUrl });

  const outputDir = path.join(process.cwd(), OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });
  const issuePath = path.join(outputDir, `${issueSlug}.html`);
  const textPath = path.join(outputDir, `${issueSlug}.txt`);
  await fs.writeFile(issuePath, issueHtml, "utf8");
  await fs.writeFile(textPath, issueText, "utf8");

  const reportDir = path.join(process.cwd(), REPORT_DIR);
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    path.join(reportDir, "latest-issue.json"),
    JSON.stringify(
      {
        generatedAt: now.toISOString(),
        generationMode,
        issueSlug,
        issueUrl,
        issueDate,
        subject: issue.subject,
        preheader: issue.preheader,
        highlightCount: issue.highlights.length,
        highlights: issue.highlights,
      },
      null,
      2
    )
  );
  await fs.writeFile(
    path.join(reportDir, "latest-issue.md"),
    [
      `# ${issue.subject}`,
      "",
      `- Mode: ${generationMode}`,
      `- Date: ${issueDate}`,
      `- URL: ${issueUrl}`,
      "",
      "## Editorial Note",
      issue.intro,
      "",
      "## Lead Signal",
      `- ${issue.leadTitle}`,
      `- ${issue.leadSummary}`,
      `- ${issue.leadWhyItMatters}`,
      "",
      "## Highlights",
      ...issue.highlights.flatMap((item) => [
        `- ${item.title}`,
        `  Summary: ${item.summary}`,
        `  Why it matters: ${item.whyItMatters}`,
        `  Link: ${item.link}`,
      ]),
      "",
      "## What To Watch",
      issue.closing,
      "",
    ].join("\n"),
    "utf8"
  );

  const feedPath = path.join(process.cwd(), "newsletter-feed.xml");
  const existing = await loadExistingFeedItems(feedPath);
  const newItem = {
    title: issue.subject,
    link: issueUrl,
    guid: issueUrl,
    pubDate: now.toUTCString(),
    description: issue.preheader,
    content: issueHtml,
  };
  const combined = [newItem, ...existing].filter((item, index, array) => array.findIndex((candidate) => candidate.guid === item.guid) === index).slice(0, 20);
  const feedXml = buildFeedXml({
    items: combined,
    siteUrl: SITE_URL,
    feedUrl: `${SITE_URL}/newsletter-feed.xml`,
  });
  await fs.writeFile(feedPath, feedXml, "utf8");
  const archiveHtml = buildArchiveHtml({
    items: combined,
    archiveUrl,
    feedUrl: `${SITE_URL}/newsletter-feed.xml`,
    siteUrl: SITE_URL,
  });
  await fs.writeFile(path.join(root, "newsletters.html"), archiveHtml, "utf8");

  console.log(`Generated newsletter issue: ${issuePath}`);
  console.log(`Generated newsletter text: ${textPath}`);
  console.log(`Generated newsletter archive: ${path.join(root, "newsletters.html")}`);
  console.log(`Newsletter report: ${path.join(reportDir, "latest-issue.md")}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
