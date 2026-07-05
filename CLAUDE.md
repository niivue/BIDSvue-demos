# CLAUDE.md

## What this is

A tiny static-site generator (Bun + [`marked`](https://github.com/markedjs/marked))
that compiles plain, GitHub-native Markdown tutorials into a styled GitHub Pages
site. The look is drawn from the BIDSvue app: system font, six accent schemes
(**Orange** default, Sage, Garnet, Periwinkle, Violet, Indigo) and light/dark
surfaces. Numbered steps render as their own panels with a screenshot floating
into an alternating column.

## Architecture / file map

- **`scripts/build.ts`** — Markdown + `site.config.ts` → `dist/`. Emits
  `dist/index.html` (hero + tutorial cards + tools), `dist/<slug>/index.html`
  per tutorial, copies each tutorial's screenshots, copies `assets/`, writes
  `.nojekyll`.
- **`scripts/render.ts`** — the Markdown → step-panels transform plus the HTML
  shell (topbar / footer / `layout()`). Also holds `escapeHtml`, `mdToPanels`,
  the accent list, and the no-FOUC head script.
- **`scripts/dev.ts`** — dev server on `localhost:5173`, SSE live-reload
  (`/__livereload`), and a source file watcher that rebuilds + reloads.
- **`scripts/preview.ts`** — static server on `localhost:4173`; serves a
  prebuilt `dist/` exactly as Pages will (no watch/reload).
- **`scripts/static.ts`** — shared MIME table + `resolveFile(dist, pathname)`
  used by both dev and preview servers (single source of truth; also contains
  the `dist/` traversal guard).
- **`assets/site.css`** — the design system: theme tokens, the two floating
  ribbons, panels/cards, screenshot lightbox.
- **`assets/theme.js`** — theme toggle + accent picker + screenshot lightbox.
- **`site.config.ts`** — site config (title, tagline, intro, URLs,
  `defaultAccent`) and the `tutorials` + `tools` registries.

## Commands

- `bun install` — first time only.
- `bun run dev` — build + serve `localhost:5173` with live reload; auto-opens a
  browser (`NO_OPEN=1` to skip). `PORT` overrides the port.
- `bun run build` — compile the static site into `dist/`.
- `bun run preview` — build, then serve `dist/` as Pages will (port 4173).
- `bun run typecheck` — `tsc --noEmit`. **Enforced on commit** via the
  `.githooks/pre-commit` hook (activated by `bun install`'s `prepare` script,
  which sets `core.hooksPath` to `.githooks`). Bypass with `--no-verify`.

## Authoring convention (KEEP GitHub-native)

Tutorials stay ordinary Markdown — no frontmatter, no build-only markup.

- `# Title` → page title.
- Text before the first `##` → the page lead.
- `## N. …` (e.g. `## 1. Do the thing`) → a numbered **step panel**; a
  screenshot in its body floats into an alternating accent-glow column.
- Any other `##` → a plain prose panel.
- `> [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]` GitHub alerts
  render as callouts.
- Register every tutorial in `site.config.ts` under `tutorials` (slug, title,
  summary, tags, duration). The slug is the folder name and the URL path.

## UI layout (current)

Two **floating ribbons**, not full-width bars:

- **Top-left nav ribbon** (`.topbar`): a single line — brand
  "BIDSvue demos" then `Tutorials | Source | Download`. Only the lower-right
  corner is beveled.
- **Bottom-right controls ribbon** (`.site-footer` / `.controls`): the six
  accent swatches + the light/dark toggle. Only the upper-left corner is
  beveled.
- **Screenshots** open in a click-to-open / click-to-close (or Escape)
  lightbox with an accent border over a blurred backdrop. One overlay is reused
  for all images on a page.

## Load-bearing gotchas (do NOT "simplify" away)

- **`dev.ts` content-signature gate.** macOS `fs.watch` fires on access-time
  changes, and the build reads the very files it watches — so a naive
  rebuild-on-event loops forever. The watcher only rebuilds when a signature of
  `path:mtime:size` over the watched sources actually changes, and re-baselines
  after each build.
- **No-FOUC theme init.** The inline `<script>` in `<head>` sets
  `data-theme` / `data-accent` from `localStorage` before first paint. Keep it
  inline and in the head.
- **Adjacent IIFEs in `theme.js` need a separating `;`.** The second IIFE is
  prefixed with a leading `;` — without it ASI parses it as a call on the first
  IIFE's return value. This was a real bug; don't remove the semicolon.
- **All asset/link paths are relative.** `layout()` takes a `base` (`""` at
  root, `"../"` one level deep) so the output works under the
  `/BIDSvue-demos/` Pages subpath with no base config.

## Deploy

- Push to `main` → `.github/workflows/deploy.yml` (GitHub Actions) type-checks,
  builds with Bun, and deploys `dist/` to GitHub Pages (so `--no-verify` local
  commits can't ship type errors). `workflow_dispatch` also available.
- Enable once under **Settings → Pages → Source → GitHub Actions**.
- The build emits `.nojekyll` so `assets/` is served verbatim.

## Audit outcomes (2026-07-05)

Three-agent audit (security/bugs, refactor, docs). Priority was **lean code over
defensive code**. Net ≈ -54 lines despite adding `static.ts`. Applied:

- **Traversal guard** in `static.ts::resolveFile` — dev/preview servers no longer
  serve files outside `dist/` (verified: encoded `..` → 404). Also catches
  malformed percent-encoding.
- **Unified static serving** — one MIME table + resolver shared by dev/preview
  (previously duplicated and already drifting; `.gif` was missing from preview).
- **SSE leak fix** — `dev.ts` `cancel()` now prunes its controller from `clients`.
- **Dead code removed**: `.btn`/`.btn--*` CSS block (~37 lines), `.section__head.center`,
  the empty dark-mode placeholder rule, `LayoutOpts.extraHead` + `bodyClass`,
  `alertCallout`'s unused `links` param, `ALERT_META.label` (→ `ALERT_ICON` map),
  `site.config.ts` `demosRepoUrl`, the `headingHtml` alias. Simplified
  `paragraphImages`; folded `export ARROW`.
- **Consistency**: topbar now escapes `config.title` / URLs like every other
  interpolation.

Deliberately **kept** (not over-defensive): `.prose kbd` / `.prose blockquote`
base styles (valid any time an author writes them); the watch signature gate;
the no-FOUC head script; the browser-opener / `watch` try/catch.

Follow-ups since done:

- Added `@types/bun` + `typescript` devDeps; `tsconfig` now uses
  `"types": ["bun"]`. `bun run typecheck` passes clean and is enforced on commit
  (see the pre-commit hook above).

Known non-blockers (left as-is):

- **Authoring constraints** (Low): two `## N.` steps sharing a number produce
  duplicate `id="step-N"`; reference-style links **inside** a `> [!NOTE]` callout
  don't resolve (the callout body is parsed in isolation). Neither occurs in
  current content; fix only if it comes up.
