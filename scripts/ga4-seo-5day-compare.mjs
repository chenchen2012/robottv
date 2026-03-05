#!/usr/bin/env node

/**
 * GA4 5-day SEO comparison for robot.tv
 *
 * Required env:
 * - GA4_PROPERTY_ID   (example: 123456789)
 * - GA4_TOKEN         (OAuth access token with analytics.readonly scope)
 *
 * Optional env:
 * - GA4_HOSTNAME_REGEX   (default: (^|\\.)robot\\.tv$)
 * - GA4_TIMEZONE         (default: Asia/Shanghai)
 */

const propertyId = process.env.GA4_PROPERTY_ID;
const token = process.env.GA4_TOKEN;
const hostnameRegex = process.env.GA4_HOSTNAME_REGEX || "(^|\\.)robot\\.tv$";
const timezone = process.env.GA4_TIMEZONE || "Asia/Shanghai";
const quotaProject = process.env.GA4_QUOTA_PROJECT || "ebuyesell";

if (!propertyId || !token) {
  console.error("Missing required env vars.");
  console.error("Example:");
  console.error(
    "GA4_PROPERTY_ID=123456789 GA4_TOKEN='<oauth_access_token>' node scripts/ga4-seo-5day-compare.mjs"
  );
  process.exit(1);
}

const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

const buildRequest = (startDate, endDate) => ({
  dateRanges: [{ startDate, endDate }],
  dimensions: [{ name: "date" }],
  metrics: [
    { name: "sessions" },
    { name: "totalUsers" },
    { name: "newUsers" },
    { name: "engagedSessions" },
    { name: "conversions" },
  ],
  dimensionFilter: {
    andGroup: {
      expressions: [
        {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { value: "Organic Search", matchType: "EXACT" },
          },
        },
        {
          filter: {
            fieldName: "hostName",
            stringFilter: { value: hostnameRegex, matchType: "FULL_REGEXP" },
          },
        },
      ],
    },
  },
  keepEmptyRows: true,
  orderBys: [
    {
      dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" },
      desc: false,
    },
  ],
  currencyCode: "USD",
});

const toNum = (v) => Number(v || 0);

const fetchRange = async (startDate, endDate) => {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": quotaProject,
    },
    body: JSON.stringify(buildRequest(startDate, endDate)),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GA4 API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
};

const aggregate = (report) => {
  const totals = {
    sessions: 0,
    totalUsers: 0,
    newUsers: 0,
    engagedSessions: 0,
    conversions: 0,
  };

  for (const row of report.rows || []) {
    const values = row.metricValues || [];
    totals.sessions += toNum(values[0]?.value);
    totals.totalUsers += toNum(values[1]?.value);
    totals.newUsers += toNum(values[2]?.value);
    totals.engagedSessions += toNum(values[3]?.value);
    totals.conversions += toNum(values[4]?.value);
  }

  totals.engagementRate = totals.sessions > 0 ? totals.engagedSessions / totals.sessions : 0;
  return totals;
};

const pct = (curr, prev) => {
  if (prev === 0) return curr === 0 ? 0 : null;
  return (curr - prev) / prev;
};

const fmtPct = (v) => {
  if (v === null) return "n/a (prev=0)";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
};

const fmtNum = (n) => Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

const run = async () => {
  const current = await fetchRange("5daysAgo", "yesterday");
  const previous = await fetchRange("10daysAgo", "6daysAgo");
  const c = aggregate(current);
  const p = aggregate(previous);

  console.log("robot.tv GA4 SEO 5-day comparison");
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Timezone target: ${timezone}`);
  console.log(`Scope: Organic Search + hostName regex ${hostnameRegex}`);
  console.log("");

  const rows = [
    ["Sessions", c.sessions, p.sessions],
    ["Total users", c.totalUsers, p.totalUsers],
    ["New users", c.newUsers, p.newUsers],
    ["Engaged sessions", c.engagedSessions, p.engagedSessions],
    ["Conversions", c.conversions, p.conversions],
    ["Engagement rate", c.engagementRate, p.engagementRate],
  ];

  for (const [label, curr, prev] of rows) {
    const delta = pct(curr, prev);
    const isRate = label.includes("rate");
    const currOut = isRate ? `${(curr * 100).toFixed(1)}%` : fmtNum(curr);
    const prevOut = isRate ? `${(prev * 100).toFixed(1)}%` : fmtNum(prev);
    console.log(`- ${label}: ${currOut} vs ${prevOut} (${fmtPct(delta)})`);
  }
};

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
