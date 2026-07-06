/**
 * Static-site build. Reads `site.config.ts` + the plain Markdown files in the
 * repo and emits a styled site into `dist/`:
 *
 *   dist/index.html              landing page (hero + tutorial cards + tools)
 *   dist/<slug>/index.html       one tutorial, split into step panels
 *   dist/<slug>/*.png            that tutorial's screenshots (copied as-is)
 *   dist/assets/                 css + js
 *
 * All links/asset paths are relative, so the output works both locally and
 * under a GitHub Pages project subpath (…/BIDSvue-demos/) with no base config.
 */

import { readFileSync } from "node:fs"
import { cp, mkdir, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import config from "../site.config.ts"
import { ARROW, HEAD_THEME_SCRIPT, MAXIMIZE, escapeHtml, layout, mdToPanels } from "./render.ts"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const DIST = join(ROOT, "dist")

// ------- landing page -------------------------------------------------------

function tutorialCard(t: (typeof config.tutorials)[number]): string {
  const chips = t.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")
  return `
    <a class="card" href="${escapeHtml(t.slug)}/index.html">
      <div class="card__tags">${chips}</div>
      <h3>${escapeHtml(t.title)}</h3>
      <p>${escapeHtml(t.summary)}</p>
      <div class="card__meta">
        <span>${escapeHtml(t.duration)}</span>
        <span class="card__go">Start${ARROW}</span>
      </div>
    </a>`
}

function toolItem(t: (typeof config.tools)[number]): string {
  return `
      <a class="tool" href="${escapeHtml(t.href)}">
        <strong>${escapeHtml(t.name)}</strong>
        <span>${escapeHtml(t.blurb)}</span>
      </a>`
}

function landingPage(): string {
  const cards = config.tutorials.map(tutorialCard).join("")
  const tools = config.tools.map(toolItem).join("")
  const main = `
  <section class="hero">
    <div class="container">
      <h1>Curate BIDS data<br />with <b>${escapeHtml(config.title)}</b></h1>
      <p class="hero__tagline">${escapeHtml(config.tagline)}</p>
      <button class="hero__peek" type="button" data-lightbox-src="splash.png" data-lightbox-alt="The BIDSvue launch screen">${MAXIMIZE} Peek at BIDSvue</button>
    </div>
  </section>

  <section class="section" id="tutorials">
    <div class="container">
      <div class="section__head">
        <p class="section__eyebrow">Tutorials</p>
        <h2>Learn by doing</h2>
        <p class="section__lead">Tutorials to learn the fundamentals.</p>
      </div>
      <div class="cards">${cards}</div>
    </div>
  </section>

  <section class="section" id="tools">
    <div class="container">
      <div class="section__head">
        <p class="section__eyebrow">Under the hood</p>
        <h2>Built on trusted open-source tools</h2>
        <p class="section__lead">BIDSvue is a wrapper for proven core tools.</p>
      </div>
      <div class="tools">${tools}</div>
    </div>
  </section>`

  return layout({
    title: `${config.title} demos — ${config.tagline}`,
    description: config.intro,
    base: "",
    main,
  })
}

// ------- tutorial pages -----------------------------------------------------

/** Intrinsic pixel size of a PNG from its IHDR header, or null for non-PNGs. */
function pngSize(path: string): { w: number; h: number } | null {
  try {
    const b = readFileSync(path)
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
  } catch {
    return null
  }
}

async function buildTutorial(t: (typeof config.tutorials)[number]): Promise<void> {
  const dir = join(ROOT, t.slug)
  const md = await Bun.file(join(dir, "README.md")).text()
  // Resolve each figure's real size so the browser reserves its box (no CLS).
  const { title, leadHtml, panelsHtml } = mdToPanels(md, (href) => pngSize(join(dir, href)))

  // Warn (don't fail) on referenced local images that don't exist — catches
  // typos and missing screenshots before they 404 on the live site.
  for (const [, src] of panelsHtml.matchAll(/<img src="([^"]+)"/g)) {
    if (/^https?:/.test(src)) continue
    if (!(await Bun.file(join(dir, src)).exists())) {
      console.warn(`  ⚠  ${t.slug}: referenced image not found — ${src}`)
    }
  }

  const chips = [...t.tags, t.duration]
    .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
    .join("")

  const main = `
  <div class="container tut-hero">
    <a class="back" href="../index.html#tutorials">${backArrow()} All tutorials</a>
    <h1>${escapeHtml(title || t.title)}</h1>
    <div class="lead">${leadHtml}</div>
    <div class="tut-hero__chips">${chips}</div>
  </div>
  <div class="container">
    <div class="panels">
      ${panelsHtml}
    </div>
  </div>`

  const html = layout({
    title: `${title || t.title} — ${config.title} demos`,
    description: t.summary,
    base: "../",
    main,
  })

  const outDir = join(DIST, t.slug)
  await mkdir(outDir, { recursive: true })
  await Bun.write(join(outDir, "index.html"), html)

  // Copy every asset in the tutorial folder except the source Markdown and
  // dotfiles. `recursive` handles both files and nested asset directories.
  for (const entry of await readdir(dir)) {
    if (entry === "README.md" || entry.startsWith(".")) continue
    await cp(join(dir, entry), join(outDir, entry), { recursive: true })
  }
}

