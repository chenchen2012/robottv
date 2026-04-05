import {
  COMPANY_ENTITY_TOKENS,
  HIGH_SIGNAL_PATTERN,
  INTERNAL_LINK_ALLOWLIST,
  LOW_VALUE_DOMAIN_PATTERN,
  NEWS_RECENT_DUPLICATE_WINDOW_DAYS,
  PROMOTIONAL_PATTERN,
  SOURCE_TRUST,
  SOURCE_TRUST_SCORES,
  TAXONOMY,
  TAXONOMY_IDS,
  isValidCategoryId,
  validateInternalLinkTarget,
} from './news-publish-config.mjs'

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'for', 'to', 'of', 'in', 'on', 'with', 'after', 'than', 'into', 'from'])

export const stripHtml = (value) => String(value || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .trim()

export const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim()

export const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

export const normalizeUrl = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '')

export const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 90)

export const titleKey = (value) =>
  normalizeText(value)
    .split(' ')
    .filter((token) => token && !STOPWORDS.has(token))
    .slice(0, 8)
    .join(' ')

export const wordCount = (value) => normalizeWhitespace(value).split(' ').filter(Boolean).length

const hostFromUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return normalizeUrl(raw).split('/')[0].replace(/^www\./, '')
  }
}

export const getSourceTrustTier = ({ sourceName = '', sourceUrl = '', sourceSiteUrl = '' } = {}) => {
  const name = normalizeWhitespace(sourceName)
  const domain = hostFromUrl(sourceUrl) || hostFromUrl(sourceSiteUrl)

  if (SOURCE_TRUST.block.names.has(name) || SOURCE_TRUST.block.domains.has(domain) || LOW_VALUE_DOMAIN_PATTERN.test(domain)) {
    return 'block'
  }
  if (SOURCE_TRUST.allow.names.has(name) || SOURCE_TRUST.allow.domains.has(domain)) {
    return 'allow'
  }
  if (SOURCE_TRUST.caution.names.has(name) || SOURCE_TRUST.caution.domains.has(domain)) {
    return 'caution'
  }
  return 'unknown'
}

export const sourceTrustScore = (value) => SOURCE_TRUST_SCORES[value] ?? SOURCE_TRUST_SCORES.unknown

export const isPromotionalLikely = ({ title = '', sourceName = '', sourceUrl = '', sourceContext = null } = {}) => {
  const normalizedTitle = normalizeText(title)
  const domain = hostFromUrl(sourceUrl)
  const meta = normalizeText(sourceContext?.metaDescription || '')
  const pageTitle = normalizeText(sourceContext?.pageTitle || '')
  const paragraphs = normalizeText((sourceContext?.paragraphs || []).join(' '))

  if (LOW_VALUE_DOMAIN_PATTERN.test(domain)) return true
  if (/register now|tickets|booth|sponsor|webinar|fireside chat/.test(normalizedTitle)) return true
  if (PROMOTIONAL_PATTERN.test(normalizedTitle) && /blog|newsroom|press/.test(domain)) return true
  if (PROMOTIONAL_PATTERN.test(meta) && /contact us|learn more|book a demo/.test(meta)) return true
  if (/our mission|our customers|our platform|our solution/.test(paragraphs) && /excited|proud|leading/.test(paragraphs)) return true
  if (/press release|news release/.test(pageTitle)) return true
  if (/affiliate|sponsored|best robots for/i.test(`${normalizedTitle} ${meta}`)) return true

  return false
}

const comparableTokens = (value) =>
  normalizeText(value)
    .split(' ')
    .filter((token) => token && token.length > 2 && !STOPWORDS.has(token))

export const titleSimilarity = (a, b) => {
  const aTokens = new Set(comparableTokens(a))
  const bTokens = new Set(comparableTokens(b))
  if (!aTokens.size || !bTokens.size) return 0
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length
  const union = new Set([...aTokens, ...bTokens]).size
  return union ? overlap / union : 0
}

export const extractKeyEntities = (title = '') => {
  const originalTokens = String(title || '').match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g) || []
  const normalizedTitle = normalizeText(title)
  const set = new Set(
    originalTokens
      .filter((token) => /[A-Z]/.test(token) || /^\d/.test(token))
      .map((token) => normalizeText(token))
      .filter((token) => token.length > 1)
  )

  COMPANY_ENTITY_TOKENS.forEach((token) => {
    if (normalizedTitle.includes(token)) set.add(token)
  })
  return set
}

export const hasEntityOverlap = (titleA, titleB) => {
  const entitiesA = extractKeyEntities(titleA)
  const entitiesB = extractKeyEntities(titleB)
  if (!entitiesA.size || !entitiesB.size) return false
  for (const token of entitiesA) {
    if (entitiesB.has(token)) return true
  }
  return false
}

