import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { callDeepSeekJson } from './deepseek-provider.mjs'
import { extractFactLayer, hasUsableSourceContext as factLayerHasUsableSourceContext } from './news-fact-extraction.mjs'
import {
  extractConcreteFactExcerpt,
  hasConcreteFact,
  headlineSupportedByBody,
  leadStartsWithImplication,
  paragraphAdvancesSummary,
  titleSimilarity,
  validateFactPackage,
} from './news-publish-quality.mjs'

const SOURCE_FETCH_TIMEOUT_MS = Number(process.env.NEWS_SOURCE_FETCH_TIMEOUT_MS || 12_000)

const SOURCE_NAME_OVERRIDES = new Map([
  ['businessinsider', 'Business Insider'],
  ['therobotreport', 'The Robot Report'],
  ['techcrunch', 'TechCrunch'],
])
const COMPETITOR_SOURCE_KEYS = new Set(['therobotreport', 'roboticsbusinessreview', 'robotics247'])
const stripHtml = (value) =>
  String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()

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

const titleCaseSource = (source) => {
  const normalized = normalizeWhitespace(source)
  if (!normalized) return 'the source report'
  const key = normalized.toLowerCase().replace(/[^a-z]/g, '')
  return SOURCE_NAME_OVERRIDES.get(key) || normalized
}

const sourceReference = (source) => {
  const normalized = normalizeWhitespace(source)
  if (!normalized) return 'public reporting'
  const key = normalized.toLowerCase().replace(/[^a-z]/g, '')
  if (COMPETITOR_SOURCE_KEYS.has(key)) return 'recent industry reporting'
  return titleCaseSource(source)
}

const hashString = (value) => {
  let hash = 0
  const text = String(value || '')
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const pickVariant = (value, options) => {
  if (!options.length) return ''
  return options[hashString(value) % options.length]
}

const extractMeta = (html, pattern) => {
  const match = html.match(pattern)
  return match ? stripHtml(match[1]) : ''
}

const extractImageUrl = (html, baseUrl = '') => {
  const candidates = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i,
  ]
  for (const pattern of candidates) {
    const value = extractMeta(html, pattern)
    if (!value) continue
    try {
      return new URL(value, baseUrl || undefined).toString()
    } catch {
      continue
    }
  }
  return ''
}

const extractParagraphs = (html) => {
  const mainSectionMatch =
    html.match(/<article[\s\S]*?<\/article>/i) ||
    html.match(/<main[\s\S]*?<\/main>/i) ||
    html.match(/<body[\s\S]*?<\/body>/i)
  const scope = mainSectionMatch ? mainSectionMatch[0] : html
  const paragraphs = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1]))
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length >= 70)
    .filter((paragraph) => !/subscribe|newsletter|advertisement|cookie|sign up|all rights reserved/i.test(paragraph))
    .filter((paragraph) => !/^©|^copyright/i.test(paragraph))
  return [...new Set(paragraphs)].slice(0, 6)
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = SOURCE_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
        ...(options.headers || {}),
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

export const blocksFromParagraphs = (paragraphs = []) =>
  (Array.isArray(paragraphs) ? paragraphs : [])
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean)
    .map((paragraph, index) => ({
      _type: 'block',
      _key: `body-${index}-${hashString(paragraph).toString(36).slice(0, 6)}`,
      style: 'normal',
      markDefs: [],
      children: [
        {
          _type: 'span',
          _key: `span-${index}-${hashString(`${paragraph}-${index}`).toString(36).slice(0, 6)}`,
          text: paragraph,
        },
      ],
    }))

const themeFromHeadline = (headline = '') => {
  const text = headline.toLowerCase()
  if (/(funding|raises|valuation|series [abc]|stealth|backed)/.test(text)) return 'capital formation'
  if (/(warehouse|fulfillment|logistics|distribution center)/.test(text)) return 'warehouse operations'
  if (/(inspection|data center|power plant|oil|gas|infrastructure)/.test(text)) return 'inspection operations'
  if (/(factory|manufacturing|assembly|automotive|production)/.test(text)) return 'factory automation'
  if (/(humanoid|biped|figure|optimus|digit|apollo)/.test(text)) return 'humanoid deployment'
  if (/(quadruped|robot dog|spot)/.test(text)) return 'field robotics'
  if (/(chip|nvidia|qualcomm|jetson|compute|semiconductor)/.test(text)) return 'robotics compute'
  if (/(summit|conference|expo|keynote)/.test(text)) return 'industry events'
  if (/(policy|pentagon|military|security|regulation|standards)/.test(text)) return 'policy and governance'
  return 'robotics commercialization'
}

