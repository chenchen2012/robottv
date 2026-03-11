const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;
const dryRun = process.env.DRY_RUN === "1";

if (!projectId || !token) {
  console.error("Missing required env: SANITY_PROJECT_ID (or SANITY_STUDIO_PROJECT_ID) and SANITY_API_TOKEN");
  process.exit(1);
}

const normalizeExcerpt = (value) => {
  const text = String(value || "").trim();
  if (!text) return text;
  let cleaned = text.replace(
    /^(multiple outlets report(?: that)?|[A-Z][A-Za-z0-9&.'"\- ]{2,80}?)\s+(reports|report|says|said)\s+/i,
    ""
  ).trim();
  if (!cleaned) return text;
  if (cleaned[0] && cleaned[0] === cleaned[0].toLowerCase()) {
    cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
};

const fetchJson = async (url) => {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Request failed ${resp.status}: ${body}`);
  }
  return resp.json();
};

const postJson = async (url, payload) => {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Request failed ${resp.status}: ${body}`);
  }
  return resp.json();
};

const query = `*[_type=="post" && defined(excerpt)]{_id, title, excerpt}`;
const queryUrl = `https://${projectId}.api.sanity.io/v2023-10-01/data/query/${dataset}?query=${encodeURIComponent(query)}`;
const result = await fetchJson(queryUrl);
const posts = Array.isArray(result.result) ? result.result : [];

const updates = posts
  .map((post) => {
    const original = String(post.excerpt || "").trim();
    const normalized = normalizeExcerpt(original);
    if (!original || normalized === original) return null;
    return {
      id: post._id,
      title: String(post.title || "").trim(),
      from: original,
      to: normalized,
    };
  })
  .filter(Boolean);

if (!updates.length) {
  console.log("No excerpts needed normalization.");
  process.exit(0);
}

console.log(`Normalizing ${updates.length} excerpts${dryRun ? " (dry run)" : ""}...`);

const mutateUrl = `https://${projectId}.api.sanity.io/v2023-10-01/data/mutate/${dataset}`;
const chunkSize = 50;

for (let i = 0; i < updates.length; i += chunkSize) {
  const batch = updates.slice(i, i + chunkSize);
  const mutations = batch.map((item) => ({
    patch: {
      id: item.id,
      set: { excerpt: item.to },
    },
  }));

  if (dryRun) {
    console.log(`Dry run batch ${i / chunkSize + 1}: ${batch.length} updates`);
    continue;
  }

  await postJson(mutateUrl, { mutations });
  console.log(`Updated batch ${i / chunkSize + 1}: ${batch.length} excerpts`);
}

console.log("Excerpt normalization complete.");
