const EXACT_REDIRECTS = new Map([
  ["/index.html", "/"],
  ["/index.php", "/"],
  ["/index", "/"],
  ["/homepage", "/"],
  ["/homepage/", "/"],
  ["/news", "https://news.robot.tv/"],
  ["/news/", "https://news.robot.tv/"],
  ["/post", "https://news.robot.tv/"],
  ["/post/", "https://news.robot.tv/"],
  ["/robot-companies", "/companies.html"],
  ["/robot-companies/", "/companies.html"],
  ["/robot-companies.html", "/companies.html"],
  ["/companies-hub", "/companies.html"],
  ["/companies-hub/", "/companies.html"],
  ["/humanoids", "/humanoid-robots.html"],
  ["/humanoids/", "/humanoid-robots.html"],
  ["/boston-dynamics", "/company-boston-dynamics.html"],
  ["/boston-dynamics/", "/company-boston-dynamics.html"],
  ["/company-boston-dynamics", "/company-boston-dynamics.html"],
  ["/company-boston-dynamics/", "/company-boston-dynamics.html"],
  ["/unitree", "/company-unitree.html"],
  ["/unitree/", "/company-unitree.html"],
  ["/company-unitree", "/company-unitree.html"],
  ["/company-unitree/", "/company-unitree.html"],
  ["/company-tesla", "/company-tesla.html"],
  ["/company-tesla/", "/company-tesla.html"],
  ["/company-figure", "/company-figure.html"],
  ["/company-figure/", "/company-figure.html"],
  ["/company-agility", "/company-agility.html"],
  ["/company-agility/", "/company-agility.html"],
  ["/company-apptronik", "/company-apptronik.html"],
  ["/company-apptronik/", "/company-apptronik.html"],
  ["/company/boston-dynamics", "/company-boston-dynamics.html"],
  ["/company/boston-dynamics/", "/company-boston-dynamics.html"],
  ["/company/unitree", "/company-unitree.html"],
  ["/company/unitree/", "/company-unitree.html"],
  ["/company/tesla", "/company-tesla.html"],
  ["/company/tesla/", "/company-tesla.html"],
  ["/company/figure", "/company-figure.html"],
  ["/company/figure/", "/company-figure.html"],
  ["/company/agility", "/company-agility.html"],
  ["/company/agility/", "/company-agility.html"],
  ["/company/apptronik", "/company-apptronik.html"],
  ["/company/apptronik/", "/company-apptronik.html"],
  ["/media-kit", "/mediakit.html"],
  ["/media-kit/", "/mediakit.html"],
  ["/media-kit-pdf", "/mediakit-print.html"],
  ["/media-kit-pdf/", "/mediakit-print.html"],
  ["/submit-video", "/get-featured.html"],
  ["/submit-video/", "/get-featured.html"],
  ["/conta", "/contact.html"],
  ["/conta/", "/contact.html"],
  ["/unitree-g1", "/unitreeg1.html"],
  ["/unitree-g1/", "/unitreeg1.html"],
  ["/unitree-h1", "/unitreeh1.html"],
  ["/unitree-h1/", "/unitreeh1.html"],
  ["/unitree-h2", "/unitreeh2.html"],
  ["/unitree-h2/", "/unitreeh2.html"],
  ["/unitree-go2", "/unitreego2.html"],
  ["/unitree-go2/", "/unitreego2.html"],
  ["/unitree-b2", "/unitreeb2.html"],
  ["/unitree-b2/", "/unitreeb2.html"],
  ["/aild", "/404.html"],
  ["/aild.html", "/404.html"],
  ["/test", "/"],
  ["/test/", "/"],
  ["/test.html", "/"],
  ["/cn", "/"],
  ["/cn/", "/"],
  [
    "/2026/02/17/unitree-robots-stun-at-spring-festival-gala.html",
    "https://news.robot.tv/post/china-humanoid-robots-lunar-new-year-showtime/"
  ],
  [
    "/2026/02/17/unitree-spring-festival-gala-robots-a-full-release-of-additional-details.html",
    "https://news.robot.tv/post/china-humanoid-robots-lunar-new-year-showtime/"
  ]
])

