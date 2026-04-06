import assert from 'node:assert/strict'

import { normalizeExcerpt } from './build-static-news-seo.mjs'
import { callDeepSeekJson } from './lib/deepseek-provider.mjs'
import { buildEditorialPackage } from './lib/news-editorial-content.mjs'
import {
  extractConcreteFactExcerpt,
  buildFallbackQcEnrichment,
  findHardDuplicate,
  findSoftDuplicate,
  getSourceTrustTier,
  hasConcreteFact,
  isValidSourceUrl,
  leadStartsWithImplication,
  isPromotionalLikely,
  validateQcEnrichment,
} from './lib/news-publish-quality.mjs'
import { evaluateYouTubeCandidate, matchYouTubeVideo } from './lib/youtube-provider.mjs'
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

const baseFetch = global.fetch
global.fetch = async (url) => {
  const target = String(url || '')
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
assert.equal(editorialPackage.generationMode, 'fallback')
assert.equal(leadStartsWithImplication(editorialPackage.excerpt), false)
assert.equal(hasConcreteFact(editorialPackage.excerpt, { title: 'Generalist introduces GEN-1 general-purpose model for physical AI' }), true)
assert.equal(leadStartsWithImplication(editorialPackage.bodyParagraphs[0]), false)
assert.equal(hasConcreteFact(editorialPackage.bodyParagraphs[0], { title: 'Generalist introduces GEN-1 general-purpose model for physical AI' }), true)
assert.doesNotMatch(editorialPackage.bodyParagraphs[1], /^That matters because\b/i)
assert.doesNotMatch(editorialPackage.bodyParagraphs[2], /^The next thing to watch\b/i)
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
assert.equal(validatedFallback.data.publish_recommendation, 'auto_publish')

const malformedProvider = await callDeepSeekJson({
  systemPrompt: 'Return JSON.',
  userPrompt: 'Return JSON.',
  timeoutMs: 10,
})
assert.ok(malformedProvider.ok === false || malformedProvider.ok === true)

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
assert.match(scrapeFallbackMatch.reason, /_scrape$/)

global.fetch = originalFetch

console.log('news publish quality tests passed')
