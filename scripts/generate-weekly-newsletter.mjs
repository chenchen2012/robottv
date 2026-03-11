import fs from "node:fs/promises";
import path from "node:path";

const FEED_URL = process.env.NEWSLETTER_FEED_URL || "https://news.robot.tv/feed.xml";
const MAX_ITEMS = Number(process.env.NEWSLETTER_MAX_ITEMS || 8);
const OUTPUT_DIR = process.env.NEWSLETTER_OUTPUT_DIR || "newsletters";
const SITE_URL = process.env.NEWSLETTER_SITE_URL || "https://robot.tv";
const TIME_ZONE = process.env.NEWSLETTER_TIMEZONE || "America/Los_Angeles";
const LOCALE = process.env.NEWSLETTER_LOCALE || "en-US";
const ISSUE_PREFIX = process.env.NEWSLETTER_SLUG_PREFIX || "robot-weekly";

const stripHtml = (input) =>
  String(input || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

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

const parseRssItems = (xml) => {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return items.map((itemXml) => {
    const titleRaw = (itemXml.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1];
    const link = stripHtml((itemXml.match(/<link>([\s\S]*?)<\/link>/) || [, ""])[1]);
    const pubDate = stripHtml((itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ""])[1]);
    const source = stripHtml((itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [, ""])[1]);
    const descriptionRaw = (itemXml.match(/<description>([\s\S]*?)<\/description>/) || [, ""])[1];
    const contentRaw = (itemXml.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) || [, ""])[1];
    const description = stripHtml(contentRaw || descriptionRaw);
    const title = stripHtml(titleRaw).replace(/\s+-\s+[^-]+$/, "").trim();
    return { title, link, pubDate, source, description };
  });
};

const formatDate = (date) =>
  new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeZone: TIME_ZONE,
  }).format(date);

const buildFallbackSummary = (items) => {
  const intro =
    "Here is a focused weekly briefing of the most important robotics stories, platform moves, and deployment signals.";
  const highlights = items.map((item) => {
    const summary = item.description
      ? item.description.split(". ")[0].replace(/\.$/, "")
      : "";
    return {
      title: item.title,
      link: item.link,
      summary: summary || "Coverage worth tracking this week.",
      source: item.source,
    };
  });
  return { subject: `Robot Weekly — ${formatDate(new Date())}`, intro, highlights };
};

const buildAiSummary = async (items) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const apiUrl = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/chat/completions";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  const prompt = {
    role: "user",
    content: `You are drafting a weekly robotics newsletter. Use the items below to generate:\n- subject: <= 80 chars\n- intro: 2-3 sentences\n- highlights: list of 6-8 bullets with title, link, 1-2 sentence summary\n\nReturn JSON with keys: subject, intro, highlights[]. Each highlight has title, link, summary, source.\n\nITEMS:\n${items
      .map(
        (item, idx) =>
          `${idx + 1}. ${item.title}\nSource: ${item.source || ""}\nLink: ${item.link}\nDescription: ${item.description || ""}`
      )
      .join("\n\n")}`,
  };

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
            "You are a concise robotics newsletter editor. Keep tone professional and executive-friendly.",
        },
        prompt,
      ],
      temperature: 0.2,
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const jsonStart = content.indexOf("{");
  const jsonEnd = content.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("DeepSeek response did not include JSON payload.");
  }
  const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
  if (!parsed?.subject || !parsed?.intro || !Array.isArray(parsed?.highlights)) {
    throw new Error("DeepSeek response JSON missing expected fields.");
  }
  return parsed;
};

