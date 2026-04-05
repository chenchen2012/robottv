import fs from 'node:fs/promises'
import path from 'node:path'

import { buildEditorialPackage, blocksFromParagraphs } from './lib/news-editorial-content.mjs'
import { callDeepSeekJson } from './lib/deepseek-provider.mjs'
import {
  NEWS_MAX_POSTS_PER_DAY,
  NEWS_PUBLISH_BATCH_LIMIT,
  NEWS_RECENT_DUPLICATE_WINDOW_DAYS,
  RSS_URL,
} from './lib/news-publish-config.mjs'
import {
  buildFallbackQcEnrichment,
  buildQcPrompt,
  choosePreferredCandidate,
  findHardDuplicate,
  findSoftDuplicate,
  getSourceTrustTier,
  isPromotionalLikely,
  normalizeText,
  normalizeUrl,
  normalizeWhitespace,
  rankCandidate,
  slugify,
  stripHtml,
  titleKey,
  validateQcEnrichment,
} from './lib/news-publish-quality.mjs'
import { matchYouTubeVideo } from './lib/youtube-provider.mjs'

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production'
const token = process.env.SANITY_API_TOKEN
const authorId = process.env.SANITY_AUTHOR_ID || 'author-chen-chen'
const dryRun = process.env.DRY_RUN === '1'
const publishReportPath =
  process.env.NEWS_PUBLISH_REPORT_PATH || path.join('ops-private', 'reports', 'publish', 'latest-published-news.json')

if (!projectId || !token) {
  console.error('Missing required env: SANITY_PROJECT_ID (or SANITY_STUDIO_PROJECT_ID) and SANITY_API_TOKEN')
  process.exit(1)
}

const utcDayStartIso = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString()

const parseRssItems = (xml) => {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1])
  return items.map((itemXml) => {
    const titleRaw = (itemXml.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]
    const link = stripHtml((itemXml.match(/<link>([\s\S]*?)<\/link>/) || [, ''])[1])
    const pubDate = stripHtml((itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ''])[1])
    const sourceSiteUrl = stripHtml((itemXml.match(/<source[^>]*url="([^"]+)"/) || [, ''])[1])
    const source = stripHtml((itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [, 'Unknown'])[1])
    const title = stripHtml(titleRaw).replace(/\s+-\s+[^-]+$/, '').trim()
    return {
      title,
      sourceName: source,
      sourceUrl: link,
      sourceSiteUrl,
      sourcePublishedAt: pubDate,
    }
  })
}

const existingQuery = encodeURIComponent(
  '*[_type=="post" && !(_id in path("drafts.**"))] | order(publishedAt desc){_id,title,"slug":slug.current,sourceName,sourceUrl,sourceSiteUrl,publishedAt}'
)
const existingResp = await fetch(`https://${projectId}.api.sanity.io/v2023-10-01/data/query/${dataset}?query=${existingQuery}`)
if (!existingResp.ok) {
  const text = await existingResp.text()
  console.error('Failed to fetch existing posts:', existingResp.status, text)
  process.exit(1)
}

const existingJson = await existingResp.json()
const existingPosts = existingJson?.result || []

const todayStart = utcDayStartIso()
const publishedTodayCount = existingPosts.filter((post) => String(post?.publishedAt || '') >= todayStart).length
const remainingDailySlots = Math.max(0, NEWS_MAX_POSTS_PER_DAY - publishedTodayCount)

if (!remainingDailySlots) {
  console.log(`UTC daily cap reached (${publishedTodayCount}/${NEWS_MAX_POSTS_PER_DAY}). No-op for this cycle.`)
  process.exit(0)
}

const xml = await fetch(RSS_URL).then((response) => response.text())
const parsed = parseRssItems(xml)

const normalizedCandidates = parsed
  .map((item) => {
    const slug = slugify(item.title)
    const sourceTrustTier = getSourceTrustTier(item)
    return {
      ...item,
      slug,
      normalizedTitle: normalizeText(item.title),
      sourceTrustTier,
      titleKey: titleKey(item.title),
    }
  })
  .filter((item) => item.title && item.slug && item.sourceUrl)
  .sort((a, b) => rankCandidate(b) - rankCandidate(a))