const firstSourceSentence = ({ headline, sourceContext }) =>
  extractConcreteFactExcerpt(
    [sourceContext.metaDescription, sourceContext.ogDescription, ...(sourceContext.paragraphs || [])]
      .filter(Boolean)
      .join(' '),
    { title: headline }
  ) || splitSentences([sourceContext.metaDescription, sourceContext.ogDescription, ...(sourceContext.paragraphs || []), sourceContext.pageTitle || headline || ''].join(' ')).find((sentence) => !leadStartsWithImplication(sentence)) || safeSentence(sourceContext.pageTitle || headline || '', 180)

const supportSentence = ({ headline, sourceContext, exclude = '' }) =>
  splitSentences([sourceContext.metaDescription, sourceContext.ogDescription, ...(sourceContext.paragraphs || [])].join(' ')).find((sentence) => {
    if (!sentence || sentence === exclude) return false
    if (leadStartsWithImplication(sentence)) return false
    return hasConcreteFact(sentence, { title: headline }) || countWords(sentence) >= 12
  }) || ''

const significanceLine = ({ headline, source, sourceContext, factPackage }) => {
  const theme = themeFromHeadline(headline)
  const actor = factPackage?.main_actor || sourceReference(source)
  const object = factPackage?.main_object || 'this reported move'
  if (factPackage?.secondary_fact) {
    return safeSentence(
      `${factPackage.secondary_fact} This matters because ${actor} is now tying ${object.toLowerCase()} to a more operational robotics outcome.`,
      220
    )
  }
  if (theme === 'robotics compute') {
    return 'The practical question is whether this changes latency, on-robot autonomy, or deployment cost in ways robotics teams can actually use.'
  }
  if (theme === 'inspection operations') {
    return 'The useful signal is whether the move reduces inspection risk or cost in routine operations rather than staying at the demo stage.'
  }
  if (theme === 'humanoid deployment') {
    return 'The useful signal is whether this development improves real deployment readiness rather than adding another humanoid headline.'
  }
  return `${actor} is now attached to a concrete development in ${theme}, which matters more than generic momentum language.`
}

const shouldUseParagraphThree = ({ factPackage, sourceContext }) => {
  if (!factPackage?.source_grounded || factPackage?.thin_source_risk === 'high') return false
  if (factPackage?.secondary_fact) return true
  const sourceText = normalizeWhitespace(
    [sourceContext.metaDescription, sourceContext.ogDescription, ...(sourceContext.paragraphs || [])].join(' ')
  )
  return /pilot|deployment|contract|customer|fleet|launch|release|version|model|orders?|expansion/i.test(sourceText)
}

const watchLine = ({ headline, sourceContext, factPackage }) => {
  const theme = themeFromHeadline(headline)
  const sourceText = normalizeWhitespace(
    [sourceContext.metaDescription, sourceContext.ogDescription, ...(sourceContext.paragraphs || [])].join(' ')
  )
  if (!shouldUseParagraphThree({ factPackage, sourceContext })) return ''
  if (/pilot|deployment|contract|customer|fleet/i.test(sourceText)) {
    return 'Watch for follow-on deployments, named customers, or contract expansion that proves the update is more than a one-off.'
  }
  if (/launch|release|version|model/i.test(sourceText)) {
    return 'Watch for performance data, customer uptake, or deployment evidence that shows the release is landing beyond the announcement cycle.'
  }
  if (theme === 'humanoid deployment') {
    return 'Watch for repeatable uptime, safety integration, and task-level productivity rather than another short demo cycle.'
  }
  return 'Watch for evidence that this reported move turns into repeatable deployment, stronger customer proof, or measurable operating value.'
}

const buildFallbackExcerpt = ({ headline, source, sourceContext, factPackage }) => {
  const factLead = safeSentence(factPackage?.best_concrete_fact || firstSourceSentence({ headline, sourceContext }) || headline, 160)
  const implication =
    factPackage?.thin_source_risk === 'high' ? '' : safeSentence(significanceLine({ headline, source, sourceContext, factPackage }), 96)
  const composed = normalizeWhitespace([factLead, implication && !leadStartsWithImplication(factLead) ? implication : ''].filter(Boolean).join(' '))
  if (composed) return composed.length > 240 ? `${composed.slice(0, 237).trimEnd()}...` : composed
  return safeSentence(`${headline}.`, 140)
}

