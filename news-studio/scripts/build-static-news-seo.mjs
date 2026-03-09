import fs from "node:fs/promises";
import path from "node:path";

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID || "lumv116w";
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || "production";
const siteUrl = "https://news.robot.tv";
const staticDir = path.resolve("static");
const sitemapPath = path.join(staticDir, "sitemap.xml");
const feedPath = path.join(staticDir, "feed.xml");
const preloadedPostsScriptPath = path.join(staticDir, "scripts", "preloaded-news-posts.js");
const STATIC_RESERVED_DIRS = new Set(["scripts"]);
const HOMEPAGE_PAGE_SIZE = 12;
const HOMEPAGE_PRELOAD_DEPTH = 60;
const HOMEPAGE_START_MARKER = "<!-- STATIC_NEWS_HOME_START -->";
const HOMEPAGE_END_MARKER = "<!-- STATIC_NEWS_HOME_END -->";
const RESERVED_ARTICLE_SLUGS = new Set([
  "",
  "404",
  "404.html",
  "_redirects",
  "_worker.js",
  "author",
  "category",
  "favicon.ico",
  "feed",
  "feed.xml",
  "index",
  "index.html",
  "page",
  "post",
  "robots.txt",
  "scripts",
  "sitemap.xml",
  "tag",
]);
const retiredLegacyRedirects = {
  "china-rolls-out-worlds-first-military-proof-5g-that-can-connect-10000-army-robots": "robot-news",
  "alphabet-owned-robotics-software-company-intrinsic-joins-google":
    "intrinsic-is-joining-google-to-advance-physical-ai-in-robotics",
  "amazon-halts-blue-jay-robotics-project-after-less-than-6-months":
    "amazon-blue-jay-halt-warehouse-robotics-roi-standards",
};
const hiddenListingSlugs = new Set([
  "biggest-ai-news-today",
  "the-biggest-robot-news-today",
  "robots-learn-faster-with-new-ai-techniques",
  "alphabet-owned-robotics-software-company-intrinsic-joins-google",
  "amazon-halts-blue-jay-robotics-project-after-less-than-6-months",
  "11-women-shaping-the-future-of-robotics",
  "2026-robotics-summit-early-bird-registration-ends-march-2",
  "amazon-cuts-jobs-in-strategically-important-robotics-division",
  "amazon-cuts-more-jobs-this-time-in-robotics-unit",
  "aw-2026-features-korea-humanoid-debuts-as-industry-seeks-digital-transformation",
  "breakingviews-hyundai-motors-robots-herald-hardware-reboot",
  "chinas-dancing-robots-how-worried-should-we-be",
  "dancing-robots-bring-support-company-to-barcelona-elderly",
  "hyundai-motor-to-unveil-multi-billion-dollar-investment-in-south-korea-source-says",
  "hyundai-to-show-mobed-at-aw-as-robotics-ai-expand-in-manufacturing",
  "tesollo-commercializes-its-lightweight-compact-robotic-hand-for-humanoids",
  "the-cows-beat-the-shit-out-of-the-robots-the-first-day-the-tech-revolution-designed-to-imp",
]);
const editorialPinnedPosts = [
  {
    title: "NVIDIA bets on robotics to drive future growth",
    excerpt:
      "NVIDIA is positioning robotics as a major long-term growth driver, with accelerated compute and software stacks aimed at real deployment workloads.",
    publishedAt: "2025-01-31T00:00:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=XGcfdbOu_uc",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "This restored legacy post tracks how NVIDIA's robotics strategy links AI models, simulation, and edge deployment hardware.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Why it matters: compute availability and software tooling are still major constraints for scaling robot deployments.",
          },
        ],
      },
    ],
    slug: "nvidia-bets-on-robotics-to-drive-future-growth",
    author: "Chen Chen",
    categories: ["Robotics News", "AI", "NVIDIA"],
  },
  {
    title: "Robot news: weekly robotics signals to watch",
    excerpt:
      "A compact roundup of notable robotics developments across humanoids, autonomy, industrial deployments, and AI software tools.",
    publishedAt: "2025-01-31T00:00:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=2zCh_6GO49c",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "This restored legacy roundup page summarizes practical signals that matter for robotics builders and operators.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Coverage focus includes deployment proof points, reliability progress, and commercialization milestones.",
          },
        ],
      },
    ],
    slug: "robot-news",
    author: "Chen Chen",
    categories: ["Robotics News", "Roundup"],
  },
  {
    title: "Robots learn faster with new AI techniques",
    excerpt:
      "New AI training approaches are reducing iteration time for robot learning and improving transfer from simulation to physical systems.",
    publishedAt: "2025-01-26T00:00:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=sa2qSF9f9Ks",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "This restored legacy post highlights how faster robot learning loops can accelerate time-to-deployment.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Why it matters: reducing training and integration cycles can materially improve robotics program ROI.",
          },
        ],
      },
    ],
    slug: "robots-learn-faster-with-new-ai-techniques",
    author: "Chen Chen",
    categories: ["AI", "Robotics News", "Research"],
  },
  {
    title: "NVIDIA readies Jetson Thor computers for humanoid robots in 2025",
    excerpt:
      "NVIDIA's Jetson Thor roadmap is aimed at bringing higher-performance onboard compute to next-wave humanoid robot platforms.",
    publishedAt: "2025-01-21T00:00:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=EwMH8-JKm3k",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "This restored legacy post follows the Jetson Thor timeline and what it could unlock for humanoid perception and control stacks.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Why it matters: on-robot compute limits often define practical autonomy boundaries in production settings.",
          },
        ],
      },
    ],
    slug: "nvidia-readies-jetson-thor-computers-for-humanoid-robots-in-2025",
    author: "Chen Chen",
    categories: ["Humanoid Robots", "NVIDIA", "Robotics News"],
  },
  {
    title: "Chinese EV manufacturers enter the humanoid robot market",
    excerpt:
      "Major Chinese EV players are extending manufacturing and supply-chain capabilities into humanoid robotics programs.",
    publishedAt: "2025-01-17T00:00:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=s4SmxpIO2qk",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "This restored legacy post tracks automotive-to-robotics convergence and the strategic push from EV manufacturers.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Why it matters: EV-scale production discipline could accelerate cost-down curves for humanoid components.",
          },
        ],
      },
    ],
    slug: "chinese-ev-manufacturers-enter-humanoid-robot-market",
    author: "Chen Chen",
    categories: ["Humanoid Robots", "China", "Robotics News"],
  },
  {
    title: "Boston Dynamics unveils a new Atlas chapter",
    excerpt:
      "Boston Dynamics' Atlas updates reflect a shift toward more practical, product-aligned humanoid capabilities.",
    publishedAt: "2024-12-23T00:00:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=h3iT9oUUZx0",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "This restored legacy post captures market reaction to the latest Atlas direction and deployment expectations.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Why it matters: hardware announcements now face stronger scrutiny on manufacturability and operational readiness.",
          },
        ],
      },
    ],
    slug: "boston-dynamics-new-atlas",
    author: "Chen Chen",
    categories: ["Humanoid Robots", "Boston Dynamics", "Robotics News"],
  },
  {
    title: "Biggest AI news today in robotics",
    excerpt:
      "A fast briefing on the day's most important AI developments that impact robotics software and real-world autonomy.",
    publishedAt: "2024-11-26T00:00:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=NL2zbYhC5Z4",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "This restored legacy page provides a concise AI-focused view of developments relevant to robotics teams.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Coverage centers on model capability, deployment constraints, and measurable operational impact.",
          },
        ],
      },
    ],
    slug: "biggest-ai-news-today",
    author: "Chen Chen",
    categories: ["AI", "Robotics News"],
  },
  {
    title: "The biggest robot news today",
    excerpt:
      "A daily robotics snapshot covering notable launches, deployments, funding moves, and industrial signals.",
    publishedAt: "2024-11-22T00:00:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=LPEGve_U1cY",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "This restored legacy page summarizes high-signal robotics updates for operators, builders, and investors.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Focus remains on practical evidence of adoption and progress beyond demo-stage announcements.",
          },
        ],
      },
    ],
    slug: "the-biggest-robot-news-today",
    author: "Chen Chen",
    categories: ["Robotics News", "Roundup"],
  },
  {
    title: "Chinese robotics firms showcase advanced quadruped robots for practical applications",
    excerpt:
      "Chinese robotics firms are showing advanced quadruped robots in practical industrial and field scenarios, signaling stronger real-world deployment readiness.",
    publishedAt: "2025-01-01T00:00:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=X2UxtKLZnNo",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "This restored briefing tracks how Chinese robotics firms are positioning quadruped platforms for practical applications beyond demonstrations.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Why it matters: commercialization momentum depends on reliability, uptime, and repeatable task performance in real operating environments.",
          },
        ],
      },
    ],
    slug: "chinese-robotics-firms-showcase-advanced-quadruped-robots-for-practical-applications",
    author: "Chen Chen",
    categories: ["Quadrupeds", "Robotics News", "Operations"],
  },
  {
    title: "Humanoid warehouse rollouts are shifting from pilot to operations in 2026",
    excerpt:
      "A growing share of warehouse humanoid programs are moving from proof-of-concept demos to measured operational deployment plans in 2026.",
    publishedAt: "2026-03-07T08:30:00.000Z",
    youtubeUrl: "https://www.youtube.com/watch?v=2zCh_6GO49c",
    body: [
      {
        _type: "block",
        children: [
          {
            text: "Editorial brief: 2026 deployment signals suggest warehouse humanoids are being evaluated against throughput, safety, and task reliability metrics rather than demo novelty.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "Why it matters: this shift from pilot headlines to operations benchmarks is where long-term robotics adoption and recurring budget decisions are made.",
          },
        ],
      },
      {
        _type: "block",
        children: [
          {
            text: "robot.tv will continue tracking execution milestones, site-level rollout pacing, and clear evidence of repeatable workflow impact.",
          },
        ],
      },
    ],
    slug: "humanoid-warehouse-rollouts-shift-from-pilot-to-operations-2026",
    author: "Chen Chen",
    categories: ["Humanoid Robots", "Operations", "Robotics News"],
  },
];
const blocksFromParagraphs = (paragraphs = []) =>
  paragraphs
    .map((paragraph) => toPlainText(paragraph))
    .filter(Boolean)
    .map((text) => ({
      _type: "block",
      children: [{ text }],
    }));

