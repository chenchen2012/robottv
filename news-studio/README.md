# robot.tv News CMS

This folder contains two separate things:

- the Sanity Studio for editing content
- the static public build that powers `news.robot.tv`

Editorial standard:

- See [EDITORIAL_POLICY.md](/Users/cc801/Documents/New%20project/robottv/news-studio/EDITORIAL_POLICY.md) for what should and should not be published on `news.robot.tv`.

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
2. Create a Cloudflare Pages project for `robot.tv`.
3. Use the repo workflows `Deploy Public News Site` and `Deploy robot.tv Public Site` for code-driven public deploys.
4. Add GitHub secrets:
   - `CLOUDFLARE_API_KEY`
   - `CLOUDFLARE_EMAIL`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_NEWS_PAGES_PROJECT_NAME`
   - `CLOUDFLARE_MAIN_PAGES_PROJECT_NAME`

When the Cloudflare secrets are present, the scheduled auto-publish workflow publishes to Sanity, rebuilds `news.robot.tv`, rebuilds `robot.tv`, and deploys both directly to Cloudflare Pages.
Production deploys should not rely on fallback deploy hooks.

## Homepage architecture

Homepage news now follows one build-time model across both public sites:

- Sanity is the only canonical source for homepage news posts.
- `news.robot.tv/` is rendered at build time into the static public site.
- `robot.tv/` homepage news is also rendered at build time from Sanity before the root public site is packaged.
- Pinned analysis remains an explicit build-time display rule.
- Homepage sections should stay clear and stable:
  - `Latest News`
  - `Pinned Analysis`
  - `Evergreen Hubs`

Do not treat preload scripts, browser cache, or generated dist files as homepage sources of truth.
Do not reintroduce browser-side homepage fetch or homepage `localStorage` fallback.

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