const distinctParagraphLeadCandidate = ({ headline, summary, candidates = [] }) => {
  for (const candidate of candidates) {
    const sentence = safeSentence(candidate, 220)
    if (!sentence) continue
    if (!hasConcreteFact(sentence, { title: headline })) continue
    if (!paragraphAdvancesSummary({ summary, paragraph: sentence })) continue
    return sentence
  }
  return ''
}

const buildFallbackBodyParagraphs = ({ headline, source, sourceContext, factPackage }) => {
  const summary = buildFallbackExcerpt({ headline, source, sourceContext, factPackage })
  const excerptLead = safeSentence(factPackage?.best_concrete_fact || firstSourceSentence({ headline, sourceContext }) || `${headline}.`, 220)
  const paragraphOneLead =
    distinctParagraphLeadCandidate({
      headline,
      summary,
      candidates: [
        factPackage?.secondary_fact,
        supportSentence({ headline, sourceContext, exclude: factPackage?.best_concrete_fact || '' }),
        ...splitSentences([sourceContext.metaDescription, sourceContext.ogDescription, ...(sourceContext.paragraphs || [])].join(' ')),
      ],
    }) || excerptLead
  const paragraphOneSupport = distinctParagraphLeadCandidate({
    headline,
    summary: normalizeWhitespace([summary, paragraphOneLead].join(' ')),
    candidates: [
      supportSentence({ headline, sourceContext, exclude: paragraphOneLead }),
      factPackage?.secondary_fact && titleSimilarity(factPackage.secondary_fact, paragraphOneLead) < 0.72 ? factPackage.secondary_fact : '',
      ...splitSentences((sourceContext.paragraphs || []).join(' ')),
    ],
  })
  const paragraphOne = normalizeWhitespace(
    [paragraphOneLead, paragraphOneSupport]
      .filter(Boolean)
      .join(' ')
  )
  const paragraphTwo = normalizeWhitespace(
    [safeSentence(significanceLine({ headline, source, sourceContext, factPackage }), 220)].filter(Boolean).join(' ')
  )
  const paragraphThree = normalizeWhitespace(
    [safeSentence(watchLine({ headline, sourceContext, factPackage }), 180)].filter(Boolean).join(' ')
  )

  return [paragraphOne, paragraphTwo, paragraphThree].filter((paragraph) => countWords(paragraph) >= 12)
}

const buildFallbackVideoSummary = ({ headline, source, sourceContext, excerpt }) => {
  const opener = excerpt || buildFallbackExcerpt({ headline, source, sourceContext, factPackage: null })
  const visualContext = pickVariant(headline, [
    'The embedded video helps readers judge how much of the story is product theater versus operational proof.',
    'The embedded video gives a clearer read on the capability, deployment setting, or market signal behind the headline.',
    'The embedded video adds the visual evidence needed to evaluate whether the claim points to real robotics progress.',
  ])
  const combined = normalizeWhitespace([opener, visualContext].join(' '))
  return combined.length > 320 ? `${combined.slice(0, 317).trimEnd()}...` : combined
}

const buildFallbackEditorialPackage = ({ headline, source, sourceContext, factPackage }) => {
  const excerpt = buildFallbackExcerpt({ headline, source, sourceContext, factPackage })
  const bodyParagraphs = buildFallbackBodyParagraphs({ headline, source, sourceContext, factPackage })
  return {
    excerpt,
    whyItMatters: shortenText(bodyParagraphs[1] || bodyParagraphs[0] || excerpt, 180),
    videoSummary: buildFallbackVideoSummary({ headline, source, sourceContext, excerpt }),
    bodyParagraphs,
    paragraph3Useful: bodyParagraphs.length > 2,
  }
}

