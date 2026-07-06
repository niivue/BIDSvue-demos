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

import { cp, mkdir, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import config from "../site.config.ts"
import { ARROW, escapeHtml, layout, mdToPanels } from "./render.ts"

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
      <p class="hero__intro">${escapeHtml(config.intro)}</p>
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

async function buildTutorial(t: (typeof config.tutorials)[number]): Promise<void> {
  const dir = join(ROOT, t.slug)
  const md = await Bun.file(join(dir, "README.md")).text()
  const { title, leadHtml, panelsHtml } = mdToPanels(md)

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

// ------- orchestration ------------------------------------------------------

export async function build(): Promise<void> {
  await rm(DIST, { recursive: true, force: true })
  await mkdir(DIST, { recursive: true })

  await Bun.write(join(DIST, "index.html"), landingPage())
  // GitHub Pages: skip Jekyll so `assets/` etc. are served verbatim.
  await Bun.write(join(DIST, ".nojekyll"), "")

  for (const t of config.tutorials) await buildTutorial(t)

  await cp(join(ROOT, "assets"), join(DIST, "assets"), { recursive: true })
}

if (import.meta.main) {
  const t0 = performance.now()
  await build()
  const ms = Math.round(performance.now() - t0)
  const pages = 1 + config.tutorials.length
  console.log(`✓ Built ${pages} page${pages === 1 ? "" : "s"} → dist/  (${ms}ms)`)
}
