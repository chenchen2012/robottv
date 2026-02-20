const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production'
const token = process.env.SANITY_API_TOKEN
const authorId = process.env.SANITY_AUTHOR_ID || 'author-chen-chen'
const maxPosts = Number(process.env.PUBLISH_COUNT || 2)
const dryRun = process.env.DRY_RUN === '1'

if (!projectId || !token) {
  console.error('Missing required env: SANITY_PROJECT_ID (or SANITY_STUDIO_PROJECT_ID) and SANITY_API_TOKEN')
  process.exit(1)
}

const rssUrl = 'https://news.google.com/rss/search?q=robotics&hl=en-US&gl=US&ceid=US:en'

const trustedSources = new Set([
  'Reuters',
  'TechCrunch',
  'The Robot Report',
  'Business Insider',
  'The Guardian',
  'Janes'
])

const topCompanyTokens = [
  'tesla', 'optimus',
  'unitree',
  'boston dynamics', 'atlas', 'spot',
  'figure', 'figure ai',
  'agility robotics', 'digit',
  'apptronik', 'apollo',
  '1x', 'neo',
  'ubtech',
  'xiaomi',
  'honda asimo',
  'toyota thr3'
]

const companyCategoryTokens = [
  'tesla', 'unitree', 'boston dynamics', 'figure', 'agility', 'apptronik', '1x', 'ubtech', 'xiaomi', 'honda', 'toyota'
]

const stripHtml = (s) => String(s || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&#x27;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .trim()

const slugify = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 90)

const normalizeText = (s) => String(s || '')
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

const buildExcerpt = (headline, source) => {
  const title = String(headline || '').trim()
  const outlet = String(source || 'industry source').trim()
  return `${outlet} reports ${title}. Why it matters: this update may change near-term robotics deployment decisions and market momentum.`
}

const isExcerptStrong = (excerpt) => {
  const text = String(excerpt || '').trim()
  if (text.length < 110 || text.length > 240) return false
  if (wordCount(text) < 16) return false
  const lower = text.toLowerCase()
  return lower.includes('why it matters:')
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'for', 'to', 'of', 'in', 'on', 'with', 'after', 'than', 'into', 'from'])

const titleKey = (s) => normalizeText(s)
  .split(' ')
  .filter((w) => w && !STOPWORDS.has(w))
  .slice(0, 8)
  .join(' ')

const hasTopCompanySignal = (text) => {
  const n = normalizeText(text)
  return topCompanyTokens.some((token) => n.includes(token))
}

const sourceToCategory = (source, title) => {
  const t = normalizeText(`${title} ${source}`)
  if (t.includes('humanoid') || t.includes('biped') || companyCategoryTokens.some((x) => t.includes(x))) {
    return 'category-humanoid-robots'
  }
  if (t.includes('quadruped') || t.includes('spot')) return 'category-quadruped-robots'
  return 'category-robotics-startups'
}

const youtubeFromQuery = async (q) => {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
  const html = await fetch(url).then((r) => r.text())
  const m = html.match(/"videoId":"([^"]+)"/)
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : ''
}

const parseRssItems = (xml) => {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1])
  return items.map((itemXml) => {
    const titleRaw = (itemXml.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]
    const link = stripHtml((itemXml.match(/<link>([\s\S]*?)<\/link>/) || [, ''])[1])
    const pubDate = stripHtml((itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ''])[1])
    const source = stripHtml((itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [, 'Unknown'])[1])
    const title = stripHtml(titleRaw).replace(/\s+-\s+[^-]+$/, '').trim()
    return { title, link, pubDate, source }
  })
}

const now = new Date()
const slotHour = now.getUTCHours() < 12 ? '00' : '12'
const slotStamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${slotHour}`

const existingQuery = encodeURIComponent(`*[_type=="post" && publishedAt > dateTime(now()) - 60*60*24*21]{"title":title,"slug":slug.current}`)
const existingResp = await fetch(`https://${projectId}.api.sanity.io/v2023-10-01/data/query/${dataset}?query=${existingQuery}`)
const existingJson = await existingResp.json()
const existingTitleKeys = new Set((existingJson?.result || []).map((p) => titleKey(p.title)).filter(Boolean))
const existingSlugs = new Set((existingJson?.result || []).map((p) => String(p.slug || '').trim()).filter(Boolean))

const xml = await fetch(rssUrl).then((r) => r.text())
const parsed = parseRssItems(xml)

