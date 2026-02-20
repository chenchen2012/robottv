# Direct X Auto-Publish Setup

This repo supports direct publishing to X from GitHub Actions every 12 hours.

## 1) Add GitHub Secrets

Repository -> Settings -> Secrets and variables -> Actions -> New repository secret

- `X_API_KEY`
- `X_API_KEY_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`

## 2) X app permissions

In X Developer Portal, app permissions must be `Read and Write`.
After changing permissions, regenerate access token + access token secret.

## 3) Run workflow

Actions -> `Auto Publish Robot News` -> `Run workflow`

The workflow will:
1. publish news
2. generate social drafts
3. auto-post up to 2 X posts directly via X API
4. fallback to Buffer only if direct X secrets are missing

## 4) Verify posting

Download `social-drafts` artifact and check:

- `latest-x-publish-report.json`

If direct posting succeeds, Buffer step is skipped to avoid duplicates.
