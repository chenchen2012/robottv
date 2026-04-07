import fs from 'node:fs/promises'
import path from 'node:path'

import { buildEditorialPackage, blocksFromParagraphs } from './lib/news-editorial-content.mjs'
import {
  NEWS_MAX_POSTS_PER_DAY,
  NEWS_PUBLISH_BATCH_LIMIT,
  NEWS_RECENT_DUPLICATE_WINDOW_DAYS,
  RSS_URL,
} from './lib/news-publish-config.mjs'
import {
  abstractnessScore,
  buildFallbackQcEnrichment,
  choosePreferredCandidate,
  extractConcreteFactExcerpt,
  findHardDuplicate,
  findSoftDuplicate,
  getSourceTrustTier,
  hasConcreteFact,
  hasStrongVisualSupport,
  headlineSupportedByBody,
  isValidSourceUrl,
  isPromotionalLikely,
  leadStartsWithImplication,
  normalizeText,
  normalizeUrl,
  normalizeWhitespace,
  rankCandidate,
  repetitionScore,
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

const GOOGLE_NEWS_HOST = 'news.google.com'
const GOOGLE_NEWS_RSS_ARTICLE_PATH = /^\/rss\/articles\//i
const BAD_INTERMEDIARY_HOST_PATTERN =
  /(^|\.)news\.google\.com$|(^|\.)google\.com$|(^|\.)googleusercontent\.com$|(^|\.)googleadservices\.com$|(^|\.)feedproxy\.google\.com$|(^|\.)l\.facebook\.com$|(^|\.)t\.co$/i
const SOURCE_URL_RESOLUTION_TIMEOUT_MS = 8_000

const hostFromUrl = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    return new URL(text).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

const isGoogleNewsRssArticleUrl = (value) => {
  const text = String(value || '').trim()
  if (!text) return false
  try {
    const url = new URL(text)
    return url.hostname.toLowerCase() === GOOGLE_NEWS_HOST && GOOGLE_NEWS_RSS_ARTICLE_PATH.test(url.pathname)
  } catch {
    return false
  }
}

const googleNewsArticleIdFromUrl = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    if (url.hostname.toLowerCase() !== GOOGLE_NEWS_HOST) return ''
    const match = url.pathname.match(/^\/rss\/articles\/([^/?#]+)/i)
    return match?.[1] || ''
  } catch {
    return ''
  }
}

const isSaneResolvedPublisherUrl = ({ resolvedUrl, sourceSiteUrl = '' }) => {
  if (!isValidSourceUrl(resolvedUrl)) return false
  const resolvedHost = hostFromUrl(resolvedUrl)
  if (!resolvedHost || BAD_INTERMEDIARY_HOST_PATTERN.test(resolvedHost)) return false

  const sourceSiteHost = hostFromUrl(sourceSiteUrl)
  if (!sourceSiteHost) return true
  return resolvedHost === sourceSiteHost || resolvedHost.endsWith(`.${sourceSiteHost}`) || sourceSiteHost.endsWith(`.${resolvedHost}`)
}

const fetchGoogleNewsDecodedUrl = async ({ articleId = '', signal } = {}) => {
  if (!articleId) return ''

  const articleUrl = `https://${GOOGLE_NEWS_HOST}/rss/articles/${articleId}?hl=en-US&gl=US&ceid=US:en`
  const articleHtml = await fetch(articleUrl, {
    method: 'GET',
    redirect: 'follow',
    signal,
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
    },
  }).then((response) => response.text())

  const params =
    articleHtml.match(/data-n-a-sg="([^"]+)"[^>]*data-n-a-ts="([^"]+)"/i) ||
    articleHtml.match(/data-n-a-ts="([^"]+)"[^>]*data-n-a-sg="([^"]+)"/i)
  if (!params) return ''

  const signature = params[1].startsWith('AU_yqL') || params[1].startsWith('ATR') ? params[1] : params[2]
  const timestamp = signature === params[1] ? params[2] : params[1]
  if (!signature || !timestamp) return ''

  const payload = [
    'Fbv4je',
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${articleId}",${timestamp},"${signature}"]`,
  ]

  const responseText = await fetch(`https://${GOOGLE_NEWS_HOST}/_/DotsSplashUi/data/batchexecute`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': 'Mozilla/5.0 (compatible; GoogleNewsDecoder/1.0)',
    },
    body: `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`,
  }).then((response) => response.text())

  const parts = responseText.split('\n\n')
  if (parts.length < 2) return ''

  const parsed = JSON.parse(parts[1])
  const encodedResponse = parsed?.[0]?.[2]
  if (!encodedResponse) return ''

  const decodedUrl = JSON.parse(encodedResponse)?.[1]
  return String(decodedUrl || '').trim()
}

