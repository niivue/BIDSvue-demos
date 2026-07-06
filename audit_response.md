# Audit responses

Triaged under the project's **lean-over-defensive**, **trusted-content** model: tutorials/config are authored by the repo owner and registered in `site.config.ts`; PRs are maintainer-reviewed; there is no untrusted runtime input. Each round verified independently by security + refactor agents.

## 2026-07-06 (round 3)

External review + agents over the six new tutorials, the layout-shift / per-image-dimension work, the 404 page, and the splash-in-lightbox → drawer. Security agent found **no High/Med bugs**; new code (`pngSize`, `notFoundPage`, lightbox `[data-lightbox-src]`, the drawer + its 620px fallback) verified clean; all six tutorials' images resolve with no orphans.

**Fixed**

- **Stale README tutorial list** — listed only ReproIn; now lists all six.
- **`dev.ts` header comment** said config hot-reloads; it isn't watched — corrected.
- **Build page count** reported 7 but emits 8 (index + 404 + 6 tutorials) — fixed to `2 + tutorials.length`.
- **Moved `splash.png` → `assets/splash.png`** so the normal asset copy deploys it; removed the one-off root-file `cp`. Drawer now references `${base}assets/splash.png`.
- **Brand double-meaning** (brand link *and* splash trigger) — already resolved when the splash moved to the drawer; the brand is now a plain home link.

**Accepted + documented**

- **404 home-link** uses `location.pathname.split('/')[1]` — correct for this GitHub *project-pages* deploy (`/BIDSvue-demos/`); added a comment noting a root/custom-domain deploy would need `/`. A configurable base is speculative flexibility with zero current callers.
- Raw HTML / unsafe protocols from Markdown, and trusted slug / sequential step numbering — reaffirmed acceptable (reviewer agreed).

**Declined**

- A dedicated deploy-fixture test for the splash asset — moving `splash.png` under `assets/` makes it non-optional (copied with every other asset), so the "forgot to deploy" risk it would guard no longer exists.
- Dead-code removal — swept CSS selectors vs emitted HTML and all exports/imports: nothing dead (`.hero__peek`/`.hero__cta`/`.hero__eyebrow`/`.hero__intro`/`.btn*` already gone; `MAXIMIZE`/`ARROW`/`DimResolver` all live).

## 2026-07-05 (round 2)

## Fixed

- **Figure alt/caption double-escaping** (Med, only visible defect). `marked` already HTML-entity-encodes `Tokens.Image.text` (quotes included), so the extra `escapeHtml` produced `sidecar&amp;#39;s`. `figureHtml` now uses `img.text` raw for `alt`/`<figcaption>`; only `img.href` is escaped (marked does not encode hrefs). `scripts/render.ts`.
- **Section content ordering** (latent). `renderSection` bucketed prose / callouts / figures then emitted prose-before-callouts, so a callout *between* paragraphs rendered after both. Rewritten as a single document-order pass that keeps prose + callouts interleaved and pulls only the first figure into the two-column media slot. The rewrite is also ~10 lines leaner. (Didn't misrender current content — its callouts are section-trailing.)
- **`new URL(...).pathname` as a filesystem path** (Med, latent portability). `.pathname` leaves `%20` for spaces and yields `/C:/…` on Windows. Switched to `fileURLToPath` in `build.ts`, `dev.ts`, `preview.ts`.
- **Non-recursive tutorial asset copy** (Low). Replaced the top-level-only, stat-gated loop with `cp(..., { recursive: true })` — simpler and supports nested asset dirs. `build.ts`.
- **Dev config-reload was misleading** (Med). `dev.ts` watched `site.config.ts` but `build()` reuses the cached import, so edits didn't apply. Removed it from the watch list and corrected the README to say config changes need a dev restart. (Honest + leanest; the promised behavior was never real.)
- **No fixture tests** (Low). Added focused Bun tests: `render.test.ts` (callout ordering, no double-escape, media extraction) and `static.test.ts` (`resolveFile` index/content-type + traversal/malformed-encoding rejection). Wired into CI (`bun test`) and the `test` script.
- **Duplicate JSDoc** on `paragraphImages` — removed.

## Accepted + documented (fixing would be over-defensive here)

- **Unsanitized Markdown / XSS** (reviewer: High → **Low here**). `marked` 14 passes raw HTML and `javascript:` links. Real, but all Markdown is owner-authored and PR-reviewed; there is no untrusted input path. Adding a sanitizer (DOMPurify + jsdom) is a heavy dependency that would also strip intentional inline HTML. **Trust assumption:** treat tutorial Markdown as trusted. Revisit only if untrusted/user-submitted content becomes possible.
- **Tutorial slug traversal** (Low). `t.slug` is owner-authored config, not input; validating trusted config is defensive noise. A slug is also a URL segment, so keep them simple path segments by convention.
- **Duplicate step DOM ids** (Low). Only occurs if an author writes two `## 1.` headings; sequential numbering is the convention. Not worth uniquing (it would break predictable `#step-N` anchors).
- **Reference-style links inside callouts** (Low). The callout body is parsed in isolation, so `[ref]` definitions elsewhere don't resolve. Rare; inline links work. Documented constraint.

## Declined

- **`prepare` git-config guard.** `git config core.hooksPath .githooks` on install is intentional and idempotent — this repo *wants* `.githooks` active. Guarding "only if unset" would silently keep a contributor's stale hooksPath. `|| true` already prevents install failure outside a git work tree.
- **Pin CI `bun-version`.** Deps are pinned via `--frozen-lockfile`; only the runtime floats. For a low-stakes docs deploy, `latest` auto-collects fixes and avoids version-bump churn. Reproducibility here isn't worth the upkeep.
- **A dedicated validation phase** (safe slugs, existing assets, allowed accents/protocols, unique ids). Over-engineering for a single-maintainer, trusted-config project; the targeted tests above cover the parts that matter.

## Process note

`audit_temp.md` was accidentally committed in `f4476b5` (swept in by `git add -A`). Added it to `.gitignore` so future review drops stay untracked. Per the reviewer, audit history lives here (not in `CLAUDE.md`, which stays operational).
