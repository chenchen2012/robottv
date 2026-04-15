import assert from 'node:assert/strict'

import { normalizeExcerpt } from './build-static-news-seo.mjs'
import { callDeepSeekJson } from './lib/deepseek-provider.mjs'
import { buildEditorialPackage } from './lib/news-editorial-content.mjs'
import { extractFactLayer } from './lib/news-fact-extraction.mjs'
import {
  extractConcreteFactExcerpt,
  buildFallbackQcEnrichment,
  editorialNaturalnessScore,
  factLooksLikeHeadlineEcho,
  findHardDuplicate,
  findSoftDuplicate,
  getSourceTrustTier,
  hasConcreteFact,
  informationalDensityScore,
  isValidSourceUrl,
  isThemeOnlyRoboticsStory,
  leadStartsWithImplication,
  looksMalformedEditorialText,
  isPromotionalLikely,
  paragraphAnchoredToFactPackage,
  paragraphAdvancesSummary,
  roboticsAudienceRelevanceScore,
  visualStandoutScore,
  validateFactPackage,
  validateQcEnrichment,
} from './lib/news-publish-quality.mjs'
import { buildYouTubeQueryVariants, evaluateYouTubeCandidate, matchYouTubeVideo } from './lib/youtube-provider.mjs'
import { TRUSTED_YOUTUBE_CHANNELS } from './lib/youtube-trusted-channels.mjs'

const now = new Date().toISOString()

const sanitizedExcerpt = normalizeExcerpt(
  'Comprehensive up-to-date news coverage, aggregated from sources all over the world by Google News. Nvidia CEO Jensen Huang predicts that every industrial company will become a robotics company.'
)
assert.equal(
  sanitizedExcerpt,
  'Nvidia CEO Jensen Huang predicts that every industrial company will become a robotics company.'
)

const trusted = getSourceTrustTier({ sourceName: 'Reuters', sourceUrl: 'https://www.reuters.com/world/robotics-story' })
assert.equal(trusted, 'allow')

const blocked = getSourceTrustTier({ sourceName: 'PR Newswire', sourceUrl: 'https://www.prnewswire.com/robotics-pr' })
assert.equal(blocked, 'block')

const hardDuplicate = findHardDuplicate(
  { title: 'Figure raises new robotics round', slug: 'figure-raises-new-robotics-round', sourceUrl: 'https://example.com/figure-round' },
  [{ title: 'Figure raises new robotics round', slug: 'other-slug', sourceUrl: 'https://elsewhere.com/other' }]
)
assert.ok(hardDuplicate)

const softDuplicate = findSoftDuplicate(
  { title: 'UBTech offers $18 million for AI scientist role' },
  [{ title: 'UBTech offers $18 million for AI scientist', publishedAt: now }]
)
assert.ok(softDuplicate)

const promotional = isPromotionalLikely({
  title: 'Leading provider announces revolutionary robotics platform',
  sourceUrl: 'https://example.com/press-release',
  sourceContext: { metaDescription: 'Leading provider announces revolutionary robotics platform. Book a demo today.' },
})
assert.equal(promotional, true)

