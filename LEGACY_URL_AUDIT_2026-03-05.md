# Legacy URL Audit (robot.tv)

Date: 2026-03-05
Source: GA4 property `462066539`, Organic Search only, last 180 days

## Method

- Pulled top organic landing paths by sessions.
- Compared each path against:
  - existing canonical HTML files
  - existing redirect sources in `_redirects`
- Flagged only paths with sessions and no redirect rule to a valid canonical target.

## Result

- New missing high-hit legacy redirects found: **0**
- Existing legacy paths receiving traffic are already covered by redirects:
  - `/conta` -> `/contact.html`
  - `/digit` -> `/digit.html`
  - `/spot` -> `/spot.html`
  - `/mediakit` -> `/mediakit.html`
  - `/test` -> `/`

## Notes

- Highest organic landings are canonical URLs (`/`, `/company-boston-dynamics.html`, `/sales.html`, `/company-unitree.html`, `/home.html`).
- No immediate redirect gaps were detected from this 180-day organic sample.
- Re-run after Search Console API access is enabled to capture query-side 404/legacy patterns not visible in GA4.

## Recovery Pass Applied (2026-03-05)

- Expanded `_redirects` with proactive legacy URL continuity rules to recover link equity from older path variants:
  - Added trailing-slash redirects for core static pages (for example: `/about/`, `/companies/`, `/sales/`, `/pricing/`, `/get-featured/`, `/robot-companies/`, `/humanoid-robots/`).
  - Added `/news/` -> `https://news.robot.tv/`.
  - Added common legacy company/profile aliases:
    - `/boston-dynamics.html` -> `/company-boston-dynamics.html`
    - `/unitree.html` -> `/company-unitree.html`
    - `/tesla.html` -> `/company-tesla.html`
    - `/figure.html` -> `/company-figure.html`
    - `/agility.html` -> `/company-agility.html`
    - `/apptronik.html` -> `/company-apptronik.html`
    - `/company/<name>` and `/company/<name>/` variants for major company pages.
- Intent: reduce avoidable 404s from historical links and preserve relevance signals through deterministic 301 mappings.
