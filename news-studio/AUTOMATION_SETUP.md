# Auto Publish Setup (Every 12 Hours)

A GitHub Actions workflow is included at `.github/workflows/news-auto-publish.yml`.

## Required GitHub Secrets

Set these secrets in your repository settings (`Settings -> Secrets and variables -> Actions`):

- `SANITY_PROJECT_ID` = `lumv116w`
- `SANITY_DATASET` = `production`
- `SANITY_API_TOKEN` = Sanity write token
- `SANITY_AUTHOR_ID` = `author-chen-chen` (optional)

## Create Sanity API Token

1. Open: `https://www.sanity.io/manage/project/lumv116w/api`
2. Create token with write access to dataset `production`.
3. Copy token into GitHub secret `SANITY_API_TOKEN`.

## Run Immediately

1. Open `Actions` tab in GitHub.
2. Select `Auto Publish Robot News`.
3. Click `Run workflow`.

The workflow runs automatically every 12 hours via cron and now includes:
- duplicate guard on recent titles
- top-company weighted selection
- draft fallback for low-confidence items
- feed health check (`MAX_FEED_AGE_HOURS`, default `24`)