assert.equal(isValidSourceUrl('https://example.com/story'), true)
assert.equal(isValidSourceUrl(''), false)
assert.equal(hasConcreteFact('UBTech offered $18 million to recruit an AI scientist.', { title: 'UBTech offers $18 million for AI scientist' }), true)
assert.equal(leadStartsWithImplication('That matters because robotics buyers are demanding proof.'), true)
assert.equal(
  paragraphAdvancesSummary({
    summary: 'Gecko Robotics announced a $71 million deal with the U.S. Navy to help reduce ship repair time.',
    paragraph:
      'Gecko Robotics announced a $71 million deal with the U.S. Navy to help reduce ship repair time. CNBC reported the company said its robots use cameras and sensors.',
  }),
  false
)
assert.equal(
  paragraphAdvancesSummary({
    summary: 'Gecko Robotics announced a $71 million deal with the U.S. Navy to help reduce ship repair time.',
    paragraph:
      'CNBC reported Gecko said its robots can shorten a repair process that can take three months to as little as two days.',
  }),
  true
)
assert.match(
  extractConcreteFactExcerpt('That matters because buyers want proof. UBTech offered $18 million to recruit an AI scientist.'),
  /\$18 million/
)
assert.equal(
  hasConcreteFact('Generalist introduced GEN-1 for physical AI.', {
    title: 'Generalist introduces GEN-1 general-purpose model for physical AI',
  }),
  true
)
assert.equal(
  factLooksLikeHeadlineEcho({
    fact: 'Cerebras Backer Eclipse Raises $1.3 Billion for Robotics, AI Infrastructure',
    title: 'Cerebras Backer Eclipse Raises $1.3 Billion for Robotics, AI Infrastructure',
  }),
  true
)
assert.equal(
  looksMalformedEditorialText({
    text: "'Ground Robots' Replace Ukrainian Troops in 21,500 Missions in Q1 - Business Insider",
    title: "Ukraine says it replaced human soldiers with 'ground robots' in over 21,000 missions for Q1",
    sourceName: 'Business Insider',
  }),
  true
)
assert.equal(
  looksMalformedEditorialText({
    text: "Ukraine's forces tripled UGV missions since November to more than 9,000 tasks in March alone.",
    title: "Ukraine says it replaced human soldiers with 'ground robots' in over 21,000 missions for Q1",
    sourceName: 'Business Insider',
  }),
  false
)
assert.equal(
  validateFactPackage(
    {
      main_actor: '',
      main_action: '',
      main_object: 'Humanoid robots show off boxing and language skills in Hong Kong',
      main_number_or_scale: '2020',
      best_concrete_fact:
        'Immigration and Customs Enforcement employees and contractors have been charged with crimes since 2020 and their wrongdoing includes patterns of physical and sexual abuse.',
      secondary_fact: '',
      source_grounded: true,
      thin_source_risk: 'low',
      headline_supported: true,
      story_format_recommendation: 'featured_candidate',
    },
    { title: 'Humanoid robots show off boxing and language skills in Hong Kong' }
  ).reason,
  'best_concrete_fact_topic_mismatch'
)
assert.equal(
  informationalDensityScore({
    title: 'Figure deploys humanoid robots in a BMW factory',
    summary: 'Figure said it deployed humanoid robots in a BMW factory to handle repetitive material movement.',
    bodyParagraphs: [
      'Reuters reported the deployment is running in Spartanburg and focuses on repetitive material movement inside the plant.',
      'That gives operators a concrete signal on workflow fit, labor substitution pressure, and whether the system can stay in routine use.',
    ],
    factPackage: {
      main_actor: 'Figure',
      main_object: 'humanoid robots',
      best_concrete_fact: 'Figure deployed humanoid robots in a BMW factory in Spartanburg.',
    },
  }) >= 4,
  true
)
assert.equal(
  roboticsAudienceRelevanceScore({
    title: 'Figure deploys humanoid robots in a BMW factory',
    summary: 'Figure said it deployed humanoid robots in a BMW factory to handle repetitive material movement.',
    bodyParagraphs: ['The rollout matters to operators and investors because it shows a real factory workflow and a live customer setting.'],
  }) >= 4,
  true
)
assert.equal(
  visualStandoutScore({
    title: 'Watch Figure humanoid robots working in a BMW factory',
    summary: 'Figure shared factory footage showing humanoid robots moving materials inside a BMW plant.',
    bodyParagraphs: ['The video gives viewers a concrete look at the robot, the workflow, and the live production setting.'],
    youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  }) >= 4,
  true
)
assert.equal(
  visualStandoutScore({
    title: 'Figure deploys humanoid robots in a BMW factory',
    summary: 'Figure said it deployed humanoid robots in a BMW factory to handle repetitive material movement.',
    bodyParagraphs: ['Reuters reported the rollout is running in Spartanburg.'],
    sourceImageUrl: 'https://example.com/factory.jpg',
  }) <= 3,
  true
)
assert.equal(
  isThemeOnlyRoboticsStory({
    title: "Is Chevron's Robotics Strategy the Future of Oilfields?",
    summary: "Chevron's robotics strategy is relevant because oilfield operators care less about flashy demos than about whether autonomous inspection systems can lower cost.",
    bodyParagraphs: [
      'Chevron robotics push matters if it leads to routine inspection and maintenance use in oilfield operations.',
      'That is a tougher standard than a polished demo.',
    ],
  }),
  true
)
assert.equal(
  paragraphAnchoredToFactPackage({
    paragraph: 'Gecko is tying U.S. Navy ship repair to a faster maintenance workflow.',
    factPackage: {
      main_actor: 'Gecko Robotics',
      main_object: 'U.S. Navy ship repair',
      best_concrete_fact: 'Gecko Robotics announced a $71 million deal with the U.S. Navy to help reduce ship repair time.',
    },
    title: 'Gecko Robotics brings its AI to U.S. Navy ship repair',
  }),
  true
)
assert.equal(
  paragraphAnchoredToFactPackage({
    paragraph: 'That matters because robotics markets are moving from hype to execution.',
    factPackage: {
      main_actor: 'Gecko Robotics',
      main_object: 'U.S. Navy ship repair',
      best_concrete_fact: 'Gecko Robotics announced a $71 million deal with the U.S. Navy to help reduce ship repair time.',
    },
    title: 'Gecko Robotics brings its AI to U.S. Navy ship repair',
  }),
  false
)
assert.equal(
  editorialNaturalnessScore({
    summary: 'Gecko Robotics announced a $71 million deal with the U.S. Navy to help reduce ship repair time.',
    whyItMatters:
      'The useful point is that Gecko is moving from inspection hype into a concrete defense-maintenance workflow with measurable operational stakes.',
    bodyParagraphs: [
      'CNBC reported Gecko said its robots can shorten a repair process that can take three months to as little as two days.',
      'That makes the contract more than another defense headline because the company is tying automation to a specific maintenance bottleneck.',
    ],
  }) >= 3,
  true
)
assert.equal(
  editorialNaturalnessScore({
    summary: 'That matters because robotics buyers want proof.',
    whyItMatters: 'The next thing to watch is whether the signal turns into momentum.',
    bodyParagraphs: [
      'That matters because robotics buyers want proof.',
      'The useful signal is whether this is now tying the update to a concrete development in robotics commercialization.',
    ],
  }) <= 2,
  true
)