export const isSoftDuplicate = (candidate, existing, windowDays = NEWS_RECENT_DUPLICATE_WINDOW_DAYS) => {
  const publishedAt = new Date(existing?.publishedAt || 0).getTime()
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000
  if (!publishedAt || Number.isNaN(publishedAt) || publishedAt < cutoff) return false
  return titleSimilarity(candidate?.title, existing?.title) >= 0.62 && hasEntityOverlap(candidate?.title, existing?.title)
}

export const findHardDuplicate = (candidate, existingPosts = []) => {
  const candidateSourceUrl = normalizeUrl(candidate?.sourceUrl)
  const candidateSlug = String(candidate?.slug || '').trim()
  const candidateTitleKey = titleKey(candidate?.title)

  return existingPosts.find((post) => {
    const postSourceUrl = normalizeUrl(post?.sourceUrl)
    const postSlug = String(post?.slug || '').trim()
    const postTitleKey = titleKey(post?.title)
    return (
      (candidateSourceUrl && postSourceUrl && candidateSourceUrl === postSourceUrl) ||
      (candidateSlug && postSlug && candidateSlug === postSlug) ||
      (candidateTitleKey && postTitleKey && candidateTitleKey === postTitleKey)
    )
  }) || null
}

export const findSoftDuplicate = (candidate, existingPosts = [], windowDays = NEWS_RECENT_DUPLICATE_WINDOW_DAYS) =>
  existingPosts.find((post) => isSoftDuplicate(candidate, post, windowDays)) || null

export const choosePreferredCandidate = (left, right) => {
  const leftTier = sourceTrustScore(left?.sourceTrustTier)
  const rightTier = sourceTrustScore(right?.sourceTrustTier)
  if (leftTier !== rightTier) return leftTier > rightTier ? left : right
  const leftSignal = HIGH_SIGNAL_PATTERN.test(`${left?.title || ''} ${left?.summary || ''}`) ? 1 : 0
  const rightSignal = HIGH_SIGNAL_PATTERN.test(`${right?.title || ''} ${right?.summary || ''}`) ? 1 : 0
  if (leftSignal !== rightSignal) return leftSignal > rightSignal ? left : right
  return left
}

const shortenText = (value, maxChars) => {
  const text = normalizeWhitespace(value)
  if (!text || text.length <= maxChars) return text
  const clipped = text.slice(0, maxChars)
  const breakpoint = clipped.lastIndexOf(' ')
  return `${(breakpoint > 40 ? clipped.slice(0, breakpoint) : clipped).trimEnd()}...`
}

export const inferCategory = ({ title = '', sourceName = '', sourceContext = null } = {}) => {
  const haystack = normalizeText([title, sourceName, sourceContext?.metaDescription || '', sourceContext?.ogDescription || ''].join(' '))
  for (const entry of TAXONOMY) {
    if (entry.keywords.some((keyword) => haystack.includes(keyword))) return entry.id
  }
  return 'category-robotics-startups'
}

export const resolveInternalLinkTarget = ({ title = '', categoryId = '' } = {}) => {
  const text = normalizeText(title)
  if (/(china|ubtech|agibot|unitree|xiaomi)/.test(text)) return 'https://robot.tv/china-humanoid-robots.html'
  if (/(warehouse|fulfillment|logistics|digit|agility)/.test(text)) return 'https://robot.tv/warehouse-humanoid-robots.html'
  if (categoryId === 'category-humanoid-robots') return 'https://robot.tv/humanoid-robots.html'
  if (categoryId === 'category-quadruped-robots' || /(inspection|quadruped|spot|patrol)/.test(text)) {
    return 'https://robot.tv/industrial-inspection-robots.html'
  }
  if (categoryId === 'category-robotics-startups' || /(funding|startup|valuation|raises|capital)/.test(text)) {
    return 'https://robot.tv/robotics-startup-execution.html'
  }
  if (/(physical ai|foundation model|vision|teleop|robot learning)/.test(text)) {
    return 'https://robot.tv/physical-ai-robot-learning.html'
  }
  return ''
}