const chinaHumanoidHubResource = {
  eyebrow: "Topic Hub",
  title: "China Humanoid Robots Hub",
  description:
    "Track Unitree, EV makers, public showcases, and deployment signals in one robot.tv resource.",
  url: "https://robot.tv/china-humanoid-robots.html",
  ctaLabel: "Open the hub",
};
const warehouseHumanoidHubResource = {
  eyebrow: "Topic Hub",
  title: "Warehouse Humanoid Robots Hub",
  description:
    "Track Digit deployments, factory-proof signals, and warehouse robotics ROI pressure in one robot.tv resource.",
  url: "https://robot.tv/warehouse-humanoid-robots.html",
  ctaLabel: "Open the hub",
};
const physicalAiHubResource = {
  eyebrow: "Topic Hub",
  title: "Physical AI & Robot Learning Hub",
  description:
    "Track robot learning, VLA models, simulation, compute, and robotics software stack signals in one robot.tv resource.",
  url: "https://robot.tv/physical-ai-robot-learning.html",
  ctaLabel: "Open the hub",
};
const cobotIntegrationGuideResource = {
  eyebrow: "Guide Page",
  title: "Collaborative Robot Integration Guide",
  description:
    "Plan layout, safety, operator handoffs, and rollout KPIs before adding cobots to an existing production line.",
  url: "https://robot.tv/collaborative-robot-integration.html",
  ctaLabel: "Open the guide",
};
const inspectionRobotsHubResource = {
  eyebrow: "Topic Hub",
  title: "Industrial Inspection Robots Hub",
  description:
    "Track Spot, Unitree quadrupeds, routine patrol workflows, and outdoor inspection deployment signals in one robot.tv resource.",
  url: "https://robot.tv/industrial-inspection-robots.html",
  ctaLabel: "Open the hub",
};
const startupExecutionGuideResource = {
  eyebrow: "Guide Page",
  title: "Robotics Startup Execution Guide",
  description:
    "Track shipping velocity, deployment proof, capital discipline, and the habits that keep robotics startups alive.",
  url: "https://robot.tv/robotics-startup-execution.html",
  ctaLabel: "Open the guide",
};
const noindexNewsSlugs = new Set([
  "11-women-shaping-the-future-of-robotics",
  "2026-robotics-summit-early-bird-registration-ends-march-2",
  "amazon-cuts-jobs-in-strategically-important-robotics-division",
  "amazon-cuts-more-jobs-this-time-in-robotics-unit",
  "aw-2026-features-korea-humanoid-debuts-as-industry-seeks-digital-transformation",
  "breakingviews-hyundai-motors-robots-herald-hardware-reboot",
  "chinas-dancing-robots-how-worried-should-we-be",
  "dancing-robots-bring-support-company-to-barcelona-elderly",
  "hyundai-motor-to-unveil-multi-billion-dollar-investment-in-south-korea-source-says",
  "hyundai-to-show-mobed-at-aw-as-robotics-ai-expand-in-manufacturing",
  "tesollo-commercializes-its-lightweight-compact-robotic-hand-for-humanoids",
  "the-cows-beat-the-shit-out-of-the-robots-the-first-day-the-tech-revolution-designed-to-imp",
]);