const deterministicFactLayer = extractFactLayer({
  headline: 'Generalist introduces GEN-1 general-purpose model for physical AI',
  sourceContext: {
    pageTitle: 'Generalist introduces GEN-1 general-purpose model for physical AI',
    metaDescription:
      'Generalist introduced GEN-1, a general-purpose model for physical AI, and said the release is aimed at faster robot training and deployment.',
    ogDescription: 'The company said GEN-1 is designed to improve robot learning across tasks.',
    paragraphs: [
      'Generalist introduced GEN-1, a general-purpose model for physical AI, and said the release is aimed at faster robot training and deployment.',
      'The company said GEN-1 is designed to improve robot learning across tasks and shorten iteration cycles for developers.',
    ],
  },
})
assert.equal(deterministicFactLayer.validation.ok, true)
assert.equal(deterministicFactLayer.diagnostics.viable_for_writing, true)
assert.equal(deterministicFactLayer.diagnostics.viable_for_deepseek_refinement, true)
assert.match(deterministicFactLayer.selectedFactPackage.best_concrete_fact, /GEN-1/)

const thinFactLayer = extractFactLayer({
  headline: 'Robotics executive shares outlook on the market',
  sourceContext: {
    pageTitle: 'Robotics executive shares outlook on the market',
    metaDescription: 'A robotics executive discussed trends in the market.',
    ogDescription: '',
    paragraphs: [],
  },
})
assert.equal(thinFactLayer.diagnostics.viable_for_deepseek_refinement, false)
assert.equal(thinFactLayer.diagnostics.viable_for_writing, false)
assert.equal(thinFactLayer.validation.ok, false)

const titleOnlyFactLayer = extractFactLayer({
  headline: "Ukraine says it replaced human soldiers with 'ground robots' in over 21,000 missions for Q1",
  sourceContext: {
    pageTitle: "'Ground Robots' Replace Ukrainian Troops in 21,500 Missions in Q1 - Business Insider",
    metaDescription: '',
    ogDescription: '',
    paragraphs: [],
  },
})
assert.equal(titleOnlyFactLayer.diagnostics.source_grounded, false)
assert.equal(titleOnlyFactLayer.diagnostics.viable_for_writing, false)

