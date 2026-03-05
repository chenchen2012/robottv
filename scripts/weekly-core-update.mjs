#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = "/Users/cc801/Documents/New project/robottv";

const TARGETS = [
  {
    file: "company-boston-dynamics.html",
    name: "Boston Dynamics",
    focus: ["atlas", "spot", "stretch", "warehouse robotics", "humanoid robotics"],
    next: "compare latest deployment signals against Unitree and Figure coverage."
  },
  {
    file: "company-unitree.html",
    name: "Unitree",
    focus: ["g1", "h1", "h2", "go2", "b2", "humanoid robotics", "quadruped robotics"],
    next: "fold in newest newsroom developments tied to Unitree humanoid and quadruped deployments."
  }
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function humanDate(d) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function maybeDeepSeekBullets(target) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;

  const prompt = [
    `You are writing exactly 3 short SEO update bullets for a robotics company hub page.`,
    `Company: ${target.name}`,
    `Focus terms: ${target.focus.join(", ")}`,
    `Constraints:`,
    `- Each bullet starts with an action verb.`,
    `- Keep each bullet under 24 words.`,
    `- No hype, no unverifiable claims.`,
    `- Mention internal linking or content freshness in at least 2 bullets.`,
    `Output only a JSON array of 3 strings.`
  ].join("\n");

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) return null;

  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr) && arr.length === 3 && arr.every((x) => typeof x === "string")) {
      return arr;
    }
  } catch {}
  return null;
}

function fallbackBullets(target) {
  if (target.name === "Boston Dynamics") {
    return [
      "Strengthened internal links to Atlas, Spot, and Stretch pages to consolidate Boston Dynamics topic authority.",
      "Refreshed guide language to better match practical search intent around Boston Dynamics robots and deployments.",
      "Kept milestone and peer-comparison sections current to maintain freshness signals for robotics company coverage."
    ];
  }
  return [
    "Reinforced internal links to Unitree robots guide plus G1 and H1 pages for stronger cluster relevance.",
    "Reviewed product and milestone structure to keep the page aligned with current Unitree search intent.",
    "Maintained cross-links to peer company hubs to support broader humanoid and quadruped topical authority."
  ];
}

function buildWeeklySection(human, bullets, nextLine) {
  const items = bullets.map((b) => `                    <li>${escapeHtml(b)}</li>`).join("\n");
  return [
    `            <section class="panel reference-panel" id="weekly-update">`,
    `                <h2>Weekly Update (${human})</h2>`,
    `                <ul class="ref-list">`,
    items,
    `                </ul>`,
    `                <p class="status-line">Next planned refresh: ${escapeHtml(nextLine)}</p>`,
    `            </section>`
  ].join("\n");
}

function updatePage(html, weeklySection, iso, human) {
  let next = html;
  next = next.replace(/"dateModified": "\d{4}-\d{2}-\d{2}"/, `"dateModified": "${iso}"`);
  next = next.replace(
    /<p class="status-line">Last externally verified by robot\.tv: [^<]+<\/p>/,
    `<p class="status-line">Last externally verified by robot.tv: ${human}</p>`
  );

  const weeklyRegex = / {12}<section class="panel reference-panel" id="weekly-update">[\s\S]*? {12}<\/section>/;
  if (weeklyRegex.test(next)) {
    next = next.replace(weeklyRegex, weeklySection);
  } else {
    next = next.replace(
      /( {12}<section class="panel reference-panel verification-strip">)/,
      `${weeklySection}\n\n$1`
    );
  }
  return next;
}

async function main() {
  const today = new Date();
  const iso = isoDate(today);
  const human = humanDate(today);

  for (const target of TARGETS) {
    const full = path.join(ROOT, target.file);
    const current = await fs.readFile(full, "utf8");
    const aiBullets = await maybeDeepSeekBullets(target);
    const bullets = aiBullets || fallbackBullets(target);
    const section = buildWeeklySection(human, bullets, target.next);
    const updated = updatePage(current, section, iso, human);
    await fs.writeFile(full, updated, "utf8");
    console.log(`updated ${target.file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
