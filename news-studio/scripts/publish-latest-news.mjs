const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production'
const token = process.env.SANITY_API_TOKEN
const authorId = process.env.SANITY_AUTHOR_ID || 'author-chen-chen'

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

const sourceToCategory = (source, title) => {
  const t = `${title} ${source}`.toLowerCase()
  if (t.includes('humanoid') || t.includes('biped')) return 'category-humanoid-robots'
  if (t.includes('quadruped') || t.includes('spot')) return 'category-quadruped-robots'
  return 'category-robotics-startups'
}

const stripHtml = (s) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 90)
const normalizeTitle = (s) => String(s || '')
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'for', 'to', 'of', 'in', 'on', 'with', 'after', 'than'])
const titleKey = (s) => normalizeTitle(s).split(' ').filter((w) => w && !STOPWORDS.has(w)).slice(0, 8).join(' ')

const youtubeFromQuery = async (q) => {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
  const html = await fetch(url).then((r) => r.text())
  const m = html.match(/"videoId":"([^"]+)"/)
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : ''
}

const parseRssItems = (xml) => {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1])
  return items.map((itemXml) => {
    const titleRaw = (itemXml.match(/<title>([\s\S]*?)<\/title>/) || [,''])[1]
    const link = stripHtml((itemXml.match(/<link>([\s\S]*?)<\/link>/) || [,''])[1])
    const pubDate = stripHtml((itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [,''])[1])
    const source = stripHtml((itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [,'Unknown'])[1])
    const title = stripHtml(titleRaw)
    return {title, link, pubDate, source}
  })
}

const now = new Date()
const slotHour = now.getUTCHours() < 12 ? '00' : '12'
const slotStamp = `${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCDate()).padStart(2,'0')}${slotHour}`

const existingQuery = encodeURIComponent(`*[_type=="post" && publishedAt > dateTime(now()) - 60*60*24*14]{"title": title}`)
const existingResp = await fetch(`https://${projectId}.api.sanity.io/v2023-10-01/data/query/${dataset}?query=${existingQuery}`)
const existingJson = await existingResp.json()
const existingKeys = new Set((existingJson?.result || []).map((p) => titleKey(p.title)).filter(Boolean))

const xml = await fetch(rssUrl).then((r) => r.text())
const parsed = parseRssItems(xml)
const selected = []
const seenKeys = new Set(existingKeys)
for (const x of parsed) {
  if (!trustedSources.has(x.source)) continue
  const cleanTitle = x.title.replace(/\s+-\s+[^-]+$/, '').trim()
  const key = titleKey(cleanTitle)
  if (!key || seenKeys.has(key)) continue
  seenKeys.add(key)
  selected.push({...x, cleanTitle})
  if (selected.length === 2) break
}

if (!selected.length) {
  console.error('No trusted non-duplicate headlines found in RSS feed')
  process.exit(1)
}

const docs = []
for (let i = 0; i < selected.length; i += 1) {
  const h = selected[i]
  const cleanTitle = h.cleanTitle
  const slug = slugify(cleanTitle)
  const yt = await youtubeFromQuery(`${cleanTitle} ${h.source}`)
  const category = sourceToCategory(h.source, cleanTitle)

  docs.push({
    _id: `post-auto-${slotStamp}-${i + 1}`,
    _type: 'post',
    title: cleanTitle,
    slug: {_type: 'slug', current: slug || `news-${slotStamp}-${i + 1}`},
    excerpt: `${cleanTitle} (${h.source})`,
    publishedAt: new Date().toISOString(),
    youtubeUrl: yt || 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    author: {_type: 'reference', _ref: authorId},
    categories: [{_type: 'reference', _ref: category}],
    body: [
      {
        _type: 'block',
        _key: `b${i}a`,
        style: 'normal',
        markDefs: [],
        children: [{_type: 'span', _key: `s${i}a`, text: `Source: ${h.source}.`}]
      },
      {
        _type: 'block',
        _key: `b${i}b`,
        style: 'normal',
        markDefs: [],
        children: [{_type: 'span', _key: `s${i}b`, text: `Original coverage link: ${h.link}`}]
      }
    ]
  })
}

const mutateUrl = `https://${projectId}.api.sanity.io/v2023-10-01/data/mutate/${dataset}`
const body = {mutations: docs.map((doc) => ({createOrReplace: doc}))}

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
console.log('Published docs:', docs.map((d) => d._id).join(', '))
if (result?.results) {
  console.log('Mutation results:', result.results.length)
}
