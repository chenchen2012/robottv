import crypto from 'node:crypto'
import fs from 'node:fs/promises'

const apiKey = process.env.X_API_KEY || ''
const apiKeySecret = process.env.X_API_KEY_SECRET || ''
const accessToken = process.env.X_ACCESS_TOKEN || ''
const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET || ''

const draftsPath = process.env.SOCIAL_DRAFT_JSON || 'news-studio/social-drafts/latest-social-drafts.json'
const outReport = process.env.X_REPORT_JSON || 'news-studio/social-drafts/latest-x-publish-report.json'
const maxPosts = Number(process.env.SOCIAL_PUBLISH_COUNT || process.env.PUBLISH_COUNT || 2)
const dryRun = process.env.X_DRY_RUN === '1'

if (!apiKey || !apiKeySecret || !accessToken || !accessTokenSecret) {
  console.log('X API secrets are not fully set; skipping direct X publish step.')
  process.exit(0)
}

const percentEncode = (str) => encodeURIComponent(String(str))
  .replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)

const nonce = () => crypto.randomBytes(16).toString('hex')
const timestamp = () => Math.floor(Date.now() / 1000).toString()

const normalizeParams = (params) => Object.keys(params)
  .sort()
  .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
  .join('&')

const buildAuthHeader = ({ method, baseUrl, queryParams = {} }) => {
  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp(),
    oauth_token: accessToken,
    oauth_version: '1.0'
  }

  const allParams = { ...queryParams, ...oauthParams }
  const paramString = normalizeParams(allParams)
  const signatureBase = [method.toUpperCase(), percentEncode(baseUrl), percentEncode(paramString)].join('&')
  const signingKey = `${percentEncode(apiKeySecret)}&${percentEncode(accessTokenSecret)}`
  const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64')

  oauthParams.oauth_signature = signature
  const header = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ')

  return header
}

const xFetch = async ({ method, url, query = {}, jsonBody = null }) => {
  const u = new URL(url)
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, String(v))
  }

  const baseUrl = `${u.origin}${u.pathname}`
  const auth = buildAuthHeader({ method, baseUrl, queryParams: query })
  const res = await fetch(u.toString(), {
    method,
    headers: {
      Authorization: auth,
      ...(jsonBody ? { 'Content-Type': 'application/json' } : {})
    },
    ...(jsonBody ? { body: JSON.stringify(jsonBody) } : {})
  })

  const txt = await res.text()
  let data = null
  try { data = txt ? JSON.parse(txt) : null } catch { data = { raw: txt } }

  if (!res.ok) {
    throw new Error(`X API ${method} ${u.pathname} failed (${res.status}): ${txt}`)
  }
  return data
}

const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const urlFromText = (s) => (String(s || '').match(/https?:\/\/news\.robot\.tv\/post\/[^\s)]+/i) || [])[0] || ''
const tighten = (s, n) => {
  const t = normalize(s)
  if (t.length <= n) return t
  return `${t.slice(0, Math.max(0, n - 1)).trim()}…`
}

const draftsRaw = await fs.readFile(draftsPath, 'utf8')
const drafts = JSON.parse(draftsRaw)
const items = Array.isArray(drafts?.items) ? drafts.items : []
if (!items.length) {
  console.log('No social draft items found; nothing to publish to X.')
  process.exit(0)
}

let me = null
let recentUrls = new Set()
try {
  me = await xFetch({ method: 'GET', url: 'https://api.x.com/2/users/me' })
  const userId = me?.data?.id
  if (userId) {
    const recent = await xFetch({
      method: 'GET',
      url: `https://api.x.com/2/users/${userId}/tweets`,
      query: {
        max_results: 20,
        exclude: 'retweets,replies',
        'tweet.fields': 'created_at,text'
      }
    })
    const tweets = Array.isArray(recent?.data) ? recent.data : []
    recentUrls = new Set(tweets.map((t) => urlFromText(t.text)).filter(Boolean))
  }
} catch (e) {
  console.warn(`X dedupe precheck failed; continuing without recent URL filter: ${e.message}`)
}

const queue = []
for (const item of items) {
  const text = tighten(item?.x?.text || '', 280)
  if (!text) continue
  const articleUrl = urlFromText(text)
  if (articleUrl && recentUrls.has(articleUrl)) continue
  queue.push({
    title: item?.title || '',
    text,
    articleUrl
  })
  if (queue.length >= Math.max(1, maxPosts)) break
}

if (!queue.length) {
  const report = {
    publishedAt: new Date().toISOString(),
    dryRun,
    account: me?.data || null,
    posted: [],
    skipped: 'all duplicates or empty drafts'
  }
  await fs.writeFile(outReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log('No new X posts to publish after duplicate guard.')
  process.exit(0)
}

const posted = []
for (const q of queue) {
  if (dryRun) {
    posted.push({ title: q.title, dryRun: true, text: q.text })
    continue
  }

  const created = await xFetch({
    method: 'POST',
    url: 'https://api.x.com/2/tweets',
    jsonBody: { text: q.text }
  })

  posted.push({
    title: q.title,
    articleUrl: q.articleUrl,
    tweetId: created?.data?.id || null,
    text: q.text
  })
}

const report = {
  publishedAt: new Date().toISOString(),
  dryRun,
  account: me?.data || null,
  requested: queue.length,
  posted
}

await fs.writeFile(outReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Direct X publish complete. Posted ${posted.length} tweet(s).`)
