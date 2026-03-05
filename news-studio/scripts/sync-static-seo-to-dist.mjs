import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const distStaticDir = path.join(distDir, "static");
const staticPostDir = path.join(distStaticDir, "post");
const distPostDir = path.join(distDir, "post");

const copyTree = async (from, to) => {
  const stat = await fs.stat(from);
  if (!stat.isDirectory()) throw new Error(`Expected directory: ${from}`);
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyTree(src, dst);
      continue;
    }
    if (entry.isFile()) {
      await fs.copyFile(src, dst);
    }
  }
};

const copyIfExists = async (from, to) => {
  try {
    await fs.copyFile(from, to);
    return true;
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    throw err;
  }
};

const run = async () => {
  await copyTree(staticPostDir, distPostDir);

  const copiedSitemap = await copyIfExists(
    path.join(distStaticDir, "sitemap.xml"),
    path.join(distDir, "sitemap.xml"),
  );
  const copiedRobots = await copyIfExists(
    path.join(distStaticDir, "robots.txt"),
    path.join(distDir, "robots.txt"),
  );

  console.log("Synced static SEO pages to dist/post.");
  if (copiedSitemap) console.log("Copied dist/static/sitemap.xml -> dist/sitemap.xml");
  if (copiedRobots) console.log("Copied dist/static/robots.txt -> dist/robots.txt");
};

run().catch((err) => {
  console.error(`Failed to sync SEO files into dist: ${err?.message || err}`);
  process.exit(1);
});