const resolveSourceUrl = async ({ rssSourceUrl = '', sourceSiteUrl = '' } = {}) => {
  const fallback = {
    rssSourceUrl,
    sourceUrl: rssSourceUrl,
    sourceUrlResolution: isGoogleNewsRssArticleUrl(rssSourceUrl) ? 'resolution_failed' : 'not_needed',
  }

  if (!isGoogleNewsRssArticleUrl(rssSourceUrl)) return fallback

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SOURCE_URL_RESOLUTION_TIMEOUT_MS)
  try {
    const articleId = googleNewsArticleIdFromUrl(rssSourceUrl)
    const resolvedUrl = await fetchGoogleNewsDecodedUrl({ articleId, signal: controller.signal })
    if (!isSaneResolvedPublisherUrl({ resolvedUrl, sourceSiteUrl })) return fallback

    return {
      rssSourceUrl,
      sourceUrl: resolvedUrl,
      sourceUrlResolution: 'resolved',
    }
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}

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
const parsedWithResolvedSourceUrls = await Promise.all(
  parsed.map(async (item) => {
    const { rssSourceUrl, sourceUrl, sourceUrlResolution } = await resolveSourceUrl({
      rssSourceUrl: item.sourceUrl,
      sourceSiteUrl: item.sourceSiteUrl,
    })
    return {
      ...item,
      rssSourceUrl,
      sourceUrl,
      sourceUrlResolution,
    }
  })
)

const normalizedCandidates = parsedWithResolvedSourceUrls
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
const draftOnlyReviews = []
const rejectedReviews = []
const acceptedForDupChecks = [...existingPosts]

const hasUsableSourceContext = (editorial) =>
  Boolean(
    editorial?.sourceContext?.metaDescription ||
      editorial?.sourceContext?.ogDescription ||
      editorial?.sourceContext?.pageTitle ||
      (Array.isArray(editorial?.sourceContext?.paragraphs) && editorial.sourceContext.paragraphs.length)
  )

const evaluateDecision = ({ candidate, editorial, enrichment, youtubeDecision }) => {
  const rejectReasons = []
  const draftReasons = []
  const factPackage = editorial?.factPackage || null

  if (!isValidSourceUrl(candidate?.sourceUrl)) {
    rejectReasons.push('missing_or_invalid_source_url')
  }

  if (!hasUsableSourceContext(editorial)) {
    rejectReasons.push('insufficient_source_context')
  }

  const summary = enrichment?.summary || editorial?.excerpt || ''
  const whyItMatters = enrichment?.why_it_matters || ''
  const bodyParagraphs = Array.isArray(editorial?.bodyParagraphs) ? editorial.bodyParagraphs : []
  const composedText = [summary, ...bodyParagraphs].join(' ')
  const concreteFactExcerpt =
    factPackage?.best_concrete_fact ||
    extractConcreteFactExcerpt(summary, { title: candidate?.title }) ||
    extractConcreteFactExcerpt(bodyParagraphs[0] || '', { title: candidate?.title }) ||
    extractConcreteFactExcerpt(composedText, { title: candidate?.title })
  const concreteFactPresent =
    Boolean(concreteFactExcerpt) || hasConcreteFact(composedText, { title: candidate?.title })
  if (!concreteFactPresent) {
    draftReasons.push('missing_concrete_fact')
  }

  const implicationFirst =
    leadStartsWithImplication(summary) &&
    !hasConcreteFact(summary, { title: candidate?.title }) &&
    !hasConcreteFact(bodyParagraphs[0] || '', { title: candidate?.title })
  if (implicationFirst) {
    draftReasons.push('implication_first_without_fact')
  }

  const headlineSupported = headlineSupportedByBody({
    title: candidate?.title,
    summary,
    bodyParagraphs,
  })
  if ((factPackage && !factPackage.headline_supported) || !headlineSupported) {
    draftReasons.push('headline_not_supported_by_body')
  }

  if (factPackage?.thin_source_risk === 'high') {
    draftReasons.push('thin_source_requires_review')
  }

  const abstraction = Math.max(
    Number(enrichment?.abstractness_score || 0),
    abstractnessScore({ summary, whyItMatters, bodyParagraphs })
  )
  if (abstraction >= 4) {
    draftReasons.push('abstract_or_over_interpretive')
  }

  const repetition = Math.max(
    Number(enrichment?.repetition_score || 0),
    repetitionScore({ summary, whyItMatters, bodyParagraphs })
  )
  if (repetition >= 4) {
    draftReasons.push('repetitive_abstract_language')
  }

  if (enrichment?.publish_recommendation === 'reject' || enrichment?.reject) {
    draftReasons.push(enrichment?.reject_reason || 'model_reject_requires_review')
  } else if (enrichment?.publish_recommendation === 'draft_only') {
    draftReasons.push(enrichment?.draft_reason || 'model_requested_editorial_review')
  }

  const visualSupport = hasStrongVisualSupport({
    youtubeUrl: youtubeDecision?.attached ? youtubeDecision?.match?.youtubeUrl || '' : '',
    sourceImageUrl: editorial?.sourceContext?.imageUrl || '',
    sourceContext: editorial?.sourceContext,
    visualStrengthScore: enrichment?.visual_strength_score || 0,
  })

  const storyFormat = visualSupport && enrichment?.story_format === 'featured_candidate'
    ? 'featured_candidate'
    : 'signal_brief'

  if (rejectReasons.length) {
    return {
      decision: 'reject',
      storyFormat,
      visualSupport,
      concreteFactPresent,
      concreteFactExcerpt,
      rejectReasons,
      draftReasons: [],
    }
  }

  if (draftReasons.length) {
    return {
      decision: 'draft_only',
      storyFormat,
      visualSupport,
      concreteFactPresent,
      concreteFactExcerpt,
      rejectReasons: [],
      draftReasons,
    }
  }

  return {
    decision: 'auto_publish',
    storyFormat,
    visualSupport,
    concreteFactPresent,
    concreteFactExcerpt,
    rejectReasons: [],
    draftReasons: [],
  }
}

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
        draftOnly: draftOnlyReviews.length,
        rejected: rejectedReviews.length,
        acceptedReviews,
        draftOnlyReviews,
        rejectedReviews,
        docs: docs.map((doc) => ({
          id: doc._id,
          title: doc.title,
          slug: doc.slug?.current || '',
          url: doc.slug?.current ? `https://news.robot.tv/${doc.slug.current}/` : '',
          homepageEligible: doc.homepageEligible,
          sourceTrustTier: doc.sourceTrustTier,
          rssSourceUrl: doc.rssSourceUrl || '',
          sourceUrl: doc.sourceUrl || '',
          sourceUrlResolution: doc.sourceUrlResolution || '',
          internalLinkTarget: doc.internalLinkTarget || '',
          storyFormat: acceptedReviews.find((review) => review.title === doc.title)?.storyFormat || 'signal_brief',
          youtubeUrl: doc.youtubeUrl || '',
        })),
      },
      null,
      2
    )
  )
}