const editorialEnhancementsBySlug = new Map([
  [
    "why-chinas-humanoid-robot-industry-is-winning-the-early-market",
    {
      excerpt:
        "China's early lead in humanoid robotics is starting to look structural: dense supply chains, faster hardware iteration, and public pilot visibility are helping local teams move faster than many rivals.",
      videoSummary:
        "The embedded coverage looks at why China's humanoid ecosystem is gaining early momentum. The main takeaway is that supply-chain depth, cost discipline, and rapid iteration may matter more right now than polished demo videos.",
      bodyParagraphs: [
        "The embedded coverage points to a simple reality: early humanoid progress is not only about model quality or flashy demos. It is also about how quickly teams can source parts, revise hardware, and get the next prototype back into the field.",
        "China appears well positioned on those operating layers. A concentrated manufacturing base can shorten feedback loops between design, integration, and cost reduction, which matters when humanoid programs are still trying to prove reliability outside controlled environments.",
        "For robot.tv, the most important question is not who wins the narrative week by week. It is which ecosystems can turn rapid iteration into repeated field trials, safer motion, and lower delivered system costs.",
        "That is why this story belongs in a broader China humanoid robotics watchlist: the advantage may come less from a single breakout company and more from how several companies benefit from the same industrial stack.",
      ],
      categories: ["China", "Robotics News"],
      sourceName: "TechCrunch",
      sourceSiteUrl: "https://techcrunch.com/",
      sourcePublishedAt: "2026-02-28T00:00:00.000Z",
      relatedResource: chinaHumanoidHubResource,
    },
  ],
  [
    "unitree-china-global-robotics-competitor-momentum",
    {
      excerpt:
        "Unitree is becoming one of the clearest signals that China's robotics sector can compete globally on speed, visibility, and cost-aware product iteration.",
      videoSummary:
        "The video highlights Unitree's momentum as more than a one-company story. For robot.tv, the bigger signal is that Unitree may be showing how China can pressure the global humanoid market on cadence, affordability, and public mindshare.",
      bodyParagraphs: [
        "Unitree matters because it gives the market a visible benchmark for how quickly a Chinese robotics company can ship updates, capture attention, and keep multiple robot categories in motion at the same time.",
        "That does not automatically mean long-term deployment leadership is settled. Global competitors still need to be judged on reliability, integration quality, and customer outcomes. But Unitree is forcing the rest of the market to take China's pace seriously.",
        "From an industry-analysis standpoint, this is a useful bridge story between company coverage and broader market structure. Unitree is both a brand to watch and a proxy for what Chinese robotics manufacturing can do when speed and cost become competitive weapons.",
        "The most important follow-up is whether momentum converts into durable commercial proof: repeat orders, clear operating use cases, and evidence that lower-cost hardware can stay reliable in production.",
      ],
      categories: ["China"],
      relatedResource: chinaHumanoidHubResource,
    },
  ],
  [
    "china-humanoid-robots-lunar-new-year-showtime",
    {
      excerpt:
        "Humanoid appearances during Lunar New Year programming were more than a novelty moment. They showed how China's robot makers are using mass-audience visibility to normalize the category and build confidence around domestic progress.",
      videoSummary:
        "The embedded coverage captures a high-visibility media moment for humanoid robotics in China. The deeper signal is that public spectacle can support market confidence, investor attention, and recruiting long before full deployment maturity arrives.",
      bodyParagraphs: [
        "Public showcase moments should not be confused with factory proof. But they do matter because they shape how quickly the public, media, and policymakers start treating humanoid robots as an emerging product category instead of a distant research concept.",
        "Large cultural broadcasts give robot makers something hard to buy any other way: shared national attention. That can accelerate interest from talent, local governments, enterprise partners, and investors who may not be following the industry week to week.",
        "For robot.tv, the useful interpretation is not that a stage appearance proves readiness. It is that China is getting better at pairing robotics progress with narrative scale, which can help domestic companies build momentum faster than quieter competitors.",
        "The ranking question to watch next is whether this visibility connects to real deployment evidence. The strongest companies will be the ones that convert public fascination into repeatable hardware, stable operations, and credible commercial timelines.",
      ],
      categories: ["China", "Robotics News"],
      sourceName: "Reuters",
      sourceSiteUrl: "https://www.reuters.com/",
      sourcePublishedAt: "2026-02-16T00:00:00.000Z",
      relatedResource: chinaHumanoidHubResource,
    },
  ],
  [
    "chinese-ev-manufacturers-enter-humanoid-robot-market",
    {
      excerpt:
        "Chinese EV manufacturers moving into humanoids could reshape the category because automotive supply chains, manufacturing discipline, and cost-down instincts map naturally onto the next stage of robot commercialization.",
      videoSummary:
        "The video ties humanoid robotics to China's EV industrial base. The core idea is that companies experienced in scaling complex hardware may shorten the path from concept robots to more affordable, repeatable platforms.",
      bodyParagraphs: [
        "The EV-to-humanoid crossover matters because both industries depend on supply-chain control, component cost pressure, systems integration, and the ability to iterate hardware on a manufacturing schedule rather than a research schedule.",
        "Automotive groups also bring a culture of volume planning and production engineering that many robotics startups are still building. If that expertise transfers well, it could accelerate the cost-down curve for actuators, batteries, compute packaging, and assembly.",
        "That still leaves a major open question: whether the software, safety, and task-generalization challenges of humanoids can be solved quickly enough to match the hardware ambition. Manufacturing strength helps, but it does not eliminate autonomy risk.",
        "For robot.tv, this is one of the clearest reasons to watch China as a full ecosystem instead of only tracking individual robot launches. The more the EV base participates, the more humanoids start to look like an industrial scaling contest, not just a lab-to-demo race.",
      ],
      relatedResource: chinaHumanoidHubResource,
    },
  ],
  [
    "humanoid-warehouse-rollouts-shift-from-pilot-to-operations-2026",
    {
      excerpt:
        "Warehouse humanoids are entering a stricter phase in 2026: operators are moving beyond pilot headlines and starting to judge programs on throughput, intervention rate, safety, and real workflow fit.",
      videoSummary:
        "The briefing argues that warehouse humanoids are crossing from curiosity to operating test. The real signal is not more demos, but the growing shift toward site-level KPIs and repeatability.",
      bodyParagraphs: [
        "For warehouse humanoids, 2026 looks like the year the market stops rewarding category excitement by itself. Buyers now want proof that robots can support repeatable tasks without creating too much supervision overhead or process friction.",
        "That changes the benchmark. Instead of asking whether a platform can complete a staged workflow, operators increasingly care about cycle contribution, exception handling, uptime, safety behavior around people, and the amount of integration work required to fit existing sites.",
        "This is why the warehouse story deserves its own robot.tv topic hub. The category is becoming less about futuristic branding and more about whether specific workflows can justify hardware, software, and change-management costs at production scale.",
        "The companies that break through are likely to be the ones that start narrow, prove value inside one task family, and show that deployment economics stay intact after the demo cameras leave.",
      ],
      categories: ["Warehouse Robotics", "Operations"],
      relatedResource: warehouseHumanoidHubResource,
    },
  ],
  [
    "humanoid-deployments-factory-proof-stage-2026",
    {
      excerpt:
        "Humanoid deployments are entering the factory-proof stage, where performance has to survive real operating constraints instead of presentation-stage conditions.",
      videoSummary:
        "The video frames 2026 as a factory-proof year for humanoids. The key idea is that the market is beginning to ask harder operational questions: uptime, supervision, cycle contribution, and integration cost.",
      bodyParagraphs: [
        "Factory proof is a different standard from demo proof. It means a robot has to contribute inside environments where downtime, line interruptions, safety policy, and worker coordination matter more than novelty.",
        "For warehouse and manufacturing buyers, the central question is no longer whether humanoids are interesting. It is whether they can reduce bottlenecks, ergonomic strain, or staffing friction without introducing more complexity than they remove.",
        "That is why this story matters for the warehouse humanoid cluster in particular. Warehouses are one of the clearest environments where task structure, workflow measurement, and ROI pressure are visible enough to judge whether a deployment is truly working.",
        "robot.tv will keep treating factory-proof signals as a higher standard than pilot optics, because that is where durable adoption, recurring budgets, and broader category credibility are likely to be decided.",
      ],
      categories: ["Warehouse Robotics", "Operations"],
      relatedResource: warehouseHumanoidHubResource,
    },
  ],
  [
    "toyota-motor-manufacturing-canada-to-deploy-agility-robotics-digit-humanoids",
    {
      excerpt:
        "Toyota's planned Digit deployment matters because warehouse humanoids only become durable market signals when serious industrial operators are willing to test them inside production environments.",
      videoSummary:
        "The story is important less for the announcement alone and more for what it implies: warehouse humanoids are starting to win attention from real operators, not just robotics spectators.",
      bodyParagraphs: [
        "Named deployment partners give warehouse humanoid coverage more weight because they connect vendor narrative to a real operating environment. In this case, the significance comes from seeing Digit associated with a recognizable industrial setting rather than another abstract pilot claim.",
        "The next thing to watch is not the headline, but the operating detail behind it: task scope, rollout pacing, human supervision load, and whether the deployment can improve throughput or reduce labor friction in measurable ways.",
        "For robot.tv, this is one of the clearest bridge stories between category theory and field validation. It gives the warehouse humanoid market a concrete signal that large operators are at least willing to run serious evaluations.",
        "That is why the story belongs inside the warehouse humanoid hub. It helps anchor the category around a real deployment reference point instead of leaving the conversation stuck at generic humanoid hype.",
      ],
      categories: ["Warehouse Robotics", "Operations", "Agility Robotics"],
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      sourcePublishedAt: "2026-02-19T00:00:00.000Z",
      relatedResource: warehouseHumanoidHubResource,
    },
  ],
  [
    "amazon-blue-jay-halt-warehouse-robotics-roi-standards",
    {
      excerpt:
        "Amazon's Blue Jay halt is a useful reality check for the warehouse robotics market: large operators are tightening ROI expectations and dropping programs that cannot prove practical value quickly enough.",
      videoSummary:
        "The video highlights a harder market environment for warehouse robotics bets. The takeaway is that warehouse humanoids and adjacent automation programs now need clearer economic proof, not just technical novelty.",
      bodyParagraphs: [
        "Blue Jay matters because it shows how quickly warehouse automation narratives can change when economics fail to clear the bar. Large operators may still explore ambitious robotics ideas, but they do not keep funding them just because the underlying concept sounds strategically important.",
        "For the warehouse humanoid category, that is a useful warning. Vendors need to show more than technical viability; they also need to prove deployment fit, manageable complexity, and a believable path to operational value inside existing sites.",
        "This is why robot.tv groups positive deployment signals and cautionary stories together in the same hub. A serious category analysis has to include both the programs that are winning evaluation slots and the ones that reveal how strict the ROI filter has become.",
        "The strongest warehouse humanoid stories going forward will be the ones that show measurable task success under real constraints, not just a compelling prototype or a broad automation thesis.",
      ],
      categories: ["Warehouse Robotics", "Operations"],
      sourceName: "Multiple outlets",
      relatedResource: warehouseHumanoidHubResource,
    },
  ],
  [
    "quadrupeds-routine-industrial-inspection-scale",
    {
      excerpt:
        "Inspection quadrupeds are moving from one-off pilots to routine patrol programs, where the real value comes from workflow fit, anomaly escalation, and lower manual inspection burden.",
      videoSummary:
        "The briefing argues that quadrupeds are starting to matter less as eye-catching robots and more as useful inspection tools. The important shift is toward routine patrol work tied to alerts, ticketing, and operator response.",
      bodyParagraphs: [
        "Quadruped inspection robots are becoming easier to justify when the task is repetitive, the route is well defined, and the operator team already has a clear process for acting on alerts. In those conditions, the robot is not replacing human judgment so much as compressing the time spent on routine patrol work.",
        "That is why workflow integration matters more than raw mobility alone. A quadruped can climb stairs and move through rougher environments, but the deployment only creates value when inspection findings move cleanly into ticketing, escalation, and maintenance decisions.",
        "For robot.tv, this is one of the strongest signs that field robotics is maturing. The most useful quadruped stories are no longer just about locomotion. They are about whether patrol robots can become part of a site's operating rhythm without creating new supervision burden.",
        "This story belongs in an industrial inspection hub because buyers increasingly want a category view: which robots are winning repeat patrol jobs, which environments are realistic, and what infrastructure or software layers are still holding wider rollout back."
      ],
      categories: ["Quadruped Robots", "Inspection", "Industrial Robotics"],
      relatedResource: inspectionRobotsHubResource,
    },
  ],
  [
    "chinese-robotics-firms-showcase-advanced-quadruped-robots-for-practical-applications",
    {
      excerpt:
        "Chinese quadruped vendors are showing that industrial inspection robots can compete on rugged mobility, price pressure, and practical field scenarios instead of relying only on polished demos.",
      videoSummary:
        "The embedded coverage is useful because it shifts the China quadruped story toward practical deployment. The key question is whether these robots can deliver repeatable inspection value outside controlled show-floor settings.",
      bodyParagraphs: [
        "Chinese quadruped activity matters because inspection robotics is starting to look like a scale and cost race as much as a software race. Vendors that can move quickly on rugged hardware, field trials, and pricing pressure may win attention from operators who care more about practical coverage than category prestige.",
        "The most important signal is not that a robot can walk over uneven terrain. It is whether the system can support repeat inspection workflows, produce usable alerts, and fit into service models that customers can actually sustain.",
        "For robot.tv, this is a useful bridge between China manufacturing strength and industrial robotics demand. Quadrupeds are one of the clearest categories where lower-cost hardware, if reliable enough, could reshape who gets serious evaluation opportunities.",
        "That is why this page now feeds a broader industrial inspection hub. The relevant search intent is not only about one country or one vendor. It is about which robots are becoming credible tools for recurring inspection work."
      ],
      categories: ["Quadruped Robots", "Inspection", "China"],
      relatedResource: inspectionRobotsHubResource,
    },
  ],
  [
    "how-to-integrate-collaborative-robots-into-existing-production-lines-without-disruption",
    {
      excerpt:
        "Collaborative robot integration works best when teams redesign flow, safety, and operator handoffs around a real bottleneck instead of dropping a cobot into the line as a stand-alone demo.",
      videoSummary:
        "The core point of the briefing is that cobot projects succeed when the rollout is treated as an operations redesign, not just a hardware install. Safety, cycle balance, and worker workflow matter as much as the robot itself.",
      bodyParagraphs: [
        "Collaborative robots are often sold as low-friction automation, but the real work starts before the arm arrives on the floor. Teams need to decide which bottleneck is worth solving, how the robot will hand work back to people, and what upstream or downstream changes the cell requires.",
        "That is why integration planning matters more than the robot spec sheet by itself. If takt time, part presentation, guarding decisions, or exception handling are weak, a cobot project can create more disruption than the manual process it was supposed to improve.",
        "For operators, the most useful rollout metrics are practical ones: cycle contribution, intervention rate, safety incidents, training time, and whether the robot stabilizes throughput without adding supervision burden. Those signals reveal whether the deployment is helping the line or just adding novelty.",
        "robot.tv treats cobot integration as a guide-worthy topic because it has evergreen search value and immediate operational consequence. Buyers need a planning framework, not just another short news hit about a new arm or demo."
      ],
      categories: ["Industrial Robots", "Operations", "Manufacturing"],
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      relatedResource: cobotIntegrationGuideResource,
    },
  ],
  [
    "startup-velocity-brief-robotics-teams-that-ship",
    {
      excerpt:
        "Robotics startup velocity only matters when teams narrow scope, learn from real deployments, and turn each release into stronger product discipline instead of faster narrative churn.",
      videoSummary:
        "The briefing argues that fast robotics teams are not just quicker at demos. The real edge comes from faster customer learning, tighter scope, and a shipping rhythm that compounds into deployment proof.",
      bodyParagraphs: [
        "Velocity matters in robotics because long hardware and autonomy cycles can quietly kill teams that do not learn fast enough. But the useful version of speed is not constant announcement flow. It is the ability to tighten scope, ship against one real workflow, and come back with better product judgment after each deployment cycle.",
        "That is why robotics startup execution should be measured against what changed in the system, not only how often the company posted progress. Strong teams usually get faster by clarifying what they will not build, which customers matter most, and which technical bets actually improve shipping odds.",
        "For investors and operators, the best signal is compounding proof. Does each release reduce integration friction, improve support, or make the product easier to evaluate in a live environment? If not, visible momentum may still be masking weak execution discipline.",
        "robot.tv treats this as guide-worthy startup coverage because the search intent is evergreen. Readers want to know what separates robotics teams that ship from the ones that move quickly without ever getting closer to durable customer value.",
      ],
      categories: ["Robotics Startups", "Operations", "Strategy"],
      relatedResource: startupExecutionGuideResource,
    },
  ],
  [
    "6-lessons-i-learned-watching-a-robotics-startup-die-from-the-inside",
    {
      excerpt:
        "Robotics startup failure stories matter because execution risk in this industry usually comes from focus, deployment discipline, and operating burn, not from a lack of technical ambition alone.",
      videoSummary:
        "The story is useful because it turns a startup collapse into operating lessons. The main takeaway is that robotics companies can lose long before the market decides the technology is impossible.",
      bodyParagraphs: [
        "Robotics startups usually fail through a chain of execution errors rather than one dramatic technical problem. Teams spread themselves across too many bets, chase narrative momentum instead of repeatable customer value, and underestimate how expensive hardware iteration becomes when deployment reality hits.",
        "That is why post-mortem style coverage deserves more than a headline. Founders, operators, and investors all benefit from understanding where process discipline broke down: product focus, sales qualification, customer success, unit economics, or the pace of shipping compared with the promises made.",
        "For robot.tv, the value of this piece is that it reframes startup coverage away from funding optics and toward operating lessons. In robotics, good judgment about scope and execution often matters as much as raw technical upside.",
        "The follow-up question is which teams are building the habits that keep them alive: narrower workflow targets, faster customer feedback loops, and a willingness to say no to expansions that do not strengthen the core system."
      ],
      categories: ["Robotics Startups", "Operations", "Strategy"],
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      relatedResource: startupExecutionGuideResource,
    },
  ],
  [
    "vdma-warns-germany-is-losing-ground-in-global-robotics-race",
    {
      excerpt:
        "VDMA's warning matters because Germany's robotics position now depends on whether engineering strength can still convert into faster investment, commercialization, and industrial demand as global competitors accelerate.",
      videoSummary:
        "The briefing frames VDMA's warning as a market-structure signal, not just a regional complaint. The deeper issue is whether Germany can keep translating engineering credibility into scale, demand, and competitive robotics momentum.",
      bodyParagraphs: [
        "Germany still carries enormous industrial credibility in robotics and automation, so a competitiveness warning from VDMA deserves attention beyond local policy circles. It suggests the pressure is no longer only about technical excellence, but about how quickly that excellence turns into commercial momentum, domestic demand, and stronger investment conditions.",
        "That matters because robotics leadership now depends on more than legacy manufacturing reputation. Countries and ecosystems that move faster on deployment, capital formation, and scaling infrastructure can start to outrun slower but highly capable incumbents.",
        "For robot.tv, this is a useful market-structure story because it adds a European counterpoint to the China and U.S. narratives already shaping robotics attention. Germany's challenge is not whether it can build serious engineering talent. It is whether the ecosystem can keep enough speed and confidence to stay central as the global robotics race changes shape.",
        "The follow-up questions are strategic ones: whether investment improves, whether customers inside Europe keep buying and deploying robotics at meaningful scale, and whether German firms can turn industrial depth into faster commercial execution over the next cycle.",
      ],
      categories: ["Europe", "Robotics Markets", "Industrial Policy"],
      replaceCategories: true,
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      sourcePublishedAt: "2026-02-25T00:00:00.000Z",
    },
  ],
  [
    "ais-role-in-the-future-of-robotics-insights-from-3laws",
    {
      excerpt:
        "AI only becomes valuable in robotics when it reduces brittle task engineering, improves deployment speed, and gives operators more reliable behavior outside controlled demos.",
      videoSummary:
        "The briefing connects AI rhetoric to the harder robotics question: what kinds of software progress actually shorten deployment time and make real systems easier to ship.",
      bodyParagraphs: [
        "AI matters in robotics because it can change how quickly teams move from scripted behavior to adaptable systems. But not every AI headline translates into deployment value. The real test is whether models reduce custom engineering, recover better from edge cases, and stay reliable when the environment changes.",
        "That is why robot.tv places this story next to the physical AI stack instead of treating it as generic AI commentary. The important question is not whether AI sounds transformative. It is which parts of the stack make robots more useful to operators and integrators right now.",
        "For builders, the most important metrics are practical: integration time, safety behavior, supervision load, and whether policy improvements survive the move from demo conditions to real production environments. Those are the signals that separate software progress from marketing language.",
        "Seen that way, AI's role in robotics is not abstract. It is about whether better models, tools, and orchestration can lower the friction of shipping physical systems. That is the lens robot.tv will keep using for future AI-in-robotics coverage."
      ],
      categories: ["Physical AI", "Robot Learning", "Strategy"],
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      relatedResource: physicalAiHubResource,
    },
  ],
  [
    "vision-language-action-models-are-the-next-leap-in-autonomous-robotics",
    {
      excerpt:
        "Vision-language-action models matter because they promise to connect perception, language, and control in one robotics stack, but the real test is whether they reduce task engineering outside demo conditions.",
      videoSummary:
        "The briefing explains why VLA models are becoming central to physical AI. The key point is that robotics teams want a stack that can interpret scenes, follow intent, and produce useful actions without brittle per-task scripting.",
      bodyParagraphs: [
        "VLA models matter because robotics teams have been missing a clean bridge between perception, reasoning, and control. The promise is not just better demos, but a shorter path from human instruction to usable robot behavior.",
        "That is why this story belongs in a physical AI hub instead of living as a one-off AI headline. If VLA systems keep improving, they could reduce the amount of custom task logic and rigid state-machine engineering needed for each new workflow.",
        "The caveat is that model capability alone is not enough. Real deployment value will depend on latency, recovery from failure, data quality, and whether policies stay reliable once robots leave curated evaluation setups.",
        "For robot.tv, the follow-up question is simple: which companies can turn VLA promise into repeatable task performance, lower integration time, and better operator trust in physical environments.",
      ],
      categories: ["Physical AI", "Robot Learning", "Robotics Software"],
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      relatedResource: physicalAiHubResource,
    },
  ],
  [
    "intrinsic-is-joining-google-to-advance-physical-ai-in-robotics",
    {
      excerpt:
        "Intrinsic joining Google matters because physical AI may be moving from a specialized robotics-software effort into a broader platform bet around models, tooling, and developer leverage.",
      videoSummary:
        "The coverage frames Intrinsic's move into Google as a signal that physical AI is becoming a bigger software-platform story. The main takeaway is that robotics tooling could benefit if model, cloud, and developer infrastructure start to line up.",
      bodyParagraphs: [
        "Intrinsic has mattered to robotics because it sits closer to tooling and workflow enablement than to a single robot product. Moving that effort deeper into Google suggests the physical AI opportunity may now be large enough to justify tighter integration with bigger model and infrastructure bets.",
        "That does not guarantee near-term product success. But it does change the conversation from isolated robotics software to the larger question of whether major platform companies are ready to support physical AI as a long-cycle category.",
        "For builders, the practical issue is whether this results in better development surfaces, easier orchestration, stronger data pipelines, or more usable simulation-to-deployment workflows. That is the real value test.",
        "robot.tv treats this as a physical AI stack story, not just a corporate-org story, because the longer-term significance depends on what it unlocks for robotics teams shipping real systems.",
      ],
      categories: ["Physical AI", "Robotics Software"],
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      relatedResource: physicalAiHubResource,
    },
  ],
  [
    "nord-releases-digital-twin-simulation-platform-for-robotics-developers",
    {
      excerpt:
        "Digital twin tooling matters because robot learning and physical AI only scale when developers can test layouts, controls, and edge cases before touching production hardware.",
      videoSummary:
        "The story matters because simulation and digital twins are part of the physical AI stack, not a side topic. The more robotics teams can model systems before deployment, the faster they can iterate with less hardware friction.",
      bodyParagraphs: [
        "Digital twin platforms deserve more attention in robotics because many of the hard deployment problems show up before a robot ever reaches a real site. Layout assumptions, collision risks, sensor coverage, and workflow timing are all easier to debug in simulation than in live operations.",
        "That makes tools like this strategically important for physical AI. Better models and smarter policies still need environments where teams can validate changes quickly and cheaply before risking downtime on expensive hardware.",
        "The broader market implication is that the robotics software stack is becoming more layered. Winning companies may need stronger simulation, fleet tooling, and developer workflows in addition to better robot hardware.",
        "For robot.tv, the question to watch is whether these tools reduce iteration time enough to change deployment economics for integrators, OEMs, and operators running complex environments.",
      ],
      categories: ["Simulation", "Robotics Software", "Physical AI"],
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      relatedResource: physicalAiHubResource,
    },
  ],
  [
    "robots-learn-faster-with-new-ai-techniques",
    {
      excerpt:
        "Faster robot learning loops matter because shorter iteration cycles can compress the time between simulation insight and real-world deployment readiness.",
      videoSummary:
        "The core idea is simple: if robots can learn faster, the deployment loop gets shorter. That matters because physical AI only becomes commercially useful when teams can improve policies without waiting through slow training and validation cycles.",
      bodyParagraphs: [
        "Faster learning matters because robotics teams live or die on iteration speed. When each improvement cycle takes too long, the cost of testing policies, collecting recovery data, and moving from simulation to field validation becomes a serious bottleneck.",
        "That is why robot learning belongs inside the physical AI story. Better models are only commercially meaningful when they improve the speed and quality of the full loop from data to behavior to deployment.",
        "In practice, the strongest approaches are likely to combine data efficiency, better simulation, stronger evaluation discipline, and policies that generalize across more than one narrow setup. Faster training alone is not enough.",
        "robot.tv treats this as an infrastructure story for the category, because faster learning changes who can afford to keep improving robotic systems after the first pilot.",
      ],
      categories: ["Robot Learning", "Physical AI"],
      relatedResource: physicalAiHubResource,
    },
  ],
  [
    "nvidia-readies-jetson-thor-computers-for-humanoid-robots-in-2025",
    {
      excerpt:
        "Jetson Thor matters because humanoid and physical AI systems need onboard compute that can carry richer perception, action models, and lower-latency control at the edge.",
      videoSummary:
        "The Jetson Thor story is really about edge compute for physical AI. The key question is whether robotics teams can run more capable models on hardware that still fits real deployment constraints.",
      bodyParagraphs: [
        "Edge compute is becoming one of the defining bottlenecks for physical AI. Robotics teams want richer perception, more capable policy models, and faster reaction loops, but those gains only matter if the hardware can support them within real power, cost, and thermal limits.",
        "That is why Jetson Thor matters beyond NVIDIA itself. It represents the broader race to make deployable robotics compute strong enough for the next generation of humanoid and autonomous systems.",
        "For builders, the real test is not headline FLOPS. It is whether better onboard compute reduces system compromise: less offboard dependency, lower latency, and more room for practical perception-and-action stacks on deployed robots.",
        "robot.tv treats this as a core physical AI enabler, because the quality of future robotics software will be constrained by what the edge hardware can actually run in production.",
      ],
      categories: ["Physical AI", "Compute", "Humanoid Robots"],
      relatedResource: physicalAiHubResource,
    },
  ],
  [
    "nvidia-bets-on-robotics-to-drive-future-growth",
    {
      excerpt:
        "NVIDIA's robotics push matters because physical AI will only scale if model training, simulation, and deployable edge compute start to look like one connected stack.",
      videoSummary:
        "The video is less about one company announcement and more about the stack around it. The takeaway is that robotics is increasingly being treated as a full compute-and-software platform opportunity.",
      bodyParagraphs: [
        "When NVIDIA emphasizes robotics, it is usually a signal about stack direction rather than a single product cycle. The company is effectively betting that simulation, model development, and deployable robotics compute will reinforce each other as physical AI matures.",
        "That matters because many robotics teams still operate across fragmented tools. A more integrated stack could shorten development time and make it easier to move from experimentation to field deployment.",
        "The risk is that platform ambition can outpace what robots can reliably do in real settings. Compute and models help, but deployments still fail when integration, safety, and workflow design are weak.",
        "For robot.tv, the important question is whether platform investments make the physical AI stack easier for shipping teams to use, not just more impressive at conference time.",
      ],
      categories: ["Physical AI", "Compute", "Robotics Software"],
      relatedResource: physicalAiHubResource,
    },
  ],
  [
    "ai2-robotics-raises-series-b-funding-to-advance-alphabot-embodied-ai",
    {
      excerpt:
        "AI2 Robotics funding matters because embodied AI teams still need capital to turn research-heavy physical AI claims into shippable products and repeatable customer value.",
      videoSummary:
        "The funding story matters because physical AI is still expensive to build into working products. Capital only helps if it turns into better systems, stronger deployment proof, and customer traction.",
      bodyParagraphs: [
        "Embodied AI companies often attract attention because the technical ambition is high, but funding stories only become meaningful when they improve the odds of reaching real customers. Capital matters most when it buys time for productization, deployment support, and stronger engineering loops.",
        "That is why robot.tv treats this as part of the physical AI stack story rather than as isolated startup news. Investors are still deciding which teams can turn model-heavy robotics narratives into durable execution.",
        "The useful follow-up questions are practical: what workflows will AlphaBot target, how quickly can the company shorten deployment cycles, and whether the product can show value beyond research demos.",
        "In physical AI, money is not the moat by itself. The real moat is whether capital accelerates the transition from promising system to repeatable operator value.",
      ],
      categories: ["Embodied AI", "Physical AI", "Robotics Startups"],
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      relatedResource: physicalAiHubResource,
    },
  ],
  [
    "ottonomy-ottumn-ai-orchestrates-robots-drones-smart-infrastructure",
    {
      excerpt:
        "Ottumn.AI matters because orchestration layers may become part of the physical AI stack as mixed fleets of robots, drones, and infrastructure nodes need one control surface.",
      videoSummary:
        "The story is really about orchestration as infrastructure. As more autonomous systems share sites, the winner may not just be the best robot but the software layer that coordinates fleets and connected environments cleanly.",
      bodyParagraphs: [
        "Orchestration is easy to underrate in robotics because it sits above the hardware. But once companies run multiple robots, aerial systems, or infrastructure endpoints together, software coordination becomes a serious operational dependency.",
        "That makes this story relevant to physical AI. Smarter robots still need systems that schedule work, route exceptions, track context, and present operators with one usable control layer.",
        "The long-term implication is that robotics may keep moving toward a stack model where fleet orchestration, simulation, model behavior, and edge hardware all matter together. No single layer solves deployment by itself.",
        "robot.tv follows these orchestration stories because they often reveal what commercial robotics teams actually need after the first device works: reliable system-level coordination.",
      ],
      categories: ["Robotics Software", "Autonomy", "Physical AI"],
      relatedResource: physicalAiHubResource,
    },
  ],
  [
    "the-hidden-infrastructure-challenge-facing-outdoor-robotics-oems",
    {
      excerpt:
        "Outdoor robotics infrastructure matters because physical AI does not win on models alone; deployments also depend on charging, communications, mapping, and service assumptions that many teams underestimate.",
      videoSummary:
        "The hidden infrastructure story is important because deployment friction often sits outside the robot. The more physical AI moves into real environments, the more invisible operational dependencies become decisive.",
      bodyParagraphs: [
        "Many robotics stories focus on the robot itself, but real deployments often fail because the surrounding infrastructure is weak. Charging, site connectivity, remote support, mapping quality, and service workflows can all become bottlenecks before algorithm quality does.",
        "That is why this belongs inside a physical AI hub. The category will not be won by model performance alone; it will also be won by who understands the supporting environment required to keep autonomous systems reliable.",
        "For operators, infrastructure blind spots usually show up as hidden cost. For OEMs, they show up as slower rollouts, heavier field-support burdens, and disappointing uptime once robots leave tightly controlled pilots.",
        "robot.tv tracks this theme because it sharpens a useful rule: the farther robotics moves into production, the more software and infrastructure discipline start to matter as much as the robot itself.",
      ],
      categories: ["Infrastructure", "Physical AI", "Autonomy"],
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      relatedResource: physicalAiHubResource,
    },
  ],
  [
    "igus-launches-new-rbtx-shopping-platform-for-robotics-developers",
    {
      excerpt:
        "Developer marketplaces matter because faster robotics builds require easier sourcing and integration of the components that sit underneath physical AI demos and real deployments.",
      videoSummary:
        "This story matters less as ecommerce news and more as developer workflow news. The easier it is to find and integrate robotics components, the easier it becomes to move from concept to working system.",
      bodyParagraphs: [
        "Robotics teams do not just need better models and better hardware. They also need lower-friction access to the components, suppliers, and integration paths that make rapid building possible in the first place.",
        "That is why developer-shopping platforms deserve a place in the broader physical AI story. If component discovery and integration stay slow, product iteration slows with them, no matter how good the higher-level software becomes.",
        "The commercial value of tools like this depends on whether they shorten sourcing cycles, reduce integration guesswork, and make it easier for smaller teams to assemble serious robotics systems.",
        "robot.tv treats this as a stack-enablement story: developer velocity often starts much lower in the stack than the headlines suggest.",
      ],
      categories: ["Robotics Software", "Developer Tools", "Physical AI"],
      sourceName: "The Robot Report",
      sourceSiteUrl: "https://www.therobotreport.com/",
      relatedResource: physicalAiHubResource,
    },
  ],
]);

