import fs from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const distDir = path.join(root, "dist-public")

const requiredFiles = [
  "index.html",
  "404.html",
  "_redirects",
  "feed.xml",
  "robots.txt",
  "sitemap.xml",
  "scripts/ga-lazy.js"
]

const directGaPatterns = [
  "googletagmanager.com/gtag/js?id=G-WC8XB1DN1E",
  "gtag('config', 'G-WC8XB1DN1E')",
  'gtag("config", "G-WC8XB1DN1E")'
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
  const target = path.join(distDir, relPath)
  if (!(await fileExists(target))) {
    failures.push(`Missing required public output: ${relPath}`)
  }
}

const htmlFiles = await collectHtmlFiles(distDir)
const postFiles = htmlFiles.filter((file) => file.includes(`${path.sep}post${path.sep}`))

if (!postFiles.length) {
  failures.push("Expected at least one generated article page under dist-public/post/")
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
}

const redirectsPath = path.join(distDir, "_redirects")
if (await fileExists(redirectsPath)) {
  const redirects = await fs.readFile(redirectsPath, "utf8")
  if (!redirects.includes("/post/*.html")) {
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