for (const candidate of candidatePool) {
  if (docs.length >= Math.min(remainingDailySlots, NEWS_PUBLISH_BATCH_LIMIT)) break

  const sourceUrlDebug = {
    rssSourceUrl: candidate.rssSourceUrl || '',
    sourceUrl: candidate.sourceUrl || '',
    sourceUrlResolution: candidate.sourceUrlResolution || '',
  }

  if (candidate.sourceTrustTier === 'block') {
    rejectedReviews.push({ title: candidate.title, reason: 'blocked source tier', tier: candidate.sourceTrustTier, ...sourceUrlDebug })
    continue
  }

  const hardDuplicate = findHardDuplicate(candidate, acceptedForDupChecks)
  if (hardDuplicate) {
    rejectedReviews.push({ title: candidate.title, reason: 'hard duplicate', tier: candidate.sourceTrustTier, ...sourceUrlDebug })
    continue
  }

  const softDuplicate = findSoftDuplicate(candidate, acceptedForDupChecks, NEWS_RECENT_DUPLICATE_WINDOW_DAYS)
  if (softDuplicate) {
    rejectedReviews.push({
      title: candidate.title,
      reason: `near-duplicate within ${NEWS_RECENT_DUPLICATE_WINDOW_DAYS} days`,
      tier: candidate.sourceTrustTier,
      duplicateOf: softDuplicate.title,
      ...sourceUrlDebug,
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

  const factDiagnostics = editorial?.factDiagnostics || null
  if (factDiagnostics) {
    console.log(
      `Fact layer for "${candidate.title}": ` +
        `grounded=${factDiagnostics.source_grounded ? 'yes' : 'no'}, ` +
        `thin=${factDiagnostics.thin_source_risk || 'n/a'}, ` +
        `write=${factDiagnostics.viable_for_writing ? 'yes' : 'no'}, ` +
        `deepseek=${factDiagnostics.viable_for_deepseek_refinement ? 'yes' : 'no'}`
    )
  }

  if (isPromotionalLikely({ title: candidate.title, sourceName: candidate.sourceName, sourceUrl: candidate.sourceUrl, sourceContext: editorial.sourceContext })) {
    rejectedReviews.push({
      title: candidate.title,
      reason: 'promotional or low-value source page',
      tier: candidate.sourceTrustTier,
      ...sourceUrlDebug,
    })
    continue
  }

  const fallbackQc = buildFallbackQcEnrichment({ candidate, editorial })
  const normalizedFallback = validateQcEnrichment(fallbackQc)
  const enrichment = normalizedFallback.ok ? normalizedFallback.data : null

  if (!enrichment) {
    rejectedReviews.push({
      title: candidate.title,
      reason: normalizedFallback.reason || 'no_safe_enrichment',
      tier: candidate.sourceTrustTier,
      ...sourceUrlDebug,
    })
    continue
  }

  if (candidate.sourceTrustTier === 'unknown') {
    rejectedReviews.push({
      title: candidate.title,
      reason: 'unknown source trust tier',
      tier: candidate.sourceTrustTier,
      ...sourceUrlDebug,
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
    excerpt: editorial.excerpt,
    whyItMatters: editorial.whyItMatters,
    videoSummary: editorial.videoSummary,
    homepageEligible: enrichment.homepage_eligible,
    sourceTrustTier: candidate.sourceTrustTier,
    internalLinkTarget: enrichment.internal_link_target || undefined,
    publishedAt: new Date().toISOString(),
    youtubeUrl: '',
    sourceName: candidate.sourceName,
    rssSourceUrl: candidate.rssSourceUrl,
    sourceUrl: candidate.sourceUrl,
    sourceUrlResolution: candidate.sourceUrlResolution,
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
      factPackage: editorial.factPackage || null,
    },
    youtubeSearchQuery: enrichment.youtube_search_query || '',
  })

  if (youtubeDecision.attached && youtubeDecision.match?.youtubeUrl) {
    doc.youtubeUrl = youtubeDecision.match.youtubeUrl
  }

  const evaluated = evaluateDecision({
    candidate,
    editorial,
    enrichment,
    youtubeDecision,
  })
  const reviewPayload = {
    title: candidate.title,
    mode: editorial.generationMode,
    tier: candidate.sourceTrustTier,
    decision: evaluated.decision,
    storyFormat: evaluated.storyFormat,
    homepageEligible: enrichment.homepage_eligible,
    rssSourceUrl: candidate.rssSourceUrl || '',
    sourceUrl: candidate.sourceUrl || '',
    sourceUrlResolution: candidate.sourceUrlResolution || '',
    concreteFactPresent: evaluated.concreteFactPresent,
    concreteFactExcerpt: evaluated.concreteFactExcerpt,
    visualSupport: evaluated.visualSupport,
    draftReasons: evaluated.draftReasons,
    rejectReasons: evaluated.rejectReasons,
    thinSourceRisk: editorial?.factPackage?.thin_source_risk || '',
    headlineSupported: editorial?.factPackage?.headline_supported ?? null,
    youtubeSearchQuery: enrichment.youtube_search_query || '',
    youtube: {
      attached: youtubeDecision.attached,
      reason: youtubeDecision.reason,
      channel: youtubeDecision.match?.channelTitle || '',
      title: youtubeDecision.match?.videoTitle || '',
    },
    summary: editorial.excerpt,
    whyItMatters: editorial.whyItMatters,
    factPackage: editorial.factPackage || null,
    factDiagnostics: editorial.factDiagnostics || null,
    internalLinkTarget: enrichment.internal_link_target || '',
  }

  console.log(
    `YouTube ${youtubeDecision.attached ? 'attached' : 'skipped'} for "${candidate.title}": ${youtubeDecision.reason}` +
      `${youtubeDecision.match?.channelTitle ? ` | ${youtubeDecision.match.channelTitle}` : ''}` +
      `${youtubeDecision.match?.videoTitle ? ` | ${youtubeDecision.match.videoTitle}` : ''}`
  )

  if (evaluated.decision === 'reject') {
    rejectedReviews.push({
      title: candidate.title,
      reason: evaluated.rejectReasons.join(', '),
      tier: candidate.sourceTrustTier,
      ...sourceUrlDebug,
      review: reviewPayload,
    })
    continue
  }

  if (evaluated.decision === 'draft_only') {
    draftOnlyReviews.push({
      title: candidate.title,
      reason: evaluated.draftReasons.join(', '),
      tier: candidate.sourceTrustTier,
      review: reviewPayload,
    })
    continue
  }

  docs.push(doc)
  acceptedForDupChecks.unshift({
    title: doc.title,
    slug: doc.slug.current,
    sourceUrl: doc.sourceUrl,
    publishedAt: doc.publishedAt,
  })
  acceptedReviews.push(reviewPayload)
}

if (!docs.length) {
  await writePublishReport()
  console.log('Quality-control layer did not auto-publish any candidates. No-op for this cycle.')
  if (draftOnlyReviews.length) {
    console.log(`Draft-only review queue: ${draftOnlyReviews.length}`)
  }
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
