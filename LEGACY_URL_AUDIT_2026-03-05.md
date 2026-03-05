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
