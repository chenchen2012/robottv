# news.robot.tv Launch Checklist

Use this checklist to replace WordPress with Sanity Studio safely.

## 1) Final backup of WordPress

- Export posts/pages/media from WordPress (Tools -> Export).
- Save one full hosting backup/snapshot if available.
- Keep backup files in a safe folder before shutdown.

## 2) Sanity project setup

- In `news-studio`, run `npx sanity login`.
- Create or link project: `npx sanity init`.
- Copy env file: `cp .env.example .env`.
- Set `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET`.
- Test locally: `npm run dev`.

## 3) Recreate the few existing posts

- Create required authors and categories first.
- Recreate each old post manually in Sanity.
- For each post, fill:
  - `title`
  - `slug` (match old slug when possible)
  - `excerpt`
  - `publishedAt`
  - `youtubeUrl`
  - `videoSummary`
  - `sourceName`
  - `sourceUrl`
  - `sourceSiteUrl` when only the publisher domain is available
  - `body`
- Confirm each post has a working YouTube URL.

## 4) Deploy Studio

- Deploy Studio (`npm run deploy`) or deploy with Vercel/Netlify.
- Confirm Studio opens and can publish content.

## 5) DNS cutover

- Point `news.robot.tv` to the new Studio host target.
- Wait for DNS propagation.
- Open `https://news.robot.tv` and verify login and content editing.

## 6) URL continuity

- If old WordPress links were indexed/shared, create redirects for those exact URLs.
- Prioritize homepage + any shared post URLs.

## 7) Post-cutover checks

- Publish one test post and verify it appears correctly.
- Confirm YouTube embeds/links render correctly.
- Confirm analytics is firing as expected.
- Verify mobile view and desktop view.

## 8) Decommission WordPress

- Disable public WordPress site after successful cutover.
- Keep backup archive for rollback/emergency reference.
