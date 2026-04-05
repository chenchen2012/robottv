import fs from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const distDir = path.join(root, "dist-root-public")

const requiredFiles = [
  "index.html",
  "404.html",
  "_redirects",
  "_worker.js",
  "robots.txt",
  "sitemap.xml",
  "styles.css",
  "fonts/space-grotesk-latin.woff2",
  "fonts/orbitron-latin.woff2",
  "about.html",
  "live.html",
  "home.html",
  "companies.html",
  "scripts/ga-lazy.js",
  "images/robot_logo.png"
]
const ROOT_HOME_NEWS_START = "<!-- ROOT_HOME_NEWS_START -->"
const ROOT_HOME_NEWS_END = "<!-- ROOT_HOME_NEWS_END -->"

const excludedEntries = [
  "news-studio",
  ".github",
  "ops-private",
  "netlify",
  "codex-mem-robottv.txt"
]

const collectHtmlFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const nextPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectHtmlFiles(nextPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(nextPath)
    }
  }
  return files
}

const fileExists = async (target) => {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

const failures = []

for (const relPath of requiredFiles) {
  if (!(await fileExists(path.join(distDir, relPath)))) {
    failures.push(`Missing required root public output: ${relPath}`)
  }
}

for (const relPath of excludedEntries) {
  if (await fileExists(path.join(distDir, relPath))) {
    failures.push(`Unexpected private/dev entry copied into root public dist: ${relPath}`)
  }
}

const htmlFiles = await collectHtmlFiles(distDir)
if (!htmlFiles.length) {
  failures.push("No HTML files found in dist-root-public/")
}

for (const file of htmlFiles) {
  const relPath = path.relative(distDir, file)
  const html = await fs.readFile(file, "utf8")
  if (!html.includes("ga-lazy.js?v=20260309-ga-v1")) {
    failures.push(`Missing lazy-load analytics include: ${relPath}`)
  }
  if (relPath === "index.html") {
    if (html.includes("preloaded-news-posts.js")) {
      failures.push("Root homepage should not depend on preloaded-news-posts.js at runtime")
    }
    if (html.includes("api.sanity.io") || html.includes("apicdn.sanity.io")) {
      failures.push("Root homepage should not fetch homepage news from Sanity at runtime")
    }
    const start = html.indexOf(ROOT_HOME_NEWS_START)
    const end = html.indexOf(ROOT_HOME_NEWS_END)
    if (start === -1 || end === -1 || end < start) {
      failures.push("Root homepage is missing generated news markers")
    } else {
      const block = html.slice(start, end)
      const articleHrefMatches = [...block.matchAll(/href="https:\/\/news\.robot\.tv\/([^"?#]+)\/"/g)]
        .map((match) => match[1])
        .filter(Boolean)
      if (new Set(articleHrefMatches).size < 3) {
        failures.push("Root homepage generated news block should contain multiple crawlable newsroom article links")
      }
      if (!block.includes("<h2>Latest News</h2>")) {
        failures.push("Root homepage generated news block is missing the Latest News section")
      }
      if (!block.includes("<h2>Pinned Analysis</h2>")) {
        failures.push("Root homepage generated news block is missing the Pinned Analysis section")
      }
      if (!block.includes("<h2>Evergreen Hubs</h2>")) {
        failures.push("Root homepage generated news block is missing the Evergreen Hubs section")
      }
    }
  }
}

if (failures.length) {
  console.error("Root public build verification failed:")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified dist-root-public with ${htmlFiles.length} HTML files.`)
