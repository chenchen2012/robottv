import { YOUTUBE_ENV } from './news-publish-config.mjs'
import { extractKeyEntities, normalizeText, normalizeWhitespace, titleSimilarity } from './news-publish-quality.mjs'
import { TRUSTED_YOUTUBE_CHANNEL_MAP, TRUSTED_YOUTUBE_CHANNELS } from './youtube-trusted-channels.mjs'

const publishedAfterIso = (maxAgeDays) => new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString()
const QUERY_STOPWORDS = new Set(['the', 'a', 'an', 'and', 'for', 'to', 'of', 'in', 'on', 'with', 'after', 'than', 'latest'])

const clipQuery = (value = '', maxWords = 12) =>
  normalizeWhitespace(value)
    .split(' ')
    .filter(Boolean)
    .slice(0, maxWords)
    .join(' ')

const comparableQueryTokens = (value = '') =>
  normalizeText(value)
    .split(' ')
    .filter((token) => token && token.length > 2 && !QUERY_STOPWORDS.has(token))

const uniqueQueryPhrases = (values = []) => {
  const seen = new Set()
  const unique = []
  for (const value of values) {
    const phrase = clipQuery(value)
    if (!phrase) continue
    const key = comparableQueryTokens(phrase).join(' ')
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(phrase)
  }
  return unique
}

const hasRoboticsHint = (value = '') => /\b(robot|robotics|humanoid|automation|factory|warehouse|vision|quadruped)\b/i.test(value)

export const buildYouTubeQueryVariants = ({ story = {}, youtubeSearchQuery = '' }) => {
  const title = normalizeWhitespace(story?.title || '')
  const sourceName = normalizeWhitespace(story?.sourceName || '')
  const factPackage = story?.factPackage || {}
  const actor = normalizeWhitespace(factPackage?.main_actor || '')
  const action = normalizeWhitespace(factPackage?.main_action || '')
  const object = normalizeWhitespace(factPackage?.main_object || '')
  const concreteFact = normalizeWhitespace(factPackage?.best_concrete_fact || '')
  const titleEntities = [...extractKeyEntities(title)].slice(0, 3)
  const objectEntities = [...extractKeyEntities([object, concreteFact].filter(Boolean).join(' '))].slice(0, 3)

  const factFocused = normalizeWhitespace(
    [actor, object || objectEntities.join(' '), hasRoboticsHint(`${actor} ${object}`) ? '' : 'robotics'].filter(Boolean).join(' ')
  )
  const actionFocused = normalizeWhitespace(
    [actor, action, objectEntities.slice(0, 2).join(' ') || titleEntities.slice(0, 2).join(' '), 'robotics']
      .filter(Boolean)
      .join(' ')
  )
  const concreteFocused = normalizeWhitespace(
    [actor, clipQuery(concreteFact, 8), hasRoboticsHint(concreteFact) ? '' : 'robotics'].filter(Boolean).join(' ')
  )
  const titleFallback = normalizeWhitespace([youtubeSearchQuery || title, ...titleEntities, sourceName && sourceName !== actor ? sourceName : ''].join(' '))

  return uniqueQueryPhrases([
    youtubeSearchQuery,
    factFocused,
    actionFocused,
    concreteFocused,
    titleFallback,
    title,
  ]).slice(0, 3)
}

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`youtube_http_${response.status}`)
  }
  return response.json()
}

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    },
  })
  if (!response.ok) {
    throw new Error(`youtube_html_${response.status}`)
  }
  return response.text()
}

export const searchYouTubeCandidates = async ({ query, order = 'date', maxResults = YOUTUBE_ENV.maxCandidates }) => {
  if (!YOUTUBE_ENV.apiKey) {
    return { ok: false, reason: 'missing_api_key', items: [] }
  }

  const url = new URL(YOUTUBE_ENV.apiUrl)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('order', order)
  url.searchParams.set('q', query)
  url.searchParams.set('key', YOUTUBE_ENV.apiKey)
  url.searchParams.set('publishedAfter', publishedAfterIso(YOUTUBE_ENV.maxVideoAgeDays))
  url.searchParams.set('safeSearch', 'strict')

  try {
    const payload = await fetchJson(url.toString())
    return { ok: true, reason: '', items: Array.isArray(payload?.items) ? payload.items : [] }
  } catch (error) {
    return { ok: false, reason: error?.message || 'provider_failed', items: [] }
  }
}

