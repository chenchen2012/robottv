import {
  extractConcreteFactExcerpt,
  extractMainNumberOrScale,
  hasConcreteFact,
  headlineSupportedByBody,
  leadStartsWithImplication,
  validateFactPackage,
} from './news-publish-quality.mjs'

const MAIN_ACTION_PATTERN =
  /\b(raised?|raises|acquires?|acquired|acquisition|partners?|partnered|deal|contract|deploy(?:ed|ment|ments)?|pilot|production|rolls? out|launched?|released?|introduced?|announced?|unveiled?|debuts?|sign(?:ed|s)?|opened?|offers?|hired?|joins?)\b/i

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim()

const countWords = (value) => normalizeWhitespace(value).split(' ').filter(Boolean).length

const splitSentences = (value = '') =>
  normalizeWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean)

const safeSentence = (value, maxLength = 280) => {
  const text = normalizeWhitespace(value)
  if (!text) return ''
  if (text.length <= maxLength) return text
  const clipped = text.slice(0, maxLength)
  const breakpoint = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('; '), clipped.lastIndexOf(', '))
  return `${(breakpoint > 120 ? clipped.slice(0, breakpoint + 1) : clipped).trimEnd()}...`
}

const shortenText = (value, maxChars) => {
  const text = normalizeWhitespace(value)
  if (!text || text.length <= maxChars) return text
  const clipped = text.slice(0, maxChars)
  const breakpoint = clipped.lastIndexOf(' ')
  return `${(breakpoint > 40 ? clipped.slice(0, breakpoint) : clipped).trimEnd()}...`
}

const sourceSentences = (sourceContext = {}) => {
  const candidates = [
    sourceContext.metaDescription || '',
    sourceContext.ogDescription || '',
    ...(Array.isArray(sourceContext.paragraphs) ? sourceContext.paragraphs : []),
    sourceContext.pageTitle || '',
  ]
  const unique = []
  const seen = new Set()
  for (const candidate of candidates) {
    for (const sentence of splitSentences(candidate)) {
      const key = sentence.toLowerCase()
      if (!sentence || seen.has(key)) continue
      seen.add(key)
      unique.push(sentence)
    }
  }
  return unique
}

export const hasUsableSourceContext = (sourceContext = {}) =>
  Boolean(
    sourceContext.metaDescription ||
      sourceContext.ogDescription ||
      sourceContext.pageTitle ||
      (Array.isArray(sourceContext.paragraphs) && sourceContext.paragraphs.length)
  )

const firstFactSentence = ({ headline, sourceContext }) => {
  const sentences = sourceSentences(sourceContext)
  return (
    sentences.find((sentence) => hasConcreteFact(sentence, { title: headline })) ||
    extractConcreteFactExcerpt(
      [sourceContext.metaDescription, sourceContext.ogDescription, ...(sourceContext.paragraphs || [])]
        .filter(Boolean)
        .join(' '),
      { title: headline }
    ) ||
    ''
  )
}

const firstSourceSentence = ({ headline, sourceContext }) => {
  const factSentence = firstFactSentence({ headline, sourceContext })
  if (factSentence) return factSentence
  return (
    sourceSentences(sourceContext).find((sentence) => !leadStartsWithImplication(sentence)) ||
    safeSentence(sourceContext.pageTitle || headline || '', 180)
  )
}

const supportSentence = ({ headline, sourceContext, exclude = '' }) =>
  sourceSentences(sourceContext).find((sentence) => {
    if (!sentence || sentence === exclude) return false
    if (leadStartsWithImplication(sentence)) return false
    return hasConcreteFact(sentence, { title: headline }) || countWords(sentence) >= 12
  }) || ''

const deriveMainAction = (value = '') => {
  const match = normalizeWhitespace(value).match(MAIN_ACTION_PATTERN)
  return normalizeWhitespace(match?.[1] || '')
}