function backArrow(): string {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`
}

// ------- 404 ----------------------------------------------------------------

// GitHub Pages serves 404.html for any missing path, at any depth, so it can't
// rely on relative asset paths (they'd resolve against the wrong URL). It's
// therefore self-contained: CSS inlined, favicon as a data URI, and the "home"
// link resolved at runtime to the site root (origin + first path segment).
async function notFoundPage(): Promise<string> {
  const css = await Bun.file(join(ROOT, "assets", "site.css")).text()
  const favicon = Buffer.from(
    await Bun.file(join(ROOT, "assets", "favicon.png")).arrayBuffer(),
  ).toString("base64")
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Page not found — ${escapeHtml(config.title)} demos</title>
<meta name="robots" content="noindex" />
<link rel="icon" type="image/png" href="data:image/png;base64,${favicon}" />
<script>${HEAD_THEME_SCRIPT}</script>
<style>${css}
main.notfound { min-height: 82vh; display: grid; place-content: center; justify-items: center; text-align: center; gap: 0.4rem; padding: 2rem; }
.notfound__code { font-size: clamp(4.5rem, 20vw, 10rem); font-weight: 800; line-height: 0.95; letter-spacing: -0.04em; color: var(--accent); }
.notfound h1 { font-size: clamp(1.5rem, 4vw, 2.3rem); letter-spacing: -0.02em; }
.notfound__lead { color: var(--fg-muted); max-width: 42ch; margin: 0.6rem auto 1.8rem; }
.notfound__home { display: inline-flex; align-items: center; gap: 0.5ch; font-weight: 650; text-decoration: none; color: var(--accent-text); background: var(--accent); padding: 0.75rem 1.3rem; border-radius: 12px; box-shadow: 0 10px 30px -14px var(--accent-glow); }
.notfound__home:hover { background: var(--accent-hover); color: var(--accent-text); }</style>
</head>
<body>
<main class="notfound">
  <p class="notfound__code">404</p>
  <h1>This page wandered off.</h1>
  <p class="notfound__lead">The page you’re looking for isn’t here — it may have moved, or never existed.</p>
  <a class="notfound__home" data-home href="/">${ARROW} Back to the demos</a>
</main>
<script>
(function(){
  var seg = location.pathname.split("/")[1] || "";
  document.querySelector("[data-home]").href = location.origin + "/" + (seg ? seg + "/" : "");
})();
</script>
</body>
</html>`
}

// ------- orchestration ------------------------------------------------------

export async function build(): Promise<void> {
  await rm(DIST, { recursive: true, force: true })
  await mkdir(DIST, { recursive: true })

  await Bun.write(join(DIST, "index.html"), landingPage())
  await Bun.write(join(DIST, "404.html"), await notFoundPage())
  // GitHub Pages: skip Jekyll so `assets/` etc. are served verbatim.
  await Bun.write(join(DIST, ".nojekyll"), "")

  for (const t of config.tutorials) await buildTutorial(t)

  await cp(join(ROOT, "assets"), join(DIST, "assets"), { recursive: true })
  // The app splash, featured in the home-page lightbox.
  await cp(join(ROOT, "splash.png"), join(DIST, "splash.png"))
}

if (import.meta.main) {
  const t0 = performance.now()
  await build()
  const ms = Math.round(performance.now() - t0)
  const pages = 1 + config.tutorials.length
  console.log(`✓ Built ${pages} page${pages === 1 ? "" : "s"} → dist/  (${ms}ms)`)
}