const parsePublishedTextToIso = (value) => {
  const text = normalizeWhitespace(value)
  if (!text) return ''
  const match = text.match(/(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago/i)
  if (!match) return ''
  const amount = Number(match[1] || 0)
  const unit = String(match[2] || '').toLowerCase()
  if (!amount || !unit) return ''

  const multipliers = {
    minute: 60 * 1000,
    minutes: 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000,
  }
  const delta = multipliers[unit]
  return delta ? new Date(Date.now() - amount * delta).toISOString() : ''
}

const flattenRuns = (value) =>
  Array.isArray(value?.runs)
    ? value.runs.map((run) => normalizeWhitespace(run?.text || '')).filter(Boolean).join(' ')
    : normalizeWhitespace(value?.simpleText || '')

const findTrustedChannelByTitle = (channelTitle) => {
  const normalized = normalizeText(channelTitle)
  if (!normalized) return null
  return (
    TRUSTED_YOUTUBE_CHANNELS.find((entry) =>
      [entry.displayName, ...(Array.isArray(entry.aliases) ? entry.aliases : []), entry.handle]
        .filter(Boolean)
        .some((alias) => normalizeText(alias) === normalized)
    ) || null
  )
}

export const searchYouTubeCandidatesByScrape = async ({ query }) => {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
  try {
    const html = await fetchText(url)
    const initialDataMatch =
      html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/) ||
      html.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});/)

    if (!initialDataMatch) {
      return { ok: false, reason: 'scrape_missing_initial_data', items: [] }
    }

    let data
    try {
      data = JSON.parse(initialDataMatch[1])
    } catch {
      return { ok: false, reason: 'scrape_invalid_initial_data', items: [] }
    }

    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
    const items = []

    for (const section of sections) {
      const contents = section?.itemSectionRenderer?.contents || []
      for (const item of contents) {
        const video = item?.videoRenderer
        if (!video?.videoId) continue
        const channelTitle = flattenRuns(video.ownerText)
        const trustedChannel = findTrustedChannelByTitle(channelTitle)
        const channelId =
          trustedChannel?.channelId ||
          String(video?.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '').trim()
        const title = flattenRuns(video.title)
        const publishedAt = parsePublishedTextToIso(flattenRuns(video.publishedTimeText))
        items.push({
          id: { videoId: String(video.videoId || '').trim() },
          snippet: {
            channelId,
            channelTitle,
            title,
            publishedAt,
          },
        })
        if (items.length >= YOUTUBE_ENV.maxCandidates) {
          return { ok: true, reason: 'scrape_fallback', items }
        }
      }
    }

    return { ok: true, reason: 'scrape_fallback', items }
  } catch (error) {
    return { ok: false, reason: error?.message || 'scrape_failed', items: [] }
  }
}

const countEntityHits = (storyEntities, videoTitle) => {
  const normalizedTitle = normalizeText(videoTitle)
  return storyEntities.filter((entity) => normalizedTitle.includes(entity)).length
}

const hasConflictingEntity = (storyEntities, videoTitle) => {
  const normalizedTitle = normalizeText(videoTitle)
  const matched = storyEntities.filter((entity) => normalizedTitle.includes(entity))
  if (!matched.length) return false
  const importantEntities = [
    'tesla',
    'figure',
    'unitree',
    'ubtech',
    'agibot',
    'digit',
    'apollo',
    'picknik',
    'realsense',
    'intel',
    'sanctuary ai',
  ]
  return importantEntities.some((entity) => normalizedTitle.includes(entity) && !storyEntities.includes(entity))
}

const buildStoryEntities = ({ story = {}, query = '' }) => {
  const factPackage = story?.factPackage || {}
  return [
    ...new Set([
      ...extractKeyEntities(story?.title || ''),
      ...extractKeyEntities([factPackage?.main_actor, factPackage?.main_object, factPackage?.best_concrete_fact].filter(Boolean).join(' ')),
      ...extractKeyEntities(query),
    ]),
  ]
}

const acceptedCandidateScore = ({ evaluation, queryIndex = 0, searchOrder = 'relevance' }) => {
  const publishedMs = new Date(evaluation?.publishedAt || 0).getTime()
  const ageDays = publishedMs && !Number.isNaN(publishedMs) ? Math.max(0, (Date.now() - publishedMs) / (24 * 60 * 60 * 1000)) : 365
  const freshnessBonus = Math.max(0, 18 - ageDays)
  const overlapScore = Number(evaluation?.overlap || 0) * 100
  const entityScore = Number(evaluation?.entityHits || 0) * 22
  const queryBonus = Math.max(0, 8 - queryIndex * 3)
  const searchModeBonus = searchOrder === 'relevance' ? 6 : 0
  return overlapScore + entityScore + freshnessBonus + queryBonus + searchModeBonus
}