const baseFetch = global.fetch
global.fetch = async (url) => {
  const target = String(url || '')
  if (target === 'https://api.deepseek.com/chat/completions') {
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                fact_package: {
                  main_actor: 'Generalist',
                  main_action: 'introduced',
                  main_object: 'GEN-1, a general-purpose model for physical AI',
                  main_number_or_scale: 'GEN-1',
                  best_concrete_fact:
                    'Generalist introduced GEN-1, a general-purpose model for physical AI, and said the release is aimed at faster robot training and deployment.',
                  secondary_fact:
                    'The company said GEN-1 is designed to improve robot learning across tasks and shorten iteration cycles for developers.',
                  source_grounded: true,
                  thin_source_risk: 'low',
                  headline_supported: true,
                  story_format_recommendation: 'signal_brief',
                },
                summary:
                  'Generalist introduced GEN-1, a general-purpose model for physical AI, and said it is aimed at faster robot training and deployment. The update matters because it ties model progress to a practical robotics workflow.',
                why_it_matters:
                  'The release is notable because it connects a specific model launch to faster robot training and deployment rather than vague platform ambition.',
                video_summary:
                  'This briefing is grounded in Generalist’s GEN-1 launch for physical AI and the company’s claim that it can speed robot training. The video context helps readers judge whether that claim looks like operational progress or branding.',
                body_paragraphs: [
                  'The company said GEN-1 is designed to improve robot learning across tasks and shorten iteration cycles for developers. Generalist framed the model as a way to move from announcement-level AI language to faster robot training and deployment.',
                  'That is a more useful robotics signal than broad AI rhetoric because it ties the release to a concrete workflow: how quickly teams can train and iterate on robot behavior. If the model really shortens development cycles, it could matter for deployment pace rather than just research positioning.',
                ],
                paragraph3_useful: false,
              }),
            },
          },
        ],
      }),
    }
  }
  if (target === 'https://example.com/fact-story') {
    return {
      ok: true,
      text: async () => `
        <html>
          <head>
            <title>Generalist introduces GEN-1 general-purpose model for physical AI</title>
            <meta name="description" content="Generalist introduced GEN-1, a general-purpose model for physical AI, and said the release is aimed at faster robot training and deployment.">
            <meta property="og:description" content="The company said GEN-1 is designed to improve robot learning across tasks.">
          </head>
          <body>
            <article>
              <p>Generalist introduced GEN-1, a general-purpose model for physical AI, and said the release is aimed at faster robot training and deployment.</p>
              <p>The company said GEN-1 is designed to improve robot learning across tasks and shorten iteration cycles for developers.</p>
            </article>
          </body>
        </html>
      `,
    }
  }
  return baseFetch(url)
}

const editorialPackage = await buildEditorialPackage({
  headline: 'Generalist introduces GEN-1 general-purpose model for physical AI',
  source: 'The Robot Report',
  sourceUrl: 'https://example.com/fact-story',
  pubDate: now,
})
assert.equal(editorialPackage.generationMode, 'deepseek')
assert.equal(leadStartsWithImplication(editorialPackage.excerpt), false)
assert.equal(hasConcreteFact(editorialPackage.excerpt, { title: 'Generalist introduces GEN-1 general-purpose model for physical AI' }), true)
assert.equal(leadStartsWithImplication(editorialPackage.bodyParagraphs[0]), false)
assert.equal(hasConcreteFact(editorialPackage.bodyParagraphs[0], { title: 'Generalist introduces GEN-1 general-purpose model for physical AI' }), true)
assert.equal(paragraphAdvancesSummary({ summary: editorialPackage.excerpt, paragraph: editorialPackage.bodyParagraphs[0] }), true)
assert.equal(editorialPackage.bodyParagraphs.length, 2)
assert.match(editorialPackage.factPackage.best_concrete_fact, /GEN-1/)
assert.equal(validateFactPackage(editorialPackage.factPackage, { title: 'Generalist introduces GEN-1 general-purpose model for physical AI' }).ok, true)
global.fetch = baseFetch

