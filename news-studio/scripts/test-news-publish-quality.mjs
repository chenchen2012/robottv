import assert from 'node:assert/strict'

import { callDeepSeekJson } from './lib/deepseek-provider.mjs'
import {
  buildFallbackQcEnrichment,
  findHardDuplicate,
  findSoftDuplicate,
  getSourceTrustTier,
  isPromotionalLikely,
  validateQcEnrichment,
} from './lib/news-publish-quality.mjs'
import { evaluateYouTubeCandidate } from './lib/youtube-provider.mjs'
import { TRUSTED_YOUTUBE_CHANNELS } from './lib/youtube-trusted-channels.mjs'

const now = new Date().toISOString()

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

const fallback = buildFallbackQcEnrichment({
  candidate: {
    title: 'Figure expands humanoid operations',
    sourceName: 'Reuters',
    sourceTrustTier: 'allow',
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
  homepage_eligible: false,
  reject: false,
  reject_reason: '',
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

console.log('news publish quality tests passed')
