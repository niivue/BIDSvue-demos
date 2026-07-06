# Audit response (2026-07-05)

Response to the external review (`audit_temp.md`), triaged under the project's
**lean-over-defensive**, **trusted-content** model: tutorials are authored by
the repo owner and registered in `site.config.ts`; PRs are maintainer-reviewed;
there is no untrusted runtime input. Verified independently by a security agent
and a refactor agent.

## Fixed

- **Figure alt/caption double-escaping** (Med, only visible defect). `marked`
  already HTML-entity-encodes `Tokens.Image.text` (quotes included), so the
  extra `escapeHtml` produced `sidecar&amp;#39;s`. `figureHtml` now uses
  `img.text` raw for `alt`/`<figcaption>`; only `img.href` is escaped (marked
  does not encode hrefs). `scripts/render.ts`.
- **Section content ordering** (latent). `renderSection` bucketed prose /
  callouts / figures then emitted prose-before-callouts, so a callout *between*
  paragraphs rendered after both. Rewritten as a single document-order pass
  that keeps prose + callouts interleaved and pulls only the first figure into
  the two-column media slot. The rewrite is also ~10 lines leaner.
  (Didn't misrender current content — its callouts are section-trailing.)
- **`new URL(...).pathname` as a filesystem path** (Med, latent portability).
  `.pathname` leaves `%20` for spaces and yields `/C:/…` on Windows. Switched
  to `fileURLToPath` in `build.ts`, `dev.ts`, `preview.ts`.
- **Non-recursive tutorial asset copy** (Low). Replaced the top-level-only,
  stat-gated loop with `cp(..., { recursive: true })` — simpler and supports
  nested asset dirs. `build.ts`.
- **Dev config-reload was misleading** (Med). `dev.ts` watched `site.config.ts`
  but `build()` reuses the cached import, so edits didn't apply. Removed it from
  the watch list and corrected the README to say config changes need a dev
  restart. (Honest + leanest; the promised behavior was never real.)
- **No fixture tests** (Low). Added focused Bun tests: `render.test.ts`
  (callout ordering, no double-escape, media extraction) and `static.test.ts`
  (`resolveFile` index/content-type + traversal/malformed-encoding rejection).
  Wired into CI (`bun test`) and the `test` script.
- **Duplicate JSDoc** on `paragraphImages` — removed.

## Accepted + documented (fixing would be over-defensive here)

- **Unsanitized Markdown / XSS** (reviewer: High → **Low here**). `marked` 14
  passes raw HTML and `javascript:` links. Real, but all Markdown is
  owner-authored and PR-reviewed; there is no untrusted input path. Adding a
  sanitizer (DOMPurify + jsdom) is a heavy dependency that would also strip
  intentional inline HTML. **Trust assumption:** treat tutorial Markdown as
  trusted. Revisit only if untrusted/user-submitted content becomes possible.
- **Tutorial slug traversal** (Low). `t.slug` is owner-authored config, not
  input; validating trusted config is defensive noise. A slug is also a URL
  segment, so keep them simple path segments by convention.
- **Duplicate step DOM ids** (Low). Only occurs if an author writes two
  `## 1.` headings; sequential numbering is the convention. Not worth uniquing
  (it would break predictable `#step-N` anchors).
- **Reference-style links inside callouts** (Low). The callout body is parsed
  in isolation, so `[ref]` definitions elsewhere don't resolve. Rare; inline
  links work. Documented constraint.

## Declined

- **`prepare` git-config guard.** `git config core.hooksPath .githooks` on
  install is intentional and idempotent — this repo *wants* `.githooks` active.
  Guarding "only if unset" would silently keep a contributor's stale hooksPath.
  `|| true` already prevents install failure outside a git work tree.
- **Pin CI `bun-version`.** Deps are pinned via `--frozen-lockfile`; only the
  runtime floats. For a low-stakes docs deploy, `latest` auto-collects fixes
  and avoids version-bump churn. Reproducibility here isn't worth the upkeep.
- **A dedicated validation phase** (safe slugs, existing assets, allowed
  accents/protocols, unique ids). Over-engineering for a single-maintainer,
  trusted-config project; the targeted tests above cover the parts that matter.

## Process note

`audit_temp.md` was accidentally committed in `f4476b5` (swept in by
`git add -A`). Added it to `.gitignore` so future review drops stay untracked.
Per the reviewer, audit history lives here (not in `CLAUDE.md`, which stays
operational).
