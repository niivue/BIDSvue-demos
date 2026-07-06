# CLAUDE.md

## What this is

A tiny static-site generator (Bun + [`marked`](https://github.com/markedjs/marked)) that compiles plain, GitHub-native Markdown tutorials into a styled GitHub Pages site. The look is drawn from the BIDSvue app: system font, six accent schemes (**Orange** default, Sage, Garnet, Periwinkle, Violet, Indigo) and light/dark surfaces. Numbered steps render as their own panels with a screenshot floating into an alternating column.

## Architecture / file map

- **`scripts/build.ts`** — Markdown + `site.config.ts` → `dist/`. Emits `dist/index.html` (hero + tutorial cards + tools), `dist/<slug>/index.html` per tutorial, a self-contained `dist/404.html` (inlined CSS so it renders at any Pages depth), copies each tutorial's screenshots, copies `assets/`, writes `.nojekyll`. Reads each figure's PNG size (`pngSize`) so `<img>` carries intrinsic `width`/`height` → no layout shift, and **warns at build time on a referenced image that doesn't exist** (typo/missing screenshot before it 404s live). `assets/splash.png` ships via the ordinary `assets/` copy — no special-case copy.
- **`scripts/render.ts`** — the Markdown → step-panels transform plus the HTML shell (topbar / footer / `layout()`). Takes an injected `DimResolver` (`(href) => {w,h} | null`) so image dimensions come from the caller, not a filesystem read here. Also holds `escapeHtml`, `mdToPanels`, the accent list, the no-FOUC head script, and exports `MAXIMIZE` (the peek-drawer icon).
- **`scripts/dev.ts`** — dev server on `localhost:5173`, SSE live-reload (`/__livereload`), and a source file watcher that rebuilds + reloads.
- **`scripts/preview.ts`** — static server on `localhost:4173`; serves a prebuilt `dist/` exactly as Pages will (no watch/reload).
- **`scripts/static.ts`** — shared MIME table + `resolveFile(dist, pathname)` + `notFoundResponse` (serves `404.html`) used by both dev and preview servers (single source of truth; also contains the `dist/` traversal guard).
- **`scripts/render.test.ts`** — render fixtures: callout ordering, no alt/caption double-escape, first-figure media extraction.
- **`scripts/static.test.ts`** — `resolveFile` index/content-type resolution + traversal / malformed-encoding rejection.
- **`assets/site.css`** — the design system: theme tokens, the two floating ribbons, panels/cards, screenshot lightbox.
- **`assets/theme.js`** — theme toggle + accent picker + screenshot lightbox.
- **`site.config.ts`** — site config (title, tagline, intro, URLs, `defaultAccent`) and the `tutorials` + `tools` registries. Six tutorials currently registered: `mri-reproin-1`, `meg-mne-1`, `pet-pet2bids-1`, `datalad-1`, `mrs-dcm-1`, `mri-physio-1`.

## Commands

- `bun install` — first time only.
- `bun run dev` — build + serve `localhost:5173` with live reload; auto-opens a browser (`NO_OPEN=1` to skip). `PORT` overrides the port.
- `bun run build` — compile the static site into `dist/`.
- `bun run preview` — build, then serve `dist/` as Pages will (port 4173).
- `bun run typecheck` — `tsc --noEmit`. **Enforced on commit** via the `.githooks/pre-commit` hook (activated by `bun install`'s `prepare` script, which sets `core.hooksPath` to `.githooks`). Bypass with `--no-verify`.
- `bun run test` — `bun test` (runs `scripts/*.test.ts`).

CI (`.github/workflows/deploy.yml`) runs typecheck + test + build before deploy. Editing `site.config.ts` needs a `bun run dev` restart — `build.ts` caches the config import, so it is not hot-reloaded.

## Authoring convention (KEEP GitHub-native)

Tutorials stay ordinary Markdown — no frontmatter, no build-only markup.

- `# Title` → page title.
- Text before the first `##` → the page lead.
- `## N. …` (e.g. `## 1. Do the thing`) → a numbered **step panel**; a screenshot in its body floats into an alternating accent-glow column.
- Any other `##` → a plain prose panel.
- `> [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]` GitHub alerts render as callouts.
- Register every tutorial in `site.config.ts` under `tutorials` (slug, title, summary, tags, duration). The slug is the folder name and the URL path.

**Trusted-content model:** all Markdown is owner-authored and PR-reviewed, so it is rendered without sanitization by design (raw HTML / links pass through). See `audit_response.md` before adding any untrusted-input path.

## Markdown style (ALL `.md` files)

Do **not** hard-wrap lines. Use a blank line (EOLN) between paragraphs, list items, and sections, but never break a paragraph across multiple lines — each paragraph, list item, or blockquote paragraph is one physical line. This keeps diffs clean (a wording change touches one line, not a reflowed block) and renders identically on GitHub. Keep fenced code blocks verbatim, and keep a GitHub-alert marker (`> [!TIP]`) on its own line above its content.

## UI layout (current)

Two **floating ribbons**, not full-width bars:

- **Top-left nav ribbon**: `.topbar` is a bare positioning wrapper; `.topbar__panel` is the visible toolbar (identical on every page — lower-right corner beveled), holding brand "BIDSvue demos" then `Tutorials | Source | Download`. On the **home page** an accent **"Peek at BIDSvue" drawer** (`.topbar__peek`) sits *behind* the panel (lower z-index), tucking under its right edge and sliding out to the right to open `assets/splash.png` in the lightbox. Hidden under 620px.
- **Bottom-right controls ribbon** (`.site-footer` / `.controls`): the six accent swatches + the light/dark toggle. Only the upper-left corner is beveled.
- **Lightbox**: click-to-open / click-to-close (or Escape) over a blurred backdrop, accent border, one reused overlay per page. It opens any `[data-lightbox-src]` element (the peek drawer, screenshots), not just `.shot` figures.

## Load-bearing gotchas (do NOT "simplify" away)

- **`dev.ts` content-signature gate.** macOS `fs.watch` fires on access-time changes, and the build reads the very files it watches — so a naive rebuild-on-event loops forever. The watcher only rebuilds when a signature of `path:mtime:size` over the watched sources actually changes, and re-baselines after each build.
- **No-FOUC theme init.** The inline `<script>` in `<head>` sets `data-theme` / `data-accent` from `localStorage` before first paint. Keep it inline and in the head.
- **Adjacent IIFEs in `theme.js` need a separating `;`.** The second IIFE is prefixed with a leading `;` — without it ASI parses it as a call on the first IIFE's return value. This was a real bug; don't remove the semicolon.
- **All asset/link paths are relative.** `layout()` takes a `base` (`""` at root, `"../"` one level deep) so the output works under the `/BIDSvue-demos/` Pages subpath with no base config.

## Deploy

- Push to `main` → `.github/workflows/deploy.yml` (GitHub Actions) type-checks, builds with Bun, and deploys `dist/` to GitHub Pages (so `--no-verify` local commits can't ship type errors). `workflow_dispatch` also available.
- Enable once under **Settings → Pages → Source → GitHub Actions**.
- The build emits `.nojekyll` so `assets/` is served verbatim.

## Audit history

Audit history + trust-model decisions live in `audit_response.md`.