const buildStructuredEditorialPrompt = ({ headline, source, sourceUrl, pubDate, sourceContext, fallbackFacts, fallbackEditorial }) =>
  [
    'You are editing a robotics news post for robot.tv.',
    'Your first job is factual extraction. Your second job is writing concise, source-grounded copy from that fact package.',
    'Use only the supplied source context. Do not invent facts. Empty strings are better than guessed facts.',
    'If the source is thin, say so through thin_source_risk and keep the writing conservative.',
    'The summary must begin with a concrete fact when possible.',
    'Paragraph 1 must be fact-first and source-grounded.',
    'Paragraph 1 must add the next strongest concrete fact or operational detail instead of closely repeating the summary lead.',
    'Paragraph 2 must stay tied to extracted facts, not generic robotics-market narration.',
    'Paragraph 3 is optional. Include it only when the source context justifies a watch-next line.',
    'Missing video must not block a valid signal brief.',
    '',
    `Headline: ${headline}`,
    `Source: ${titleCaseSource(source)}`,
    `Source URL: ${sourceUrl || 'n/a'}`,
    `Source published date: ${pubDate || 'n/a'}`,
    `Source page title: ${sourceContext.pageTitle || 'n/a'}`,
    `Source meta description: ${sourceContext.metaDescription || 'n/a'}`,
    `Source og description: ${sourceContext.ogDescription || 'n/a'}`,
    `Source extracted paragraphs: ${sourceContext.paragraphs.join(' || ') || 'n/a'}`,
    `Fallback best concrete fact: ${fallbackFacts.best_concrete_fact || 'n/a'}`,
    `Fallback secondary fact: ${fallbackFacts.secondary_fact || 'n/a'}`,
    `Fallback summary: ${fallbackEditorial.excerpt || 'n/a'}`,
    `Fallback paragraph 1: ${fallbackEditorial.bodyParagraphs?.[0] || 'n/a'}`,
    '',
    'Return strict JSON only in this shape:',
    '{',
    '  "fact_package": {',
    '    "main_actor": "string",',
    '    "main_action": "string",',
    '    "main_object": "string",',
    '    "main_number_or_scale": "string",',
    '    "best_concrete_fact": "string",',
    '    "secondary_fact": "string",',
    '    "source_grounded": true,',
    '    "thin_source_risk": "low | medium | high",',
    '    "headline_supported": true,',
    '    "story_format_recommendation": "signal_brief | featured_candidate | draft_only"',
    '  },',
    '  "summary": "string",',
    '  "why_it_matters": "string",',
    '  "video_summary": "string",',
    '  "body_paragraphs": ["paragraph 1", "paragraph 2"],',
    '  "paragraph3_useful": false',
    '}',
    'Rules:',
    '- best_concrete_fact must be a fact directly supported by the source context.',
    '- If you cannot support a field from the source, return an empty string rather than guessing.',
    '- summary should contain one concrete fact and one implication when justified.',
    '- paragraph 3 must be omitted when paragraph3_useful is false.',
    '- story_format_recommendation should be draft_only when the source is too thin for confident publication.',
  ].join('\n')

const normalizeAiEditorialPackage = (value, { title = '', fallbackPackage = null } = {}) => {
  if (!value || typeof value !== 'object') return null
  const validatedFacts = validateFactPackage(value.fact_package, { title })
  if (!validatedFacts.ok) return null

  const bodyParagraphs = (Array.isArray(value.body_paragraphs) ? value.body_paragraphs : [])
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean)
  const paragraph3Useful = Boolean(value.paragraph3_useful)
  const summary = normalizeWhitespace(value.summary || '')
  const whyItMatters = normalizeWhitespace(value.why_it_matters || bodyParagraphs[1] || '')
  const videoSummary = normalizeWhitespace(value.video_summary || fallbackPackage?.videoSummary || '')

  if (bodyParagraphs.length < 2 || bodyParagraphs.length > 3) return null
  if (bodyParagraphs.some((paragraph) => countWords(paragraph) < 18 || paragraph.length > 700 || /^source:/i.test(paragraph))) return null
  if (!summary || summary.length < 90 || countWords(summary) < 12) return null
  if (leadStartsWithImplication(summary) || !hasConcreteFact(summary, { title })) return null
  if (!bodyParagraphs[0] || leadStartsWithImplication(bodyParagraphs[0]) || !hasConcreteFact(bodyParagraphs[0], { title })) return null
  if (!paragraphAdvancesSummary({ summary, paragraph: bodyParagraphs[0] })) return null
  if (!whyItMatters || whyItMatters.length < 50 || countWords(whyItMatters) < 8) return null
  if (bodyParagraphs.length === 3 && !paragraph3Useful) return null
  if (bodyParagraphs.length === 2 && paragraph3Useful) return null
  if (
    !headlineSupportedByBody({
      title,
      summary,
      bodyParagraphs,
    })
  ) {
    return null
  }

  return {
    excerpt: shortenText(summary, 240),
    whyItMatters: shortenText(whyItMatters, 180),
    videoSummary: shortenText(videoSummary || fallbackPackage?.videoSummary || '', 340),
    bodyParagraphs,
    paragraph3Useful,
    factPackage: validatedFacts.data,
  }
}

