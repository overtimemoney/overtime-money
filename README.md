# Overtime Money — Debt Payoff Calculator (web app)

A client-side debt payoff calculator for nurses and shift workers with irregular
income. **Vanilla HTML/CSS/JS only** — no build step, no npm, no frameworks, no
external requests. Works fully offline after first load (PWA).

## Files

| File | What it is |
|---|---|
| `index.html` | **Public demo** shell (`window.OVERTIME_FULL = false`) |
| `app-9f3k7x2m4q.html` | **Full (paid) version** shell (`window.OVERTIME_FULL = true`). The random suffix is the access control — only buyers get this URL. |
| `app.js` | All logic: payoff engine (Part 1, pure/testable) + UI (Part 2) |
| `styles.css` | Full theme (navy/coral/cream) |
| `manifest.json` | PWA manifest (installable, standalone) |
| `sw.js` | Service worker — offline-first cache |
| `icon-192.png`, `icon-512.png` | PWA icons |
| `engine.test.js` | Node test suite for the payoff engine |

Both shells load the same `app.js`/`styles.css`; the inline
`window.OVERTIME_FULL` flag is the only difference.

## Demo vs full

- **Demo** (`index.html`): preloaded sample data, max **3 debts** (adding a 4th
  shows an upgrade nudge), persistent "Get the full version" banner, "Reset demo
  data" button.
- **Full** (`app-9f3k7x2m4q.html`): starts blank, up to **10 debts**, "Load sample
  data" option, no banner. Registers the service worker (installable/offline).

**Where the buy link goes:** in `app.js`, set `DEMO_UPGRADE_URL` (currently `'#'`)
to the Etsy listing URL. It feeds the demo banner link and the upgrade-nudge
button.

**Access control model:** the full version lives at an unguessable URL delivered
via the Etsy's PDF download. Anyone with the URL can use it — same model as
other Etsy "app" sellers. For stronger gating (license keys), a backend is
required; that's a future layer, not this build.

## Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `overtime-money`).
2. Push the contents of this folder to the repo's `main` branch (all files at
   repo root, or in `docs/` — either works).
3. GitHub → repo **Settings → Pages** → Source: **Deploy from a branch** →
   Branch: `main`, folder: `/` (or `/docs`) → Save.
4. After a minute: demo at `https://<user>.github.io/<repo>/`
   and full version at `https://<user>.github.io/<repo>/app-9f3k7x2m4q.html`.
5. The service worker only works over HTTPS (GitHub Pages is HTTPS ✓) and
   takes effect on second visit. Bump `CACHE` in `sw.js` when shipping updates.

## Etsy delivery (PDF-with-link)

Etsy digital delivery doesn't accept HTML, so the listing's downloadable file is
a short PDF containing:
1. A big button/link to the full-version URL above,
2. "Add to Home Screen" instructions (iPhone Safari → Share → Add to Home
   Screen; Android Chrome → Menu → Add to Home Screen),
3. A 1-page quick-start.

## Engine math (verified)

Ported from a Google Sheets build whose outputs were hand-checked to the cent.
Per month, per debt (`S` = start balance): interest `ROUND(S·apr/12, 2)`;
payment `MIN(S+I, minPay + firepower)` for the focus debt, `MIN(S+I, minPay)`
otherwise (no cascade — unused extra is not passed on); end
`MAX(0, ROUND(S+I−payment, 2))`. Firepower = month's extra + minimums of debts
already at zero. Avalanche = APR desc, Snowball = balance asc, ranks fixed from
initial inputs. **Tie fix:** the sheet's `RANK()` gave tied debts the same rank
and the extra could hit both; here ties break deterministically by input order —
extra goes to exactly one debt per month.

Verified (see `engine.test.js`, run with `node engine.test.js`):
- Sample ($8,400@24.99/min$180, $3,200@19.99/min$75, $12,000@6.9/min$210),
  overrides M1=$450 M2=$100 M3=$300, default $200 →
  avalanche 46 mo / $6,394.97, snowball 46 mo / $6,835.38, saves $440.41.
- Same sample, flat $200 → avalanche 46 mo / $6,657.03, snowball 48 mo /
  $7,278.45, saves $621.42 and 2 months.
- Plus: tie-breaking, extra > balance, zero debts, 0% APR, minimums-only.

## Privacy

All data lives in the browser's `localStorage` under `overtimeMoney.v1`
(full) / `overtimeMoney.demo.v1` (demo). Nothing is uploaded or transmitted.
Backup export/import is a local JSON file the user controls.
