# news.robot.tv Launch Checklist

Use this checklist to run the public news site and Studio as separate surfaces.

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

- Deploy Studio with `npm run deploy`.
- Target host: `robottv.sanity.studio`.
- Confirm Studio opens and can publish content.

## 5) Build and deploy the public site

- Run `npm run build:public`.
- Deploy `dist-public/` to your static host for `news.robot.tv`.
- Confirm article pages, `feed.xml`, `robots.txt`, `sitemap.xml`, and `404.html` are present at the output root.
- Confirm the build passes the new public verification step and that `_redirects` is present in the upload root.

## 5b) Cloudflare Pages production setup

- Create a Pages project for the public `news.robot.tv` site.
- Add GitHub secrets:
  - `CLOUDFLARE_API_KEY`
  - `CLOUDFLARE_EMAIL`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_NEWS_PAGES_PROJECT_NAME`
- Run the `Deploy Public News Site` workflow once.
- Confirm the preview/production Pages URL serves the news homepage, article pages, `feed.xml`, and `sitemap.xml` correctly.
- If scheduled auto-publish should deploy directly, keep the Cloudflare secrets set in GitHub Actions.
- Keep `NEWS_PUBLIC_DEPLOY_HOOK_URL` only if you still want a fallback rebuild trigger for manual edits.

## 6) DNS cutover

- Point `news.robot.tv` to the public static host.
- Keep Studio on `robottv.sanity.studio`.
- Wait for DNS propagation.
- Open `https://news.robot.tv` and verify reading/browsing.
- Open `https://robottv.sanity.studio` and verify editing/login.

## 7) URL continuity

- If old WordPress links were indexed/shared, create redirects for those exact URLs.
- Prioritize homepage + any shared post URLs.

## 8) Post-cutover checks

- Publish one test post and verify it appears correctly.
- Confirm YouTube embeds/links render correctly.
- Confirm analytics is firing as expected.
- Verify mobile view and desktop view.

## 9) Decommission WordPress

- Disable public WordPress site after successful cutover.
- Keep backup archive for rollback/emergency reference.
