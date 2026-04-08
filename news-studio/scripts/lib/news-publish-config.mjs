const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const RSS_URL =
  process.env.NEWS_RSS_URL || 'https://news.google.com/rss/search?q=robotics&hl=en-US&gl=US&ceid=US:en'

export const NEWS_MAX_POSTS_PER_DAY = parsePositiveNumber(process.env.NEWS_MAX_POSTS_PER_DAY, 8)
export const NEWS_PUBLISH_BATCH_LIMIT = parsePositiveNumber(process.env.PUBLISH_COUNT, 8)
export const NEWS_MIN_INFORMATIONAL_DENSITY = parsePositiveNumber(process.env.NEWS_MIN_INFORMATIONAL_DENSITY, 3)
export const NEWS_MIN_AUDIENCE_RELEVANCE = parsePositiveNumber(process.env.NEWS_MIN_AUDIENCE_RELEVANCE, 3)
export const NEWS_RECENT_DUPLICATE_WINDOW_DAYS = parsePositiveNumber(
  process.env.NEWS_RECENT_DUPLICATE_WINDOW_DAYS,
  7
)
export const NEWS_SOURCE_FETCH_TIMEOUT_MS = parsePositiveNumber(process.env.NEWS_SOURCE_FETCH_TIMEOUT_MS, 12_000)
export const NEWS_DEEPSEEK_TIMEOUT_MS = parsePositiveNumber(process.env.NEWS_DEEPSEEK_TIMEOUT_MS, 20_000)
export const YOUTUBE_MAX_CANDIDATES = parsePositiveNumber(process.env.YOUTUBE_MAX_CANDIDATES, 5)
export const YOUTUBE_MAX_VIDEO_AGE_DAYS = parsePositiveNumber(process.env.YOUTUBE_MAX_VIDEO_AGE_DAYS, 45)
export const YOUTUBE_REQUIRE_TRUSTED_CHANNEL = String(process.env.YOUTUBE_REQUIRE_TRUSTED_CHANNEL || '1') !== '0'
export const YOUTUBE_ENABLE_SCRAPE_FALLBACK = String(process.env.YOUTUBE_ENABLE_SCRAPE_FALLBACK || '1') !== '0'

export const TAXONOMY = [
  {
    id: 'category-humanoid-robots',
    title: 'Humanoid Robots',
    keywords: ['humanoid', 'biped', 'optimus', 'figure', 'digit', 'apollo', 'agibot', 'ubtech', 'warehouse'],
  },
  {
    id: 'category-quadruped-robots',
    title: 'Quadruped Robots',
    keywords: ['quadruped', 'robot dog', 'spot', 'inspection', 'patrol'],
  },
  {
    id: 'category-robotics-startups',
    title: 'Robotics Startups',
    keywords: ['funding', 'startup', 'capital', 'valuation', 'raises', 'company', 'market', 'commercial'],
  },
]

export const TAXONOMY_BY_ID = new Map(TAXONOMY.map((entry) => [entry.id, entry]))
export const TAXONOMY_IDS = TAXONOMY.map((entry) => entry.id)

export const INTERNAL_LINK_ALLOWLIST = new Set([
  'https://robot.tv/humanoid-robots.html',
  'https://robot.tv/china-humanoid-robots.html',
  'https://robot.tv/warehouse-humanoid-robots.html',
  'https://robot.tv/industrial-inspection-robots.html',
  'https://robot.tv/robotics-startup-execution.html',
  'https://robot.tv/physical-ai-robot-learning.html',
  'https://robot.tv/company-figure.html',
  'https://robot.tv/company-unitree.html',
  'https://robot.tv/company-agility.html',
  'https://robot.tv/company-apptronik.html',
  'https://robot.tv/company-tesla.html',
  'https://robot.tv/unitree-robots.html',
  'https://robot.tv/tesla-optimus.html',
])

