# Buffer Auto-Publish Setup (X only)

This workflow can auto-post generated X drafts to your connected Buffer X channel.

## 1) Add GitHub Secret

Repository -> Settings -> Secrets and variables -> Actions -> New repository secret

- Name: `BUFFER_ACCESS_TOKEN`
- Value: your Buffer access token

## 2) Run workflow

Actions -> `Auto Publish Robot News` -> `Run workflow`

If token is set and Buffer has a connected X profile, it will publish up to 2 X posts immediately per run.

## 3) Verify result

Download `social-drafts` artifact and open:

- `latest-buffer-publish-report.json`

It includes posted update IDs/status.

## Notes

- LinkedIn and Reddit remain draft-only right now.
- Duplicate guard checks recent Buffer sent/pending updates by article URL.
