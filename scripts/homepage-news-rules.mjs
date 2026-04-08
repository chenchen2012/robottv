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

const homepageSpecificProductPattern =
  /\b(robot|robots|humanoid|quadruped|drone|uav|ugv|cobot|robot dog|robot hand|gripper|delivery bot|inspection system|platform|model)\b/i

const homepageVisualAppealPattern =
  /\b(video|watch|demo|demonstration|footage|clip|showcase|walks?|running|working|test|tested|prototype)\b/i

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

export const hasHomepagePlayableVideo = (post) => hasHomepageEmbeddedVideo(post)

export const hasHomepageImageSupport = (post) =>
  homepageLeadFeaturePreferredSlugs.has(normalizeHomepageSlug(post?.slug)) ||
  homepageVisualFeaturePreferredSlugs.has(normalizeHomepageSlug(post?.slug)) ||
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

export const getHomepageVisualStandoutScore = (post) => {
  const title = String(post?.title || "")
  const excerpt = String(post?.excerpt || "")
  const combined = `${title} ${excerpt}`
  let score = 1

  if (hasHomepageStrongVisualSupport(post)) score += 2
  if (homepageSpecificProductPattern.test(combined)) score += 1
  if (homepageVisualAppealPattern.test(combined)) score += 1
  if (homepageConcreteFactPattern.test(combined)) score += 1

  return Math.max(1, Math.min(5, score))
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
  const visualStandoutScore = getHomepageVisualStandoutScore(post)
  const hasPlayableVideo = hasHomepagePlayableVideo(post)
  const hasImageSupport = hasHomepageImageSupport(post)
  const hasStrongVisual = hasPlayableVideo || hasImageSupport

  if (homepageLeadFeaturePreferredSlugs.has(slug)) {
    return { kind: "lead-feature", editorialScore, visualStandoutScore, hasStrongVisual }
  }
  if (hasPlayableVideo && (editorialScore >= 4 || visualStandoutScore >= 4)) {
    return { kind: "lead-feature", editorialScore, visualStandoutScore, hasStrongVisual }
  }
  if (
    homepageVisualFeaturePreferredSlugs.has(slug) ||
    (hasPlayableVideo && (editorialScore >= 3 || visualStandoutScore >= 3)) ||
    (hasImageSupport && visualStandoutScore >= 4)
  ) {
    return { kind: "featured", editorialScore, visualStandoutScore, hasStrongVisual }
  }
  return { kind: "signal-brief", editorialScore, visualStandoutScore, hasStrongVisual }
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

export const selectHomepageStoryLayout = (posts, { railBriefSlots = 3, briefsOnlyTopSlots = 4, fallbackSourcePosts } = {}) => {
  const orderedPosts = Array.isArray(posts) ? [...posts] : []
  const fallbackOrderedPosts = Array.isArray(fallbackSourcePosts) && fallbackSourcePosts.length
    ? [...fallbackSourcePosts]
    : orderedPosts
  const classifications = orderedPosts.map((post) => ({
    post,
    classification: classifyHomepageStory(post),
  }))
  const fallbackClassifications = fallbackOrderedPosts.map((post) => ({
    post,
    classification: classifyHomepageStory(post),
  }))
  const byPublishedAtDesc = (left, right) => {
    const scoreDelta =
      (right?.classification?.visualStandoutScore || 0) - (left?.classification?.visualStandoutScore || 0) ||
      (right?.classification?.editorialScore || 0) - (left?.classification?.editorialScore || 0)
    if (scoreDelta) return scoreDelta
    const leftTime = new Date(left?.post?.publishedAt || 0).getTime()
    const rightTime = new Date(right?.post?.publishedAt || 0).getTime()
    return rightTime - leftTime
  }
  const featureEntries = classifications
    .filter((entry) => entry.classification.kind === "lead-feature" || entry.classification.kind === "featured")
    .sort(byPublishedAtDesc)
  const signalEntries = classifications
    .filter((entry) => entry.classification.kind === "signal-brief")
    .sort(byPublishedAtDesc)

  const featuredLeadEntry = featureEntries[0] || null
  const fallbackVideoEntry = featuredLeadEntry
    ? null
    : fallbackClassifications
        .filter((entry) => hasHomepageEmbeddedVideo(entry.post))
        .sort(byPublishedAtDesc)[0] || null
  const leadEntry = featuredLeadEntry || fallbackVideoEntry
  const lead = leadEntry?.post || null
  const leadKind = featuredLeadEntry ? "featured" : fallbackVideoEntry ? "video-brief" : "none"
  const layoutMode = featuredLeadEntry ? "featured" : fallbackVideoEntry ? "video-brief" : "briefs-only"

  const leadSlug = normalizeHomepageSlug(lead?.slug)
  const remainingFeatures = featureEntries
    .filter((entry) => normalizeHomepageSlug(entry.post?.slug) !== leadSlug)
    .map((entry) => entry.post)
  const remainingSignals = signalEntries
    .filter((entry) => normalizeHomepageSlug(entry.post?.slug) !== leadSlug)
    .map((entry) => entry.post)

  const topBriefs = layoutMode === "briefs-only"
    ? remainingSignals.slice(0, briefsOnlyTopSlots)
    : remainingSignals.slice(0, railBriefSlots)
  const remainder = layoutMode === "briefs-only"
    ? [...remainingSignals.slice(briefsOnlyTopSlots)]
    : [...remainingFeatures, ...remainingSignals.slice(railBriefSlots)]

  return {
    lead,
    leadKind,
    layoutMode,
    topBriefs,
    remainder,
  }
}
