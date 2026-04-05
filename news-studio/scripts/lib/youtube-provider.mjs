import { YOUTUBE_ENV } from './news-publish-config.mjs'
import { extractKeyEntities, normalizeText, normalizeWhitespace, titleSimilarity } from './news-publish-quality.mjs'
import { TRUSTED_YOUTUBE_CHANNEL_MAP, TRUSTED_YOUTUBE_CHANNELS } from './youtube-trusted-channels.mjs'

const publishedAfterIso = (maxAgeDays) => new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString()

const buildFallbackQuery = ({ title = '', youtubeSearchQuery = '' } = {}) => {
  const base = normalizeWhitespace(youtubeSearchQuery || title)
  const entities = [...extractKeyEntities(title)].slice(0, 3)
  return normalizeWhitespace([base, ...entities].join(' '))
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

export const searchYouTubeCandidates = async ({ query }) => {
  if (!YOUTUBE_ENV.apiKey) {
    return { ok: false, reason: 'missing_api_key', items: [] }
  }

  const url = new URL(YOUTUBE_ENV.apiUrl)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', String(YOUTUBE_ENV.maxCandidates))
  url.searchParams.set('order', 'date')
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

export const evaluateYouTubeCandidate = ({ story, query, candidate }) => {
  const channelId = String(candidate?.snippet?.channelId || '').trim()
  const channelTitle = String(candidate?.snippet?.channelTitle || '').trim()
  const videoId = String(candidate?.id?.videoId || '').trim()
  const videoTitle = String(candidate?.snippet?.title || '').trim()
  const publishedAt = String(candidate?.snippet?.publishedAt || '').trim()
  const trustedChannel = TRUSTED_YOUTUBE_CHANNEL_MAP.get(channelId) || null

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
  const storyEntities = [...extractKeyEntities(storyTitle)]
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
  const query = buildFallbackQuery({ title: story?.title, youtubeSearchQuery })
  if (!query) {
    return { attached: false, reason: 'empty_query', query: '', match: null }
  }

  let search = await searchYouTubeCandidates({ query })
  let searchMode = 'api'

  if (!search.ok && YOUTUBE_ENV.enableScrapeFallback) {
    const scrapeSearch = await searchYouTubeCandidatesByScrape({ query })
    if (scrapeSearch.ok) {
      search = scrapeSearch
      searchMode = 'scrape'
    } else {
      return {
        attached: false,
        reason: `${search.reason || 'api_failed'}_and_${scrapeSearch.reason || 'scrape_failed'}`,
        query,
        match: null,
      }
    }
  }

  if (!search.ok) {
    return { attached: false, reason: search.reason, query, match: null }
  }

  for (const item of search.items) {
    const evaluation = evaluateYouTubeCandidate({ story, query, candidate: item })
    if (evaluation.accepted) {
      return { attached: true, reason: `${evaluation.reason}_${searchMode}`, query, match: evaluation }
    }
  }

  const fallbackReason = search.items.length ? 'no_safe_match' : 'no_candidates'
  return { attached: false, reason: `${fallbackReason}_${searchMode}`, query, match: null }
}