const scored = parsed
  .filter((x) => trustedSources.has(x.source))
  .map((x) => {
    const k = titleKey(x.title)
    const normalized = normalizeText(x.title)
    let score = 0
    if (hasTopCompanySignal(x.title)) score += 4
    if (normalized.includes('humanoid') || normalized.includes('robot')) score += 1
    if (x.source === 'Reuters') score += 1
    return { ...x, titleKey: k, score, topCompany: hasTopCompanySignal(x.title) }
  })
  .sort((a, b) => b.score - a.score)

const selected = []
const seen = new Set(existingTitleKeys)
for (const item of scored) {
  if (!item.titleKey || seen.has(item.titleKey)) continue
  const slug = slugify(item.title)
  if (!slug || existingSlugs.has(slug)) continue
  seen.add(item.titleKey)
  selected.push(item)
  if (selected.length >= maxPosts) break
}

if (!selected.length) {
  console.error('No trusted non-duplicate headlines found in RSS feed')
  process.exit(1)
}

const docs = []
const skipped = []
const usedYoutubeIds = new Set()
const usedTitleKeys = new Set()
for (let i = 0; i < selected.length; i += 1) {
  const h = selected[i]
  const slug = slugify(h.title)
  const yt = await youtubeFromQuery(`${h.title} ${h.source} robotics`)
  const ytId = extractYoutubeId(yt)
  const category = sourceToCategory(h.source, h.title)
  const excerpt = buildExcerpt(h.title, h.source)
  const key = titleKey(h.title)

  const hasGuardIssue =
    !h.title ||
    !slug ||
    !key ||
    !h.link ||
    !isExcerptStrong(excerpt) ||
    !ytId ||
    usedYoutubeIds.has(ytId) ||
    usedTitleKeys.has(key)

  if (hasGuardIssue) {
    skipped.push({
      title: h.title,
      reason: !ytId
        ? 'missing/invalid YouTube video'
        : !isExcerptStrong(excerpt)
          ? 'excerpt quality below threshold'
          : usedYoutubeIds.has(ytId)
            ? 'duplicate YouTube video in batch'
            : usedTitleKeys.has(key)
              ? 'duplicate headline in batch'
              : 'required field guard failed'
    })
    continue
  }

  const lowConfidence = !h.topCompany
  const idBase = `post-auto-${slotStamp}-${i + 1}`
  const docId = lowConfidence ? `drafts.${idBase}` : idBase

  usedYoutubeIds.add(ytId)
  usedTitleKeys.add(key)

  docs.push({
    _id: docId,
    _type: 'post',
    title: h.title,
    slug: { _type: 'slug', current: slug || `news-${slotStamp}-${i + 1}` },
    excerpt,
    publishedAt: new Date().toISOString(),
    youtubeUrl: `https://www.youtube.com/watch?v=${ytId}`,
    author: { _type: 'reference', _ref: authorId },
    categories: [{ _type: 'reference', _ref: category }],
    body: [
      {
        _type: 'block',
        _key: `b${i}a`,
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: `s${i}a`, text: `Source: ${h.source}. Published: ${h.pubDate || 'n/a'}.` }]
      },
      {
        _type: 'block',
        _key: `b${i}b`,
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: `s${i}b`, text: `Original coverage link: ${h.link}` }]
      },
      {
        _type: 'block',
        _key: `b${i}c`,
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: `s${i}c`, text: lowConfidence ? 'Status: queued as draft for review (company-signal guard).' : 'Status: auto-published.' }]
      }
    ]
  })
}

if (skipped.length) {
  console.log('Guard skipped items:')
  skipped.forEach((x) => console.log(`- ${x.title}: ${x.reason}`))
}

if (!docs.length) {
  console.error('Publish guard blocked all candidate posts. Nothing was published.')
  process.exit(1)
}

if (dryRun) {
  console.log('Dry run selected docs:')
  docs.forEach((d) => console.log(`- ${d._id} | ${d.title}`))
  process.exit(0)
}

const mutateUrl = `https://${projectId}.api.sanity.io/v2023-10-01/data/mutate/${dataset}`
const body = { mutations: docs.map((doc) => ({ createOrReplace: doc })) }

const resp = await fetch(mutateUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify(body)
})

if (!resp.ok) {
  const text = await resp.text()
  console.error('Sanity mutation failed:', resp.status, text)
  process.exit(1)
}

const result = await resp.json()
const published = docs.filter((d) => !d._id.startsWith('drafts.')).length
const drafted = docs.length - published
console.log('Created docs:', docs.map((d) => d._id).join(', '))
console.log(`Published: ${published}, Drafted: ${drafted}`)
if (result?.results) {
  console.log('Mutation results:', result.results.length)
}