export const buildFallbackQcEnrichment = ({ candidate, editorial }) => {
  const summarySource = editorial?.excerpt || editorial?.bodyParagraphs?.[0] || candidate?.title || ''
  const whySource = editorial?.bodyParagraphs?.[1] || editorial?.bodyParagraphs?.[0] || summarySource
  const category = inferCategory({ title: candidate?.title, sourceName: candidate?.sourceName, sourceContext: editorial?.sourceContext })
  const homepageEligible =
    candidate?.sourceTrustTier === 'allow' &&
    HIGH_SIGNAL_PATTERN.test(`${candidate?.title || ''} ${summarySource}`) &&
    (category === 'category-humanoid-robots' || category === 'category-robotics-startups')
  const internalLinkTarget = resolveInternalLinkTarget({ title: candidate?.title, categoryId: category })

  return {
    summary: shortenText(summarySource, 220),
    why_it_matters: shortenText(whySource, 180),
    category,
    homepage_eligible: Boolean(homepageEligible),
    reject: false,
    reject_reason: '',
    internal_link_target: validateInternalLinkTarget(internalLinkTarget) ? internalLinkTarget : '',
    youtube_search_query: normalizeWhitespace(`${candidate?.title || ''} ${candidate?.sourceName || ''} robotics`),
  }
}

export const validateQcEnrichment = (value) => {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'missing_enrichment', data: null }

  const normalized = {
    summary: shortenText(value.summary || '', 220),
    why_it_matters: shortenText(value.why_it_matters || '', 180),
    category: String(value.category || '').trim(),
    homepage_eligible: Boolean(value.homepage_eligible),
    reject: Boolean(value.reject),
    reject_reason: normalizeWhitespace(value.reject_reason || ''),
    internal_link_target: normalizeWhitespace(value.internal_link_target || ''),
    youtube_search_query: shortenText(value.youtube_search_query || '', 140),
  }

  if (normalized.summary.length < 90 || wordCount(normalized.summary) < 12) {
    return { ok: false, reason: 'invalid_summary', data: null }
  }
  if (normalized.why_it_matters.length < 50 || wordCount(normalized.why_it_matters) < 8) {
    return { ok: false, reason: 'invalid_why_it_matters', data: null }
  }
  if (!isValidCategoryId(normalized.category)) {
    return { ok: false, reason: 'invalid_category', data: null }
  }
  if (!validateInternalLinkTarget(normalized.internal_link_target)) {
    return { ok: false, reason: 'invalid_internal_link_target', data: null }
  }

  return { ok: true, reason: '', data: normalized }
}

export const rankCandidate = (candidate) => {
  const trust = sourceTrustScore(candidate?.sourceTrustTier) * 10
  const signal = HIGH_SIGNAL_PATTERN.test(candidate?.title || '') ? 3 : 0
  const entities = COMPANY_ENTITY_TOKENS.some((token) => normalizeText(candidate?.title || '').includes(token)) ? 2 : 0
  return trust + signal + entities
}

export const buildQcPrompt = ({ candidate, editorial }) => {
  const allowedCategories = TAXONOMY.map((entry) => `${entry.id}: ${entry.title}`).join('; ')
  const allowedLinks = [...INTERNAL_LINK_ALLOWLIST].join('; ')
  return [
    'Review this robotics news candidate for robot.tv auto-publish.',
    'Return strict JSON only.',
    'Do not invent facts.',
    'Use only the supplied source context.',
    'Reject obvious promotional rewrites, thin PR-style copy, low-value marketing posts, and suspicious sources.',
    'homepage_eligible should be true only when the item has clear homepage value.',
    `Allowed categories: ${allowedCategories}`,
    `Allowed internal link targets: ${allowedLinks}`,
    `Title: ${candidate?.title || 'n/a'}`,
    `Source: ${candidate?.sourceName || 'n/a'}`,
    `Source URL: ${candidate?.sourceUrl || 'n/a'}`,
    `Source tier: ${candidate?.sourceTrustTier || 'unknown'}`,
    `Published at: ${candidate?.sourcePublishedAt || 'n/a'}`,
    `Source page title: ${editorial?.sourceContext?.pageTitle || 'n/a'}`,
    `Source meta description: ${editorial?.sourceContext?.metaDescription || 'n/a'}`,
    `Source og description: ${editorial?.sourceContext?.ogDescription || 'n/a'}`,
    `Extracted source paragraphs: ${(editorial?.sourceContext?.paragraphs || []).join(' || ') || 'n/a'}`,
    `Fallback summary: ${editorial?.excerpt || 'n/a'}`,
    `Fallback why it matters: ${editorial?.bodyParagraphs?.[1] || editorial?.bodyParagraphs?.[0] || 'n/a'}`,
    '',
    'Return this JSON shape only:',
    '{',
    '  "summary": "string",',
    '  "why_it_matters": "string",',
    '  "category": "category-id",',
    '  "homepage_eligible": true,',
    '  "reject": false,',
    '  "reject_reason": "",',
    '  "internal_link_target": "",',
    '  "youtube_search_query": ""',
    '}',
  ].join('\n')
}