export const evaluateYouTubeCandidate = ({ story, query, candidate }) => {
  const channelId = String(candidate?.snippet?.channelId || '').trim()
  const channelTitle = String(candidate?.snippet?.channelTitle || '').trim()
  const videoId = String(candidate?.id?.videoId || '').trim()
  const videoTitle = String(candidate?.snippet?.title || '').trim()
  const publishedAt = String(candidate?.snippet?.publishedAt || '').trim()
  const trustedChannel = TRUSTED_YOUTUBE_CHANNEL_MAP.get(channelId) || findTrustedChannelByTitle(channelTitle) || null

  if (!videoId || !videoTitle) {
    return { accepted: false, reason: 'missing_video_fields' }
  }
  if (YOUTUBE_ENV.requireTrustedChannel && !trustedChannel) {
    return { accepted: false, reason: 'untrusted_channel', channelId, channelTitle, videoTitle }
  }

  const publishedMs = new Date(publishedAt || 0).getTime()
  const maxAgeMs = YOUTUBE_ENV.maxVideoAgeDays * 24 * 60 * 60 * 1000
  if (!publishedMs || Number.isNaN(publishedMs) || Date.now() - publishedMs > maxAgeMs) {
    return { accepted: false, reason: 'stale_video', channelId, channelTitle, videoTitle }
  }

  const storyTitle = String(story?.title || '')
  const storyEntities = buildStoryEntities({ story, query })
  const overlap = Math.max(titleSimilarity(storyTitle, videoTitle), titleSimilarity(query, videoTitle))
  const entityHits = countEntityHits(storyEntities, videoTitle)

  if (storyEntities.length > 0 && entityHits === 0) {
    return { accepted: false, reason: 'missing_key_entity', channelId, channelTitle, videoTitle, overlap, entityHits }
  }
  if (hasConflictingEntity(storyEntities, videoTitle)) {
    return { accepted: false, reason: 'ambiguous_conflicting_entity', channelId, channelTitle, videoTitle, overlap, entityHits }
  }
  if (overlap < 0.34) {
    return { accepted: false, reason: 'weak_topic_overlap', channelId, channelTitle, videoTitle, overlap, entityHits }
  }

  return {
    accepted: true,
    reason: 'trusted_recent_entity_match',
    channelId,
    channelTitle: trustedChannel?.displayName || channelTitle,
    videoId,
    videoTitle,
    publishedAt,
    overlap,
    entityHits,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
  }
}

export const matchYouTubeVideo = async ({ story, youtubeSearchQuery = '' }) => {
  const queries = buildYouTubeQueryVariants({ story, youtubeSearchQuery })
  if (!queries.length) {
    return { attached: false, reason: 'empty_query', query: '', attemptedQueries: [], match: null }
  }

  const attempts = []
  const acceptedMatches = []

  const runSearchAttempt = async ({ query, queryIndex, order, maxResults }) => {
    let search = await searchYouTubeCandidates({ query, order, maxResults })
    let searchMode = 'api'
    if (!search.ok && YOUTUBE_ENV.enableScrapeFallback) {
      const scrapeSearch = await searchYouTubeCandidatesByScrape({ query })
      if (scrapeSearch.ok) {
        search = scrapeSearch
        searchMode = 'scrape'
      } else {
        attempts.push({
          query,
          order,
          mode: 'error',
          reason: `${search.reason || 'api_failed'}_and_${scrapeSearch.reason || 'scrape_failed'}`,
        })
        return
      }
    }

    if (!search.ok) {
      attempts.push({ query, order, mode: 'error', reason: search.reason || 'provider_failed' })
      return
    }

    let acceptedCount = 0
    for (const item of search.items) {
      const evaluation = evaluateYouTubeCandidate({ story, query, candidate: item })
      if (!evaluation.accepted) continue
      acceptedCount += 1
      acceptedMatches.push({
        ...evaluation,
        query,
        queryIndex,
        searchMode,
        searchOrder: order,
        score: acceptedCandidateScore({ evaluation, queryIndex, searchOrder: order }),
      })
    }

    attempts.push({
      query,
      order,
      mode: searchMode,
      reason: acceptedCount ? 'accepted_candidates_found' : search.items.length ? 'no_safe_match' : 'no_candidates',
      candidateCount: search.items.length,
      acceptedCount,
    })
  }

  for (const [queryIndex, query] of queries.entries()) {
    await runSearchAttempt({
      query,
      queryIndex,
      order: 'relevance',
      maxResults: Math.max(YOUTUBE_ENV.maxCandidates, 8),
    })
    if (acceptedMatches.length) break
  }

  if (!acceptedMatches.length && queries[0]) {
    await runSearchAttempt({
      query: queries[0],
      queryIndex: 0,
      order: 'date',
      maxResults: Math.max(YOUTUBE_ENV.maxCandidates, 6),
    })
  }

  if (acceptedMatches.length) {
    acceptedMatches.sort((left, right) => right.score - left.score)
    const best = acceptedMatches[0]
    return {
      attached: true,
      reason: `${best.reason}_${best.searchMode}_${best.searchOrder}`,
      query: best.query,
      attemptedQueries: attempts,
      match: best,
    }
  }

  const lastAttempt = attempts[attempts.length - 1] || null
  return {
    attached: false,
    reason: lastAttempt ? `${lastAttempt.reason}_${lastAttempt.mode}_${lastAttempt.order}` : 'no_candidates',
    query: queries[0] || '',
    attemptedQueries: attempts,
    match: null,
  }
}