const videoOverridesBySlug = {
  "11-women-shaping-the-future-of-robotics": "https://www.youtube.com/watch?v=uVJeI60glTE",
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[ch] || ch;
  });

const toPlainText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizeCompareText = (value) =>
  toPlainText(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const normalizeListingTitle = (value) =>
  normalizeCompareText(value)
    .split(" ")
    .filter(
      (word) =>
        word &&
        !["the", "a", "an", "and", "for", "to", "of", "in", "on", "with", "after", "than"].includes(word)
    )
    .slice(0, 8)
    .join(" ");

const mergeUniqueText = (...groups) => {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    for (const value of Array.isArray(group) ? group : []) {
      const text = toPlainText(value);
      const key = normalizeCompareText(text);
      if (!text || !key || seen.has(key)) continue;
      seen.add(key);
      merged.push(text);
    }
  }
  return merged;
};

const normalizeSlug = (slug) => String(slug || "").trim().replace(/^\/+|\/+$/g, "");
const articleUrlForSlug = (slug) => `${siteUrl}/${encodeURIComponent(normalizeSlug(slug))}/`;
const assertSafeArticleSlug = (slug) => {
  if (!slug) {
    throw new Error("Encountered an empty article slug while building news pages.");
  }
  if (slug.includes("/")) {
    throw new Error(`Article slug "${slug}" cannot contain "/" when articles live at the site root.`);
  }
  if (RESERVED_ARTICLE_SLUGS.has(slug.toLowerCase())) {
    throw new Error(`Article slug "${slug}" conflicts with a reserved top-level route on news.robot.tv.`);
  }
};
const isNoindexNewsSlug = (slug) => noindexNewsSlugs.has(normalizeSlug(slug));
const videoIdFromUrl = (url) => {
  const value = String(url || "").trim();
  if (!value) return "";
  const short = value.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (short) return short[1];
  const watch = value.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watch) return watch[1];
  const embed = value.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embed) return embed[1];
  return "";
};

