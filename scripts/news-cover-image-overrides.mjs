export const newsCoverImageOverrides = {
  "us-lawmakers-to-introduce-bill-to-ban-government-use-of-chinese-robots":
    "https://news.robot.tv/images/covers/photos/us-lawmakers-ban-chinese-robots.jpg",
  "lucid-bots-raises-20m-to-keep-up-with-demand-for-its-window-washing-drones":
    "https://news.robot.tv/images/covers/photos/lucid-bots-window-washing-drones.jpg",
  "meet-the-machines-the-latest-generation-of-robots":
    "https://news.robot.tv/images/covers/photos/latest-generation-of-robots.jpg",
  "no-arms-no-legs-no-problem-the-robots-taking-over-retail-logistics":
    "https://news.robot.tv/images/covers/photos/retail-logistics-robots.jpg",
  "amazon-just-bought-a-startup-making-kid-size-humanoid-robots":
    "https://news.robot.tv/images/covers/photos/amazon-kid-size-humanoid-robots.jpg",
  "openai-is-scrapping-the-sora-app-to-chase-bigger-ai-goals":
    "https://news.robot.tv/images/covers/photos/openai-sora-strategy-shift.jpg",
  "agile-robots-becomes-the-latest-robotics-company-to-partner-with-google-deepmind":
    "https://news.robot.tv/images/covers/photos/agile-robots-google-deepmind.jpg",
  "chinas-open-source-dominance-threatens-us-ai-lead-us-advisory-body-warns":
    "https://news.robot.tv/images/covers/photos/china-open-source-ai-lead.jpg",
};

const freeCoverFallbacks = {
  capitol: "https://news.robot.tv/images/covers/photos/us-lawmakers-ban-chinese-robots.jpg",
  drone: "https://news.robot.tv/images/covers/photos/lucid-bots-window-washing-drones.jpg",
  humanoid: "https://news.robot.tv/images/covers/photos/amazon-kid-size-humanoid-robots.jpg",
  robotPortrait: "https://news.robot.tv/images/covers/photos/latest-generation-of-robots.jpg",
  warehouse: "https://news.robot.tv/images/covers/photos/retail-logistics-robots.jpg",
  chips: "https://news.robot.tv/images/covers/photos/china-open-source-ai-lead.jpg",
  aiStrategy: "https://news.robot.tv/images/covers/photos/openai-sora-strategy-shift.jpg",
  industrialArm: "https://news.robot.tv/images/covers/photos/agile-robots-google-deepmind.jpg",
};

const normalize = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const includesAny = (text, terms = []) => terms.some((term) => text.includes(term));

export const autoCoverImageForPost = (post = {}) => {
  const title = normalize(post?.title);
  const categories = Array.isArray(post?.cats)
    ? post.cats.map(normalize).join(" ")
    : Array.isArray(post?.categories)
      ? post.categories.map(normalize).join(" ")
      : "";
  const source = normalize(post?.sourceName);
  const haystack = `${title} ${categories} ${source}`.trim();

  if (!haystack) return "";

  if (includesAny(haystack, ["lawmakers", "congress", "senate", "house", "government use", "ban government", "policy", "advisory body"])) {
    return freeCoverFallbacks.capitol;
  }
  if (includesAny(haystack, ["window-washing", "window washing", "drone", "uav", "facade", "building inspection"])) {
    return freeCoverFallbacks.drone;
  }
  if (includesAny(haystack, ["warehouse", "logistics", "retail logistics", "fulfillment", "ocado"])) {
    return freeCoverFallbacks.warehouse;
  }
  if (includesAny(haystack, ["open-source", "open source", "chip", "compute", "semiconductor", "ai lead", "sora", "openai"])) {
    return includesAny(haystack, ["sora", "openai", "strategy", "app"]) ? freeCoverFallbacks.aiStrategy : freeCoverFallbacks.chips;
  }
  if (includesAny(haystack, ["deepmind", "partnership", "partner with", "industrial robot", "robot arm", "factory automation"])) {
    return freeCoverFallbacks.industrialArm;
  }
  if (includesAny(haystack, ["kid-size humanoid", "kid size humanoid", "child-sized humanoid", "child sized humanoid"])) {
    return freeCoverFallbacks.humanoid;
  }
  if (includesAny(haystack, ["humanoid", "robotics revolution", "latest generation of robots", "meet the machines", "robot exhibition"])) {
    return includesAny(haystack, ["humanoid"]) ? freeCoverFallbacks.humanoid : freeCoverFallbacks.robotPortrait;
  }
  if (includesAny(haystack, ["robot", "robotics"])) {
    return freeCoverFallbacks.robotPortrait;
  }

  return "";
};

export const coverImageOverrideForPost = (post = {}) =>
  newsCoverImageOverrides[String(post?.slug || "").trim()] || autoCoverImageForPost(post);
