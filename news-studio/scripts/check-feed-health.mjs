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

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length

const extractYoutubeId = (url) => {
  const value = String(url || '').trim()
  if (!value) return ''
  const short = value.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (short) return short[1]
  const watch = value.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watch) return watch[1]
  const embed = value.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  if (embed) return embed[1]
  return ''
}

const isExcerptStrong = (excerpt) => {
  const text = String(excerpt || '').trim()
  if (text.length < 110 || text.length > 240) return false
  if (wordCount(text) < 16) return false
  return text.toLowerCase().includes('why it matters:')
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'for', 'to', 'of', 'in', 'on', 'with', 'after', 'than', 'into', 'from'])
const titleKey = (s) => normalizeTitle(s)
  .split(' ')
  .filter((w) => w && !STOPWORDS.has(w))
  .slice(0, 8)
  .join(' ')

const query = '*[_type=="post" && !(_id in path("drafts.**"))] | order(publishedAt desc)[0...12]{_id,title,excerpt,publishedAt,youtubeUrl,"slug":slug.current}'
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
const badPosts = []
const seenYoutube = new Map()
const youtubeDupes = []
for (const p of posts) {
  const key = titleKey(p.title)
  const ytId = extractYoutubeId(p.youtubeUrl)

  if (!String(p.title || '').trim()) badPosts.push(`${p._id}: missing title`)
  if (!String(p.slug || '').trim()) badPosts.push(`${p._id}: missing slug`)
  if (!isExcerptStrong(p.excerpt)) badPosts.push(`${p._id}: weak excerpt`)
  if (!ytId) badPosts.push(`${p._id}: missing/invalid YouTube URL`)

  if (ytId) {
    if (seenYoutube.has(ytId)) youtubeDupes.push([seenYoutube.get(ytId), p])
    else seenYoutube.set(ytId, p)
  }

  if (!key) continue
  if (seen.has(key)) dupes.push([seen.get(key), p])
  else seen.set(key, p)
}

if (badPosts.length > 0) {
  console.error('Feed health failed: content guard checks failed.')
  for (const issue of badPosts.slice(0, 8)) {
    console.error(`- ${issue}`)
  }
  process.exit(1)
}

if (dupes.length > 0) {
  console.error('Feed health failed: duplicate-like headlines found in recent posts.')
  for (const [a, b] of dupes.slice(0, 5)) {
    console.error(`- ${a.title} | ${b.title}`)
  }
  process.exit(1)
}

if (youtubeDupes.length > 0) {
  console.error('Feed health failed: duplicate YouTube videos found in recent posts.')
  for (const [a, b] of youtubeDupes.slice(0, 5)) {
    console.error(`- ${a.title} | ${b.title}`)
  }
  process.exit(1)
}

console.log(`Feed health OK: latest post "${latest.title}" is ${ageHours.toFixed(1)}h old; guards passed for ${posts.length} posts.`)
