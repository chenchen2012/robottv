# Auto Publish Setup (Every 6 Hours + Instant Rebuild)

A GitHub Actions workflow is included at `../.github/workflows/news-auto-publish.yml` (repository root).

## Required GitHub Secrets

Set these secrets in your repository settings (`Settings -> Secrets and variables -> Actions`):

- `SANITY_API_TOKEN` = Sanity write token
- `SANITY_AUTHOR_ID` = `author-chen-chen` (optional)
- `NETLIFY_BUILD_HOOK_URL` = Netlify build hook for `news.robot.tv`

Note:
- Workflow is pinned to project `lumv116w` and dataset `production` directly in `../.github/workflows/news-auto-publish.yml` to avoid secret drift.

## Create Sanity API Token

1. Open: `https://www.sanity.io/manage/project/lumv116w/api`
2. Create token with write access to dataset `production`.
3. Copy token into GitHub secret `SANITY_API_TOKEN`.

## Create Netlify Build Hook

1. Open Netlify site settings for the news site.
2. Go to `Build & deploy -> Build hooks`.
3. Create a hook (example name: `sanity-publish`).
4. Copy the generated URL into GitHub secret `NETLIFY_BUILD_HOOK_URL`.

## Run Immediately

1. Open `Actions` tab in GitHub.
2. Select `Auto Publish Robot News`.
3. Click `Run workflow`.

The workflow runs automatically every 6 hours via cron and now includes:
- duplicate guard on recent titles
- top-company weighted selection
- draft fallback for low-confidence items
- feed health check (`MAX_FEED_AGE_HOURS`, default `24`)
- automatic Netlify rebuild trigger after successful publish

## Optional: Instant Rebuild On Manual Sanity Publish

If you publish articles manually in Sanity Studio, add a Sanity webhook that posts to the same Netlify build hook URL:

1. In Sanity project settings, open `API -> Webhooks`.
2. Trigger on `create`, `update`, and `delete` for document type `post`.
3. Target URL: your Netlify build hook URL.
4. This ensures static SEO pages and sitemap refresh immediately after manual edits.