const applyEditorialEnhancements = (post) => {
  if (!post) return post;
  const slug = normalizeSlug(post.slug);
  if (!slug) return post;
  const enhancement = editorialEnhancementsBySlug.get(slug);
  if (!enhancement) return { ...post, slug };

  const enhancedPost = {
    ...post,
    slug,
  };
  if (enhancement.excerpt) enhancedPost.excerpt = enhancement.excerpt;
  if (enhancement.videoSummary) enhancedPost.videoSummary = enhancement.videoSummary;
  if (enhancement.bodyParagraphs?.length) {
    enhancedPost.body = blocksFromParagraphs(enhancement.bodyParagraphs);
  }
  if (enhancement.categories?.length) {
    enhancedPost.categories = enhancement.replaceCategories
      ? [...enhancement.categories]
      : mergeUniqueText(post.categories || [], enhancement.categories);
  }
  if (enhancement.sourceName) enhancedPost.sourceName = enhancement.sourceName;
  if (enhancement.sourceUrl) enhancedPost.sourceUrl = enhancement.sourceUrl;
  if (enhancement.sourceSiteUrl) enhancedPost.sourceSiteUrl = enhancement.sourceSiteUrl;
  if (enhancement.sourcePublishedAt) enhancedPost.sourcePublishedAt = enhancement.sourcePublishedAt;
  if (enhancement.relatedResource) enhancedPost.relatedResource = enhancement.relatedResource;
  return enhancedPost;
};
const dedupeListingPosts = (posts) => {
  const seen = new Set();
  return posts.filter((post) => {
    const key = normalizeListingTitle(post?.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const sortPostsByPublishedAtDesc = (posts) =>
  [...posts].sort((a, b) => {
    const aTime = new Date(a?.publishedAt || 0).getTime();
    const bTime = new Date(b?.publishedAt || 0).getTime();
    return bTime - aTime;
  });
const filterVisibleListingPosts = (posts) =>
  posts.filter((post) => !hiddenListingSlugs.has(normalizeSlug(post?.slug)));
const getHomepageListingPosts = (posts) =>
  dedupeListingPosts(sortPostsByPublishedAtDesc(filterVisibleListingPosts(posts)));
const buildHomepagePreloadPosts = (posts) =>
  getHomepageListingPosts(posts)
    .slice(0, HOMEPAGE_PRELOAD_DEPTH)
    .map((post) => ({
      title: toPlainText(post.title || ""),
      excerpt: toPlainText(post.excerpt || ""),
      publishedAt: post.publishedAt || "",
      youtubeUrl: post.youtubeUrl || "",
      slug: normalizeSlug(post.slug),
      author: getAuthorName(post.author),
    }));

const youtubeThumb = (url) => {
  const id = videoIdFromUrl(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "https://robot.tv/images/robot_logo.png";
};

const formatDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
};

const formatDateOnly = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
};

const formatDisplayDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const formatRssDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
};

const blocksToParagraphs = (body) => {
  if (!Array.isArray(body)) return [];
  return body
    .filter((b) => b && b._type === "block" && Array.isArray(b.children))
    .map((b) => b.children.map((c) => c?.text || "").join("").trim())
    .map((p) => toPlainText(p))
    .filter((p) => p.length > 0)
    .slice(0, 12);
};

const isMetaParagraph = (paragraph) => {
  const text = toPlainText(paragraph);
  if (!text) return true;
  if (/^status:/i.test(text)) return true;
  if (/^source:/i.test(text)) return true;
  if (/^coverage source:/i.test(text)) return true;
  if (/^original coverage link:/i.test(text)) return true;
  if (/^original article:/i.test(text)) return true;
  if (/news\.google\.com\/rss\/articles/i.test(text)) return true;
  return false;
};

const filterRenderableParagraphs = (paragraphs) =>
  (Array.isArray(paragraphs) ? paragraphs : []).filter((paragraph) => !isMetaParagraph(paragraph));

const buildVideoSummary = (post, paragraphs = []) => {
  const manualSummary = toPlainText(post.videoSummary || "");
  if (manualSummary) return manualSummary;

  const parts = [];
  const seen = new Set();
  const pushUnique = (value) => {
    const text = toPlainText(value);
    const key = normalizeCompareText(text);
    if (!text || !key || seen.has(key)) return;
    seen.add(key);
    parts.push(text);
  };

  pushUnique(post.excerpt || "");
  for (const paragraph of paragraphs) {
    if (/^source:/i.test(paragraph)) continue;
    pushUnique(paragraph);
    if (parts.length >= 2) break;
  }

  const combined = parts.join(" ");
  return combined.length > 340 ? `${combined.slice(0, 337).trimEnd()}...` : combined;
};

const editorialAboutUrl = "https://robot.tv/about.html#editorial-operations";
const editorialMethodSummary =
  "robot.tv pairs attributable source reporting with embedded video and concise robotics context. Low-confidence automation items are held for review.";
const knownSourceSites = new Map([
  ["Reuters", "https://www.reuters.com/"],
  ["TechCrunch", "https://techcrunch.com/"],
  ["The Robot Report", "https://www.therobotreport.com/"],
  ["Business Insider", "https://www.businessinsider.com/"],
  ["The Guardian", "https://www.theguardian.com/"],
  ["Janes", "https://www.janes.com/"],
]);
const isGoogleNewsUrl = (value) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "news.google.com" || host.endsWith(".news.google.com");
  } catch (_) {
    return false;
  }
};

