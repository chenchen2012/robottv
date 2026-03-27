export const newsCoverImageOverrides = {
  "us-lawmakers-to-introduce-bill-to-ban-government-use-of-chinese-robots":
    "https://news.robot.tv/images/covers/us-lawmakers-ban-chinese-robots.svg",
  "lucid-bots-raises-20m-to-keep-up-with-demand-for-its-window-washing-drones":
    "https://news.robot.tv/images/covers/lucid-bots-window-washing-drones.svg",
  "meet-the-machines-the-latest-generation-of-robots":
    "https://news.robot.tv/images/covers/latest-generation-of-robots.svg",
  "no-arms-no-legs-no-problem-the-robots-taking-over-retail-logistics":
    "https://news.robot.tv/images/covers/retail-logistics-robots.svg",
  "amazon-just-bought-a-startup-making-kid-size-humanoid-robots":
    "https://news.robot.tv/images/covers/amazon-kid-size-humanoid-robots.svg",
  "openai-is-scrapping-the-sora-app-to-chase-bigger-ai-goals":
    "https://news.robot.tv/images/covers/openai-sora-strategy-shift.svg",
  "agile-robots-becomes-the-latest-robotics-company-to-partner-with-google-deepmind":
    "https://news.robot.tv/images/covers/agile-robots-google-deepmind.svg",
  "chinas-open-source-dominance-threatens-us-ai-lead-us-advisory-body-warns":
    "https://news.robot.tv/images/covers/china-open-source-ai-lead.svg",
};

export const coverImageOverrideForPost = (post = {}) =>
  newsCoverImageOverrides[String(post?.slug || "").trim()] || "";
