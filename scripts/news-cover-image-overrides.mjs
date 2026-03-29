export const newsCoverImageOverrides = {
  "agile-robots-to-deploy-google-deepmind-foundation-models-on-its-humanoid":
    "https://news.robot.tv/images/covers/photos/agile-robots-google-deepmind.jpg",
  "mind-robotics-raises-series-a-to-develop-ai-driven-industrial-automation":
    "https://news.robot.tv/images/covers/photos/latest-generation-of-robots.jpg",
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

export const generatedCoverImageForSlug = (slug = "") => {
  const normalized = String(slug || "").trim();
  return normalized
    ? `https://news.robot.tv/images/covers/generated/${normalized}.svg`
    : "";
};

export const coverImageOverrideForPost = (post = {}) =>
  newsCoverImageOverrides[String(post?.slug || "").trim()] || "";
