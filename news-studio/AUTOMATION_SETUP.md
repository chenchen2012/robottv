# Auto Publish Setup (Every 6 Hours + Cloudflare Pages Deploy)

A GitHub Actions workflow is included at `../.github/workflows/news-auto-publish.yml` (repository root).

Before changing automation logic, read:

- [EDITORIAL_POLICY.md](/Users/cc801/Documents/New%20project/robottv/news-studio/EDITORIAL_POLICY.md)

The default publishing bias should stay conservative: skip promotional or weak items rather than publishing them.

## Required GitHub Secrets

Set these secrets in your repository settings (`Settings -> Secrets and variables -> Actions`):

- `SANITY_API_TOKEN` = Sanity write token
- `SANITY_AUTHOR_ID` = `author-chen-chen` (optional)
- `CLOUDFLARE_API_KEY` = Cloudflare Global API key
- `CLOUDFLARE_EMAIL` = Cloudflare account email
- `CLOUDFLARE_ACCOUNT_ID` = Cloudflare account id that owns the Pages project
- `CLOUDFLARE_NEWS_PAGES_PROJECT_NAME` = Pages project name for the public `news.robot.tv` site
- `CLOUDFLARE_MAIN_PAGES_PROJECT_NAME` = Pages project name for the public `robot.tv` site

Note:
- Workflow is pinned to project `lumv116w` and dataset `production` directly in `../.github/workflows/news-auto-publish.yml` to avoid secret drift.
- Studio deployment is separate. The editor should live at `robottv.sanity.studio`, not under `news.robot.tv/studio`.
- If the Cloudflare secrets are present, the auto-publish workflow deploys both `news.robot.tv` and `robot.tv` directly to Cloudflare Pages after publishing to Sanity.
- Production deploys are Pages-only. Do not configure fallback production deploy hooks.
- Homepage freshness now depends on GitHub Actions rebuilding both public sites from Sanity-backed content after publish. Do not add browser-side homepage fallback logic to compensate for deploy issues.

## Create Sanity API Token

1. Open: `https://www.sanity.io/manage/project/lumv116w/api`
2. Create token with write access to dataset `production`.
3. Copy token into GitHub secret `SANITY_API_TOKEN`.

## Cloudflare Pages Path (Required)

1. Create a Cloudflare Pages project for the public `news.robot.tv` site.
2. Create a Cloudflare Pages project for the public `robot.tv` site.
3. Keep the Pages build command empty if you plan to use direct deploy from GitHub Actions.
4. Add these GitHub secrets:
   - `CLOUDFLARE_API_KEY`
   - `CLOUDFLARE_EMAIL`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_NEWS_PAGES_PROJECT_NAME`
   - `CLOUDFLARE_MAIN_PAGES_PROJECT_NAME`
5. Run `Deploy Public News Site` and `Deploy robot.tv Public Site` from GitHub Actions once to confirm both projects accept their static output.
6. After that, scheduled auto-publish runs will publish to Sanity, rebuild both public sites, and deploy both directly to Cloudflare Pages.

## Run Immediately

1. Open `Actions` tab in GitHub.
2. Select `Auto Publish Robot News`.
3. Click `Run workflow`.

The workflow runs automatically every 6 hours via cron and now includes:
- duplicate guard on recent titles
- top-company weighted selection
- draft fallback for low-confidence items
- feed health check (`MAX_FEED_AGE_HOURS`, default `24`)
- automatic rebuild + deploy of both public sites after successful publish

## Manual Publish Guidance

If you publish content manually in Sanity Studio, trigger the GitHub Actions workflow instead of using an external deploy hook:

1. Open the repository `Actions` tab.
2. Run `Auto Publish Robot News` or the specific deploy workflow you need.
3. Confirm both Cloudflare Pages projects show fresh deploy timestamps after the run.
