import fs from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const distDir = path.join(root, "dist-root-public")

const includeDirs = new Set([
  "images",
  "scripts"
])

const includeFiles = new Set([
  "_redirects",
  "_worker.js",
  "robots.txt",
  "sitemap.xml",
  "styles.css",
  "ajaxload.gif",
  "chenchen1.jpg",
  "your-background-image.jpg",
  "silian.txt"
])

const includeFileByExtension = (name) => {
  const ext = path.extname(name).toLowerCase()
  return [".html", ".css", ".xml", ".gif", ".jpg", ".jpeg", ".png", ".ico"].includes(ext)
}

const run = async () => {
  await fs.rm(distDir, { recursive: true, force: true })
  await fs.mkdir(distDir, { recursive: true })

  const entries = await fs.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    if (entry.isDirectory()) {
      if (!includeDirs.has(entry.name)) continue
      await fs.cp(path.join(root, entry.name), path.join(distDir, entry.name), { recursive: true })
      continue
    }
    if (!entry.isFile()) continue
    if (!includeFiles.has(entry.name) && !includeFileByExtension(entry.name)) continue
    await fs.copyFile(path.join(root, entry.name), path.join(distDir, entry.name))
  }

  console.log("Copied root public site into dist-root-public/.")
}

run().catch((err) => {
  console.error(`Failed to build root public dist: ${err?.message || err}`)
  process.exit(1)
})