const deriveMainActor = (value = '', fallbackHeadline = '') => {
  const text = normalizeWhitespace(value)
  const action = deriveMainAction(text)
  if (text && action) {
    const splitIndex = text.toLowerCase().indexOf(action.toLowerCase())
    if (splitIndex > 0) {
      return shortenText(text.slice(0, splitIndex), 80)
    }
  }
  const headline = normalizeWhitespace(fallbackHeadline)
  const headlineMatch = headline.match(/^([A-Z0-9][A-Za-z0-9&.+'’ -]{2,90}?)(?:\s+(?:raises|acquires|partners|deploys|launches|rolls out|offers|joins|wins|is)\b|:)/)
  return shortenText(headlineMatch?.[1] || '', 80)
}

const deriveMainObject = (value = '', fallbackHeadline = '') => {
  const text = normalizeWhitespace(value)
  const action = deriveMainAction(text)
  if (text && action) {
    const splitIndex = text.toLowerCase().indexOf(action.toLowerCase())
    if (splitIndex >= 0) {
      return shortenText(text.slice(splitIndex + action.length).replace(/^[\s:-]+/, ''), 120)
    }
  }
  return shortenText(fallbackHeadline, 120)
}

export const buildDeterministicFactDraft = ({ headline, sourceContext }) => {
  const bestConcreteFact = safeSentence(firstFactSentence({ headline, sourceContext }) || firstSourceSentence({ headline, sourceContext }), 220)
  const secondaryFact = safeSentence(
    supportSentence({ headline, sourceContext, exclude: bestConcreteFact }) || sourceContext.paragraphs?.[1] || '',
    220
  )
  const sourceGrounded = hasUsableSourceContext(sourceContext)
  const headlineSupported = headlineSupportedByBody({
    title: headline,
    summary: bestConcreteFact,
    bodyParagraphs: [secondaryFact, ...(sourceContext.paragraphs || []).slice(0, 1)],
  })
  const thinSourceRisk = !sourceGrounded || !bestConcreteFact
    ? 'high'
    : secondaryFact
      ? 'low'
      : 'medium'
  const storyFormatRecommendation =
    thinSourceRisk === 'high'
      ? 'draft_only'
      : sourceContext.imageUrl
        ? 'featured_candidate'
        : 'signal_brief'

  return {
    main_actor: deriveMainActor(bestConcreteFact, headline),
    main_action: deriveMainAction(bestConcreteFact),
    main_object: deriveMainObject(bestConcreteFact, headline),
    main_number_or_scale: extractMainNumberOrScale(bestConcreteFact),
    best_concrete_fact: bestConcreteFact,
    secondary_fact: hasConcreteFact(secondaryFact, { title: headline }) ? secondaryFact : '',
    source_grounded: sourceGrounded,
    thin_source_risk: thinSourceRisk,
    headline_supported: headlineSupported,
    story_format_recommendation: storyFormatRecommendation,
  }
}

export const extractFactLayer = ({ headline, sourceContext }) => {
  const factDraft = buildDeterministicFactDraft({ headline, sourceContext })
  const validation = validateFactPackage(factDraft, { title: headline })
  const factPackage = validation.ok ? validation.data : null
  const selectedFactPackage = factPackage || factDraft
  const diagnostics = {
    source_grounded: Boolean(selectedFactPackage?.source_grounded),
    thin_source_risk: selectedFactPackage?.thin_source_risk || 'high',
    headline_supported: Boolean(selectedFactPackage?.headline_supported),
    best_concrete_fact_present: Boolean(selectedFactPackage?.best_concrete_fact),
    secondary_fact_present: Boolean(selectedFactPackage?.secondary_fact),
    deterministic_valid: validation.ok,
    viable_for_writing: Boolean(factPackage?.best_concrete_fact && factPackage?.source_grounded),
    viable_for_deepseek_refinement: Boolean(
      factPackage?.best_concrete_fact &&
        factPackage?.source_grounded &&
        factPackage?.thin_source_risk !== 'high'
    ),
  }

  return {
    factDraft,
    factPackage,
    selectedFactPackage,
    validation,
    diagnostics,
  }
}