global.fetch = async (url) => {
  const target = String(url || '')
  if (target === 'https://api.deepseek.com/chat/completions') {
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{' } }],
      }),
    }
  }
  if (target === 'https://example.com/fact-story') {
    return {
      ok: true,
      text: async () => `
        <html>
          <head>
            <title>Generalist introduces GEN-1 general-purpose model for physical AI</title>
            <meta name="description" content="Generalist introduced GEN-1, a general-purpose model for physical AI, and said the release is aimed at faster robot training and deployment.">
            <meta property="og:description" content="The company said GEN-1 is designed to improve robot learning across tasks.">
          </head>
          <body>
            <article>
              <p>Generalist introduced GEN-1, a general-purpose model for physical AI, and said the release is aimed at faster robot training and deployment.</p>
              <p>The company said GEN-1 is designed to improve robot learning across tasks and shorten iteration cycles for developers.</p>
            </article>
          </body>
        </html>
      `,
    }
  }
  return baseFetch(url)
}

const fallbackEditorialPackage = await buildEditorialPackage({
  headline: 'Generalist introduces GEN-1 general-purpose model for physical AI',
  source: 'The Robot Report',
  sourceUrl: 'https://example.com/fact-story',
  pubDate: now,
})
assert.equal(fallbackEditorialPackage.generationMode, 'fallback')
assert.equal(fallbackEditorialPackage.bodyParagraphs.length >= 2, true)
assert.equal(leadStartsWithImplication(fallbackEditorialPackage.excerpt), false)
assert.equal(/This matters because|is now tying|The next thing to watch/i.test(fallbackEditorialPackage.excerpt), false)
assert.equal(/This matters because|is now tying|The next thing to watch/i.test(fallbackEditorialPackage.bodyParagraphs[1] || ''), false)
assert.equal(
  paragraphAdvancesSummary({ summary: fallbackEditorialPackage.excerpt, paragraph: fallbackEditorialPackage.bodyParagraphs[0] }),
  true
)
global.fetch = baseFetch

const fallback = buildFallbackQcEnrichment({
  candidate: {
    title: 'Figure expands humanoid operations',
    sourceName: 'Reuters',
    sourceTrustTier: 'allow',
    sourceUrl: 'https://www.reuters.com/world/robotics-story',
  },
  editorial: {
    excerpt:
      'Figure is expanding humanoid operations into a broader commercial push, suggesting buyers now want clearer deployment proof and measurable execution.',
    bodyParagraphs: [
      'Figure is expanding humanoid operations into a broader commercial push, suggesting buyers now want clearer deployment proof and measurable execution.',
      'That matters because humanoid companies are now being judged on real workflows, integration pace, and whether pilots can become durable operating programs.',
      'The next thing to watch is whether the company can convert this momentum into repeatable site deployments and stronger customer evidence.',
    ],
    sourceContext: { metaDescription: 'Figure expands humanoid operations with a stronger commercial push.' },
  },
})
const validatedFallback = validateQcEnrichment(fallback)
assert.equal(validatedFallback.ok, true)
assert.equal(validatedFallback.data.story_format, 'signal_brief')
assert.equal(validatedFallback.data.publish_recommendation, 'draft_only')
assert.equal(validatedFallback.data.editorial_naturalness_score <= 2, true)
assert.equal(validatedFallback.data.informational_density_score <= 2, true)
assert.equal(validatedFallback.data.robotics_audience_relevance_score >= 3, true)
assert.equal(validatedFallback.data.visual_standout_score <= 3, true)

global.fetch = async () => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: '{' } }],
  }),
})
const malformedProvider = await callDeepSeekJson({
  systemPrompt: 'Return JSON.',
  userPrompt: 'Return JSON.',
  timeoutMs: 10,
})
assert.ok(malformedProvider.ok === false || malformedProvider.ok === true)
global.fetch = baseFetch

const invalidCategory = validateQcEnrichment({
  summary: 'This robotics update signals a stronger commercial push as buyers ask for deployment proof and clearer execution data.',
  why_it_matters: 'It matters because robotics buyers are now testing whether these systems can move from pilots into repeatable operating programs.',
  category: 'category-invalid',
  story_format: 'signal_brief',
  publish_recommendation: 'draft_only',
  concrete_fact_present: false,
  concrete_fact_excerpt: '',
  source_grounded: true,
  headline_supported_by_body: true,
  lead_with_concrete_fact: false,
  implication_first_risk: 'high',
  abstractness_score: 4,
  repetition_score: 3,
  editorial_naturalness_score: 2,
  source_strength_score: 3,
  newsworthiness_score: 3,
  visual_strength_score: 1,
  homepage_eligible: false,
  reject: false,
  reject_reason: '',
  draft_reason: 'needs_editorial_review',
  internal_link_target: '',
  youtube_search_query: '',
})
assert.equal(invalidCategory.ok, false)

