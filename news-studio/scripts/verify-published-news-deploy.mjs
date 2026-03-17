import fs from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const reportPath = path.resolve(root, process.env.NEWS_PUBLISH_REPORT_PATH || path.join("ops-private", "reports", "publish", "latest-published-news.json"))
const distDir = path.resolve(root, process.env.NEWS_DIST_DIR || "dist-public")
const liveSiteUrl = String(process.env.NEWS_LIVE_SITE_URL || "https://news.robot.tv").replace(/\/+$/, "")
const verifyLive = process.env.NEWS_VERIFY_LIVE === "1"
const liveRetries = Number(process.env.NEWS_VERIFY_RETRIES || 8)
const liveDelayMs = Number(process.env.NEWS_VERIFY_DELAY_MS || 5000)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const loadReport = async () => {
  try {
    const raw = await fs.readFile(reportPath, "utf8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const localFileForSlug = (slug) => path.join(distDir, slug, "index.html")

const fileExists = async (target) => {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

const checkLiveUrl = async (url) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  })
  const html = await response.text()
  const notFoundSignals = [
    "<title>404 | robot.tv News</title>",
    "This link is out of date"
  ]
  return {
    ok: response.ok && !notFoundSignals.some((signal) => html.includes(signal)),
    status: response.status,
    bodySnippet: html.slice(0, 220).replace(/\s+/g, " ").trim()
  }
}

const report = await loadReport()
if (!report) {
  console.log(`No publish report found at ${reportPath}; skipping permalink verification.`)
  process.exit(0)
}

const publishedDocs = Array.isArray(report.docs)
  ? report.docs.filter((doc) => doc && !doc.isDraft && doc.slug)
  : []

if (!publishedDocs.length) {
  console.log("Publish report contains no newly published slugs; skipping permalink verification.")
  process.exit(0)
}

const failures = []

for (const doc of publishedDocs) {
  const target = localFileForSlug(doc.slug)
  if (!(await fileExists(target))) {
    failures.push(`Missing generated article page for slug "${doc.slug}" at ${path.relative(root, target)}`)
  }
}

if (failures.length) {
  console.error("Published permalink verification failed before deploy:")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified ${publishedDocs.length} generated article page(s) in ${path.relative(root, distDir)}.`)

if (!verifyLive) {
  process.exit(0)
}

for (const doc of publishedDocs) {
  const url = doc.url || `${liveSiteUrl}/${doc.slug}/`
  let success = false
  let lastResult = null
  for (let attempt = 1; attempt <= Math.max(1, liveRetries); attempt += 1) {
    lastResult = await checkLiveUrl(url)
    if (lastResult.ok) {
      success = true
      console.log(`Live permalink verified: ${url}`)
      break
    }
    if (attempt < liveRetries) {
      await sleep(Math.max(0, liveDelayMs))
    }
  }
  if (!success) {
    failures.push(`Live permalink failed after deploy: ${url} (last status ${lastResult?.status || "unknown"}; snippet: ${lastResult?.bodySnippet || "n/a"})`)
  }
}

if (failures.length) {
  console.error("Published permalink verification failed after deploy:")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified ${publishedDocs.length} live published permalink(s) on ${liveSiteUrl}.`)
