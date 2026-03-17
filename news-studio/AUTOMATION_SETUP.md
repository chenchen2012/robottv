# Auto Publish Setup (Every 6 Hours + Public Rebuild Hook)

A GitHub Actions workflow is included at `../.github/workflows/news-auto-publish.yml` (repository root).

Before changing automation logic, read:

- [EDITORIAL_POLICY.md](/Users/cc801/Documents/New%20project/robottv/news-studio/EDITORIAL_POLICY.md)

The default publishing bias should stay conservative: skip promotional or weak items rather than publishing them.

## Required GitHub Secrets

Set these secrets in your repository settings (`Settings -> Secrets and variables -> Actions`):

- `SANITY_API_TOKEN` = Sanity write token
- `SANITY_AUTHOR_ID` = `author-chen-chen` (optional)
- `NEWS_PUBLIC_DEPLOY_HOOK_URL` = optional fallback deploy hook for the public `news.robot.tv` build
- `CLOUDFLARE_API_KEY` = Cloudflare Global API key
- `CLOUDFLARE_EMAIL` = Cloudflare account email
- `CLOUDFLARE_ACCOUNT_ID` = Cloudflare account id that owns the Pages project
- `CLOUDFLARE_NEWS_PAGES_PROJECT_NAME` = Pages project name for the public `news.robot.tv` site

Note:
- Workflow is pinned to project `lumv116w` and dataset `production` directly in `../.github/workflows/news-auto-publish.yml` to avoid secret drift.
- Studio deployment is separate. The editor should live at `robottv.sanity.studio`, not under `news.robot.tv/studio`.
- If the Cloudflare secrets are present, the auto-publish workflow builds `dist-public/` and deploys it straight to Cloudflare Pages via `wrangler pages deploy`. In that mode the script skips the deploy-hook POST automatically.
- If the Cloudflare secrets are not present yet, the workflow keeps using `NEWS_PUBLIC_DEPLOY_HOOK_URL` as the public rebuild trigger.

## Create Sanity API Token

1. Open: `https://www.sanity.io/manage/project/lumv116w/api`
2. Create token with write access to dataset `production`.
3. Copy token into GitHub secret `SANITY_API_TOKEN`.

## Cloudflare Pages Path (Preferred)

1. Create a Cloudflare Pages project for the public `news.robot.tv` site.
2. Keep the Pages build command empty if you plan to use direct deploy from GitHub Actions.
3. Add these GitHub secrets:
   - `CLOUDFLARE_API_KEY`
   - `CLOUDFLARE_EMAIL`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_NEWS_PAGES_PROJECT_NAME`
4. Run `Deploy Public News Site` from GitHub Actions once to confirm the project accepts `dist-public/`.
5. After that, scheduled auto-publish runs will deploy directly to Cloudflare Pages without using Netlify.

## Create Public Deploy Hook (Fallback / Manual Publish)

1. Open your public hosting project for `news.robot.tv`.
2. Create a deploy hook/build hook for the production branch.
3. Copy the generated URL into GitHub secret `NEWS_PUBLIC_DEPLOY_HOOK_URL`.
4. Confirm the hook rebuilds the static public news site when triggered with `POST`.

## Run Immediately

1. Open `Actions` tab in GitHub.
2. Select `Auto Publish Robot News`.
3. Click `Run workflow`.

The workflow runs automatically every 6 hours via cron and now includes:
- duplicate guard on recent titles
- top-company weighted selection
- draft fallback for low-confidence items
- feed health check (`MAX_FEED_AGE_HOURS`, default `24`)
- automatic public-site rebuild trigger after successful publish

## Optional: Instant Rebuild On Manual Sanity Publish

If you publish articles manually in Sanity Studio and are not relying solely on scheduled GitHub Actions deploys, add a Sanity webhook that posts to the same deploy hook URL:

1. In Sanity project settings, open `API -> Webhooks`.
2. Trigger on `create`, `update`, and `delete` for document type `post`.
3. Target URL: your public-site deploy hook URL.
4. This ensures static SEO pages and sitemap refresh immediately after manual edits.