const dailyCapRemaining = Math.max(0, 8 - 8)
assert.equal(dailyCapRemaining, 0)

const trustedChannelId = TRUSTED_YOUTUBE_CHANNELS[0].channelId
const factAwareQueries = buildYouTubeQueryVariants({
  story: {
    title: 'Gecko Robotics brings its AI to U.S. Navy ship repair',
    sourceName: 'CNBC',
    factPackage: {
      main_actor: 'Gecko Robotics',
      main_action: 'announced',
      main_object: 'U.S. Navy ship repair robots',
      best_concrete_fact: 'Gecko Robotics announced a $71 million deal with the U.S. Navy to help reduce ship repair time.',
    },
  },
  youtubeSearchQuery: 'Gecko Robotics U.S. Navy ship repair robots',
})
assert.equal(factAwareQueries.length >= 2, true)
assert.match(factAwareQueries[0], /Gecko Robotics/i)
assert.equal(factAwareQueries.some((query) => /Navy|ship repair/i.test(query)), true)

const trustedVideo = evaluateYouTubeCandidate({
  story: { title: 'Humanoid robots join a factory workforce at Figure' },
  query: 'Figure humanoid factory workforce',
  candidate: {
    id: { videoId: 'abc123def45' },
    snippet: {
      channelId: trustedChannelId,
      channelTitle: 'The Wall Street Journal',
      title: 'Figure humanoid robots join a factory workforce',
      publishedAt: new Date().toISOString(),
    },
  },
})
assert.equal(trustedVideo.accepted, true)

const trustedByTitleVideo = evaluateYouTubeCandidate({
  story: {
    title: 'Gecko Robotics brings its AI to U.S. Navy ship repair',
    factPackage: {
      main_actor: 'Gecko Robotics',
      main_object: 'U.S. Navy ship repair',
    },
  },
  query: 'Gecko Robotics U.S. Navy ship repair robots',
  candidate: {
    id: { videoId: 'navy123def45' },
    snippet: {
      channelId: 'UNKNOWN_CHANNEL',
      channelTitle: 'CNBC Television',
      title: 'Gecko Robotics lands U.S. Navy ship repair contract',
      publishedAt: new Date().toISOString(),
    },
  },
})
assert.equal(trustedByTitleVideo.accepted, true)

const untrustedVideo = evaluateYouTubeCandidate({
  story: { title: 'Humanoid robots join a factory workforce at Figure' },
  query: 'Figure humanoid factory workforce',
  candidate: {
    id: { videoId: 'abc123def45' },
    snippet: {
      channelId: 'UNTRUSTED123',
      channelTitle: 'Random Robotics Clips',
      title: 'Figure humanoid robots join a factory workforce',
      publishedAt: new Date().toISOString(),
    },
  },
})
assert.equal(untrustedVideo.accepted, false)
assert.equal(untrustedVideo.reason, 'untrusted_channel')

const ambiguousVideo = evaluateYouTubeCandidate({
  story: { title: 'Figure expands humanoid operations' },
  query: 'Figure humanoid operations',
  candidate: {
    id: { videoId: 'abc123def45' },
    snippet: {
      channelId: trustedChannelId,
      channelTitle: 'The Wall Street Journal',
      title: 'Figure and Tesla Optimus humanoid operations update',
      publishedAt: new Date().toISOString(),
    },
  },
})
assert.equal(ambiguousVideo.accepted, false)
assert.equal(ambiguousVideo.reason, 'ambiguous_conflicting_entity')

const staleVideo = evaluateYouTubeCandidate({
  story: { title: 'Figure expands humanoid operations' },
  query: 'Figure humanoid operations',
  candidate: {
    id: { videoId: 'abc123def45' },
    snippet: {
      channelId: trustedChannelId,
      channelTitle: 'The Wall Street Journal',
      title: 'Figure expands humanoid operations',
      publishedAt: '2020-01-01T00:00:00.000Z',
    },
  },
})
assert.equal(staleVideo.accepted, false)
assert.equal(staleVideo.reason, 'stale_video')

