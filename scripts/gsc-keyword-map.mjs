#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.GSC_TOKEN;
const quotaProject = process.env.GSC_QUOTA_PROJECT || "ebuyesell";
const outDir = path.join(process.cwd(), "ops-private", "reports", "seo");

if (!token) {
  console.error("Missing GSC_TOKEN. Example:");
  console.error("GSC_TOKEN=$(gcloud auth application-default print-access-token) node scripts/gsc-keyword-map.mjs");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "x-goog-user-project": quotaProject,
  "Content-Type": "application/json",
};

const targets = [
  { name: "robot.tv", siteUrl: "sc-domain:robot.tv" },
  { name: "news.robot.tv", siteUrl: "https://news.robot.tv/" },
];

const NOISE_QUERY_PATTERNS = [
  /^site:/i,
  /^https?:\/\//i,
  /^www\./i,
  /^robot\.tv$/i,
  /^news\.robot\.tv$/i,
  /^robot\s*tv$/i,
  /^robottv$/i,
];

function isNoisyQuery(q) {
  const v = String(q || "").trim().toLowerCase();
  if (!v) return true;
  return NOISE_QUERY_PATTERNS.some((re) => re.test(v));
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function subDays(base, days) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function pct(curr, prev) {
  if (prev === 0) return curr === 0 ? 0 : null;
  return (curr - prev) / prev;
}

function fmtPct(v) {
  if (v === null) return "n/a";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function toNum(n) {
  return Number(n || 0);
}

async function querySearchAnalytics(siteUrl, startDate, endDate, rowLimit = 300) {
  const encoded = encodeURIComponent(siteUrl);
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`;
  const body = {
    startDate,
    endDate,
    dimensions: ["query"],
    searchType: "web",
    rowLimit,
    startRow: 0,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GSC query failed for ${siteUrl}: HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  return Array.isArray(data.rows) ? data.rows : [];
}

function mergePeriods(currentRows, previousRows) {
  const m = new Map();

  for (const r of previousRows) {
    const q = String(r.keys?.[0] || "").trim();
    if (!q) continue;
    m.set(q, {
      query: q,
      prevClicks: toNum(r.clicks),
      prevImpressions: toNum(r.impressions),
      prevCtr: toNum(r.ctr),
      prevPosition: toNum(r.position),
      currClicks: 0,
      currImpressions: 0,
      currCtr: 0,
      currPosition: 0,
    });
  }

  for (const r of currentRows) {
    const q = String(r.keys?.[0] || "").trim();
    if (!q) continue;
    const prev = m.get(q) || {
      query: q,
      prevClicks: 0,
      prevImpressions: 0,
      prevCtr: 0,
      prevPosition: 0,
    };
    m.set(q, {
      ...prev,
      currClicks: toNum(r.clicks),
      currImpressions: toNum(r.impressions),
      currCtr: toNum(r.ctr),
      currPosition: toNum(r.position),
    });
  }

  return Array.from(m.values()).map((x) => ({
    ...x,
    clickDeltaPct: pct(x.currClicks, x.prevClicks),
    imprDeltaPct: pct(x.currImpressions, x.prevImpressions),
    ctrDeltaPct: pct(x.currCtr, x.prevCtr),
    posDelta: x.prevPosition && x.currPosition ? x.currPosition - x.prevPosition : null,
  }));
}

function buildActions(rows) {
  const active = rows.filter((r) => r.currImpressions > 0 && !isNoisyQuery(r.query));

  const defend = active
    .filter((r) => r.currImpressions >= 8 && r.currPosition <= 10 && r.currCtr < 0.05)
    .sort((a, b) => b.currImpressions - a.currImpressions)
    .slice(0, 12);

  const push = active
    .filter((r) => r.currImpressions >= 5 && r.currPosition > 8 && r.currPosition <= 30)
    .sort((a, b) => b.currImpressions - a.currImpressions)
    .slice(0, 12);

  const rising = active
    .filter((r) => r.currImpressions >= 3 && (r.imprDeltaPct === null || r.imprDeltaPct >= 0.4))
    .sort((a, b) => {
      const ad = a.imprDeltaPct === null ? 9e9 : a.imprDeltaPct;
      const bd = b.imprDeltaPct === null ? 9e9 : b.imprDeltaPct;
      return bd - ad;
    })
    .slice(0, 12);

  return { defend, push, rising };
}

function topTable(rows, count = 20) {
  return rows
    .filter((r) => r.currImpressions > 0 && !isNoisyQuery(r.query))
    .sort((a, b) => b.currImpressions - a.currImpressions)
    .slice(0, count);
}

function lineFor(r) {
  return `- \`${r.query}\` | imp ${r.currImpressions} (${fmtPct(r.imprDeltaPct)}), clicks ${r.currClicks} (${fmtPct(r.clickDeltaPct)}), ctr ${(r.currCtr * 100).toFixed(2)}%, pos ${r.currPosition.toFixed(1)}`;
}

async function run() {
  const now = new Date();
  const endCurrent = subDays(now, 1);
  const startCurrent = subDays(now, 28);
  const endPrev = subDays(now, 29);
  const startPrev = subDays(now, 56);

  const ranges = {
    current: { start: fmtDate(startCurrent), end: fmtDate(endCurrent) },
    previous: { start: fmtDate(startPrev), end: fmtDate(endPrev) },
  };

  const report = {
    generatedAt: new Date().toISOString(),
    ranges,
    properties: [],
  };

  for (const t of targets) {
    const curr = await querySearchAnalytics(t.siteUrl, ranges.current.start, ranges.current.end);
    const prev = await querySearchAnalytics(t.siteUrl, ranges.previous.start, ranges.previous.end);
    const merged = mergePeriods(curr, prev);
    const actions = buildActions(merged);
    const top = topTable(merged, 25);

    report.properties.push({
      name: t.name,
      siteUrl: t.siteUrl,
      summary: {
        currentRows: curr.length,
        previousRows: prev.length,
      },
      topKeywords: top,
      actions,
    });
  }

  const day = report.generatedAt.slice(0, 10);
  const jsonPath = path.join(outDir, `keyword-map-${day}.json`);
  const mdPath = path.join(outDir, `keyword-map-${day}.md`);

  const md = [
    "# Weekly Keyword Map",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Current range: ${ranges.current.start} to ${ranges.current.end}`,
    `- Previous range: ${ranges.previous.start} to ${ranges.previous.end}`,
    "",
    ...report.properties.flatMap((p) => [
      `## ${p.name}`,
      "",
      "### Top Keywords (by impressions)",
      ...p.topKeywords.slice(0, 12).map(lineFor),
      "",
      "### Defend (high impressions, low CTR)",
      ...(p.actions.defend.length ? p.actions.defend.map(lineFor) : ["- none"]),
      "",
      "### Push (page 2 opportunities)",
      ...(p.actions.push.length ? p.actions.push.map(lineFor) : ["- none"]),
      "",
      "### Rising (fast growth)",
      ...(p.actions.rising.length ? p.actions.rising.map(lineFor) : ["- none"]),
      "",
    ]),
  ].join("\n");

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, `${md}\n`, "utf8");

  console.log(`keyword_map_json=${jsonPath}`);
  console.log(`keyword_map_md=${mdPath}`);
  console.log(md);
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
