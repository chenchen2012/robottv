import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = process.env.NEWSLETTER_OUTPUT_DIR || "newsletters";
const ISSUE_PREFIX = process.env.NEWSLETTER_SLUG_PREFIX || "robot-weekly";
const SITE_URL = process.env.NEWSLETTER_SITE_URL || "https://robot.tv";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_LIST_ID = Number(process.env.BREVO_LIST_ID || 3);
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "newsletter@robot.tv";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Robot Weekly";
const BREVO_CAMPAIGN_PREFIX = process.env.BREVO_CAMPAIGN_PREFIX || "Robot Weekly";
const BREVO_DRY_RUN = process.env.BREVO_DRY_RUN === "1";

const LOG_PATH = path.join("ops-private", "reports", "newsletter", "brevo-last-sent.json");

const decodeHtml = (input) =>
  String(input || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const findLatestIssue = async () => {
  const dir = path.resolve(OUTPUT_DIR);
  const entries = await fs.readdir(dir);
  const matches = entries
    .map((name) => {
      const match = name.match(new RegExp(`^${ISSUE_PREFIX}-(\\d{4}-\\d{2}-\\d{2})\\.html$`));
      if (!match) return null;
      return { name, date: match[1] };
    })
    .filter(Boolean);
  if (!matches.length) {
    throw new Error(`No newsletter issues found in ${OUTPUT_DIR}.`);
  }
  matches.sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = matches[0];
  const filePath = path.join(dir, latest.name);
  const html = await fs.readFile(filePath, "utf8");
  return { filePath, filename: latest.name, date: latest.date, html };
};

const extractSubject = (html) => {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  if (!match) return `Robot Weekly — ${new Date().toISOString().slice(0, 10)}`;
  return decodeHtml(match[1].trim());
};

const loadLastSent = async () => {
  try {
    const data = await fs.readFile(LOG_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
};

const saveLastSent = async (payload) => {
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.writeFile(LOG_PATH, JSON.stringify(payload, null, 2));
};

const brevoRequest = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Brevo request failed (${response.status}): ${text}`);
  }
  return response.json();
};

const run = async () => {
  if (!BREVO_API_KEY) {
    throw new Error("Missing BREVO_API_KEY.");
  }
  if (!Number.isFinite(BREVO_LIST_ID)) {
    throw new Error("BREVO_LIST_ID must be a number.");
  }

  const latest = await findLatestIssue();
  const subject = extractSubject(latest.html);
  const issueUrl = `${SITE_URL}/newsletters/${latest.filename}`;
  const lastSent = await loadLastSent();
  if (lastSent?.issue === latest.filename) {
    console.log(`Latest issue already sent (${latest.filename}).`);
    return;
  }

  const campaignPayload = {
    name: `${BREVO_CAMPAIGN_PREFIX} ${latest.date}`,
    subject,
    sender: {
      name: BREVO_SENDER_NAME,
      email: BREVO_SENDER_EMAIL,
    },
    replyTo: BREVO_SENDER_EMAIL,
    type: "classic",
    htmlContent: latest.html,
    recipients: {
      listIds: [BREVO_LIST_ID],
    },
    mirrorActive: true,
  };

  if (BREVO_DRY_RUN) {
    console.log("BREVO_DRY_RUN=1. Campaign payload prepared but not sent.");
    console.log(JSON.stringify({ issue: latest.filename, subject, issueUrl }, null, 2));
    return;
  }

  const created = await brevoRequest("https://api.brevo.com/v3/emailCampaigns", campaignPayload);
  const campaignId = created?.id;
  if (!campaignId) {
    throw new Error("Brevo did not return a campaign ID.");
  }
  await brevoRequest(`https://api.brevo.com/v3/emailCampaigns/${campaignId}/sendNow`, {});

  await saveLastSent({
    issue: latest.filename,
    subject,
    issueUrl,
    campaignId,
    sentAt: new Date().toISOString(),
  });

  console.log(`Sent ${latest.filename} via Brevo campaign ${campaignId}.`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
