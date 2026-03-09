# robot.tv News CMS

This folder contains two separate things:

- the Sanity Studio for editing content
- the static public build that powers `news.robot.tv`

## 1) Create / link a Sanity project

Run in this folder:

```bash
npm install
npx sanity login
npx sanity init --create-project "robot-tv-news" --dataset production
```

If you already have a Sanity project, skip `init` and set env vars.

## 2) Configure env vars

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set values:

- `SANITY_STUDIO_PROJECT_ID` (`lumv116w`)
- `SANITY_STUDIO_DATASET` (usually `production`)
- `SANITY_STUDIO_HOSTNAME` (`robottv` for `robottv.sanity.studio`)

## 3) Run locally

```bash
npm run dev
```

Studio will open locally (usually `http://localhost:3333`).

## 4) Deploy Studio to `robottv.sanity.studio`

```bash
npm run deploy
```

This repo is configured so Studio can be hosted separately at `robottv.sanity.studio`.
Do not mount Studio under `news.robot.tv/studio`.

## 5) Build the public news site

```bash
npm run build:public
```

This writes the public site to `dist-public/`.
That output is intended for static hosting such as Cloudflare Pages.
The build now includes a verification step that fails if required public files or lazy-load analytics wiring are missing.

## Public hosting layout

- `news.robot.tv` should point to the static public build, not to Studio.
- `robottv.sanity.studio` should be the editor/admin URL.
- `news.robot.tv/studio` is intentionally not part of the production route design anymore.

## Cloudflare Pages deployment

Preferred production path:

1. Create a Cloudflare Pages project for `news.robot.tv`.
2. Use the repo workflow `Deploy Public News Site` for code-driven public deploys.
3. Add GitHub secrets:
   - `CLOUDFLARE_API_KEY`
   - `CLOUDFLARE_EMAIL`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_NEWS_PAGES_PROJECT_NAME`
4. Keep `NEWS_PUBLIC_DEPLOY_HOOK_URL` only if you want a fallback rebuild trigger for manual publish flows.

When the Cloudflare secrets are present, the scheduled auto-publish workflow deploys directly to Pages after it publishes new Sanity posts.

## Content model

- `post`: title, slug, excerpt, publish date, hero image, YouTube URL, optional YouTube video ID override, video summary, primary source name, primary source URL, optional source site URL, optional source publish time, author, categories, body.
- `author`: name, slug, image, bio.
- `category`: title, slug, description.

## YouTube usage

For each article, populate `youtubeUrl` with a full URL like:

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`

`youtubeVideoId` is optional and only needed when you want to override extraction in your frontend.

## Frontend query example (GROQ)

```groq
*[_type == "post"] | order(publishedAt desc){
  title,
  "slug": slug.current,
  excerpt,
  videoSummary,
  sourceName,
  sourceUrl,
  sourceSiteUrl,
  sourcePublishedAt,
  publishedAt,
  youtubeUrl,
  youtubeVideoId,
  "author": author->{name, bio, "slug": slug.current},
  "categories": categories[]->title
}
```
