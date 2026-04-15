import {
  COMPANY_ENTITY_TOKENS,
  HIGH_SIGNAL_PATTERN,
  INTERNAL_LINK_ALLOWLIST,
  LOW_VALUE_DOMAIN_PATTERN,
  NEWS_MIN_AUDIENCE_RELEVANCE,
  NEWS_MIN_INFORMATIONAL_DENSITY,
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
const IMPLICATION_FIRST_PATTERNS = [
  /^that matters because\b/i,
  /^the next thing to watch\b/i,
  /^this (signals|suggests|reflects|shows|highlights|points to)\b/i,
  /^operators? and investors? are looking for\b/i,
  /^the market is shifting\b/i,
]
const ABSTRACT_SIGNAL_PATTERNS = [
  /\bthat matters because\b/i,
  /\bthe next thing to watch\b/i,
  /\bframing the update as a signal for\b/i,
  /\bthis (signals|suggests|reflects|shows|highlights|points to)\b/i,
  /\bmarket momentum\b/i,
  /\bdeployment signal\b/i,
  /\brobotics commercialization\b/i,
  /\bclearer competitive position\b/i,
  /\bdurable deployment signals\b/i,
]
const TEMPLATED_EDITORIAL_PATTERNS = [
  /\bthat matters because\b/i,
  /\bthe next thing to watch\b/i,
  /\bis now tying\b/i,
  /\bpoints to a concrete development\b/i,
  /\bsignals a shift\b/i,
  /\bmore useful than generic momentum language\b/i,
  /\bmore useful than another broad robotics claim\b/i,
  /\bthe useful signal is\b/i,
  /\bthe practical question is\b/i,
  /\bthe real signal is\b/i,
]
const STRATEGY_ONLY_TITLE_PATTERNS = [
  /\bstrategy\b/i,
  /\bplan\b/i,
  /\bvision\b/i,
  /\bfuture of\b/i,
  /\binsights?\b/i,
  /\btrends?\b/i,
  /\bhow .* changing\b/i,
]
const SPECIFIC_PRODUCT_PATTERNS =
  /\b(robot|robots|humanoid|quadruped|drone|uav|ugv|cobot|arm|hand|gripper|vision system|camera|sensor|platform|model|software|fleet|inspection system|delivery bot)\b/i
const DEPLOYMENT_VALUE_PATTERNS =
  /\b(deploy(?:ed|ment|ments)?|pilot|customer|contract|order|fleet|site|factory|plant|warehouse|hospital|port|mine|ship|inspection|maintenance|picking|packing|surgery|delivery|manufacturing|uptime|throughput|labor|cost|risk|safety|roi|valuation|funding|raised?|acquired?|partner(?:ed|ship)?|rolls? out|commercial)\b/i
const HARD_PROOF_PATTERNS =
  /\b(deployed?|customer|contract|order|fleet|site|factory|plant|warehouse|hospital|port|mine|ship|inspection|maintenance|surgery|delivery|valuation|funding|raised?|acquired?|rolls? out)\b/i
const AUDIENCE_RELEVANCE_PATTERNS = {
  consumer: /\b(home|consumer|household|retail|personal|cleaning|lawn|delivery|companion)\b/i,
  investor: /\b(funding|raised?|valuation|revenue|orders?|backlog|market|commercial|contract|customer|margin|capex|roi)\b/i,
  operator: /\b(factory|plant|warehouse|hospital|site|fleet|inspection|maintenance|manufacturing|workflow|uptime|throughput|safety|labor|deployment)\b/i,
}
const EXPLICIT_VISUAL_EVIDENCE_PATTERNS =
  /\b(video|watch|demo|demonstration|footage|clip|showcase|shown|shows)\b/i
const VISUAL_STANDOUT_PATTERNS =
  /\b(video|watch|demo|demonstration|footage|clip|showcase|shown|shows|humanoid|quadruped|robot dog|drone|delivery bot|robot hand|gripper)\b/i
const HEADLINE_OVERPROMISE_PATTERNS = /\b(world['’]s first|revolutionary|game[- ]changing|breakthrough|guarantees?)\b/i
const VISUAL_STORY_FORMATS = new Set(['featured_candidate'])

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

export const isValidSourceUrl = (value) => {
  const text = String(value || '').trim()
  if (!text) return false
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

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

const firstSentence = (value = '') => normalizeWhitespace(String(value || '').split(/(?<=[.!?])\s+/)[0] || '')

export const titleSimilarity = (a, b) => {
  const aTokens = new Set(comparableTokens(a))
  const bTokens = new Set(comparableTokens(b))
  if (!aTokens.size || !bTokens.size) return 0
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length
  const union = new Set([...aTokens, ...bTokens]).size
  return union ? overlap / union : 0
}

export const paragraphAdvancesSummary = ({ summary = '', paragraph = '' } = {}) => {
  const summaryLead = firstSentence(summary)
  const paragraphLead = firstSentence(paragraph)
  if (!summaryLead || !paragraphLead) return true

  const normalizedSummaryLead = normalizeText(summaryLead)
  const normalizedParagraphLead = normalizeText(paragraphLead)
  if (!normalizedSummaryLead || !normalizedParagraphLead) return true
  if (normalizedSummaryLead === normalizedParagraphLead) return false

  const summaryTokens = new Set(comparableTokens(summaryLead))
  const paragraphTokens = new Set(comparableTokens(paragraphLead))
  if (!summaryTokens.size || !paragraphTokens.size) return true

  const sharedTokens = [...summaryTokens].filter((token) => paragraphTokens.has(token)).length
  const minSize = Math.min(summaryTokens.size, paragraphTokens.size)
  if (sharedTokens >= Math.max(3, minSize - 1) && titleSimilarity(summaryLead, paragraphLead) >= 0.72) {
    return false
  }

  return true
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

export const hasConcreteFact = (value = '', { title = '' } = {}) => {
  const text = normalizeWhitespace(value)
  if (!text) return false
  const normalized = normalizeText(text)
  const storyEntities = [...extractKeyEntities(title)].filter(Boolean)
  const concreteNumberPattern =
    /\b(\$[\d,.]+(?:\s?(?:m|b|million|billion))?|\d[\d,.]*(?:\s?(?:%|percent|million|billion|thousand|robots?|units?|days?|hours?|years?|customers?|factories?|warehouses?|sites?|ships?))?|version\s+\d+(?:\.\d+)?|v\d+(?:\.\d+)?)\b/i
  const concreteEventPattern =
    /\b(raised?|raises|acquires?|acquired|acquisition|partners?|partnered|deal|contract|deploy(?:ed|ment|ments)?|pilot|production|rolls? out|launched?|released?|introduced?|announced?|unveiled?|debuts?|sign(?:ed|s)?|opened?|proof[- ]of[- ]concept|poc|valuation|orders?|milestone|expand(?:s|ed|ing)?|offers?)\b/i
  if (concreteNumberPattern.test(text)) return true
  if (storyEntities.some((entity) => entity && normalized.includes(entity)) && concreteEventPattern.test(text)) return true
  return false
}

export const extractConcreteFactExcerpt = (value = '', options = {}) => {
  const text = normalizeWhitespace(value)
  if (!text) return ''
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean)
  const concreteSentence = sentences.find((sentence) => hasConcreteFact(sentence, options))
  return concreteSentence || ''
}

export const extractMainNumberOrScale = (value = '') => {
  const text = normalizeWhitespace(value)
  if (!text) return ''
  const match = text.match(
    /\b(\$[\d,.]+(?:\s?(?:m|b|million|billion))?|\d[\d,.]*(?:\s?(?:%|percent|million|billion|thousand|robots?|units?|days?|hours?|years?|customers?|factories?|warehouses?|sites?|ships?))?|version\s+\d+(?:\.\d+)?|v\d+(?:\.\d+)?)\b/i
  )
  return normalizeWhitespace(match?.[1] || '')
}

export const factLooksLikeHeadlineEcho = ({ fact = '', title = '' } = {}) => {
  const normalizedFact = normalizeText(fact)
  const normalizedTitle = normalizeText(title)
  if (!normalizedFact || !normalizedTitle) return false
  if (normalizedFact === normalizedTitle) return true
  const similarity = titleSimilarity(fact, title)
  const factTokens = comparableTokens(fact)
  const titleTokens = comparableTokens(title)
  return similarity >= 0.9 && Math.abs(factTokens.length - titleTokens.length) <= 2
}

export const looksMalformedEditorialText = ({ text = '', title = '', sourceName = '' } = {}) => {
  const normalizedText = normalizeWhitespace(text)
  if (!normalizedText) return true

  if (/\bthis matter\.\.\.$/i.test(normalizedText)) return true
  if (/[.?!]\.\.\.$/.test(normalizedText)) return true

  const source = normalizeWhitespace(sourceName)
  if (source) {
    const sourceSuffixPattern = new RegExp(`\\s-\\s${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    if (sourceSuffixPattern.test(normalizedText)) return true
  }

  if (factLooksLikeHeadlineEcho({ fact: normalizedText, title })) return true
  if (titleSimilarity(normalizedText, title) >= 0.92 && normalizedText.length <= normalizeWhitespace(title).length + 36) return true

  return false
}

export const paragraphAnchoredToFactPackage = ({ paragraph = '', factPackage = {}, title = '' } = {}) => {
  const text = normalizeWhitespace(paragraph)
  if (!text) return false
  const normalized = normalizeText(text)
  const anchors = [
    factPackage?.main_actor || '',
    factPackage?.main_object || '',
    factPackage?.main_number_or_scale || '',
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)

  if (anchors.some((anchor) => normalized.includes(anchor))) return true
  if (factPackage?.secondary_fact && titleSimilarity(text, factPackage.secondary_fact) >= 0.16) return true
  if (factPackage?.best_concrete_fact && titleSimilarity(text, factPackage.best_concrete_fact) >= 0.16) return true
  return hasConcreteFact(text, { title })
}

export const leadStartsWithImplication = (value = '') => {
  const text = normalizeWhitespace(value)
  if (!text) return false
  return IMPLICATION_FIRST_PATTERNS.some((pattern) => pattern.test(text))
}

export const validateFactPackage = (value, { title = '' } = {}) => {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'missing_fact_package', data: null }

  const thinSourceRisk = String(value.thin_source_risk || '').trim().toLowerCase()
  const storyFormatRecommendation = String(value.story_format_recommendation || '').trim()
  const normalized = {
    main_actor: normalizeWhitespace(value.main_actor || ''),
    main_action: normalizeWhitespace(value.main_action || ''),
    main_object: normalizeWhitespace(value.main_object || ''),
    main_number_or_scale: normalizeWhitespace(value.main_number_or_scale || ''),
    best_concrete_fact: shortenText(value.best_concrete_fact || '', 220),
    secondary_fact: shortenText(value.secondary_fact || '', 220),
    source_grounded: Boolean(value.source_grounded),
    thin_source_risk: ['low', 'medium', 'high'].includes(thinSourceRisk) ? thinSourceRisk : 'high',
    headline_supported: Boolean(value.headline_supported),
    story_format_recommendation: ['signal_brief', 'featured_candidate', 'draft_only'].includes(storyFormatRecommendation)
      ? storyFormatRecommendation
      : 'draft_only',
  }

  if (!normalized.best_concrete_fact || !hasConcreteFact(normalized.best_concrete_fact, { title })) {
    return { ok: false, reason: 'invalid_best_concrete_fact', data: null }
  }
  if (SPECIFIC_PRODUCT_PATTERNS.test(title) && !SPECIFIC_PRODUCT_PATTERNS.test(normalized.best_concrete_fact)) {
    return { ok: false, reason: 'best_concrete_fact_topic_mismatch', data: null }
  }
  if (!normalized.source_grounded && factLooksLikeHeadlineEcho({ fact: normalized.best_concrete_fact, title })) {
    return { ok: false, reason: 'headline_echo_best_concrete_fact', data: null }
  }

  if (normalized.secondary_fact && !hasConcreteFact(normalized.secondary_fact, { title })) {
    normalized.secondary_fact = ''
  }

  if (normalized.main_number_or_scale && !extractMainNumberOrScale(normalized.main_number_or_scale)) {
    normalized.main_number_or_scale = ''
  }

  return { ok: true, reason: '', data: normalized }
}

export const headlineSupportedByBody = ({ title = '', summary = '', bodyParagraphs = [] } = {}) => {
  const supportingText = normalizeWhitespace([summary, ...(Array.isArray(bodyParagraphs) ? bodyParagraphs : [])].join(' '))
  if (!supportingText) return false
  const titleScore = titleSimilarity(title, supportingText)
  const titleEntities = [...extractKeyEntities(title)]
  const normalizedBody = normalizeText(supportingText)
  const entityHits = titleEntities.filter((entity) => normalizedBody.includes(entity)).length
  const titleTokens = comparableTokens(title)
  const bodyTokens = new Set(comparableTokens(supportingText))
  const tokenOverlap = titleTokens.filter((token) => bodyTokens.has(token)).length
  if (HEADLINE_OVERPROMISE_PATTERNS.test(title) && !HEADLINE_OVERPROMISE_PATTERNS.test(supportingText)) return false
  return titleScore >= 0.18 || entityHits > 0 || tokenOverlap >= 2
}

export const countAbstractSignals = (value = '') =>
  ABSTRACT_SIGNAL_PATTERNS.reduce((count, pattern) => count + (pattern.test(value) ? 1 : 0), 0)

export const abstractnessScore = ({ summary = '', whyItMatters = '', bodyParagraphs = [] } = {}) => {
  const lead = normalizeWhitespace(summary || bodyParagraphs?.[0] || '')
  const second = normalizeWhitespace(whyItMatters || bodyParagraphs?.[1] || '')
  const allText = normalizeWhitespace([summary, whyItMatters, ...(Array.isArray(bodyParagraphs) ? bodyParagraphs : [])].join(' '))
  let score = 1

  if (leadStartsWithImplication(lead) && !hasConcreteFact(lead)) score += 2
  if (!hasConcreteFact(lead) && countAbstractSignals(lead) > 0) score += 1
  if (lead && second && !hasConcreteFact(lead) && leadStartsWithImplication(second)) score += 1
  if (countAbstractSignals(allText) >= 3) score += 1

  return Math.min(5, Math.max(1, score))
}

export const repetitionScore = ({ summary = '', whyItMatters = '', bodyParagraphs = [] } = {}) => {
  const samples = [summary, whyItMatters, ...(Array.isArray(bodyParagraphs) ? bodyParagraphs : [])]
    .map((value) => normalizeText(value))
    .filter(Boolean)
  if (!samples.length) return 5
  const repetitiveTokens = ['signals', 'suggests', 'reflects', 'matters because', 'next thing to watch', 'momentum']
  const repeated = repetitiveTokens.reduce(
    (count, token) => count + samples.filter((sample) => sample.includes(token)).length,
    0
  )
  return Math.min(5, Math.max(1, 1 + Math.floor(repeated / 2)))
}

export const editorialNaturalnessScore = ({ summary = '', whyItMatters = '', bodyParagraphs = [] } = {}) => {
  const lead = normalizeWhitespace(summary || '')
  const paragraphs = Array.isArray(bodyParagraphs) ? bodyParagraphs.map((value) => normalizeWhitespace(value)).filter(Boolean) : []
  const second = normalizeWhitespace(whyItMatters || paragraphs[1] || '')
  const allText = [lead, second, ...paragraphs].filter(Boolean)
  if (!allText.length) return 1

  let score = 5
  const templatedHits = TEMPLATED_EDITORIAL_PATTERNS.reduce(
    (count, pattern) => count + allText.filter((sample) => pattern.test(sample)).length,
    0
  )
  const implicationLedSamples = allText.filter((sample) => leadStartsWithImplication(sample)).length
  const repeatedLead = lead && paragraphs[0] && !paragraphAdvancesSummary({ summary: lead, paragraph: paragraphs[0] })
  const genericSecond = second && !hasConcreteFact(second) && countAbstractSignals(second) > 0

  if (templatedHits >= 1) score -= 1
  if (templatedHits >= 3) score -= 1
  if (implicationLedSamples >= 2) score -= 1
  if (repeatedLead) score -= 1
  if (genericSecond) score -= 1

  return Math.max(1, Math.min(5, score))
}

export const informationalDensityScore = ({ title = '', summary = '', whyItMatters = '', bodyParagraphs = [], factPackage = null } = {}) => {
  const paragraphs = Array.isArray(bodyParagraphs) ? bodyParagraphs.map((value) => normalizeWhitespace(value)).filter(Boolean) : []
  const allText = [summary, whyItMatters, ...paragraphs].map((value) => normalizeWhitespace(value)).filter(Boolean)
  if (!allText.length) return 1

  const combined = allText.join(' ')
  const sentences = combined
    .split(/(?<=[.!?])\s+/)
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean)
  const concreteFactSentences = sentences.filter(
    (sentence) => hasConcreteFact(sentence, { title }) && (extractMainNumberOrScale(sentence) || HARD_PROOF_PATTERNS.test(sentence))
  ).length
  const storyEntities = new Set([
    ...extractKeyEntities(title),
    ...extractKeyEntities([factPackage?.main_actor, factPackage?.main_object].filter(Boolean).join(' ')),
  ])
  const normalizedCombined = normalizeText(combined)
  const entityHits = [...storyEntities].filter((entity) => entity && normalizedCombined.includes(entity)).length
  const operationalHits = (combined.match(new RegExp(DEPLOYMENT_VALUE_PATTERNS.source, 'gi')) || []).length
  const productHits = (combined.match(new RegExp(SPECIFIC_PRODUCT_PATTERNS.source, 'gi')) || []).length
  const hardProofHits = (combined.match(new RegExp(HARD_PROOF_PATTERNS.source, 'gi')) || []).length

  let score = 1
  if (concreteFactSentences >= 1) score += 1
  if (concreteFactSentences >= 2) score += 1
  if (entityHits >= 2) score += 1
  if (hardProofHits >= 1 || (productHits >= 2 && hardProofHits >= 1)) score += 1
  if (!extractMainNumberOrScale(combined) && hardProofHits === 0) score -= 1
  if (STRATEGY_ONLY_TITLE_PATTERNS.some((pattern) => pattern.test(title)) && concreteFactSentences < 2 && operationalHits < 2) {
    score -= 2
  }

  return Math.max(1, Math.min(5, score))
}

export const roboticsAudienceRelevanceScore = ({ title = '', summary = '', whyItMatters = '', bodyParagraphs = [] } = {}) => {
  const combined = normalizeWhitespace([title, summary, whyItMatters, ...(Array.isArray(bodyParagraphs) ? bodyParagraphs : [])].join(' '))
  if (!combined) return 1

  let score = 1
  if (SPECIFIC_PRODUCT_PATTERNS.test(combined)) score += 1
  if (DEPLOYMENT_VALUE_PATTERNS.test(combined)) score += 1

  const audienceMatches = Object.values(AUDIENCE_RELEVANCE_PATTERNS).filter((pattern) => pattern.test(combined)).length
  if (audienceMatches >= 1) score += 1
  if (audienceMatches >= 2) score += 1

  if (STRATEGY_ONLY_TITLE_PATTERNS.some((pattern) => pattern.test(title)) && !DEPLOYMENT_VALUE_PATTERNS.test(combined)) {
    score -= 2
  }

  return Math.max(1, Math.min(5, score))
}

export const isThemeOnlyRoboticsStory = ({ title = '', summary = '', bodyParagraphs = [], factPackage = null } = {}) => {
  const combined = normalizeWhitespace([title, summary, ...(Array.isArray(bodyParagraphs) ? bodyParagraphs : [])].join(' '))
  const strategyTitle = STRATEGY_ONLY_TITLE_PATTERNS.some((pattern) => pattern.test(title))
  if (!strategyTitle) return false

  const density = informationalDensityScore({ title, summary, bodyParagraphs, factPackage })
  const concreteStoryFact = hasConcreteFact(combined, { title })
  const hasProductSignal = SPECIFIC_PRODUCT_PATTERNS.test(combined)
  const hasDeploymentSignal = DEPLOYMENT_VALUE_PATTERNS.test(combined)
  if (!concreteStoryFact) return true
  return density < NEWS_MIN_INFORMATIONAL_DENSITY && (!hasProductSignal || !hasDeploymentSignal)
}

export const visualStandoutScore = ({
  title = '',
  summary = '',
  whyItMatters = '',
  bodyParagraphs = [],
  youtubeUrl = '',
  sourceImageUrl = '',
  sourceContext = null,
  visualStrengthScore = 0,
} = {}) => {
  const combined = normalizeWhitespace([title, summary, whyItMatters, ...(Array.isArray(bodyParagraphs) ? bodyParagraphs : [])].join(' '))
  const visualSupport = hasStrongVisualSupport({ youtubeUrl, sourceImageUrl, sourceContext, visualStrengthScore })
  const hasVideoSupport = Boolean(String(youtubeUrl || '').trim())
  const explicitVisualEvidence = EXPLICIT_VISUAL_EVIDENCE_PATTERNS.test(combined)
  const qualifiesAsVisualEvidence = hasVideoSupport || (visualSupport && explicitVisualEvidence)
  let score = 1

  if (visualSupport) score += 2
  if (VISUAL_STANDOUT_PATTERNS.test(combined)) score += 1
  if (SPECIFIC_PRODUCT_PATTERNS.test(combined)) score += 1
  if (hasConcreteFact(combined, { title })) score += 1
  if (STRATEGY_ONLY_TITLE_PATTERNS.some((pattern) => pattern.test(title)) && !VISUAL_STANDOUT_PATTERNS.test(combined)) score -= 2

  const bounded = Math.max(1, Math.min(5, score))
  return qualifiesAsVisualEvidence ? bounded : Math.min(3, bounded)
}

export const hasStrongVisualSupport = ({ youtubeUrl = '', sourceImageUrl = '', sourceContext = null, visualStrengthScore = 0 } = {}) =>
  Boolean(youtubeUrl) ||
  isValidSourceUrl(sourceImageUrl) ||
  isValidSourceUrl(sourceContext?.imageUrl || '') ||
  Number(visualStrengthScore || 0) >= 4

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
  const whySource = editorial?.whyItMatters || editorial?.bodyParagraphs?.[1] || editorial?.bodyParagraphs?.[0] || summarySource
  const factPackage = editorial?.factPackage || null
  const category = inferCategory({ title: candidate?.title, sourceName: candidate?.sourceName, sourceContext: editorial?.sourceContext })
  const summary = shortenText(summarySource, 220)
  const whyItMatters = shortenText(whySource, 180)
  const malformedSummary = looksMalformedEditorialText({
    text: summary,
    title: candidate?.title,
    sourceName: candidate?.sourceName,
  })
  const malformedParagraphOne = looksMalformedEditorialText({
    text: editorial?.bodyParagraphs?.[0] || '',
    title: candidate?.title,
    sourceName: candidate?.sourceName,
  })
  const sourceGrounded = Boolean(
    factPackage?.source_grounded ||
      editorial?.sourceContext?.metaDescription ||
      editorial?.sourceContext?.ogDescription ||
      editorial?.sourceContext?.paragraphs?.length
  )
  const concreteFactExcerpt =
    factPackage?.best_concrete_fact ||
    extractConcreteFactExcerpt(summary, { title: candidate?.title }) ||
    extractConcreteFactExcerpt(editorial?.bodyParagraphs?.[0] || '', { title: candidate?.title }) ||
    extractConcreteFactExcerpt((editorial?.bodyParagraphs || []).join(' '), { title: candidate?.title })
  const concreteFactPresent = Boolean(concreteFactExcerpt)
  const leadWithConcreteFact = Boolean(
    concreteFactPresent &&
      !leadStartsWithImplication(summary) &&
      (hasConcreteFact(summary, { title: candidate?.title }) ||
        hasConcreteFact(editorial?.bodyParagraphs?.[0] || '', { title: candidate?.title }))
  )
  const visualStrengthScore = hasStrongVisualSupport({
    youtubeUrl: candidate?.youtubeUrl || '',
    sourceImageUrl: editorial?.sourceContext?.imageUrl || '',
    sourceContext: editorial?.sourceContext,
  })
    ? 4
    : 1
  const visualStandout = visualStandoutScore({
    title: candidate?.title,
    summary,
    whyItMatters,
    bodyParagraphs: editorial?.bodyParagraphs || [],
    youtubeUrl: candidate?.youtubeUrl || '',
    sourceImageUrl: editorial?.sourceContext?.imageUrl || '',
    sourceContext: editorial?.sourceContext,
    visualStrengthScore,
  })
  const storyFormat =
    visualStrengthScore >= 4 && (factPackage?.story_format_recommendation === 'featured_candidate' || visualStandout >= 4)
      ? 'featured_candidate'
      : 'signal_brief'
  const implicationRisk = leadStartsWithImplication(summary) && !leadWithConcreteFact ? 'high' : 'low'
  const homepageEligible =
    (
      candidate?.sourceTrustTier === 'allow' &&
      HIGH_SIGNAL_PATTERN.test(`${candidate?.title || ''} ${summarySource}`) &&
      (category === 'category-humanoid-robots' || category === 'category-robotics-startups')
    ) ||
    ((candidate?.sourceTrustTier === 'allow' || candidate?.sourceTrustTier === 'caution') &&
      visualStandout >= 4 &&
      SPECIFIC_PRODUCT_PATTERNS.test(`${candidate?.title || ''} ${summary}`))
  const internalLinkTarget = resolveInternalLinkTarget({ title: candidate?.title, categoryId: category })
  const headlineSupported = headlineSupportedByBody({
    title: candidate?.title,
    summary,
    bodyParagraphs: editorial?.bodyParagraphs || [],
  })
  const abstraction = abstractnessScore({ summary, whyItMatters, bodyParagraphs: editorial?.bodyParagraphs || [] })
  const repetition = repetitionScore({ summary, whyItMatters, bodyParagraphs: editorial?.bodyParagraphs || [] })
  const editorialNaturalness = editorialNaturalnessScore({
    summary,
    whyItMatters,
    bodyParagraphs: editorial?.bodyParagraphs || [],
  })
  const informationalDensity = informationalDensityScore({
    title: candidate?.title,
    summary,
    whyItMatters,
    bodyParagraphs: editorial?.bodyParagraphs || [],
    factPackage,
  })
  const audienceRelevance = roboticsAudienceRelevanceScore({
    title: candidate?.title,
    summary,
    whyItMatters,
    bodyParagraphs: editorial?.bodyParagraphs || [],
  })
  const themeOnlyStory = isThemeOnlyRoboticsStory({
    title: candidate?.title,
    summary,
    bodyParagraphs: editorial?.bodyParagraphs || [],
    factPackage,
  })
  const actor = normalizeWhitespace(factPackage?.main_actor || '')
  const action = normalizeWhitespace(factPackage?.main_action || '')
  const object = normalizeWhitespace(factPackage?.main_object || '')
  const factEntities = [...extractKeyEntities([object, factPackage?.best_concrete_fact || ''].filter(Boolean).join(' '))].slice(0, 2)
  const youtubeSearchQuery =
    normalizeWhitespace(
      [
        actor,
        object || factEntities.join(' '),
        action && !object ? action : '',
        /(robot|robotics|humanoid|automation|factory|warehouse|vision)/i.test(`${actor} ${object}`) ? '' : 'robotics',
      ]
        .filter(Boolean)
        .join(' ')
    ) || normalizeWhitespace(`${candidate?.title || ''} ${candidate?.sourceName || ''} robotics`)
  const publishRecommendation =
    !isValidSourceUrl(candidate?.sourceUrl) || !sourceGrounded
      ? 'reject'
      : malformedSummary ||
          malformedParagraphOne ||
          factPackage?.thin_source_risk === 'high' ||
          !concreteFactPresent ||
          !leadWithConcreteFact ||
          !headlineSupported ||
          !paragraphAdvancesSummary({ summary, paragraph: editorial?.bodyParagraphs?.[0] || '' }) ||
          abstraction >= 4 ||
          repetition >= 4 ||
          editorialNaturalness <= 2 ||
          informationalDensity < NEWS_MIN_INFORMATIONAL_DENSITY ||
          audienceRelevance < NEWS_MIN_AUDIENCE_RELEVANCE ||
          themeOnlyStory ||
          !paragraphAnchoredToFactPackage({ paragraph: editorial?.bodyParagraphs?.[1] || '', factPackage, title: candidate?.title })
        ? 'draft_only'
        : 'auto_publish'

  return {
    summary,
    why_it_matters: whyItMatters,
    category,
    story_format: storyFormat,
    publish_recommendation: publishRecommendation,
    concrete_fact_present: concreteFactPresent,
    concrete_fact_excerpt: concreteFactExcerpt,
    source_grounded: sourceGrounded,
    headline_supported_by_body: factPackage ? Boolean(factPackage.headline_supported) && headlineSupported : headlineSupported,
    lead_with_concrete_fact: leadWithConcreteFact,
    implication_first_risk: implicationRisk,
    abstractness_score: abstraction,
    repetition_score: repetition,
    editorial_naturalness_score: editorialNaturalness,
    informational_density_score: informationalDensity,
    robotics_audience_relevance_score: audienceRelevance,
    visual_standout_score: visualStandout,
    source_strength_score: candidate?.sourceTrustTier === 'allow' ? 5 : candidate?.sourceTrustTier === 'caution' ? 3 : 2,
    newsworthiness_score: HIGH_SIGNAL_PATTERN.test(`${candidate?.title || ''} ${summary}`) ? 4 : 3,
    visual_strength_score: visualStrengthScore,
    homepage_eligible: Boolean(homepageEligible),
    reject: false,
    reject_reason: '',
    draft_reason: publishRecommendation === 'draft_only' ? 'needs_editorial_review' : '',
    internal_link_target: validateInternalLinkTarget(internalLinkTarget) ? internalLinkTarget : '',
    youtube_search_query: youtubeSearchQuery,
  }
}

export const validateQcEnrichment = (value) => {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'missing_enrichment', data: null }

  const implicationRisk = String(value.implication_first_risk || '').trim().toLowerCase()
  const storyFormat = String(value.story_format || '').trim()
  const publishRecommendation = String(value.publish_recommendation || '').trim()
  const normalized = {
    summary: shortenText(value.summary || '', 220),
    why_it_matters: shortenText(value.why_it_matters || '', 180),
    category: String(value.category || '').trim(),
    story_format: ['signal_brief', 'featured_candidate', 'reject'].includes(storyFormat) ? storyFormat : 'signal_brief',
    publish_recommendation: ['auto_publish', 'draft_only', 'reject'].includes(publishRecommendation)
      ? publishRecommendation
      : 'draft_only',
    concrete_fact_present: Boolean(value.concrete_fact_present),
    concrete_fact_excerpt: shortenText(value.concrete_fact_excerpt || '', 180),
    source_grounded: Boolean(value.source_grounded),
    headline_supported_by_body: Boolean(value.headline_supported_by_body),
    lead_with_concrete_fact: Boolean(value.lead_with_concrete_fact),
    implication_first_risk: ['low', 'medium', 'high'].includes(implicationRisk) ? implicationRisk : 'medium',
    abstractness_score: Number(value.abstractness_score || 0),
    repetition_score: Number(value.repetition_score || 0),
    editorial_naturalness_score: Number(value.editorial_naturalness_score || 0),
    informational_density_score: Number(value.informational_density_score || 0),
    robotics_audience_relevance_score: Number(value.robotics_audience_relevance_score || 0),
    visual_standout_score: Number(value.visual_standout_score || 0),
    source_strength_score: Number(value.source_strength_score || 0),
    newsworthiness_score: Number(value.newsworthiness_score || 0),
    visual_strength_score: Number(value.visual_strength_score || 0),
    homepage_eligible: Boolean(value.homepage_eligible),
    reject: Boolean(value.reject),
    reject_reason: normalizeWhitespace(value.reject_reason || ''),
    draft_reason: normalizeWhitespace(value.draft_reason || ''),
    internal_link_target: normalizeWhitespace(value.internal_link_target || ''),
    youtube_search_query: shortenText(value.youtube_search_query || '', 140),
  }

  if (normalized.summary.length < 90 || wordCount(normalized.summary) < 12) {
    return { ok: false, reason: 'invalid_summary', data: null }
  }
  if (looksMalformedEditorialText({ text: normalized.summary })) {
    return { ok: false, reason: 'malformed_summary', data: null }
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
  if (normalized.concrete_fact_present && !normalized.concrete_fact_excerpt) {
    return { ok: false, reason: 'invalid_concrete_fact_excerpt', data: null }
  }
  const boundedScores = [
    normalized.abstractness_score,
    normalized.repetition_score,
    normalized.editorial_naturalness_score,
    normalized.informational_density_score,
    normalized.robotics_audience_relevance_score,
    normalized.visual_standout_score,
    normalized.source_strength_score,
    normalized.newsworthiness_score,
    normalized.visual_strength_score,
  ]
  if (boundedScores.some((score) => !Number.isFinite(score) || score < 1 || score > 5)) {
    return { ok: false, reason: 'invalid_score_range', data: null }
  }

  return { ok: true, reason: '', data: normalized }
}

export const rankCandidate = (candidate) => {
  const trust = sourceTrustScore(candidate?.sourceTrustTier) * 10
  const signal = HIGH_SIGNAL_PATTERN.test(candidate?.title || '') ? 3 : 0
  const entities = COMPANY_ENTITY_TOKENS.some((token) => normalizeText(candidate?.title || '').includes(token)) ? 2 : 0
  const visualAppeal = VISUAL_STANDOUT_PATTERNS.test(candidate?.title || '') ? 2 : 0
  const specificProduct = SPECIFIC_PRODUCT_PATTERNS.test(candidate?.title || '') ? 2 : 0
  const strategyPenalty = STRATEGY_ONLY_TITLE_PATTERNS.some((pattern) => pattern.test(candidate?.title || '')) ? -3 : 0
  return trust + signal + entities + visualAppeal + specificProduct + strategyPenalty
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
    `Source image URL: ${editorial?.sourceContext?.imageUrl || 'n/a'}`,
    `Extracted source paragraphs: ${(editorial?.sourceContext?.paragraphs || []).join(' || ') || 'n/a'}`,
    `Fallback summary: ${editorial?.excerpt || 'n/a'}`,
    `Fallback why it matters: ${editorial?.bodyParagraphs?.[1] || editorial?.bodyParagraphs?.[0] || 'n/a'}`,
    '',
    'Rules:',
    '- A YouTube video is not required for a valid post.',
    '- If the item has no embedded video or strong visual support, it should be treated as signal_brief, not rejected for that reason alone.',
    '- Only return featured_candidate when the item appears visually strong enough for featured treatment.',
    '- concrete_fact_present should be true only if the summary/body contains at least one concrete factual statement.',
    '- lead_with_concrete_fact should be false if the summary opens with implication-first framing before stating a concrete fact.',
    '- headline_supported_by_body should be false if the body does not substantiate the headline.',
    `- informational_density_score should fall below ${NEWS_MIN_INFORMATIONAL_DENSITY} when the story stays too abstract or lacks enough concrete product/deployment facts.`,
    `- robotics_audience_relevance_score should fall below ${NEWS_MIN_AUDIENCE_RELEVANCE} when the story is weak for robotics consumers, investors, or operators.`,
    '- visual_standout_score should be high only when the story is both specific and visually compelling for a robotics audience, not just vaguely hypey.',
    '- Use draft_only when the item is potentially useful but needs editorial review.',
    '- Use reject only for items that should not be published.',
    '',
    'Return this JSON shape only:',
    '{',
    '  "summary": "string",',
    '  "why_it_matters": "string",',
    '  "category": "category-id",',
    '  "story_format": "signal_brief | featured_candidate | reject",',
    '  "publish_recommendation": "auto_publish | draft_only | reject",',
    '  "concrete_fact_present": true,',
    '  "concrete_fact_excerpt": "string",',
    '  "source_grounded": true,',
    '  "headline_supported_by_body": true,',
    '  "lead_with_concrete_fact": true,',
    '  "implication_first_risk": "low | medium | high",',
    '  "abstractness_score": 1,',
    '  "repetition_score": 1,',
    '  "editorial_naturalness_score": 1,',
    '  "informational_density_score": 1,',
    '  "robotics_audience_relevance_score": 1,',
    '  "visual_standout_score": 1,',
    '  "source_strength_score": 1,',
    '  "newsworthiness_score": 1,',
    '  "visual_strength_score": 1,',
    '  "homepage_eligible": true,',
    '  "reject": false,',
    '  "reject_reason": "",',
    '  "draft_reason": "",',
    '  "internal_link_target": "",',
    '  "youtube_search_query": ""',
    '}',
  ].join('\n')
}
