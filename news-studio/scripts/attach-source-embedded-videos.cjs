const fs = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')

const { getCliClient } = require('@sanity/cli')

const DEFAULT_LIMIT = 12
const DEFAULT_LOOKBACK_DAYS = 45
const SOURCE_FETCH_TIMEOUT_MS = Number(process.env.NEWS_SOURCE_FETCH_TIMEOUT_MS || 12_000)

const normalizeYouTubeUrl = (value = '') => {
  const text = String(value || '').replace(/\\\//g, '/').replace(/&amp;/gi, '&').trim()
  const match = text.match(
    /(?:youtube\.com\/watch\?[^"'<>\s]*v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  )
  const videoId = match?.[1] || ''
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''
}

const extractYouTubeUrls = (html) => {
  const urls = []
  const seen = new Set()
  const candidates = [
    ...String(html || '').matchAll(/(?:https?:)?\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?[^"'<>\s]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}[^"'<>\s]*/gi),
    ...String(html || '').matchAll(/["']videoId["']\s*:\s*["'][a-zA-Z0-9_-]{11}["']/gi),
  ]
  for (const candidate of candidates) {
    const normalized = normalizeYouTubeUrl(candidate[0])
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    urls.push(normalized)
    if (urls.length >= 3) break
  }
  return urls
}

const parseArgNumber = (name, fallback) => {
  const prefix = `--${name}=`
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const fetchSourceHtml = async (sourceUrl) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
    })
    return response.ok ? response.text() : ''
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

;(async () => {
  const args = new Set(process.argv.slice(2))
  const applyChanges = args.has('--apply')
  const limit = parseArgNumber('limit', DEFAULT_LIMIT)
  const lookbackDays = parseArgNumber('lookback-days', DEFAULT_LOOKBACK_DAYS)
  const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()
  const reportPath =
    process.env.REPORT_PATH || path.join(process.cwd(), '..', 'ops-private', 'reports', 'publish', 'source-embedded-video-backfill.json')

  const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID || 'lumv116w'
  const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production'
  const client = getCliClient({ apiVersion: '2023-10-01' }).withConfig({ projectId, dataset, useCdn: false })

  const posts = await client.fetch(
    `*[_type=="post" && !(_id in path("drafts.**")) && defined(slug.current) && defined(sourceUrl) && (!defined(youtubeUrl) || youtubeUrl == "") && publishedAt >= $since] | order(publishedAt desc)[0...${limit}]{
      _id,
      title,
      "slug": slug.current,
      publishedAt,
      sourceName,
      sourceUrl
    }`,
    { since: sinceIso }
  )

  const report = []
  const mutations = []

  for (const post of posts || []) {
    const html = await fetchSourceHtml(post.sourceUrl)
    const youtubeUrls = extractYouTubeUrls(html)
    const youtubeUrl = youtubeUrls[0] || ''
    report.push({
      slug: post.slug,
      title: post.title,
      publishedAt: post.publishedAt,
      sourceName: post.sourceName,
      sourceUrl: post.sourceUrl,
      youtubeUrls,
      status: youtubeUrl ? (applyChanges ? 'applied' : 'prepared') : 'no_source_embed_found',
    })

    if (!youtubeUrl) continue
    mutations.push({
      patch: {
        id: post._id,
        set: { youtubeUrl },
      },
    })
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2))

  const prepared = report.filter((item) => item.youtubeUrls?.length).length
  if (!prepared) {
    console.log(`No source-embedded YouTube URLs found across ${posts?.length || 0} recent no-video posts.`)
    console.log(`Report: ${reportPath}`)
    process.exit(0)
  }

  if (!applyChanges) {
    console.log(`Dry run only; prepared ${prepared} source-embedded video attachment(s).`)
    console.log(`Report: ${reportPath}`)
    process.exit(0)
  }

  await client.mutate(mutations)
  console.log(`Applied ${mutations.length} source-embedded video attachment(s).`)
  console.log(`Report: ${reportPath}`)
})().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