const fetchSourceContext = async (sourceUrl) => {
  const fallback = {
    pageTitle: '',
    metaDescription: '',
    ogDescription: '',
    imageUrl: '',
    paragraphs: [],
  }
  const url = String(sourceUrl || '').trim()
  if (!url) return fallback

  try {
    const response = await fetchWithTimeout(url, {}, SOURCE_FETCH_TIMEOUT_MS)
    if (!response.ok) return fallback
    const html = await response.text()
    return {
      pageTitle: extractMeta(html, /<title>([\s\S]*?)<\/title>/i),
      metaDescription: extractMeta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"]+)["']/i),
      ogDescription: extractMeta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"]+)["']/i),
      imageUrl: extractImageUrl(html, url),
      paragraphs: extractParagraphs(html),
    }
  } catch {
    return fallback
  }
}

export const buildEditorialPackage = async ({
  headline,
  source,
  sourceUrl,
  pubDate,
}) => {
  const sourceContext = await fetchSourceContext(sourceUrl)
  const deterministicFacts = extractFactLayer({ headline, sourceContext })
  const fallbackFactDraft = deterministicFacts.factDraft
  const fallbackFactPackage = deterministicFacts.factPackage
  const selectedDeterministicFactPackage = deterministicFacts.selectedFactPackage
  const fallbackEditorial = buildFallbackEditorialPackage({
    headline,
    source,
    sourceContext,
    factPackage: selectedDeterministicFactPackage,
  })

  let selectedEditorial = {
    ...fallbackEditorial,
    factPackage: selectedDeterministicFactPackage,
    factDiagnostics: deterministicFacts.diagnostics,
    generationMode: 'fallback',
    sourceContext,
  }

  if (factLayerHasUsableSourceContext(sourceContext) && deterministicFacts.diagnostics.viable_for_deepseek_refinement) {
    const deepSeekResult = await callDeepSeekJson({
      systemPrompt: 'You are a precise robotics news fact extractor and editor. Return strict JSON only. Do not invent facts.',
      userPrompt: buildStructuredEditorialPrompt({
        headline,
        source,
        sourceUrl,
        pubDate,
        sourceContext,
        fallbackFacts: selectedDeterministicFactPackage,
        fallbackEditorial,
      }),
      maxTokens: 900,
    })
    const normalizedAiPackage = normalizeAiEditorialPackage(deepSeekResult.data, {
      title: headline,
      fallbackPackage: fallbackEditorial,
    })
    if (deepSeekResult.ok && normalizedAiPackage) {
      selectedEditorial = {
        ...normalizedAiPackage,
        factDiagnostics: deterministicFacts.diagnostics,
        generationMode: 'deepseek',
        sourceContext,
      }
    }
  }

  return selectedEditorial
}

export const renderEditorialReport = ({ title, editorialPackage, source }) => {
  const lines = [
    `# ${title}`,
    '',
    `Mode: ${editorialPackage.generationMode}`,
    `Source: ${titleCaseSource(source)}`,
    '',
    '## Fact Package',
  ]

  const factPackage = editorialPackage.factPackage || {}
  Object.entries(factPackage).forEach(([key, value]) => {
    if (value === '' || value === null || typeof value === 'undefined') return
    lines.push(`- ${key}: ${value}`)
  })

  lines.push('', '## Excerpt', editorialPackage.excerpt, '', '## Why It Matters', editorialPackage.whyItMatters, '', '## Video Summary', editorialPackage.videoSummary, '', '## Body')

  editorialPackage.bodyParagraphs.forEach((paragraph, index) => {
    lines.push(`${index + 1}. ${paragraph}`)
  })

  lines.push('', '## Source Context')
  const context = editorialPackage.sourceContext || {}
  if (context.pageTitle) lines.push(`- Title: ${context.pageTitle}`)
  if (context.metaDescription) lines.push(`- Description: ${context.metaDescription}`)
  for (const paragraph of context.paragraphs || []) {
    lines.push(`- Paragraph: ${paragraph}`)
  }
  return `${lines.join(os.EOL)}${os.EOL}`
}

export const writeEditorialReport = async (targetFile, payload) => {
  await fs.mkdir(path.dirname(targetFile), { recursive: true })
  await fs.writeFile(targetFile, renderEditorialReport(payload), 'utf8')
}
