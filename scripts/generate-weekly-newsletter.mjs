import fs from "node:fs/promises";
import path from "node:path";

const FEED_URL = process.env.NEWSLETTER_FEED_URL || "https://news.robot.tv/feed.xml";
const FEED_PATH = process.env.NEWSLETTER_FEED_PATH;
const MAX_ITEMS = Number(process.env.NEWSLETTER_MAX_ITEMS || 8);
const OUTPUT_DIR = process.env.NEWSLETTER_OUTPUT_DIR || "newsletters";
const SITE_URL = process.env.NEWSLETTER_SITE_URL || "https://robot.tv";
const TIME_ZONE = process.env.NEWSLETTER_TIMEZONE || "America/Los_Angeles";
const LOCALE = process.env.NEWSLETTER_LOCALE || "en-US";
const ISSUE_PREFIX = process.env.NEWSLETTER_SLUG_PREFIX || "robot-weekly";
const REPORT_DIR = process.env.NEWSLETTER_REPORT_DIR || path.join("ops-private", "reports", "newsletter");

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
      "This week’s robot.tv briefing focuses on the stories that look most useful for understanding deployment progress, company positioning, and the shape of the current robotics market.",
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
      "The next useful question is whether these signals turn into repeatable deployments, stronger margins, and clearer category leaders over the next quarter.",
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
    "- Avoid robotic phrases like 'why it matters:' in labels.",
    "- Keep the tone sharp, human, and professional.",
    "- Keep each title matched to the linked story.",
    "- Summaries should explain the development.",
    "- whyItMatters lines should explain the practical implication.",
    "- Return strict JSON only.",
    "",
    "Return this shape:",
    "{",
    '  "subject": "string <= 80 chars",',
    '  "preheader": "string <= 140 chars",',
    '  "intro": "2-3 sentences",',
    '  "leadTitle": "string",',
    '  "leadLink": "one of the supplied links",',
    '  "leadSummary": "2 sentences",',
    '  "leadWhyItMatters": "1-2 sentences",',
    '  "highlights": [',
    '    { "title": "string", "link": "string", "source": "string", "summary": "1-2 sentences", "whyItMatters": "1 sentence" }',
    "  ],",
    '  "closing": "2 sentences"',
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

const buildIssueHtml = ({ subject, preheader, intro, leadTitle, leadLink, leadSummary, leadWhyItMatters, highlights, closing, issueDate, issueUrl }) => {
  const highlightCards = highlights
    .map(
      (item) => `
      <li>
        <h3><a href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(item.summary)}</p>
        <p class="why">${escapeHtml(item.whyItMatters)}</p>
        ${item.source ? `<div class="source">${escapeHtml(item.source)}</div>` : ""}
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
    body { margin:0; padding:0; background:#09111a; color:#edf3ff; font-family:"Space Grotesk",Arial,sans-serif; }
    .shell { width:100%; padding:28px 14px; }
    .card { max-width:720px; margin:0 auto; border:1px solid #203047; border-radius:20px; background:linear-gradient(160deg,#0d1622,#101d2d); overflow:hidden; }
    .hero { padding:28px 28px 22px; background:
      radial-gradient(circle at top right, rgba(94,132,255,.26), transparent 38%),
      radial-gradient(circle at top left, rgba(239,45,82,.18), transparent 32%),
      linear-gradient(160deg,#0f1826,#122133); }
    .kicker { margin:0 0 10px; color:#94a7c6; text-transform:uppercase; letter-spacing:.12em; font-size:12px; font-weight:700; }
    h1 { margin:0; font-size:31px; line-height:1.15; }
    .meta { margin-top:12px; color:#9fb0ca; font-size:14px; }
    .preheader { margin-top:14px; color:#d3def0; line-height:1.7; font-size:16px; }
    .body { padding:0 28px 28px; }
    .section { padding-top:24px; }
    .section h2 { margin:0 0 12px; font-size:21px; }
    .section p { margin:0; color:#d6e1f2; line-height:1.75; }
    .lead { border:1px solid #243955; border-radius:16px; padding:18px 18px 16px; background:rgba(8,13,22,.64); }
    .lead h3 { margin:0 0 10px; font-size:22px; line-height:1.25; }
    .lead .why { margin-top:12px; color:#9fc2ff; }
    ul { list-style:none; padding:0; margin:0; display:grid; gap:12px; }
    li { border:1px solid #1d314b; border-radius:16px; padding:16px 16px 14px; background:#0d1724; }
    li h3 { margin:0 0 10px; font-size:18px; line-height:1.35; }
    li h3 a { color:#edf3ff; text-decoration:none; }
    li p { margin:0; color:#d2deef; line-height:1.7; }
    li .why { margin-top:10px; color:#8fb3ff; }
    .source { margin-top:10px; color:#7f96b7; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
    .closing { border-top:1px solid #22344e; margin-top:24px; padding-top:24px; }
    .footer { margin-top:24px; color:#8da2c2; font-size:13px; line-height:1.7; }
    a { color:#8db5ff; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <div class="hero">
        <p class="kicker">Robot Weekly</p>
        <h1>${escapeHtml(subject)}</h1>
        <div class="meta">${escapeHtml(issueDate)}</div>
        <p class="preheader">${escapeHtml(preheader)}</p>
      </div>
      <div class="body">
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
            <p>Browse the newsroom any time at <a href="https://news.robot.tv">news.robot.tv</a>.</p>
            <p>Issue archive: <a href="${escapeHtml(issueUrl)}">${escapeHtml(issueUrl)}</a></p>
          </div>
        </section>
      </div>
    </div>
  </div>
</body>
</html>`;
};

const buildIssueText = ({ subject, intro, leadTitle, leadLink, leadSummary, leadWhyItMatters, highlights, closing, issueDate, issueUrl }) => {
  const lines = [
    subject,
    issueDate,
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
  lines.push(`Archive: ${issueUrl}`);

  return `${lines.join("\n")}\n`;
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
  const issueHtml = buildIssueHtml({ ...issue, issueDate, issueUrl });
  const issueText = buildIssueText({ ...issue, issueDate, issueUrl });

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

  console.log(`Generated newsletter issue: ${issuePath}`);
  console.log(`Generated newsletter text: ${textPath}`);
  console.log(`Newsletter report: ${path.join(reportDir, "latest-issue.md")}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
