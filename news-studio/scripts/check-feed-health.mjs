const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production'
const token = process.env.SANITY_API_TOKEN || ''
const maxFeedAgeHours = Number(process.env.MAX_FEED_AGE_HOURS || 24)
const guardWindowHours = Number(process.env.GUARD_WINDOW_HOURS || 36)
const mainstreamSources = new Set([
  'Reuters',
  'TechCrunch',
  'Business Insider',
  'The Guardian',
  'Janes',
  'Bloomberg',
  'BBC',
  'CNN',
  'The Wall Street Journal',
  'Wall Street Journal',
  'Financial Times',
  'Associated Press',
  'AP'
])

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
  if (text.length < 120 || text.length > 260) return false
  return wordCount(text) >= 18
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'for', 'to', 'of', 'in', 'on', 'with', 'after', 'than', 'into', 'from'])
const titleKey = (s) => normalizeTitle(s)
  .split(' ')
  .filter((w) => w && !STOPWORDS.has(w))
  .slice(0, 8)
  .join(' ')

const bodyWordCount = (body = []) =>
  (Array.isArray(body) ? body : [])
    .flatMap((block) => Array.isArray(block?.children) ? block.children : [])
    .map((child) => String(child?.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length

const allowsMissingYoutube = (post) =>
  mainstreamSources.has(String(post?.sourceName || '').trim()) &&
  isExcerptStrong(post?.excerpt) &&
  bodyWordCount(post?.body) >= 80

const query = '*[_type=="post" && !(_id in path("drafts.**"))] | order(publishedAt desc)[0...12]{_id,title,excerpt,publishedAt,youtubeUrl,sourceName,body,"slug":slug.current}'
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

const badPosts = []
const recentGuardPosts = posts.filter((p) => {
  const ts = Date.parse(p.publishedAt)
  if (!Number.isFinite(ts)) return false
  const age = (Date.now() - ts) / (1000 * 60 * 60)
  return age <= guardWindowHours
})

const seenYoutube = new Map()
const youtubeDupes = []
for (const p of recentGuardPosts) {
  const ytId = extractYoutubeId(p.youtubeUrl)

  if (!String(p.title || '').trim()) badPosts.push(`${p._id}: missing title`)
  if (!String(p.slug || '').trim()) badPosts.push(`${p._id}: missing slug`)
  if (!isExcerptStrong(p.excerpt)) badPosts.push(`${p._id}: weak excerpt`)
  if (!ytId && !allowsMissingYoutube(p)) badPosts.push(`${p._id}: missing/invalid YouTube URL`)

  if (ytId) {
    if (seenYoutube.has(ytId)) youtubeDupes.push([seenYoutube.get(ytId), p])
    else seenYoutube.set(ytId, p)
  }

}

if (badPosts.length > 0) {
  console.error(`Feed health failed: content guard checks failed in last ${guardWindowHours}h.`)
  for (const issue of badPosts.slice(0, 8)) {
    console.error(`- ${issue}`)
  }
  process.exit(1)
}

const seen = new Map()
const dupes = []
for (const p of recentGuardPosts) {
  const key = titleKey(p.title)
  if (!key) continue
  if (seen.has(key)) dupes.push([seen.get(key), p])
  else seen.set(key, p)
}

if (dupes.length > 0) {
  console.error(`Feed health failed: duplicate-like headlines found in last ${guardWindowHours}h.`)
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

console.log(`Feed health OK: latest post "${latest.title}" is ${ageHours.toFixed(1)}h old; strict guards passed for ${recentGuardPosts.length} recent posts.`)
