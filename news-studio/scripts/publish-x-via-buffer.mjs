import fs from 'node:fs/promises'

const token = process.env.BUFFER_ACCESS_TOKEN || ''
const draftsPath = process.env.SOCIAL_DRAFT_JSON || 'news-studio/social-drafts/latest-social-drafts.json'
const maxPosts = Number(process.env.SOCIAL_PUBLISH_COUNT || process.env.PUBLISH_COUNT || 2)
const postNow = process.env.BUFFER_POST_NOW !== '0'
const dryRun = process.env.BUFFER_DRY_RUN === '1'
const outReport = process.env.BUFFER_REPORT_JSON || 'news-studio/social-drafts/latest-buffer-publish-report.json'
const disableIfXDirect = process.env.BUFFER_DISABLE_IF_X_DIRECT !== '0'
const hasXDirectSecrets = Boolean(
  (process.env.X_API_KEY || '') &&
  (process.env.X_API_KEY_SECRET || '') &&
  (process.env.X_ACCESS_TOKEN || '') &&
  (process.env.X_ACCESS_TOKEN_SECRET || '')
)

if (disableIfXDirect && hasXDirectSecrets) {
  console.log('Direct X secrets detected; skipping Buffer publish to avoid duplicate posting.')
  process.exit(0)
}

if (!token) {
  console.log('BUFFER_ACCESS_TOKEN not set; skipping Buffer publish step.')
  process.exit(0)
}

const apiGet = async (path) => {
  const sep = path.includes('?') ? '&' : '?'
  const url = `https://api.bufferapp.com/1/${path}${sep}access_token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  const txt = await res.text()
  let data = null
  try { data = txt ? JSON.parse(txt) : null } catch { data = { raw: txt } }
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${txt}`)
  return data
}

const apiPostForm = async (path, formPairs) => {
  const body = new URLSearchParams()
  for (const [k, v] of formPairs) body.append(k, String(v))
  body.append('access_token', token)
  const res = await fetch(`https://api.bufferapp.com/1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const txt = await res.text()
  let data = null
  try { data = txt ? JSON.parse(txt) : null } catch { data = { raw: txt } }
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status}): ${txt}`)
  return data
}

const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const urlFromText = (s) => (String(s || '').match(/https?:\/\/news\.robot\.tv\/post\/[^\s)]+/i) || [])[0] || ''

const draftsRaw = await fs.readFile(draftsPath, 'utf8')
const drafts = JSON.parse(draftsRaw)
const items = Array.isArray(drafts?.items) ? drafts.items : []
if (!items.length) {
  console.log('No social draft items found; nothing to publish.')
  process.exit(0)
}

const profiles = await apiGet('profiles.json')
const xProfiles = (Array.isArray(profiles) ? profiles : []).filter((p) => {
  const s = String(p?.service || '').toLowerCase()
  return s === 'twitter' || s === 'x'
})

if (!xProfiles.length) {
  throw new Error('No X/Twitter profiles found in connected Buffer account.')
}

const profile = xProfiles[0]
const profileId = profile.id

let recentText = []
try {
  const sent = await apiGet(`profiles/${encodeURIComponent(profileId)}/updates/sent.json?count=40`)
  const pending = await apiGet(`profiles/${encodeURIComponent(profileId)}/updates/pending.json?count=40`)
  const s = Array.isArray(sent?.updates) ? sent.updates : Array.isArray(sent) ? sent : []
  const p = Array.isArray(pending?.updates) ? pending.updates : Array.isArray(pending) ? pending : []
  recentText = [...s, ...p].map((u) => normalize(u?.text || u?.text_formatted || ''))
} catch (e) {
  console.warn(`Could not fetch recent updates for dedupe guard: ${e.message}`)
}

const recentUrls = new Set(recentText.map(urlFromText).filter(Boolean))
const queue = []
for (const item of items) {
  const xText = normalize(item?.x?.text || '')
  if (!xText) continue
  const storyUrl = urlFromText(xText)
  if (storyUrl && recentUrls.has(storyUrl)) continue
  queue.push({ title: item?.title || '', text: xText, storyUrl })
  if (queue.length >= Math.max(1, maxPosts)) break
}

if (!queue.length) {
  console.log('No new X posts to publish after duplicate guard.')
  const report = { publishedAt: new Date().toISOString(), profileId, posted: [], skipped: 'all duplicates or empty' }
  await fs.writeFile(outReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.exit(0)
}

const posted = []
for (const q of queue) {
  if (dryRun) {
    posted.push({ title: q.title, dryRun: true, text: q.text })
    continue
  }

  const response = await apiPostForm('updates/create.json', [
    ['profile_ids[]', profileId],
    ['text', q.text],
    ['shorten', 'false'],
    ['now', postNow ? 'true' : 'false']
  ])

  posted.push({
    title: q.title,
    storyUrl: q.storyUrl,
    updateId: response?.updates?.[0]?.id || response?.update?.id || null,
    status: response?.updates?.[0]?.status || response?.update?.status || (postNow ? 'sent' : 'buffer')
  })
}

const report = {
  publishedAt: new Date().toISOString(),
  dryRun,
  profile: {
    id: profileId,
    service: profile.service,
    username: profile.service_username || profile.formatted_username || ''
  },
  requested: queue.length,
  posted
}

await fs.writeFile(outReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Buffer X publish complete. Posted ${posted.length} update(s).`)