const candidatePool = []
const seenPoolKeys = new Map()
for (const candidate of normalizedCandidates) {
  const hardDup = findHardDuplicate(candidate, existingPosts)
  if (candidate.sourceTrustTier === 'block' || hardDup) continue

  const existing = seenPoolKeys.get(candidate.titleKey)
  if (!existing) {
    seenPoolKeys.set(candidate.titleKey, candidate)
    candidatePool.push(candidate)
    continue
  }

  const preferred = choosePreferredCandidate(candidate, existing)
  if (preferred === candidate) {
    seenPoolKeys.set(candidate.titleKey, candidate)
    const index = candidatePool.findIndex((item) => item.titleKey === candidate.titleKey)
    if (index >= 0) candidatePool[index] = candidate
  }
}

const docs = []
const acceptedReviews = []
const rejectedReviews = []
const acceptedForDupChecks = [...existingPosts]

const writePublishReport = async () => {
  await fs.mkdir(path.dirname(publishReportPath), { recursive: true })
  await fs.writeFile(
    publishReportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        utcDayStart: todayStart,
        publishedTodayCount,
        remainingDailySlots,
        maxPostsPerDay: NEWS_MAX_POSTS_PER_DAY,
        published: docs.length,
        acceptedReviews,
        rejectedReviews,
        docs: docs.map((doc) => ({
          id: doc._id,
          title: doc.title,
          slug: doc.slug?.current || '',
          url: doc.slug?.current ? `https://news.robot.tv/${doc.slug.current}/` : '',
          homepageEligible: doc.homepageEligible,
          sourceTrustTier: doc.sourceTrustTier,
          internalLinkTarget: doc.internalLinkTarget || '',
        })),
      },
      null,
      2
    )
  )
}

