import fs from "node:fs/promises"
import path from "node:path"
import { homepageEditorialPinnedPosts } from "./editorial-pinned-posts.mjs"
import { getHomepageListingPosts, normalizeHomepageSlug, selectHomepagePromotionSlots } from "./homepage-news-rules.mjs"
import { coverImageOverrideForPost, generatedCoverImageForSlug } from "./news-cover-image-overrides.mjs"

const ROOT = process.cwd()
const INDEX_PATH = path.join(ROOT, "index.html")
const START_MARKER = "<!-- ROOT_HOME_NEWS_START -->"
const END_MARKER = "<!-- ROOT_HOME_NEWS_END -->"
const DIST_ROOT_INDEX_PATH = path.join(ROOT, "dist-root-public", "index.html")
const PROJECT_ID = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID || "lumv116w"
const DATASET = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || "production"
const FALLBACK_COVER_IMAGE = "https://news.robot.tv/images/covers/photos/latest-generation-of-robots.jpg"
const BLOCKED_SOURCE_IMAGE_PREFIXES = [
  "https://lh3.googleusercontent.com/J6_coFbogxhRI9iM864NL_liGXvsQp2AupsKei7z0cNNfDvGUmWUy20nuUhkREQyrpY4bEeIBuc"
]
const EVERGREEN_HUBS = [
  {
    title: "China Humanoid Robots",
    href: "china-humanoid-robots.html",
    image: "https://img.youtube.com/vi/s4SmxpIO2qk/hqdefault.jpg",
    alt: "China humanoid market analysis",
    description: "Track Unitree, EV crossover, and the industrial signals shaping China's humanoid market.",
  },
  {
    title: "Warehouse Humanoid Robots",
    href: "warehouse-humanoid-robots.html",
    image: "https://img.youtube.com/vi/2zCh_6GO49c/hqdefault.jpg",
    alt: "Warehouse humanoid operations",
    description: "Follow deployment proof, ROI pressure, and operational rollout signals in one place.",
  },
  {
    title: "Physical AI & Robot Learning",
    href: "physical-ai-robot-learning.html",
    image: "https://img.youtube.com/vi/XGcfdbOu_uc/hqdefault.jpg",
    alt: "Physical AI and robot learning hub",
    description: "Connect model capability, simulation, and robot-learning signals without bouncing between scattered articles.",
  },
  {
    title: "Industrial Inspection Robots",
    href: "industrial-inspection-robots.html",
    image: "images/spot.jpg",
    alt: "Industrial inspection robot hub",
    description: "Track quadruped patrol, outdoor autonomy, and recurring inspection workflows in one hub.",
  },
  {
    title: "Robotics Startup Execution",
    href: "robotics-startup-execution.html",
    image: "https://img.youtube.com/vi/b8BDUa-xbyA/hqdefault.jpg",
    alt: "Robotics startup execution guide",
    description: "Follow the habits, rollout discipline, and failure patterns that matter for robotics teams that ship.",
  },
  {
    title: "Collaborative Robot Integration",
    href: "collaborative-robot-integration.html",
    image: "https://img.youtube.com/vi/sa2qSF9f9Ks/hqdefault.jpg",
    alt: "Collaborative robot integration guide",
    description: "Plan layout, safety, operator handoffs, and rollout metrics before adding a cobot cell.",
  },
]

const HOMEPAGE_QUERY = `*[_type == "post"] | order(publishedAt desc)[0...24]{
  title,
  excerpt,
  publishedAt,
  youtubeUrl,
  sourceName,
  sourceImageUrl,
  heroImage{asset->{url}},
  "slug": slug.current,
  "categories": categories[]->title
}`

const esc = (value) =>
  String(value || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]))

const toPlain = (value) => String(value || "").replace(/\s+/g, " ").trim()

const formatDate = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