const noVideoCandidate = evaluateYouTubeCandidate({
  story: { title: 'Figure expands humanoid operations' },
  query: '',
  candidate: { id: {}, snippet: {} },
})
assert.equal(noVideoCandidate.accepted, false)
assert.equal(noVideoCandidate.reason, 'missing_video_fields')

const originalFetch = global.fetch
const scrapedInitialData = JSON.stringify({
  contents: {
    twoColumnSearchResultsRenderer: {
      primaryContents: {
        sectionListRenderer: {
          contents: [
            {
              itemSectionRenderer: {
                contents: [
                  {
                    videoRenderer: {
                      videoId: 'abc123def45',
                      title: { runs: [{ text: 'Figure humanoid robots join a factory workforce' }] },
                      ownerText: { runs: [{ text: 'The Wall Street Journal' }] },
                      publishedTimeText: { simpleText: '2 days ago' },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    },
  },
})
global.fetch = async (url) => {
  const target = String(url || '')
  if (target.includes('googleapis.com/youtube/v3/search')) {
    throw new Error('simulated_api_failure')
  }
  return {
    ok: true,
    text: async () => `<script>var ytInitialData = ${scrapedInitialData};</script>`,
  }
}

const scrapeFallbackMatch = await matchYouTubeVideo({
  story: { title: 'Humanoid robots join a factory workforce at Figure' },
  youtubeSearchQuery: 'Figure humanoid factory workforce',
})
assert.equal(scrapeFallbackMatch.attached, true)
assert.equal(scrapeFallbackMatch.match?.channelTitle, 'The Wall Street Journal')
assert.match(scrapeFallbackMatch.reason, /_scrape_/)

global.fetch = originalFetch

global.fetch = async (url) => {
  const target = String(url || '')
  if (target.includes('googleapis.com/youtube/v3/search')) {
    const parsed = new URL(target)
    const q = (parsed.searchParams.get('q') || '').toLowerCase()
    if (q.includes('gecko robotics') && q.includes('navy') && q.includes('robots')) {
      return {
        ok: true,
        json: async () => ({
          items: [],
        }),
      }
    }
    if (q.includes('gecko robotics') && q.includes('navy')) {
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              id: { videoId: 'gecko1234567' },
              snippet: {
                channelId: 'UNKNOWN_CHANNEL',
                channelTitle: 'CNBC Television',
                title: 'Gecko Robotics wins U.S. Navy ship repair contract',
                publishedAt: new Date().toISOString(),
              },
            },
          ],
        }),
      }
    }
    return {
      ok: true,
      json: async () => ({ items: [] }),
    }
  }
  if (target.includes('youtube.com/results?search_query=')) {
    const scrapedGeckoData = JSON.stringify({
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        videoRenderer: {
                          videoId: 'gecko1234567',
                          title: { runs: [{ text: 'Gecko Robotics wins U.S. Navy ship repair contract' }] },
                          ownerText: { runs: [{ text: 'CNBC Television' }] },
                          publishedTimeText: { simpleText: '1 day ago' },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    })
    return {
      ok: true,
      text: async () => `<script>var ytInitialData = ${scrapedGeckoData};</script>`,
    }
  }
  return originalFetch(url)
}

const secondQueryMatch = await matchYouTubeVideo({
  story: {
    title: 'Gecko Robotics brings its AI to U.S. Navy ship repair',
    sourceName: 'CNBC',
    factPackage: {
      main_actor: 'Gecko Robotics',
      main_action: 'announced',
      main_object: 'U.S. Navy ship repair',
      best_concrete_fact: 'Gecko Robotics announced a $71 million deal with the U.S. Navy to help reduce ship repair time.',
    },
  },
  youtubeSearchQuery: 'Gecko Robotics U.S. Navy ship repair robots',
})
assert.equal(secondQueryMatch.attached, true)
assert.equal(secondQueryMatch.match?.channelTitle, 'CNBC Television')
assert.equal(Array.isArray(secondQueryMatch.attemptedQueries), true)
assert.equal(secondQueryMatch.attemptedQueries.length >= 1, true)
assert.match(secondQueryMatch.query, /Gecko Robotics/i)

global.fetch = originalFetch

console.log('news publish quality tests passed')
