import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "static");
const distDir = path.join(root, "dist-public");

const run = async () => {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.cp(sourceDir, distDir, { recursive: true });
  console.log("Copied static/ -> dist-public/ for public hosting.");
};

run().catch((err) => {
  console.error(`Failed to build public dist: ${err?.message || err}`);
  process.exit(1);
});