const buildIssueHtml = ({ subject, intro, highlights, issueDate, issueUrl }) => {
  const itemsHtml = highlights
    .map(
      (item) => `
      <li>
        <h3><a href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(item.summary)}${item.source ? ` <span class="source">(${escapeHtml(item.source)})</span>` : ""}</p>
      </li>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <script src="/scripts/ga-lazy.js?v=20260309-ga-v1" defer></script>
  <style>
    body { margin: 0; padding: 24px; font-family: "Space Grotesk", Arial, sans-serif; background: #0b0f16; color: #f3f6fb; }
    .container { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .meta { color: #9aa6bc; font-size: 14px; margin-bottom: 24px; }
    h2 { font-size: 20px; margin-top: 28px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { border: 1px solid #1c2637; border-radius: 12px; padding: 16px; margin-bottom: 12px; background: #111827; }
    a { color: #76a7ff; text-decoration: none; }
    p { line-height: 1.6; }
    .source { color: #7f8ca3; font-size: 12px; }
    .footer { margin-top: 32px; color: #7f8ca3; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(subject)}</h1>
    <div class="meta">${escapeHtml(issueDate)}</div>
    <p>${escapeHtml(intro)}</p>
    <h2>Top stories</h2>
    <ul>${itemsHtml}</ul>
    <div class="footer">
      <p>You can also browse the newsroom feed at <a href="https://news.robot.tv">news.robot.tv</a>.</p>
      <p>Issue archive: <a href="${escapeHtml(issueUrl)}">${escapeHtml(issueUrl)}</a></p>
    </div>
  </div>
</body>
</html>`;
};

const buildFeedXml = ({ items, siteUrl, feedUrl }) => {
  const feedItems = items
    .map((item) => {
      const description = escapeXml(item.description || "");
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid>${escapeXml(item.guid || item.link)}</guid>
      <pubDate>${escapeXml(item.pubDate)}</pubDate>
      <description>${description}</description>
      <content:encoded><![CDATA[${item.content}]]></content:encoded>
    </item>`;
    })
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
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    return items.map((itemXml) => {
      const title = stripHtml((itemXml.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1]);
      const link = stripHtml((itemXml.match(/<link>([\s\S]*?)<\/link>/) || [, ""])[1]);
      const guid = stripHtml((itemXml.match(/<guid>([\s\S]*?)<\/guid>/) || [, ""])[1]);
      const pubDate = stripHtml((itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ""])[1]);
      const description = stripHtml((itemXml.match(/<description>([\s\S]*?)<\/description>/) || [, ""])[1]);
      const content = (itemXml.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) || [, ""])[1];
      return { title, link, guid, pubDate, description, content };
    });
  } catch (err) {
    return [];
  }
};

const run = async () => {
  const xml = await fetch(FEED_URL).then((r) => r.text());
  const items = parseRssItems(xml).filter((item) => item.title && item.link);
  if (!items.length) throw new Error("No items found in feed.");

  const selected = items.slice(0, MAX_ITEMS);
  let summary;
  try {
    summary = await buildAiSummary(selected);
  } catch (err) {
    console.warn(`DeepSeek summarization failed, using fallback. ${err?.message || err}`);
  }
  if (!summary) summary = buildFallbackSummary(selected);

  const now = new Date();
  const issueDate = formatDate(now);
  const issueSlug = `${ISSUE_PREFIX}-${now.toISOString().slice(0, 10)}`;
  const issueUrl = `${SITE_URL}/${OUTPUT_DIR}/${issueSlug}.html`;
  const issueHtml = buildIssueHtml({
    subject: summary.subject,
    intro: summary.intro,
    highlights: summary.highlights,
    issueDate,
    issueUrl,
  });

  const outputDir = path.join(process.cwd(), OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });
  const issuePath = path.join(outputDir, `${issueSlug}.html`);
  await fs.writeFile(issuePath, issueHtml, "utf8");

  const feedPath = path.join(process.cwd(), "newsletter-feed.xml");
  const existing = await loadExistingFeedItems(feedPath);
  const newItem = {
    title: summary.subject,
    link: issueUrl,
    guid: issueUrl,
    pubDate: now.toUTCString(),
    description: summary.intro,
    content: issueHtml,
  };
  const combined = [newItem, ...existing].slice(0, 20);

  const feedXml = buildFeedXml({
    items: combined,
    siteUrl: SITE_URL,
    feedUrl: `${SITE_URL}/newsletter-feed.xml`,
  });
  await fs.writeFile(feedPath, feedXml, "utf8");

  console.log(`Generated newsletter issue: ${issuePath}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
