const LEGACY_POST_MAP = new Map([
  [
    "/post/china-rolls-out-worlds-first-military-proof-5g-that-can-connect-10000-army-robots",
    "/robot-news/"
  ],
  [
    "/post/china-rolls-out-worlds-first-military-proof-5g-that-can-connect-10000-army-robots/",
    "/robot-news/"
  ],
  [
    "/post/china-rolls-out-worlds-first-military-proof-5g-that-can-connect-10000-army-robots.html",
    "/robot-news/"
  ],
  [
    "/post/alphabet-owned-robotics-software-company-intrinsic-joins-google",
    "/intrinsic-is-joining-google-to-advance-physical-ai-in-robotics/"
  ],
  [
    "/post/alphabet-owned-robotics-software-company-intrinsic-joins-google/",
    "/intrinsic-is-joining-google-to-advance-physical-ai-in-robotics/"
  ],
  [
    "/post/alphabet-owned-robotics-software-company-intrinsic-joins-google.html",
    "/intrinsic-is-joining-google-to-advance-physical-ai-in-robotics/"
  ],
  [
    "/post/amazon-halts-blue-jay-robotics-project-after-less-than-6-months",
    "/amazon-blue-jay-halt-warehouse-robotics-roi-standards/"
  ],
  [
    "/post/amazon-halts-blue-jay-robotics-project-after-less-than-6-months/",
    "/amazon-blue-jay-halt-warehouse-robotics-roi-standards/"
  ],
  [
    "/post/amazon-halts-blue-jay-robotics-project-after-less-than-6-months.html",
    "/amazon-blue-jay-halt-warehouse-robotics-roi-standards/"
  ]
])

const redirect = (requestUrl, targetPath, status = 301) => {
  const nextUrl = new URL(targetPath, requestUrl)
  return Response.redirect(nextUrl.toString(), status)
}

const withSearch = (requestUrl, pathname) => {
  const nextUrl = new URL(pathname, requestUrl)
  nextUrl.search = requestUrl.search
  return nextUrl.toString()
}

const withRobotsTag = (response, robotsTag) => {
  const headers = new Headers(response.headers)
  headers.set("X-Robots-Tag", robotsTag)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === "/feed") {
      return Response.redirect(withSearch(url, "/feed.xml"), 301)
    }

    if (path === "/favicon.ico") {
      return Response.redirect("https://robot.tv/images/favicon.png", 301)
    }

    if (path === "/index.php" || path.startsWith("/tdb_templates/") || path === "/tds-switching-plans-wizard" || path === "/tds-switching-plans-wizard/") {
      return Response.redirect(withSearch(url, "/"), 301)
    }

    if (path === "/post" || path === "/post/") {
      return Response.redirect(withSearch(url, "/"), 301)
    }

    if (path === "/contact" || path === "/contact/") {
      return Response.redirect(withSearch(url, "/"), 301)
    }

    if (LEGACY_POST_MAP.has(path)) {
      return Response.redirect(withSearch(url, LEGACY_POST_MAP.get(path)), 301)
    }

    if (path.startsWith("/category/") || path.startsWith("/tag/") || path.startsWith("/author/") || path.startsWith("/page/")) {
      return Response.redirect(withSearch(url, "/"), 301)
    }

    const postHtmlMatch = path.match(/^\/post\/([^/]+)\.html$/)
    if (postHtmlMatch) {
      return Response.redirect(withSearch(url, `/${postHtmlMatch[1]}/`), 301)
    }

    const postSlugMatch = path.match(/^\/post\/([^/]+)\/?$/)
    if (postSlugMatch && !postSlugMatch[1].includes(".")) {
      return Response.redirect(withSearch(url, `/${postSlugMatch[1]}/`), 301)
    }

    const datedHtmlMatch = path.match(/^\/\d{4}\/\d{2}(?:\/\d{2})?\/([^/]+)\.html$/)
    if (datedHtmlMatch) {
      return Response.redirect(withSearch(url, `/${datedHtmlMatch[1]}/`), 301)
    }

    const datedSlugMatch = path.match(/^\/\d{4}\/\d{2}(?:\/\d{2})?\/([^/]+)\/?$/)
    if (datedSlugMatch) {
      return Response.redirect(withSearch(url, `/${datedSlugMatch[1]}/`), 301)
    }

    const response = await env.ASSETS.fetch(request)
    const requestedPage = Number.parseInt(url.searchParams.get("page") || "1", 10)
    if (path === "/" && Number.isFinite(requestedPage) && requestedPage > 1) {
      return withRobotsTag(response, "noindex,follow")
    }

    return response
  }
}