for (const candidate of candidatePool) {
  if (docs.length >= Math.min(remainingDailySlots, NEWS_PUBLISH_BATCH_LIMIT)) break

  if (candidate.sourceTrustTier === 'block') {
    rejectedReviews.push({ title: candidate.title, reason: 'blocked source tier', tier: candidate.sourceTrustTier })
    continue
  }

  const hardDuplicate = findHardDuplicate(candidate, acceptedForDupChecks)
  if (hardDuplicate) {
    rejectedReviews.push({ title: candidate.title, reason: 'hard duplicate', tier: candidate.sourceTrustTier })
    continue
  }

  const softDuplicate = findSoftDuplicate(candidate, acceptedForDupChecks, NEWS_RECENT_DUPLICATE_WINDOW_DAYS)
  if (softDuplicate) {
    rejectedReviews.push({
      title: candidate.title,
      reason: `near-duplicate within ${NEWS_RECENT_DUPLICATE_WINDOW_DAYS} days`,
      tier: candidate.sourceTrustTier,
      duplicateOf: softDuplicate.title,
    })
    continue
  }

  const editorial = await buildEditorialPackage({
    headline: candidate.title,
    source: candidate.sourceName,
    sourceUrl: candidate.sourceUrl,
    pubDate: candidate.sourcePublishedAt,
    categoryHint: '',
  })

  if (isPromotionalLikely({ title: candidate.title, sourceName: candidate.sourceName, sourceUrl: candidate.sourceUrl, sourceContext: editorial.sourceContext })) {
    rejectedReviews.push({ title: candidate.title, reason: 'promotional or low-value source page', tier: candidate.sourceTrustTier })
    continue
  }

  const fallbackQc = buildFallbackQcEnrichment({ candidate, editorial })
  const deepSeekResult = await callDeepSeekJson({
    systemPrompt: 'You are a strict robotics news quality-control reviewer. Return strict JSON only and do not invent facts.',
    userPrompt: buildQcPrompt({ candidate, editorial }),
    maxTokens: 420,
  })

  const normalizedModelOutput = validateQcEnrichment(deepSeekResult.data)
  const normalizedFallback = validateQcEnrichment(fallbackQc)
  const enrichment =
    normalizedModelOutput.ok ? normalizedModelOutput.data : normalizedFallback.ok ? normalizedFallback.data : null

  if (!enrichment) {
    rejectedReviews.push({
      title: candidate.title,
      reason: normalizedModelOutput.reason || normalizedFallback.reason || 'no_safe_enrichment',
      tier: candidate.sourceTrustTier,
    })
    continue
  }

  if (deepSeekResult.ok && enrichment.reject) {
    rejectedReviews.push({
      title: candidate.title,
      reason: enrichment.reject_reason || 'model_reject',
      tier: candidate.sourceTrustTier,
    })
    continue
  }

  if (candidate.sourceTrustTier === 'unknown') {
    rejectedReviews.push({
      title: candidate.title,
      reason: 'unknown source trust tier',
      tier: candidate.sourceTrustTier,
    })
    continue
  }

  const sourcePublishedAt = (() => {
    const parsedDate = new Date(candidate.sourcePublishedAt || '')
    return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate.toISOString()
  })()

  const doc = {
    _id: `post-auto-${candidate.slug}`,
    _type: 'post',
    title: candidate.title,
    slug: { _type: 'slug', current: candidate.slug },
    excerpt: enrichment.summary,
    whyItMatters: enrichment.why_it_matters,
    homepageEligible: enrichment.homepage_eligible,
    sourceTrustTier: candidate.sourceTrustTier,
    internalLinkTarget: enrichment.internal_link_target || undefined,
    publishedAt: new Date().toISOString(),
    youtubeUrl: '',
    sourceName: candidate.sourceName,
    sourceUrl: candidate.sourceUrl,
    sourceSiteUrl: candidate.sourceSiteUrl,
    sourcePublishedAt,
    sourceImageUrl: editorial?.sourceContext?.imageUrl || '',
    author: { _type: 'reference', _ref: authorId },
    categories: [{ _type: 'reference', _ref: enrichment.category }],
    body: blocksFromParagraphs(editorial.bodyParagraphs),
  }

  const youtubeDecision = await matchYouTubeVideo({
    story: {
      title: doc.title,
      sourceName: doc.sourceName,
      sourcePublishedAt,
    },
    youtubeSearchQuery: enrichment.youtube_search_query || '',
  })

  if (youtubeDecision.attached && youtubeDecision.match?.youtubeUrl) {
    doc.youtubeUrl = youtubeDecision.match.youtubeUrl
  }

  docs.push(doc)
  acceptedForDupChecks.unshift({
    title: doc.title,
    slug: doc.slug.current,
    sourceUrl: doc.sourceUrl,
    publishedAt: doc.publishedAt,
  })

  acceptedReviews.push({
    title: candidate.title,
    mode: deepSeekResult.ok ? 'deepseek' : 'fallback',
    tier: candidate.sourceTrustTier,
    homepageEligible: enrichment.homepage_eligible,
    youtubeSearchQuery: enrichment.youtube_search_query || '',
    youtube: {
      attached: youtubeDecision.attached,
      reason: youtubeDecision.reason,
      channel: youtubeDecision.match?.channelTitle || '',
      title: youtubeDecision.match?.videoTitle || '',
    },
  })

  console.log(
    `YouTube ${youtubeDecision.attached ? 'attached' : 'skipped'} for "${candidate.title}": ${youtubeDecision.reason}` +
      `${youtubeDecision.match?.channelTitle ? ` | ${youtubeDecision.match.channelTitle}` : ''}` +
      `${youtubeDecision.match?.videoTitle ? ` | ${youtubeDecision.match.videoTitle}` : ''}`
  )
}

if (!docs.length) {
  await writePublishReport()
  console.log('Quality-control layer rejected all candidates. No-op for this cycle.')
  if (rejectedReviews.length) {
    rejectedReviews.forEach((item) => console.log(`- ${item.title}: ${item.reason}`))
  }
  process.exit(0)
}

if (dryRun) {
  console.log('Dry run selected docs:')
  docs.forEach((doc) => console.log(`- ${doc._id} | ${doc.title}`))
  process.exit(0)
}

const mutateUrl = `https://${projectId}.api.sanity.io/v2023-10-01/data/mutate/${dataset}`
const mutationBody = { mutations: docs.map((doc) => ({ createIfNotExists: doc })) }

const mutateResp = await fetch(mutateUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(mutationBody),
})

if (!mutateResp.ok) {
  const text = await mutateResp.text()
  console.error('Sanity mutation failed:', mutateResp.status, text)
  process.exit(1)
}

const result = await mutateResp.json()

await writePublishReport()

console.log('Created docs:', docs.map((doc) => doc._id).join(', '))
console.log(`Published: ${docs.length}`)
if (result?.results) {
  console.log('Mutation results:', result.results.length)
}
console.log(`Publish report: ${publishReportPath}`)
console.log('Public site rebuilds are handled by GitHub Actions + Cloudflare Pages after publish.')
