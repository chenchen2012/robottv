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
  "about.html",
  "live.html",
  "home.html",
  "companies.html",
  "scripts/ga-lazy.js",
  "images/robot_logo.png"
]

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
}

if (failures.length) {
  console.error("Root public build verification failed:")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified dist-root-public with ${htmlFiles.length} HTML files.`)
