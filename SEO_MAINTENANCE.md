# robot.tv SEO Maintenance Calendar

Last updated: March 7, 2026

## Cadence Overview

1. Every 12 hours
- Homepage freshness (`/index.html` "Latest Intelligence" + ticker)
- `news.robot.tv` auto-publish pipeline
- Rule: only publish when there is valid new source content

2. Weekly
- Technical SEO checks: `sitemap.xml`, `robots.txt`, `_redirects`, 404 behavior
- Internal-link sanity check for key hubs: `companies.html`, top company pages
- Broken-link spot check for top landing pages
- Refresh static profile/newsroom link blocks with `node scripts/build-static-profile-news.mjs` before main-site deploys when newsroom coverage has changed

3. Every 2-4 weeks
- Evergreen hub refresh:
  - `companies.html`
  - `company-unitree.html`
  - `company-boston-dynamics.html`
  - `company-figure.html`
  - `company-tesla.html`
  - `company-agility.html`
  - `company-apptronik.html`
- Top robot profile refresh (any pages with strong impressions/clicks)

4. Monthly
- Conversion/commercial pages:
  - `get-featured.html`
  - `partner.html`
  - `pricing.html`
  - `contact.html`
- Review CTA copy, trust signals, and internal links from homepage/news entry points

5. Quarterly
- Trust/compliance pages:
  - `about.html`
  - `privacy.html`
  - `terms.html`
- Content pruning/merge pass:
  - remove thin pages
  - merge overlapping pages
  - improve canonical/internal linking consistency

## Weekly SEO Checklist

1. Validate crawl surfaces
- Confirm `robots.txt` and `sitemap.xml` are reachable and up to date
- Confirm new important URLs are in sitemap

2. Validate indexability and canonical basics
- Spot-check canonical tags on homepage + 3 key company pages + 3 key robot pages
- Confirm no accidental `noindex` behavior

3. Validate internal links
- Check homepage links to key hubs (`/companies`, `/news`, `/live`)
- Check company pages link to relevant robot pages and vice versa

4. Validate stale/broken paths
- Test known old or typo paths and confirm useful 404/redirect behavior
- Keep `_redirects` current for high-volume legacy paths

5. Validate content freshness signals
- Ensure homepage "Latest Intelligence" is recent and non-duplicative
- Ensure top evergreen pages show meaningful refreshes (not cosmetic edits)

## Monthly Content Checklist

1. Update high-intent copy on `get-featured.html`, `partner.html`, `pricing.html`
2. Add/update at least 1 internal link from each conversion page to a relevant proof page
3. Refresh 2-4 top evergreen pages with substantive updates
4. Review titles/meta descriptions on pages with highest search impressions

## Ranking Assets vs Freshness Briefs

1. Treat indexed guide and hub pages as ranking assets:
- `company-unitree.html`
- `company-tesla.html`
- `unitree-robots.html`
- `tesla-optimus.html`
- `humanoid-robots.html`
- `china-humanoid-robots.html`
- `warehouse-humanoid-robots.html`
- `industrial-inspection-robots.html`
- `robotics-startup-execution.html`
- `physical-ai-robot-learning.html`
- `collaborative-robot-integration.html`

2. Treat short newsroom posts as freshness briefs unless they have enough original analysis to stand alone in search.

3. Every freshness brief should link to one relevant ranking asset when a clear topic match exists.

4. Do not create a new indexed hub if an existing guide already satisfies the same search intent; strengthen the canonical page instead.

5. A new root hub is justified when a topic shows repeated search intent plus at least 3 strong, internally linkable stories or reference pages.

## Ownership Pattern

1. Automation handles:
- 12-hour homepage/news refreshes
- Weekly technical SEO report via `.github/workflows/weekly-seo-check.yml`
- Manual AI draft generation via `.github/workflows/evergreen-content-drafts.yml`

2. Manual/editorial handles:
- weekly technical checks
- biweekly evergreen page improvements
- monthly conversion and metadata refinement
- reviewing AI-generated evergreen draft artifacts before publishing them live

## Quick Run Commands

Run from repo root:

```bash
# Find key SEO files quickly
ls -1 robots.txt sitemap.xml _redirects 404.html

# Spot-check canonical usage across site
rg -n 'rel=\"canonical\"' *.html

# Spot-check noindex usage (should normally be empty for public pages)
rg -n 'noindex' *.html

# Spot-check internal news/company/robot links
rg -n 'news\\.robot\\.tv|company-|companies\\.html' *.html

# Refresh static newsroom link blocks inside profile pages
node scripts/build-static-profile-news.mjs

# Generate DeepSeek-backed evergreen draft packs (requires DEEPSEEK_API_KEY)
node scripts/generate-evergreen-seo-drafts.mjs

# Run the same checks used by GitHub Actions
node scripts/seo-weekly-check.mjs
```

## Notes

1. Frequent updates help only when quality stays high.
2. Avoid thin or duplicate edits just to change timestamps.
3. Keep the current guardrail: if feed/source validation fails, skip publish.
4. Intentional `noindex` set for the weekly checker: `404.html`, `contact-success.html`, `mediakit-print.html`, `news.html`, `sales.html`, `chenchen.html`, `wooshe.html`, `anymal.html`, `apollo.html`, `digit.html`, `handle.html`, `thr3.html`, `unitreeb2.html`, `unitreeg1.html`, `unitreego2.html`, `unitreeh1.html`, `unitreeh2.html`, `yumi.html`.
5. Thin robot reference pages can stay live for navigation and internal linking while remaining out of the index if they do not yet have enough original substance to compete in search.
6. `companies.html` is the canonical company hub; keep `robot-companies` as a legacy redirect only.
7. Static profile/newsroom blocks should ship in HTML where possible; browser-side news scripts are fallback behavior, not the primary SEO path.
8. For broad Unitree and Tesla intent, strengthen `company-unitree.html` and `company-tesla.html` before creating any new overlapping guide URLs.
9. Use `physical-ai-robot-learning.html` as the main root-level destination for VLA models, simulation, compute, orchestration, and robot-learning software-stack stories.
10. Use `collaborative-robot-integration.html` as the main root-level destination for cobot rollout, line-fit, safety, and operator handoff guidance.
11. Use `industrial-inspection-robots.html` as the main root-level destination for quadruped inspection, outdoor patrol, routine rounds, and field-operations workflow stories.
12. Use `robotics-startup-execution.html` as the main root-level destination for robotics startup execution, shipping velocity, capital discipline, and deployment-proof intent.
13. DeepSeek automation should generate draft artifacts only; do not let AI auto-commit or auto-publish evergreen edits without review.
14. Evergreen AI prompts should stay source-grounded: official company pages, robot.tv internal guides, and relevant `news.robot.tv` coverage only.
