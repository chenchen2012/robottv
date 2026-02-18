# robot.tv News CMS (Sanity Studio)

This folder is a Sanity Studio for `news.robot.tv`.

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

- `SANITY_STUDIO_PROJECT_ID`
- `SANITY_STUDIO_DATASET` (usually `production`)

## 3) Run locally

```bash
npm run dev
```

Studio will open locally (usually `http://localhost:3333`).

## 4) Deploy Studio to `news.robot.tv`

Recommended: deploy Studio with Vercel/Netlify and map subdomain `news.robot.tv`.

Alternative (Sanity hosted Studio):

```bash
npm run deploy
```

Then set your DNS/CNAME for `news.robot.tv` to the deployed Studio endpoint.

## Content model

- `post`: title, slug, excerpt, publish date, hero image, YouTube URL, optional YouTube video ID override, author, categories, body.
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
  publishedAt,
  youtubeUrl,
  youtubeVideoId,
  "author": author->name,
  "categories": categories[]->title
}
```
