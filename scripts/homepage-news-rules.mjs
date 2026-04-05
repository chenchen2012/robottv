const hiddenHomepageListingSlugs = [
  "biggest-ai-news-today",
  "the-biggest-robot-news-today",
  "robots-learn-faster-with-new-ai-techniques",
  "alphabet-owned-robotics-software-company-intrinsic-joins-google",
  "amazon-halts-blue-jay-robotics-project-after-less-than-6-months",
  "11-women-shaping-the-future-of-robotics",
  "amazon-cuts-jobs-in-strategically-important-robotics-division",
  "amazon-cuts-more-jobs-this-time-in-robotics-unit",
  "aw-2026-features-korea-humanoid-debuts-as-industry-seeks-digital-transformation",
  "breakingviews-hyundai-motors-robots-herald-hardware-reboot",
  "chinas-dancing-robots-how-worried-should-we-be",
  "dancing-robots-bring-support-company-to-barcelona-elderly",
  "hyundai-motor-to-unveil-multi-billion-dollar-investment-in-south-korea-source-says",
  "hyundai-to-show-mobed-at-aw-as-robotics-ai-expand-in-manufacturing",
  "inside-project-kobe-amazons-plan-to-build-walmart-style-supercenters-powered-by-warehouse-",
  "tesollo-commercializes-its-lightweight-compact-robotic-hand-for-humanoids",
  "the-cows-beat-the-shit-out-of-the-robots-the-first-day-the-tech-revolution-designed-to-imp",
]

const demotedHomepageListingSlugs = [
  "inside-the-new-living-lab-advancing-agricultural-robotics",
]

export const hiddenHomepageSlugs = new Set(hiddenHomepageListingSlugs)
export const demotedHomepageSlugs = new Set(demotedHomepageListingSlugs)
export const homepageLeadFeaturePreferredSlugs = new Set([])
export const homepageVisualFeaturePreferredSlugs = new Set([])
export const homepageTextSignalPreferredSlugs = new Set([])

export const normalizeHomepageSlug = (slug) => String(slug || "").trim().replace(/^\/+|\/+$/g, "")

const normalizeCompareText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

export const normalizeHomepageListingTitle = (value) =>
  normalizeCompareText(value)
    .split(" ")
    .filter(
      (word) =>
        word &&
        !["the", "a", "an", "and", "for", "to", "of", "in", "on", "with", "after", "than"].includes(word)
    )
    .slice(0, 8)
    .join(" ")

export const filterVisibleHomepageListingPosts = (posts) =>
  posts.filter((post) => !hiddenHomepageSlugs.has(normalizeHomepageSlug(post?.slug)))

