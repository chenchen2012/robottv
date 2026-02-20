const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production'
const token = process.env.SANITY_API_TOKEN || ''
const count = Number(process.env.SOCIAL_DRAFT_COUNT || process.env.PUBLISH_COUNT || 3)
const outJson = process.env.SOCIAL_DRAFT_JSON || 'news-studio/social-drafts/latest-social-drafts.json'
const outMd = process.env.SOCIAL_DRAFT_MD || 'news-studio/social-drafts/latest-social-drafts.md'

if (!projectId) {
  console.error('Missing required env: SANITY_PROJECT_ID (or SANITY_STUDIO_PROJECT_ID)')
  process.exit(1)
}

const headers = token ? { Authorization: `Bearer ${token}` } : {}
const query = '*[_type=="post" && !(_id in path("drafts.**"))] | order(publishedAt desc)[0...24]{title,excerpt,publishedAt,youtubeUrl,"slug":slug.current,"author":author->name}'
const url = `https://${projectId}.api.sanity.io/v2023-10-01/data/query/${dataset}?query=${encodeURIComponent(query)}`

const resp = await fetch(url, { headers })
if (!resp.ok) {
  const text = await resp.text()
  console.error('Failed to fetch posts for social drafts:', resp.status, text)
  process.exit(1)
}

const data = await resp.json()
const allPosts = Array.isArray(data?.result) ? data.result : []

const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const titleKey = (s) => normalize(s).toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ').filter(Boolean).slice(0, 10).join(' ')
const dedup = []
const seen = new Set()
for (const p of allPosts) {
  if (!p?.slug || !p?.title) continue
  const k = titleKey(p.title)
  if (!k || seen.has(k)) continue
  seen.add(k)
  dedup.push(p)
  if (dedup.length >= Math.max(1, count)) break
}

if (!dedup.length) {
  console.error('No eligible published posts found for social drafts.')
  process.exit(1)
}

const detectTopic = (title = '', excerpt = '') => {
  const t = `${title} ${excerpt}`.toLowerCase()
  if (t.includes('humanoid') || t.includes('biped') || t.includes('optimus') || t.includes('figure')) return 'humanoids'
  if (t.includes('quadruped') || t.includes('spot') || t.includes('unitree')) return 'quadrupeds'
  if (t.includes('warehouse') || t.includes('factory') || t.includes('logistics') || t.includes('deployment')) return 'deployments'
  if (t.includes('funding') || t.includes('startup') || t.includes('raise') || t.includes('valuation')) return 'startups'
  return 'robotics'
}

const hookFor = (topic) => {
  if (topic === 'humanoids') return 'Humanoids are moving from demo to deployment.'
  if (topic === 'quadrupeds') return 'Quadrupeds are becoming practical infrastructure tools.'
  if (topic === 'deployments') return 'Real-world robot deployment signals just moved.'
  if (topic === 'startups') return 'Robotics startup velocity is shifting again.'
  return 'A high-signal robotics update just dropped.'
}

const tagsFor = (topic) => {
  if (topic === 'humanoids') return ['#Robotics', '#HumanoidRobots', '#AI']
  if (topic === 'quadrupeds') return ['#Robotics', '#Quadrupeds', '#Automation']
  if (topic === 'deployments') return ['#Robotics', '#Automation', '#Industry40']
  if (topic === 'startups') return ['#Robotics', '#Startups', '#VentureCapital']
  return ['#Robotics', '#Automation', '#Tech']
}

const tighten = (s, n) => {
  const t = normalize(s)
  if (t.length <= n) return t
  return `${t.slice(0, Math.max(0, n - 1)).trim()}…`
}

const items = dedup.map((p) => {
  const topic = detectTopic(p.title, p.excerpt)
  const hook = hookFor(topic)
  const tags = tagsFor(topic)
  const articleUrl = `https://news.robot.tv/post/${p.slug}`
  const homeUrl = 'https://robot.tv/'
  const newsUrl = 'https://news.robot.tv/'
  const sourceLine = p.author ? `By ${normalize(p.author)} on robot.tv News.` : 'From robot.tv News.'
  const insight = normalize(p.excerpt || p.title)

  const xTail = `\n\nRead: ${articleUrl}\n${tags.join(' ')}`
  const xBudget = Math.max(40, 280 - xTail.length)
  const xLead = tighten(`${hook} ${tighten(p.title, 110)} ${tighten(insight, 120)}`, xBudget)
  const xPost = `${xLead}${xTail}`

  const linkedinPost = [
    hook,
    '',
    `Headline: ${normalize(p.title)}`,
    '',
    `Why it matters: ${tighten(insight, 220)}`,
    '',
    `${sourceLine}`,
    `Read on news.robot.tv: ${articleUrl}`,
    `Explore robot index: ${homeUrl}`,
    '',
    tags.join(' ')
  ].join('\n')

  const redditTitle = tighten(`${normalize(p.title)} | robot.tv News`, 280)
  const redditBody = [
    hook,
    '',
    `Key signal: ${tighten(insight, 260)}`,
    '',
    `Article: ${articleUrl}`,
    `Main site: ${homeUrl}`,
    `Newsroom: ${newsUrl}`,
    '',
    'Question: Do you think this changes near-term robot adoption in real operations?'
  ].join('\n')

  return {
    slug: p.slug,
    title: normalize(p.title),
    publishedAt: p.publishedAt,
    topic,
    links: {
      article: articleUrl,
      robotTv: homeUrl,
      news: newsUrl,
      youtube: p.youtubeUrl || ''
    },
    x: {
      text: xPost,
      charCount: xPost.length
    },
    linkedin: {
      text: linkedinPost
    },
    reddit: {
      title: redditTitle,
      body: redditBody,
      suggestedSubreddits: ['r/robotics', 'r/singularity', 'r/Futurology']
    }
  }
})

const now = new Date().toISOString()
const output = {
  generatedAt: now,
  source: {
    projectId,
    dataset,
    count: items.length
  },
  items
}

await import('node:fs/promises').then(async (fs) => {
  await fs.mkdir('news-studio/social-drafts', { recursive: true })
  await fs.writeFile(outJson, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  const md = [
    '# robot.tv Social Drafts',
    '',
    `Generated: ${now}`,
    '',
    ...items.flatMap((it, i) => [
      `## ${i + 1}. ${it.title}`,
      '',
      `- Topic: ${it.topic}`,
      `- Article: ${it.links.article}`,
      `- YouTube: ${it.links.youtube || 'n/a'}`,
      '',
      '### X',
      '',
      it.x.text,
      '',
      '### LinkedIn',
      '',
      it.linkedin.text,
      '',
      '### Reddit Title',
      '',
      it.reddit.title,
      '',
      '### Reddit Body',
      '',
      it.reddit.body,
      '',
      '---',
      ''
    ])
  ].join('\n')

  await fs.writeFile(outMd, md, 'utf8')
})

console.log(`Generated social drafts for ${items.length} post(s).`)
console.log(`- JSON: ${outJson}`)
console.log(`- MD: ${outMd}`)