const getAuthorName = (authorValue) => {
  if (authorValue && typeof authorValue === "object") {
    return toPlainText(authorValue.name || "");
  }
  return toPlainText(authorValue || "");
};

const buildAuthorProfile = (post) => {
  const authorValue = post.author;
  const name = getAuthorName(authorValue) || "robot.tv News Desk";
  const explicitBio =
    authorValue && typeof authorValue === "object" ? toPlainText(authorValue.bio || "") : "";
  const normalizedName = normalizeCompareText(name);
  const isChenChen = normalizedName === "chen chen";
  return {
    name,
    role: isChenChen ? "Founder and editor, robot.tv" : "Contributor, robot.tv News",
    bio:
      explicitBio ||
      (isChenChen
        ? "Chen Chen leads robot.tv's robotics coverage, focusing on source-backed videos, deployment signals, and company execution."
        : `${name} contributes to robot.tv's video-first robotics coverage and source-backed briefings.`),
    url: editorialAboutUrl,
  };
};

const extractSourceMeta = (post, paragraphs = []) => {
  let name = toPlainText(post.sourceName || "");
  let url = toPlainText(post.sourceUrl || "");
  let siteUrl = toPlainText(post.sourceSiteUrl || "");
  let publishedAt = formatDate(post.sourcePublishedAt || "");

  const sourceParagraph = (Array.isArray(paragraphs) ? paragraphs : []).find((paragraph) =>
    /^(source|coverage source):/i.test(toPlainText(paragraph))
  );
  if (sourceParagraph) {
    const normalizedSource = toPlainText(sourceParagraph);
    const sourcePatterns = [
      /^Source:\s*(.+?)(?:\.\s*Published:\s*(.+?))?\.?$/i,
      /^Coverage source:\s*(.+?)(?:\s*\((.+?)\))?\.?$/i,
    ];
    for (const pattern of sourcePatterns) {
      const match = normalizedSource.match(pattern);
      if (!match) continue;
      if (!name) name = toPlainText(match[1]);
      if (!publishedAt) publishedAt = formatDate(match[2] || "");
      break;
    }
  }

  const originalArticleParagraph = (Array.isArray(paragraphs) ? paragraphs : []).find((paragraph) =>
    /^(original article|original coverage link):/i.test(toPlainText(paragraph))
  );
  if (!url && originalArticleParagraph) {
    const match = toPlainText(originalArticleParagraph).match(/https?:\/\/\S+/i);
    if (match) url = match[0];
  }

  if (!name) {
    const excerpt = toPlainText(post.excerpt || "");
    const explicitMatch = excerpt.match(/^(.+?) (reports|says)\b/i);
    if (explicitMatch) {
      name = toPlainText(explicitMatch[1]);
    } else if (/^multiple outlets report\b/i.test(excerpt)) {
      name = "Multiple outlets";
    }
  }

  if (url && isGoogleNewsUrl(url)) {
    url = "";
  }
  if (!siteUrl && name && knownSourceSites.has(name)) {
    siteUrl = knownSourceSites.get(name) || "";
  }

  const sourceType = url ? "Primary source" : siteUrl ? "Source outlet" : "Coverage basis";
  const sourceLabel = name || "robot.tv editorial briefing";
  const publishedDisplay = publishedAt ? formatDisplayDate(publishedAt) : "";

  return {
    name: sourceLabel,
    url,
    siteUrl,
    publishedAt,
    publishedDisplay,
    type: sourceType,
  };
};

