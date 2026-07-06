# Audit

Scope: current working tree. No `audit_response.md` found. Previous `audit_temp.md` was stale and replaced.

## Findings

- **High: Markdown output is still unsanitized.** `scripts/render.ts:30-33` and `scripts/render.ts:66` pass Markdown through `marked` directly. Marked emits raw HTML and dangerous link protocols; verified examples: `<script>alert(1)</script>` is emitted as script, and `[x](javascript:alert(1))` is emitted as a `javascript:` link. This is a deploy blocker if tutorial content can arrive through PRs or copied external material. Sanitize rendered HTML and restrict URL protocols, or configure a renderer that rejects raw HTML and unsafe links.

- **Medium: dev reload for `site.config.ts` is misleading.** `scripts/dev.ts:9-10` imports `config` and `build` once; `scripts/build.ts:16` imports `site.config.ts` once. `scripts/dev.ts:103-107` watches `site.config.ts`, but rebuilds reuse the cached module, so changed titles, tool links, tutorial lists, and default accent do not update until restart. README lines `67-68` promise this works. Either restart the dev process on config changes or load config cache-busted inside `build()`.

- **Medium: filesystem paths still use URL `.pathname`.** `scripts/build.ts:19`, `scripts/dev.ts:13`, and `scripts/preview.ts:9` use `new URL(...).pathname` as a path. This returns percent-encoded paths such as `/tmp/a%20b/` and is especially fragile on Windows. Use `fileURLToPath`.

- **Medium: tutorial slugs can escape source and output roots.** `scripts/build.ts:91` and `scripts/build.ts:119` join `t.slug` into filesystem paths without validation. A slug containing `../` can read a README outside the tutorial tree or write pages outside `dist`. Validate slugs as a single safe path segment before building.

- **Medium: section rendering reorders content.** `scripts/render.ts:115-135` buckets prose, callouts, and figures separately, then `scripts/render.ts:152-154` emits prose before all callouts. A callout placed between two paragraphs renders after both paragraphs; verified with a minimal Markdown fixture. Preserve token order and only extract the one image selected for the media column.

- **Low: figure alt/caption text is double-escaped.** `scripts/render.ts:137-140` escapes Marked's already-entity-encoded image text. Current output contains `sidecar&amp;#39;s` in `dist/mri-reproin-1/index.html`. Decode token text before escaping, or source the raw image text.

- **Low: tutorial asset copying only handles top-level files.** `scripts/build.ts:123-128` skips nested directories. A tutorial using `images/foo.png` or downloadable folders will build broken links. Copy recursively or fail the build on unresolved local assets.

- **Low: duplicate step numbers create duplicate DOM IDs.** `scripts/render.ts:148` and `scripts/render.ts:164` derive IDs directly from the step number. Duplicate `## 1.` headings produce duplicate `id="step-1"`. Generate unique IDs or validate step numbers.

- **Low: reference-style links inside callouts do not resolve.** `scripts/render.ts:61-66` reparses callout body text in isolation, without the parent document's reference link table. Inline links work; reference links in GitHub alert blocks silently break.

- **Low: install mutates local Git configuration.** `package.json:12` runs `git config core.hooksPath .githooks || true` from `prepare`. This overwrites any existing repository-local hooks path whenever dependencies are installed. Prefer an explicit setup command or preserve/chain an existing hooks path.

- **Low: CI still uses a moving Bun version.** `.github/workflows/deploy.yml:25-30` installs `bun-version: latest`. Pin Bun so Pages builds are reproducible.

- **Low: custom logic has no fixture tests.** CI now type-checks and builds, but there are no tests for `resolveFile`, Markdown sanitization, callout ordering, slug validation, duplicate IDs, or missing assets. The static resolver and Markdown transform are small enough for focused unit fixtures.

## Refactoring Opportunities

- Add one validation phase before build: safe slugs, existing tutorial READMEs, unique step IDs, existing referenced local assets, allowed accent names, and allowed URL protocols.

- Split Markdown rendering into small pure transforms with fixtures: section splitting, callout conversion, figure extraction, and shell layout.

- Keep `scripts/static.ts` as the shared serving boundary. Do not reintroduce static-serving logic in `dev.ts` or `preview.ts`.

- Treat `CLAUDE.md` as operational notes, not an audit record. Move resolved audit history out of the runtime project documentation once the work stabilizes.

## Verification

- `bun run build` passes.
- `bun run typecheck` passes.
- Direct `resolveFile()` probe returns `null` for `/..%2fpackage.json` and malformed `/%ZZ`.
- No live server probe was run; sandboxed Bun cannot bind sockets here.