export const dedupeHomepageListingPosts = (posts) => {
  const seen = new Set()
  return posts.filter((post) => {
    const key = normalizeHomepageListingTitle(post?.title)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const sortHomepageListingPostsByPublishedAtDesc = (posts) =>
  [...posts].sort((a, b) => {
    const aDemoted = demotedHomepageSlugs.has(normalizeHomepageSlug(a?.slug))
    const bDemoted = demotedHomepageSlugs.has(normalizeHomepageSlug(b?.slug))
    if (aDemoted !== bDemoted) return aDemoted ? 1 : -1
    const aTime = new Date(a?.publishedAt || 0).getTime()
    const bTime = new Date(b?.publishedAt || 0).getTime()
    return bTime - aTime
  })

export const getHomepageListingPosts = (posts) =>
  dedupeHomepageListingPosts(sortHomepageListingPostsByPublishedAtDesc(filterVisibleHomepageListingPosts(posts)))

export const hasHomepageEmbeddedVideo = (post) => {
  const text = String(post?.youtubeUrl || "").trim()
  if (!text) return false
  return Boolean(
    (text.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || [])[1] ||
      (text.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
      (text.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
      (text.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
      (text.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/) || [])[1]
  )
}

const normalizeTopicToken = (value) =>
  normalizeCompareText(value)
    .replace(/\brobotics\b/g, "robotics")
    .trim()

const prominentHomepageSources = new Set([
  "reuters",
  "techcrunch",
  "bloomberg",
  "financial times",
  "the wall street journal",
  "wall street journal",
  "associated press",
  "ap",
  "business insider",
  "the robot report",
])

const priorityHomepageTopics = new Set([
  "humanoids",
  "warehouse robotics",
  "operations",
  "robotics business",
  "physical ai",
  "autonomy",
  "manufacturing",
  "industrial robotics",
  "china",
])

const homepageHighSignalPattern =
  /\b(deploy(?:ment|s)?|pilot|factory|warehouse|supply chain|manufactur(?:e|ing)|funding|raises?|valuation|acquires?|acquisition|partners?|rolls out|milestone|orders?|production|commerciali[sz]ation|teleop|dexter|surgical|vision|foundation model|humanoid)\b/i

const homepageConcreteFactPattern =
  /\b(\$[\d,.]+(?:\s?(?:m|b|million|billion))?|\d[\d,]*(?:st|nd|rd|th)?|digit|ubtech|figure|agibot|amazon|google|intel|toyota|picknik|surgery|humanoid)\b/i

const hoursSincePublished = (post) => {
  const publishedAt = new Date(post?.publishedAt || 0).getTime()
  if (!publishedAt || Number.isNaN(publishedAt)) return Number.POSITIVE_INFINITY
  return (Date.now() - publishedAt) / (1000 * 60 * 60)
}

const hasPriorityHomepageTopic = (post) =>
  (Array.isArray(post?.categories) ? post.categories : []).some((category) =>
    priorityHomepageTopics.has(normalizeTopicToken(category))
  )

export const hasHomepageStrongVisualSupport = (post) =>
  homepageLeadFeaturePreferredSlugs.has(normalizeHomepageSlug(post?.slug)) ||
  homepageVisualFeaturePreferredSlugs.has(normalizeHomepageSlug(post?.slug)) ||
  hasHomepageEmbeddedVideo(post) ||
  Boolean(String(post?.sourceImageUrl || "").trim()) ||
  Boolean(String(post?.heroImage?.asset?.url || "").trim())

export const getHomepageEditorialScore = (post) => {
  const slug = normalizeHomepageSlug(post?.slug)
  const title = String(post?.title || "")
  const excerpt = String(post?.excerpt || "")
  const sourceName = normalizeCompareText(post?.sourceName || "")
  let score = 0

  if (homepageLeadFeaturePreferredSlugs.has(slug)) score += 5
  if (homepageVisualFeaturePreferredSlugs.has(slug)) score += 3
  if (homepageTextSignalPreferredSlugs.has(slug)) score -= 1
  if (hasPriorityHomepageTopic(post)) score += 2
  if (homepageHighSignalPattern.test(`${title} ${excerpt}`)) score += 2
  if (homepageConcreteFactPattern.test(`${title} ${excerpt}`)) score += 1
  if (prominentHomepageSources.has(sourceName)) score += 1

  const ageHours = hoursSincePublished(post)
  if (ageHours <= 48) score += 1
  else if (ageHours > 168) score -= 1

  return score
}

export const isHomepageVisualFeatureCandidate = (post) =>
  hasHomepageStrongVisualSupport(post) && getHomepageEditorialScore(post) >= 3

export const isHomepageTextSignalCandidate = (post) =>
  homepageTextSignalPreferredSlugs.has(normalizeHomepageSlug(post?.slug)) ||
  !hasHomepageStrongVisualSupport(post) ||
  getHomepageEditorialScore(post) < 3

export const classifyHomepageStory = (post) => {
  const slug = normalizeHomepageSlug(post?.slug)
  const editorialScore = getHomepageEditorialScore(post)
  const hasStrongVisual = hasHomepageStrongVisualSupport(post)

  if (homepageLeadFeaturePreferredSlugs.has(slug)) {
    return { kind: "lead-feature", editorialScore, hasStrongVisual }
  }
  if (hasStrongVisual && editorialScore >= 4) {
    return { kind: "lead-feature", editorialScore, hasStrongVisual }
  }
  if (homepageVisualFeaturePreferredSlugs.has(slug) || (hasStrongVisual && editorialScore >= 3)) {
    return { kind: "featured", editorialScore, hasStrongVisual }
  }
  return { kind: "signal-brief", editorialScore, hasStrongVisual }
}

export const selectHomepagePromotionSlots = (posts, { visualSlots = 2, textSlots = 1 } = {}) => {
  const orderedPosts = Array.isArray(posts) ? [...posts] : []
  const selectedSlugs = new Set()

  const takeMatching = (matcher, limit) => {
    const matches = []
    for (const post of orderedPosts) {
      const slug = normalizeHomepageSlug(post?.slug)
      if (!slug || selectedSlugs.has(slug) || !matcher(post)) continue
      selectedSlugs.add(slug)
      matches.push(post)
      if (matches.length >= limit) break
    }
    return matches
  }

  const fillSlots = (limit, matchers) => {
    const selections = []
    for (const matcher of matchers) {
      if (selections.length >= limit) break
      selections.push(...takeMatching(matcher, limit - selections.length))
    }
    return selections
  }

  const visualPosts = fillSlots(visualSlots, [
    (post) => homepageVisualFeaturePreferredSlugs.has(normalizeHomepageSlug(post?.slug)),
    isHomepageVisualFeatureCandidate,
    () => true,
  ])

  const textSignalPosts = fillSlots(textSlots, [
    (post) => homepageTextSignalPreferredSlugs.has(normalizeHomepageSlug(post?.slug)),
    isHomepageTextSignalCandidate,
    () => true,
  ])

  return { visualPosts, textSignalPosts }
}

export const selectHomepageStoryLayout = (posts, { railBriefSlots = 3 } = {}) => {
  const orderedPosts = Array.isArray(posts) ? [...posts] : []
  const classifications = orderedPosts.map((post) => ({
    post,
    classification: classifyHomepageStory(post),
  }))

  const leadEntry =
    classifications.find((entry) => entry.classification.kind === "lead-feature") ||
    classifications.find((entry) => entry.classification.kind === "featured") ||
    classifications[0] ||
    null

  const lead = leadEntry?.post || null
  const leadKind = leadEntry
    ? leadEntry.classification.kind === "signal-brief"
      ? "lead-brief"
      : "featured"
    : "featured"

  const leadSlug = normalizeHomepageSlug(lead?.slug)
  const remaining = classifications.filter((entry) => normalizeHomepageSlug(entry.post?.slug) !== leadSlug)

  const railBriefs = []
  const remainder = []

  for (const entry of remaining) {
    if (railBriefs.length < railBriefSlots && entry.classification.kind === "signal-brief") {
      railBriefs.push(entry.post)
      continue
    }
    remainder.push(entry.post)
  }

  return {
    lead,
    leadKind,
    railBriefs,
    remainder,
  }
}