const RETIRED_PREFIXES = [
  "/wp-admin/",
  "/wp-content/",
  "/wp-includes/",
  "/wp-json/",
  "/xy-gf/",
  "/cn/2016/",
  "/geeni-camera/"
]

const RETIRED_EXACT = new Set([
  "/xmlrpc.php",
  "/xdog",
  "/xdog.html"
])

const redirect = (requestUrl, targetPath, status = 301) => {
  const nextUrl = new URL(targetPath, requestUrl)
  nextUrl.search = requestUrl.search
  return Response.redirect(nextUrl.toString(), status)
}

const normalizePath = (pathname) => {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1)
  return pathname
}

const servePrettyAsset = async (request, env, prettyPath, statusOverride) => {
  const targetUrl = new URL(request.url)
  targetUrl.pathname = prettyPath
  const assetResp = await env.ASSETS.fetch(new Request(targetUrl.toString(), request))
  if (statusOverride == null) return assetResp

  const headers = new Headers(assetResp.headers)
  return new Response(assetResp.body, {
    status: statusOverride,
    headers
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const normalized = normalizePath(path)

    if (url.hostname === "www.robot.tv") {
      return redirect(url, `https://robot.tv${path}${url.search}`, 301)
    }

    if (path.startsWith("/cn/")) {
      return redirect(url, "/", 301)
    }

    if (RETIRED_EXACT.has(path) || RETIRED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return servePrettyAsset(request, env, "/404", 410)
    }

    if (EXACT_REDIRECTS.has(path)) {
      const status = path === "/aild" || path === "/aild.html" ? 410 : 301
      if (status === 410) {
        return servePrettyAsset(request, env, "/404", 410)
      }
      return redirect(url, EXACT_REDIRECTS.get(path), status)
    }

    if (EXACT_REDIRECTS.has(normalized)) {
      return redirect(url, EXACT_REDIRECTS.get(normalized), 301)
    }

    if (path.startsWith("/category/") || path.startsWith("/tag/") || path.startsWith("/author/") || path.startsWith("/page/")) {
      return redirect(url, "https://news.robot.tv/", 301)
    }

    const postHtmlMatch = path.match(/^\/post\/([^/]+)\.html$/)
    if (postHtmlMatch) {
      return redirect(url, `https://news.robot.tv/post/${postHtmlMatch[1]}/`, 301)
    }

    const datedHtmlMatch = path.match(/^\/\d{4}\/\d{2}(?:\/\d{2})?\/([^/]+)\.html$/)
    if (datedHtmlMatch) {
      return redirect(url, `https://news.robot.tv/post/${datedHtmlMatch[1]}/`, 301)
    }

    const datedSlugMatch = path.match(/^\/\d{4}\/\d{2}(?:\/\d{2})?\/([^/]+)\/?$/)
    if (datedSlugMatch) {
      return redirect(url, `https://news.robot.tv/post/${datedSlugMatch[1]}/`, 301)
    }

    if (path.endsWith(".html")) {
      if (path === "/index.html") {
        return redirect(url, "/", 301)
      }
      const prettyPath = path.slice(0, -5)
      if (prettyPath) {
        return servePrettyAsset(request, env, prettyPath)
      }
    }

    const topLevelPrettyMatch = path.match(/^\/([a-z0-9][a-z0-9-]*)\/?$/i)
    if (topLevelPrettyMatch && normalized !== "/") {
      const candidateResp = await servePrettyAsset(request, env, normalized)
      if (candidateResp.status < 400) {
        return redirect(url, `${normalized}.html`, 301)
      }
    }

    return env.ASSETS.fetch(request)
  }
}