const videoIdFromUrl = (value) => {
  const text = String(value || "").trim()
  if (!text) return ""
  return (
    (text.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || [])[1] ||
    (text.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
    (text.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
    (text.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
    (text.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/) || [])[1] ||
    ""
  )
}

const thumbFromVideo = (value) => {
  const id = videoIdFromUrl(value)
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ""
}

const isBlockedSourceImage = (value) => {
  const text = String(value || "").trim()
  return text ? BLOCKED_SOURCE_IMAGE_PREFIXES.some((prefix) => text.startsWith(prefix)) : false
}

const coverImageForPost = (post) => {
  const override = coverImageOverrideForPost(post)
  if (override) return override
  const videoThumb = thumbFromVideo(post?.youtubeUrl)
  if (videoThumb) return videoThumb
  const heroImage = post?.heroImage?.asset?.url || ""
  if (heroImage) return heroImage
  const sourceImageUrl = String(post?.sourceImageUrl || "").trim()
  if (sourceImageUrl && !isBlockedSourceImage(sourceImageUrl)) return sourceImageUrl
  const generatedCover = generatedCoverImageForSlug(post?.slug)
  if (generatedCover) return generatedCover
  return FALLBACK_COVER_IMAGE
}

const toNewsUrl = (slug) => `https://news.robot.tv/${encodeURIComponent(normalizeHomepageSlug(slug))}/`

const fetchHomepagePosts = async () => {
  const encodedQuery = encodeURIComponent(HOMEPAGE_QUERY)
  const url = `https://${PROJECT_ID}.api.sanity.io/v2023-10-01/data/query/${DATASET}?query=${encodedQuery}`
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "robot.tv root homepage build",
    },
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch homepage posts from Sanity: HTTP ${response.status}`)
  }
  const payload = await response.json()
  return Array.isArray(payload?.result) ? payload.result : []
}

const renderTicker = (posts) => {
  const items = posts
    .slice(0, 8)
    .map((post) => `<span><a href="${toNewsUrl(post.slug)}">${esc(post.title)}</a></span>`)
    .join("")
  return `<section class="live-ticker panel" aria-label="Latest robotics headlines">
                <span class="ticker-label"><span class="live-dot" aria-hidden="true"></span>Latest Headlines</span>
                <div class="ticker-track-wrap">
                    <div id="intelligence-rail" class="ticker-track">${items}${items}</div>
                </div>
            </section>`
}

const renderLatestCard = (post, tag = "Featured Story") => {
  const href = toNewsUrl(post.slug)
  const title = esc(post.title)
  const excerpt = esc(post.excerpt || "Open the full newsroom briefing for the latest robotics context.")
  const image = esc(coverImageForPost(post))
  const alt = `${title} thumbnail`
  const date = formatDate(post.publishedAt)
  return `<a class="story-card" href="${href}" data-video="${esc(post.youtubeUrl || "")}">
                        <span class="story-media-shell">
                            <img class="story-media" src="${image}" alt="${esc(alt)}" loading="lazy" width="1600" height="900" decoding="async">
                            <span class="story-preview-layer" aria-hidden="true"></span>
                        </span>
                        <span class="story-tag">${tag}</span>
                        <h3>${title}</h3>
                        <p>${date ? `${esc(date)} | ` : ""}${excerpt}</p>
                    </a>`
}

const renderTextSignalSlot = (post) => {
  const href = toNewsUrl(post.slug)
  const title = esc(post.title)
  const excerpt = esc(post.excerpt || "Open the full newsroom briefing for the latest robotics context.")
  const date = formatDate(post.publishedAt)
  return `<aside class="homepage-signal-slot">
                    <span class="story-tag">Signal Brief</span>
                    <h3><a href="${href}">${title}</a></h3>
                    <p>${date ? `${esc(date)} | ` : ""}${excerpt}</p>
                    <a class="signal-slot-link" href="${href}">Read briefing</a>
                </aside>`
}

const renderLatestSection = ({ visualPosts, textSignalPosts }) => `<section class="section panel content-band latest-band" id="latest">
                <div class="section-head">
                    <h2>Latest News</h2>
                    <a href="https://news.robot.tv">Open newsroom</a>
                </div>
                <div class="homepage-news-layout">
                    <div class="homepage-feature-grid">
${visualPosts.map((post) => `                        ${renderLatestCard(post, "Featured Visual")}`).join("\n")}
                    </div>
${textSignalPosts.map((post) => `                    ${renderTextSignalSlot(post)}`).join("\n")}
                </div>
            </section>`

const renderChannelCard = (item) => `<a class="channel-card" href="${esc(item.href)}">
                        <img src="${esc(item.image)}" alt="${esc(item.alt)}" width="1600" height="1000" loading="lazy" decoding="async">
                        <h3>${esc(item.title)}</h3>
                        <p>${esc(item.description)}</p>
                    </a>`

const renderPinnedSection = (posts) => `<section class="section panel content-band pinned-band" aria-label="Pinned analysis">
                <div class="section-head">
                    <h2>Pinned Analysis</h2>
                    <a href="https://news.robot.tv">More analysis</a>
                </div>
                <div class="homepage-pinned-grid">
${posts.map((post) => `                    ${renderChannelCard({
  href: toNewsUrl(post.slug),
  image: coverImageForPost(post),
  alt: post.title,
  title: post.title,
  description: post.excerpt || "Open the full analysis briefing on news.robot.tv.",
})}`).join("\n")}
                </div>
            </section>`

const renderEvergreenSection = () => `<section class="section panel content-band evergreen-band" aria-label="Evergreen hubs">
                <div class="section-head">
                    <h2>Evergreen Hubs</h2>
                    <a href="home.html">Open Robot Index</a>
                </div>
                <div class="homepage-evergreen-grid">
${EVERGREEN_HUBS.map((item) => `                    ${renderChannelCard(item)}`).join("\n")}
                </div>
            </section>`

export const renderRootHomepageNews = async (html) => {
  const start = html.indexOf(START_MARKER)
  const end = html.indexOf(END_MARKER)
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Could not find root homepage news markers in index.html")
  }

  const latestPosts = getHomepageListingPosts(await fetchHomepagePosts())
  if (latestPosts.length < 5) {
    throw new Error(`Expected at least 5 visible homepage posts from Sanity, received ${latestPosts.length}`)
  }

  const latestSectionPosts = latestPosts.slice(0, 8)
  const homepagePromotionSlots = selectHomepagePromotionSlots(latestSectionPosts, { visualSlots: 2, textSlots: 1 })
  const pinnedPosts = homepageEditorialPinnedPosts
    .filter((post) => post?.slug && !latestSectionPosts.some((latest) => latest.slug === post.slug))
    .slice(0, 2)

  const rendered = [
    renderTicker(latestPosts),
    renderLatestSection(homepagePromotionSlots),
    renderPinnedSection(pinnedPosts),
    renderEvergreenSection(),
  ].join("\n\n")

  const prefix = html.slice(0, start + START_MARKER.length)
  const suffix = html.slice(end)
  return `${prefix}\n${rendered}\n            ${suffix}`
}

export const buildRootHomepageNews = async ({ sourcePath = INDEX_PATH, outputPath = DIST_ROOT_INDEX_PATH } = {}) => {
  const html = await fs.readFile(sourcePath, "utf8")
  const renderedHtml = await renderRootHomepageNews(html)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, renderedHtml, "utf8")
  console.log(`Rendered root homepage news from Sanity into ${outputPath}.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildRootHomepageNews().catch((error) => {
    console.error(`Failed to build root homepage news: ${error?.message || error}`)
    process.exit(1)
  })
}