export const SOURCE_TRUST = {
  allow: {
    names: new Set([
      'Reuters',
      'TechCrunch',
      'The Robot Report',
      'Business Insider',
      'The Guardian',
      'Janes',
      'Bloomberg',
      'BBC',
      'CNN',
      'The Wall Street Journal',
      'Wall Street Journal',
      'Financial Times',
      'Associated Press',
      'AP',
      'CNBC',
      'VentureBeat',
      'IEEE Spectrum',
    ]),
    domains: new Set([
      'reuters.com',
      'techcrunch.com',
      'therobotreport.com',
      'businessinsider.com',
      'theguardian.com',
      'janes.com',
      'bloomberg.com',
      'bbc.com',
      'cnn.com',
      'wsj.com',
      'ft.com',
      'apnews.com',
      'cnbc.com',
      'venturebeat.com',
      'spectrum.ieee.org',
    ]),
  },
  caution: {
    names: new Set(['Yahoo Finance', 'Forbes', 'Interesting Engineering', 'New Atlas']),
    domains: new Set(['finance.yahoo.com', 'forbes.com', 'interestingengineering.com', 'newatlas.com']),
  },
  block: {
    names: new Set(['PR Newswire', 'Business Wire', 'GlobeNewswire', 'OpenPR']),
    domains: new Set([
      'prnewswire.com',
      'businesswire.com',
      'globenewswire.com',
      'openpr.com',
      'accessnewswire.com',
      'einnews.com',
      'medium.com',
    ]),
  },
}

export const SOURCE_TRUST_SCORES = {
  allow: 3,
  caution: 1,
  unknown: 0,
  block: -10,
}

export const COMPANY_ENTITY_TOKENS = [
  'tesla',
  'optimus',
  'unitree',
  'boston dynamics',
  'atlas',
  'spot',
  'figure',
  'figure ai',
  'agility robotics',
  'digit',
  'apptronik',
  'apollo',
  '1x',
  'neo',
  'ubtech',
  'xiaomi',
  'toyota',
  'agibot',
  'picknik',
  'intel',
  'realsense',
  'sanctuary ai',
]

export const HIGH_SIGNAL_PATTERN =
  /\b(deploy(?:ment|s)?|pilot|factory|warehouse|supply chain|manufactur(?:e|ing)|funding|raises?|valuation|acquires?|acquisition|partners?|rolls out|milestone|orders?|production|commerciali[sz]ation|teleop|dexter|surgical|vision|foundation model|humanoid)\b/i

export const PROMOTIONAL_PATTERN =
  /\b(announces?|introduces?|launches?|unveils?|excited to|proud to|leading provider|revolutionary|game[- ]changing|industry-leading|world['’]s first|register now|on sale|early bird|sponsored)\b/i

export const LOW_VALUE_DOMAIN_PATTERN =
  /(prnewswire|businesswire|globenewswire|openpr|accessnewswire|einnews)\./i

export const DEEPSEEK_ENV = {
  apiKey: String(process.env.DEEPSEEK_API_KEY || '').trim(),
  apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  timeoutMs: NEWS_DEEPSEEK_TIMEOUT_MS,
}

export const YOUTUBE_ENV = {
  apiKey: String(process.env.YOUTUBE_API_KEY || '').trim(),
  apiUrl: process.env.YOUTUBE_API_URL || 'https://www.googleapis.com/youtube/v3/search',
  maxCandidates: YOUTUBE_MAX_CANDIDATES,
  maxVideoAgeDays: YOUTUBE_MAX_VIDEO_AGE_DAYS,
  requireTrustedChannel: YOUTUBE_REQUIRE_TRUSTED_CHANNEL,
  enableScrapeFallback: YOUTUBE_ENABLE_SCRAPE_FALLBACK,
}

export const isValidCategoryId = (value) => TAXONOMY_BY_ID.has(String(value || '').trim())

export const validateInternalLinkTarget = (value) =>
  !String(value || '').trim() || INTERNAL_LINK_ALLOWLIST.has(String(value || '').trim())