const buildArticleHtml = (post) => {
  const slug = normalizeSlug(post.slug);
  const title = toPlainText(post.title || "robot.tv News");
  const excerpt = toPlainText(post.excerpt || "robot.tv News coverage.");
  const authorProfile = buildAuthorProfile(post);
  const categories = Array.isArray(post.categories) ? post.categories.map(toPlainText).filter(Boolean) : [];
  const publishedAtIso = formatDate(post.publishedAt || new Date().toISOString());
  const publishedDateDisplay = publishedAtIso ? formatDisplayDate(publishedAtIso) : "";
  assertSafeArticleSlug(slug);
  const canonicalUrl = articleUrlForSlug(slug);
  const thumb = youtubeThumb(post.youtubeUrl);
  const rawParagraphs = blocksToParagraphs(post.body);
  const paragraphs = filterRenderableParagraphs(rawParagraphs);
  const videoSummary = buildVideoSummary(post, paragraphs);
  const sourceMeta = extractSourceMeta(post, rawParagraphs);
  const relatedResource =
    post.relatedResource && typeof post.relatedResource === "object" ? post.relatedResource : null;
  const embedId = videoIdFromUrl(post.youtubeUrl);
  const embedUrl = embedId
    ? `https://www.youtube.com/embed/${embedId}?rel=0&modestbranding=1&playsinline=1`
    : "";
  const robotsContent = isNoindexNewsSlug(slug)
    ? "noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description: excerpt,
    datePublished: publishedAtIso || new Date().toISOString(),
    dateModified: publishedAtIso || new Date().toISOString(),
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
    image: [thumb],
    author: {
      "@type": "Person",
      name: authorProfile.name,
      url: authorProfile.url,
      description: authorProfile.bio,
    },
    publisher: {
      "@type": "Organization",
      name: "robot.tv",
      logo: {
        "@type": "ImageObject",
        url: "https://robot.tv/images/robot_logo.png",
      },
    },
  };
  if (sourceMeta.url) {
    jsonLd.isBasedOn = sourceMeta.url;
  }

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "robot.tv",
    url: "https://robot.tv/",
    logo: "https://robot.tv/images/robot_logo.png",
    sameAs: ["https://news.robot.tv/"],
  };

  const siteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "robot.tv News",
    url: "https://news.robot.tv/",
    publisher: {
      "@type": "Organization",
      name: "robot.tv",
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "robot.tv",
        item: "https://robot.tv/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "News",
        item: "https://news.robot.tv/",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: title,
        item: canonicalUrl,
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(excerpt)}">
  <meta name="robots" content="${robotsContent}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="icon" href="https://robot.tv/images/favicon.png" type="image/png">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="robot.tv News">
  <meta property="og:title" content="${escapeHtml(title)} | robot.tv News">
  <meta property="og:description" content="${escapeHtml(excerpt)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(thumb)}">
  <meta property="article:published_time" content="${escapeHtml(publishedAtIso || new Date().toISOString())}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)} | robot.tv News">
  <meta name="twitter:description" content="${escapeHtml(excerpt)}">
  <meta name="twitter:image" content="${escapeHtml(thumb)}">
  <title>${escapeHtml(title)} | robot.tv News</title>
  <script type="application/ld+json">${JSON.stringify(orgJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(siteJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <script src="/scripts/ga-lazy.js?v=20260309-ga-v1"></script>
  <style>
    :root { --bg:#05070b; --panel:#0d131d; --panel2:#111a27; --text:#f3f6fb; --muted:#97a5bc; --line:#233048; --red:#ef2d52; --blue:#5e84ff; }
    * { box-sizing:border-box; } html,body { margin:0; padding:0; min-height:100%; } body { font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--text); background:var(--bg); overflow-x:hidden; }
    a { color:inherit; text-decoration:none; } .container { position:relative; z-index:2; width:min(1180px,94vw); margin:0 auto; padding:1rem 0 2rem; }
    .bg-grid { position:fixed; inset:0; z-index:0; background:linear-gradient(to right, rgba(255,255,255,.03) 1px, transparent 1px),linear-gradient(to bottom, rgba(255,255,255,.03) 1px, transparent 1px); background-size:28px 28px; mask-image:radial-gradient(circle at center, #000 30%, transparent 82%); }
    .bg-glow { position:fixed; width:520px; height:520px; filter:blur(80px); z-index:1; opacity:.23; pointer-events:none; }
    .red { background:var(--red); top:-170px; left:-120px; } .blue { background:var(--blue); right:-170px; top:20%; }
    .panel { border:1px solid var(--line); border-radius:12px; background:linear-gradient(160deg,var(--panel),var(--panel2)); }
    .header { display:flex; align-items:center; justify-content:space-between; gap:1rem; border:1px solid var(--line); background:linear-gradient(135deg, rgba(10,15,24,.95), rgba(12,18,29,.95)); border-radius:10px; padding:.8rem 1rem; }
    .brand img { width:150px; height:auto; display:block; }
    .nav { display:flex; gap:1rem; flex-wrap:wrap; color:var(--muted); font-weight:600; }
    .nav a { transition:color .2s ease; }
    .nav a:hover { color:#d3deef; }
    .nav a.is-active { border:1px solid #5c80bb; border-radius:999px; padding:.22rem .62rem; color:#f4f8ff; background:linear-gradient(120deg, rgba(94,132,255,.32), rgba(94,132,255,.16)); box-shadow:0 0 0 1px rgba(94,132,255,.28) inset, 0 4px 14px rgba(28,52,96,.34); }
    .cta { border:1px solid #46597a; border-radius:999px; padding:.45rem .9rem; font-weight:700; font-size:.88rem; }
    article { margin-top:1rem; border:1px solid var(--line); border-radius:12px; padding:1rem; background:linear-gradient(160deg,var(--panel),var(--panel2)); }
    h1 { margin:.3rem 0 0; line-height:1.2; font-size:clamp(1.3rem,3.8vw,2rem); }
    .meta { margin:.55rem 0 0; color:var(--muted); font-size:.9rem; }
    .article-meta { margin:.6rem 0 0; display:flex; flex-wrap:wrap; gap:.45rem 1rem; align-items:center; }
    .article-byline { margin:0; color:#d7e3f6; font-size:.95rem; }
    .meta-link { color:#dbe8ff; text-decoration:underline; text-decoration-color:rgba(219,232,255,.45); text-underline-offset:.18em; }
    .excerpt { margin:.75rem 0 0; color:#c3d0e4; line-height:1.7; }
    .video { margin:.9rem 0 0; width:100%; aspect-ratio:16/9; border:1px solid #24344f; border-radius:10px; overflow:hidden; background:#000; }
    .video iframe { width:100%; height:100%; border:0; display:block; }
    .video-summary { margin-top:.9rem; border:1px solid #24344f; border-radius:10px; padding:.85rem .95rem; background:rgba(9, 14, 24, 0.72); }
    .video-summary h2 { margin:0; font-size:.96rem; letter-spacing:.04em; text-transform:uppercase; color:#dce8ff; }
    .video-summary p { margin:.55rem 0 0; color:#c6d2e8; line-height:1.75; }
    .insight-grid { margin-top:1rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:.85rem; }
    .insight-card { border:1px solid #24344f; border-radius:10px; padding:.9rem .95rem; background:rgba(8, 13, 22, .76); }
    .eyebrow { margin:0; color:#9fb2d4; font-size:.75rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    .insight-card h2 { margin:.28rem 0 0; font-size:1rem; }
    .insight-card p { margin:.55rem 0 0; color:#c6d2e8; line-height:1.7; }
    .trust-note { color:#9fb2d4; }
    .source-link { display:inline-flex; margin-top:.7rem; }
    .body p { margin:.9rem 0 0; color:#c6d2e8; line-height:1.8; }
    .tags { margin:.9rem 0 0; padding:0; list-style:none; display:flex; flex-wrap:wrap; gap:.45rem; }
    .tags li { border:1px solid #2a3f5d; border-radius:999px; padding:.22rem .55rem; color:#c6d2e8; font-size:.8rem; }
    .footer { margin-top:1.2rem; padding:1rem; display:flex; justify-content:space-between; gap:.8rem; flex-wrap:wrap; color:#a7b7d1; font-size:.9rem; }
    .footer-links { display:flex; gap:.9rem; flex-wrap:wrap; }
    @media (max-width:760px){ .header{flex-direction:column; align-items:flex-start;} .insight-grid{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <div class="bg-grid" aria-hidden="true"></div>
  <div class="bg-glow red" aria-hidden="true"></div>
  <div class="bg-glow blue" aria-hidden="true"></div>
  <div class="container">
    <header class="header">
      <a class="brand" href="https://robot.tv" aria-label="robot.tv home"><img src="https://robot.tv/images/robot_logo.png" alt="robot.tv" width="1194" height="224" fetchpriority="high" decoding="async"></a>
      <nav class="nav">
        <a href="https://robot.tv">Home</a>
        <a href="https://robot.tv/home.html">Robot Index</a>
        <a href="https://robot.tv/companies.html">Companies</a>
        <a href="https://robot.tv/live.html">Live Now</a>
        <a class="is-active" href="/">News</a>
        <a href="https://robot.tv/partner.html">Partner</a>
        <a href="https://robot.tv/about.html">About</a>
      </nav>
      <a class="cta" href="https://robot.tv/get-featured.html">Get Featured</a>
    </header>
    <article>
      <p style="margin:0;color:#acbcd7;letter-spacing:.08em;font-size:.75rem;text-transform:uppercase;font-weight:700;">Robotics News</p>
      <h1>${escapeHtml(title)}</h1>
      <div class="article-meta">
        <p class="meta">${escapeHtml(publishedDateDisplay)}</p>
        <p class="article-byline">By <a class="meta-link" href="${escapeHtml(authorProfile.url)}">${escapeHtml(authorProfile.name)}</a> | ${escapeHtml(authorProfile.role)}</p>
      </div>
      <p class="excerpt">${escapeHtml(excerpt)}</p>
      ${embedUrl ? `<div class="video"><iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(title)} video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>` : ""}
      ${embedUrl && videoSummary ? `<section class="video-summary"><h2>Video Summary</h2><p>${escapeHtml(videoSummary)}</p></section>` : ""}
      <section class="insight-grid" aria-label="Source and author details">
        <section class="insight-card">
          <p class="eyebrow">Source & Method</p>
          <h2>How this story was built</h2>
          <p><strong>${escapeHtml(sourceMeta.type)}:</strong> ${escapeHtml(sourceMeta.name)}</p>
          ${sourceMeta.publishedDisplay ? `<p class="trust-note">Original report date: ${escapeHtml(sourceMeta.publishedDisplay)}</p>` : ""}
          ${sourceMeta.url ? `<a class="meta-link source-link" href="${escapeHtml(sourceMeta.url)}" rel="noopener noreferrer">Read the original report</a>` : sourceMeta.siteUrl ? `<a class="meta-link source-link" href="${escapeHtml(sourceMeta.siteUrl)}" rel="noopener noreferrer">Visit ${escapeHtml(sourceMeta.name)}</a>` : `<p class="trust-note">This page is an original robot.tv editorial briefing backed by public footage and newsroom context.</p>`}
          ${!sourceMeta.url && sourceMeta.siteUrl ? `<p class="trust-note">Direct article links were not available in the archived source feed for this post.</p>` : ""}
          <p class="trust-note">${escapeHtml(editorialMethodSummary)}</p>
          <a class="meta-link source-link" href="${escapeHtml(editorialAboutUrl)}">How robot.tv covers robotics</a>
        </section>
        <section class="insight-card">
          <p class="eyebrow">About the Author</p>
          <h2>${escapeHtml(authorProfile.name)}</h2>
          <p><strong>${escapeHtml(authorProfile.role)}</strong></p>
          <p class="trust-note">${escapeHtml(authorProfile.bio)}</p>
          <a class="meta-link source-link" href="${escapeHtml(authorProfile.url)}">Editorial background</a>
        </section>
        ${
          relatedResource
            ? `<section class="insight-card">
          <p class="eyebrow">${escapeHtml(relatedResource.eyebrow || "Related Resource")}</p>
          <h2>${escapeHtml(relatedResource.title)}</h2>
          <p>${escapeHtml(relatedResource.description || "")}</p>
          <a class="meta-link source-link" href="${escapeHtml(relatedResource.url)}">${escapeHtml(relatedResource.ctaLabel || "Open resource")}</a>
        </section>`
            : ""
        }
      </section>
      <section class="body">
        ${(paragraphs.length ? paragraphs : ["This article is part of robot.tv's video-first robotics coverage."])
          .map((p) => `<p>${escapeHtml(p)}</p>`)
          .join("")}
      </section>
      ${categories.length ? `<ul class="tags">${categories.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>` : ""}
    </article>
    <footer class="panel footer">
      <div>robot.tv News | Real-time robotics briefings</div>
      <div class="footer-links">
        <a href="https://robot.tv">robot.tv</a>
        <a href="https://robot.tv/home.html">Robot Index</a>
        <a href="https://robot.tv/companies.html">Companies</a>
        <a href="https://robot.tv/live.html">Live</a>
        <a href="https://robot.tv/partner.html">Partner</a>
        <a href="https://robot.tv/about.html">About</a>
      </div>
    </footer>
  </div>
</body>
</html>`;
};

const fetchPosts = async () => {
  const query =
    '*[_type=="post" && defined(slug.current)] | order(publishedAt desc)[0...500]{title,excerpt,videoSummary,sourceName,sourceUrl,sourceSiteUrl,sourcePublishedAt,publishedAt,youtubeUrl,body,"slug":slug.current,"author":author->{name,bio,"slug":slug.current},"categories":categories[]->title}';
  const url = `https://${projectId}.apicdn.sanity.io/v2023-10-01/data/query/${dataset}?query=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`Failed to fetch posts from Sanity: HTTP ${resp.status}`);
  const json = await resp.json();
  const posts = Array.isArray(json.result) ? json.result : [];
  const merged = [...editorialPinnedPosts, ...posts];
  const unique = [];
  const seen = new Set();
  for (const post of merged) {
    const slug = normalizeSlug(post.slug);
    if (!slug || retiredLegacyRedirects[slug] || seen.has(slug)) continue;
    seen.add(slug);
    const overrideYoutubeUrl = videoOverridesBySlug[slug];
    unique.push(
      applyEditorialEnhancements({
        ...post,
        slug,
        youtubeUrl: overrideYoutubeUrl || post.youtubeUrl,
      })
    );
  }
  unique.sort((a, b) => {
    const aTime = new Date(a.publishedAt || 0).getTime();
    const bTime = new Date(b.publishedAt || 0).getTime();
    return bTime - aTime;
  });
  const generatedSlugs = new Set(unique.map((post) => post.slug));
  for (const [legacySlug, targetSlug] of Object.entries(retiredLegacyRedirects)) {
    if (!generatedSlugs.has(targetSlug)) {
      throw new Error(
        `Legacy redirect target is missing for ${legacySlug}: expected generated post ${targetSlug}`
      );
    }
  }
  return unique;
};

const writeSitemap = async (posts) => {
  const orderedPosts = [...posts].sort((a, b) => {
    const aTime = new Date(a.publishedAt || 0).getTime();
    const bTime = new Date(b.publishedAt || 0).getTime();
    return bTime - aTime;
  });
  const items = [
    {
      loc: `${siteUrl}/`,
      lastmod: formatDateOnly(new Date().toISOString()),
      changefreq: "daily",
      priority: "0.9",
    },
    ...orderedPosts.filter((p) => !isNoindexNewsSlug(p.slug)).map((p) => ({
      loc: articleUrlForSlug(p.slug),
      lastmod: formatDateOnly(p.publishedAt),
      changefreq: "weekly",
      priority: "0.8",
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items
  .map(
    (u) =>
      `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  )
  .join("\n")}
</urlset>
`;

  await fs.writeFile(sitemapPath, xml, "utf8");
};

const writeFeed = async (posts) => {
  const feedPosts = [...posts]
    .sort((a, b) => {
      const aTime = new Date(a.publishedAt || 0).getTime();
      const bTime = new Date(b.publishedAt || 0).getTime();
      return bTime - aTime;
    })
    .filter((post) => !isNoindexNewsSlug(post.slug))
    .slice(0, 40);
  const latestPublished = feedPosts[0]?.publishedAt || new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>robot.tv News</title>
    <link>${siteUrl}/</link>
    <description>Video-first robot news and robotics news from robot.tv covering humanoids, physical AI, quadrupeds, and deployment signals.</description>
    <language>en-us</language>
    <lastBuildDate>${formatRssDate(latestPublished)}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml" />
${feedPosts
  .map((post) => {
    const slug = normalizeSlug(post.slug);
    const link = articleUrlForSlug(slug);
    const categories = Array.isArray(post.categories) ? post.categories : [];
    return `    <item>
      <title>${escapeHtml(post.title || "")}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <pubDate>${formatRssDate(post.publishedAt)}</pubDate>
      <description>${escapeHtml(toPlainText(post.excerpt || "Latest robotics briefing from robot.tv."))}</description>
${categories.map((category) => `      <category>${escapeHtml(category)}</category>`).join("\n")}
    </item>`;
  })
  .join("\n")}
  </channel>
</rss>
`;

  await fs.writeFile(feedPath, xml, "utf8");
};
const writeHomepagePreloadScript = async (posts) => {
  const preloadPosts = buildHomepagePreloadPosts(posts);
  const payload = JSON.stringify(preloadPosts);
  await fs.writeFile(
    preloadedPostsScriptPath,
    `window.__ROBOTTV_PRELOADED_POSTS__ = ${payload};\n`,
    "utf8"
  );
};
const buildHomepageStaticMarkup = (posts) => {
  const listingPosts = getHomepageListingPosts(posts);
  const pagePosts = listingPosts.slice(0, HOMEPAGE_PAGE_SIZE);
  const cardsHtml = pagePosts
    .map((post, index) => {
      const title = escapeHtml(toPlainText(post.title || "robot.tv News"));
      const excerpt = escapeHtml(
        toPlainText(post.excerpt || "Latest robotics intelligence from robot.tv.")
      );
      const date = escapeHtml(formatDisplayDate(post.publishedAt));
      const articleUrl = escapeHtml(`/${normalizeSlug(post.slug)}/`);
      const thumbUrl = escapeHtml(youtubeThumb(post.youtubeUrl));
      return `        <article class="card ${index === 0 ? "featured" : ""}">
          <span class="thumb-shell">
            <img class="thumb" src="${thumbUrl}" alt="${title} thumbnail" loading="lazy">
            <span class="thumb-preview" aria-hidden="true"></span>
          </span>
          <div class="content">
            <p class="meta">${date}</p>
            <h3><a href="${articleUrl}">${title}</a></h3>
            <p>${excerpt}</p>
            <div class="row">
              <a class="btn btn-primary" href="${articleUrl}">Read Robot News</a>
            </div>
          </div>
        </article>`;
    })
    .join("\n");
  return `      <section class="panel hero">
        <p class="kicker">ROBOTICS NEWSROOM</p>
        <h1>Robot News and Robotics News, Daily</h1>
        <p class="copy">From humanoid robot news to AI robotics news and startup execution velocity, robot.tv News tracks the biggest robot news stories with video-first reporting.</p>
        <div class="actions">
          <a class="btn btn-ghost" href="https://robot.tv">Back to robot.tv</a>
        </div>
      </section>
      <section class="section">
        <div class="section-head">
          <h2>Latest Robot News</h2>
        </div>
        <div class="grid">
${cardsHtml}
        </div>
      </section>
      <section class="panel topic-hub">
        <p class="kicker">TOPIC HUB</p>
        <h2>Topic Hubs and Guide Pages</h2>
        <p class="copy">Track robot.tv's strongest structured resources for China humanoids, warehouse deployments, physical AI, industrial inspection robots, robotics startup execution, collaborative robot integration, and the canonical Unitree and Tesla guide pages instead of bouncing between isolated short posts.</p>
        <div class="actions">
          <a class="btn btn-primary" href="https://robot.tv/china-humanoid-robots.html">Open China Hub</a>
          <a class="btn btn-ghost" href="https://robot.tv/warehouse-humanoid-robots.html">Open Warehouse Hub</a>
          <a class="btn btn-ghost" href="https://robot.tv/physical-ai-robot-learning.html">Open Physical AI Hub</a>
          <a class="btn btn-ghost" href="https://robot.tv/industrial-inspection-robots.html">Open Inspection Hub</a>
          <a class="btn btn-ghost" href="https://robot.tv/robotics-startup-execution.html">Open Startup Guide</a>
          <a class="btn btn-ghost" href="https://robot.tv/collaborative-robot-integration.html">Open Cobot Guide</a>
          <a class="btn btn-ghost" href="https://robot.tv/company-unitree.html">See Unitree Guide</a>
          <a class="btn btn-ghost" href="https://robot.tv/company-tesla.html">See Tesla Guide</a>
        </div>
      </section>
      <section class="panel newsletter">
        <p class="kicker">NEWSLETTER</p>
        <h2>Get The Weekly Robot Brief</h2>
        <p class="copy">One concise email with the biggest robot news and robotics market signals from robot.tv News.</p>
        <form class="newsletter-form" method="POST" action="https://formsubmit.co/chenchen2012@hotmail.com">
          <input type="hidden" name="_next" value="https://robot.tv/contact-success/">
          <input type="hidden" name="_subject" value="robot.tv newsletter signup from news">
          <input type="hidden" name="_captcha" value="false">
          <input type="text" name="_honey" style="position:absolute;left:-5000px;" tabindex="-1" autocomplete="off">
          <input type="hidden" name="topic" value="newsletter-signup">
          <input type="hidden" name="source" value="news-robot-tv">
          <input type="email" name="email" placeholder="you@company.com" required>
          <button class="btn btn-primary" type="submit">Subscribe</button>
        </form>
        <p class="newsletter-note">No spam. Unsubscribe any time.</p>
      </section>`;
};
const writeHomepageIndex = async (posts) => {
  const indexPath = path.join(staticDir, "index.html");
  const html = await fs.readFile(indexPath, "utf8");
  const start = html.indexOf(HOMEPAGE_START_MARKER);
  const end = html.indexOf(HOMEPAGE_END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Could not find homepage static content markers in static/index.html");
  }
  const prefix = html.slice(0, start + HOMEPAGE_START_MARKER.length);
  const suffix = html.slice(end);
  const rendered = buildHomepageStaticMarkup(posts);
  await fs.writeFile(indexPath, `${prefix}\n${rendered}\n      ${suffix}`, "utf8");
};

const ensureCleanPostDir = async () => {
  const entries = await fs.readdir(staticDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (STATIC_RESERVED_DIRS.has(entry.name)) continue;
    await fs.rm(path.join(staticDir, entry.name), { recursive: true, force: true });
  }
  for (const year of ["2024", "2025"]) {
    await fs.rm(path.join(staticDir, year), { recursive: true, force: true });
  }
};

const writePosts = async (posts) => {
  const seenSlugs = new Set();
  for (const post of posts) {
    const slug = normalizeSlug(post.slug);
    assertSafeArticleSlug(slug);
    if (seenSlugs.has(slug)) {
      throw new Error(`Duplicate article slug "${slug}" would overwrite an existing news page.`);
    }
    seenSlugs.add(slug);
    const html = buildArticleHtml(post);
    const primaryDir = path.join(staticDir, slug);
    await fs.mkdir(primaryDir, { recursive: true });
    await fs.writeFile(path.join(primaryDir, "index.html"), html, "utf8");

  }
};

const main = async () => {
  const posts = await fetchPosts();
  await ensureCleanPostDir();
  await writePosts(posts);
  await writeSitemap(posts);
  await writeFeed(posts);
  await writeHomepagePreloadScript(posts);
  await writeHomepageIndex(posts);
  console.log(`Generated ${posts.length} static post pages plus sitemap.xml and feed.xml`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
