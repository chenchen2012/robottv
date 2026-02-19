const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production'
const token = process.env.SANITY_API_TOKEN || ''
const maxFeedAgeHours = Number(process.env.MAX_FEED_AGE_HOURS || 24)

if (!projectId) {
  console.error('Missing required env: SANITY_PROJECT_ID (or SANITY_STUDIO_PROJECT_ID)')
  process.exit(1)
}

const normalizeTitle = (s) => String(s || '')
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'for', 'to', 'of', 'in', 'on', 'with', 'after', 'than', 'into', 'from'])
const titleKey = (s) => normalizeTitle(s)
  .split(' ')
  .filter((w) => w && !STOPWORDS.has(w))
  .slice(0, 8)
  .join(' ')

const query = '*[_type=="post" && !(_id in path("drafts.**"))] | order(publishedAt desc)[0...12]{_id,title,publishedAt}'
const url = `https://${projectId}.api.sanity.io/v2023-10-01/data/query/${dataset}?query=${encodeURIComponent(query)}`
const headers = token ? { Authorization: `Bearer ${token}` } : {}
const resp = await fetch(url, { headers })

if (!resp.ok) {
  const text = await resp.text()
  console.error('Feed health query failed:', resp.status, text)
  process.exit(1)
}

const data = await resp.json()
const posts = data?.result || []
if (!posts.length) {
  console.error('Feed health failed: no published posts found.')
  process.exit(1)
}

const latest = posts[0]
const latestAt = Date.parse(latest.publishedAt)
if (!Number.isFinite(latestAt)) {
  console.error('Feed health failed: latest post has invalid publishedAt.')
  process.exit(1)
}

let ageHours = (Date.now() - latestAt) / (1000 * 60 * 60)
if (ageHours < -6) {
  console.error(`Feed health failed: latest post appears ${Math.abs(ageHours).toFixed(1)}h in the future.`)
  process.exit(1)
}
if (ageHours < 0) {
  console.warn(`Feed health warning: latest post timestamp is ${Math.abs(ageHours).toFixed(1)}h in the future; treating as fresh.`)
  ageHours = 0
}
if (ageHours > maxFeedAgeHours) {
  console.error(`Feed health failed: latest post is ${ageHours.toFixed(1)}h old, max is ${maxFeedAgeHours}h.`)
  process.exit(1)
}

const seen = new Map()
const dupes = []
for (const p of posts) {
  const key = titleKey(p.title)
  if (!key) continue
  if (seen.has(key)) dupes.push([seen.get(key), p])
  else seen.set(key, p)
}

if (dupes.length > 0) {
  console.error('Feed health failed: duplicate-like headlines found in recent posts.')
  for (const [a, b] of dupes.slice(0, 5)) {
    console.error(`- ${a.title} | ${b.title}`)
  }
  process.exit(1)
}

console.log(`Feed health OK: latest post "${latest.title}" is ${ageHours.toFixed(1)}h old; no duplicate-like titles in last ${posts.length} posts.`)
