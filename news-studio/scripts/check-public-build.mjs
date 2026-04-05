import fs from "node:fs/promises"
import path from "node:path"
import vm from "node:vm"

const root = process.cwd()
const distDir = path.join(root, "dist-public")

const requiredFiles = [
  "index.html",
  "404.html",
  "_redirects",
  "feed.xml",
  "robots.txt",
  "sitemap.xml",
  "fonts/space-grotesk-latin.woff2",
  "fonts/orbitron-latin.woff2",
  "scripts/ga-lazy.js"
]

const directGaPatterns = [
  "googletagmanager.com/gtag/js?id=G-WC8XB1DN1E",
  "gtag('config', 'G-WC8XB1DN1E')",
  'gtag("config", "G-WC8XB1DN1E")'
]
const reservedTopLevelDirs = new Set(["scripts"])
const thinBodySentinel = "This article is part of robot.tv's video-first robotics coverage."

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

const validateInlineScripts = (html, relPath, failures) => {
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRegex.exec(html))) {
    const attrs = match[1] || ""
    const body = match[2] || ""
    if (/\bsrc\s*=/i.test(attrs)) continue
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)
    const typeValue = (typeMatch?.[1] || "").toLowerCase()
    if (typeValue && typeValue !== "text/javascript" && typeValue !== "application/javascript" && typeValue !== "module") {
      continue
    }
    if (!body.trim()) continue
    try {
      new vm.Script(body, { filename: relPath })
    } catch (error) {
      failures.push(`Inline script parse failure in ${relPath}: ${error?.message || error}`)
    }
  }
}

const failures = []

for (const relPath of requiredFiles) {
  const target = path.join(distDir, relPath)
  if (!(await fileExists(target))) {
    failures.push(`Missing required public output: ${relPath}`)
  }
}

const htmlFiles = await collectHtmlFiles(distDir)
const postFiles = htmlFiles.filter((file) => {
  const relParts = path.relative(distDir, file).split(path.sep)
  return relParts.length === 2 && relParts[1] === "index.html" && !reservedTopLevelDirs.has(relParts[0])
})
const postRelPaths = new Set(postFiles.map((file) => path.relative(distDir, file)))

if (!postFiles.length) {
  failures.push("Expected at least one generated article page under dist-public/<slug>/index.html")
}

if (await fileExists(path.join(distDir, "post"))) {
  failures.push("Unexpected legacy dist-public/post/ directory present after article URL migration")
}

for (const file of htmlFiles) {
  const relPath = path.relative(distDir, file)
  const html = await fs.readFile(file, "utf8")
  if (!html.includes("ga-lazy.js?v=20260309-ga-v1")) {
    failures.push(`Missing lazy-load analytics include: ${relPath}`)
  }
  if (directGaPatterns.some((pattern) => html.includes(pattern))) {
    failures.push(`Found direct GA snippet in public HTML: ${relPath}`)
  }
  if (postRelPaths.has(relPath) && html.includes(thinBodySentinel) && !/noindex,follow/i.test(html)) {
    failures.push(`Thin fallback-only article is still indexable: ${relPath}`)
  }
  if (relPath === "index.html") {
    if (html.includes("scripts/preloaded-news-posts.js")) {
      failures.push("Homepage should not depend on preloaded-news-posts.js at runtime")
    }
    if (html.includes("localStorage.getItem(") || html.includes("localStorage.setItem(")) {
      failures.push("Homepage should not use localStorage to control news rendering")
    }
  }
  validateInlineScripts(html, relPath, failures)
}

const redirectsPath = path.join(distDir, "_redirects")
if (await fileExists(redirectsPath)) {
  const redirects = await fs.readFile(redirectsPath, "utf8")
  if (!redirects.includes("/post/*")) {
    failures.push("Expected legacy article redirect rule in dist-public/_redirects")
  }
  if (!redirects.includes("/feed       /feed.xml")) {
    failures.push("Expected feed redirect rule in dist-public/_redirects")
  }
}

if (failures.length) {
  console.error("Public news build verification failed:")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified dist-public with ${htmlFiles.length} HTML files and ${postFiles.length} article pages.`)
