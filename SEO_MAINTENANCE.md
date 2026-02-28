# robot.tv SEO Maintenance Calendar

Last updated: February 28, 2026

## Cadence Overview

1. Every 12 hours
- Homepage freshness (`/index.html` "Latest Intelligence" + ticker)
- `news.robot.tv` auto-publish pipeline
- Rule: only publish when there is valid new source content

2. Weekly
- Technical SEO checks: `sitemap.xml`, `robots.txt`, `_redirects`, 404 behavior
- Internal-link sanity check for key hubs: `companies.html`, `robot-companies.html`, top company pages
- Broken-link spot check for top landing pages

3. Every 2-4 weeks
- Evergreen hub refresh:
  - `companies.html`
  - `robot-companies.html`
  - `company-unitree.html`
  - `company-boston-dynamics.html`
  - `company-figure.html`
  - `company-tesla.html`
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
- Check homepage links to key hubs (`/companies`, `/robot-companies`, `/news`, `/live`)
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

## Ownership Pattern

1. Automation handles:
- 12-hour homepage/news refreshes
- Weekly technical SEO report via `.github/workflows/weekly-seo-check.yml`

2. Manual/editorial handles:
- weekly technical checks
- biweekly evergreen page improvements
- monthly conversion and metadata refinement

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
rg -n 'news\\.robot\\.tv|company-|robot-companies|companies\\.html' *.html

# Run the same checks used by GitHub Actions
node scripts/seo-weekly-check.mjs
```

## Notes

1. Frequent updates help only when quality stays high.
2. Avoid thin or duplicate edits just to change timestamps.
3. Keep the current guardrail: if feed/source validation fails, skip publish.
4. Intentional `noindex` set for the weekly checker: `404.html`, `contact-success.html`, `mediakit-print.html`, `news.html`, `sales.html`, `aild.html`, `chenchen.html`, `wooshe.html`.
