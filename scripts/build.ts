/**
 * Static-site build. Reads `site.config.ts` + the plain Markdown files in the
 * repo and emits a styled site into `dist/`:
 *
 *   dist/index.html              landing page (hero + tutorial cards + tools)
 *   dist/<slug>/index.html       one tutorial, split into step panels
 *   dist/<slug>/*.png            that tutorial's screenshots (copied as-is)
 *   dist/assets/                 css + js
 *
 * Nav/asset paths are relative (via layout()'s `base`), but the site targets the
 * apex custom domain: canonical/OG URLs use `config.siteUrl`, the 404 home link is
 * the apex root "/", and a CNAME is emitted — so it is not a project-subpath deploy.
 */

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { cp, mkdir, readdir, readFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import config from "../site.config.ts"
import { ARROW, HEAD_THEME_SCRIPT, escapeHtml, layout, mdToPanels } from "./render.ts"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const DIST = join(ROOT, "dist")
const ASSETS = join(ROOT, "assets")
const ASSET_MANIFEST = join(ROOT, ".asset-manifest.json")

type AssetManifest = {
  version: 1
  files: Record<string, string>
}

async function assetFiles(dir: string, prefix = ""): Promise<string[]> {
  let entries
  try {
    entries = await readdir(join(dir, prefix), { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }

  const files: string[] = []
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...(await assetFiles(dir, path)))
    else if (entry.isFile()) files.push(path)
  }
  return files.sort()
}

async function fileHash(path: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(path)).digest("hex")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

async function readAssetManifest(path: string): Promise<AssetManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as AssetManifest
    return parsed.version === 1 && parsed.files && typeof parsed.files === "object" ? parsed : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return null
    throw error
  }
}

/**
 * Finds files edited or added directly under dist/assets since the last build.
 * A generated file is safe to replace when it still matches the prior manifest,
 * or when an identical copy has already been promoted into source assets/.
 */
export async function findUnpromotedDistAssets(
  sourceAssets = ASSETS,
  distAssets = join(DIST, "assets"),
  manifestPath = ASSET_MANIFEST,
): Promise<string[]> {
  const manifest = await readAssetManifest(manifestPath)
  // Without prior state, dist/ may simply come from an older checkout. The
  // guard becomes authoritative only after this checkout completes a build.
  if (!manifest) return []
  const unpromoted: string[] = []

  for (const relativePath of await assetFiles(distAssets)) {
    const distHash = await fileHash(join(distAssets, relativePath))
    if (manifest?.files[relativePath] === distHash) continue
    if ((await fileHash(join(sourceAssets, relativePath))) === distHash) continue
    unpromoted.push(relativePath)
  }

  return unpromoted
}

async function assertDistAssetsSafe(): Promise<void> {
  const unpromoted = await findUnpromotedDistAssets()
  if (unpromoted.length === 0) return

  throw new Error(
    "Refusing to rebuild dist/: these generated assets contain unpromoted changes:\n" +
      unpromoted.map((path) => `  - dist/assets/${path}`).join("\n") +
      "\nCopy the intended files into assets/ first, then rebuild.",
  )
}

async function writeAssetManifest(): Promise<void> {
  const files: Record<string, string> = {}
  for (const relativePath of await assetFiles(ASSETS)) {
    const hash = await fileHash(join(ASSETS, relativePath))
    if (hash) files[relativePath] = hash
  }
  const manifest: AssetManifest = { version: 1, files }
  await Bun.write(ASSET_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** Finds local files referenced by CSS url() values that do not exist. */
export async function findMissingCssAssets(
  cssPath = join(ASSETS, "site.css"),
  assetsDir = ASSETS,
): Promise<string[]> {
  const css = await readFile(cssPath, "utf8")
  const refs = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)]
    .map((match) => match[1].trim())
    .filter((ref) => !/^(?:data:|https?:|#)/.test(ref))
  const missing: string[] = []
  for (const ref of new Set(refs)) {
    if (!(await Bun.file(join(assetsDir, ref)).exists())) missing.push(ref)
  }
  return missing.sort()
}

async function assertCssAssetsExist(): Promise<void> {
  const missing = await findMissingCssAssets()
  if (missing.length === 0) return
  throw new Error(
    "Missing source assets referenced by assets/site.css:\n" +
      missing.map((path) => `  - assets/${path}`).join("\n"),
  )
}

// ------- landing page -------------------------------------------------------

export const HERO_VARIANTS = [
  { id: "mesh", label: "NiiVue / cortical mesh", detail: "MNI152 · LH" },
  { id: "voxel", label: "NiiVue / voxel volumes", detail: "MNI152 · axial" },
  { id: "coronal", label: "NiiVue / voxel volumes", detail: "MNI152 · coronal" },
  { id: "sagittal", label: "NiiVue / voxel volumes", detail: "MNI152 · sagittal" },
] as const
const HERO_VARIANT_IDS = HERO_VARIANTS.map(({ id }) => id)
const HERO_VARIANT_SCRIPT = `(function(){var variants=${JSON.stringify(HERO_VARIANT_IDS)};document.documentElement.setAttribute('data-hero-variant',variants[Math.floor(Math.random()*variants.length)])})();`

function tutorialCard(t: (typeof config.tutorials)[number], index: number): string {
  const chips = t.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")
  return `
    <a class="card" href="${escapeHtml(t.slug)}/index.html">
      <span class="card__index" aria-hidden="true">${index + 1}</span>
      <div class="card__content">
        <div class="card__tags">${chips}</div>
        <h3>${escapeHtml(t.title)}</h3>
        <p>${escapeHtml(t.summary)}</p>
      </div>
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
  const shortcuts = config.tutorials
    .map(
      (tutorial, index) =>
        `<a href="${escapeHtml(tutorial.slug)}/index.html"><b>${index + 1}</b> ${escapeHtml(tutorial.shortcutLabel)}</a>`,
    )
    .join("\n          ")
  const coordinates = HERO_VARIANTS.map(
    ({ id, label, detail }) => `
        <div class="hero__coordinates hero__coordinates--${escapeHtml(id)}">
          <span>${escapeHtml(label)}</span>
          <span>${escapeHtml(detail)}</span>
        </div>`,
  ).join("")
  const main = `
  <section class="hero">
    <div class="container hero__grid">
      <div class="hero__copy">
        <p class="hero__kicker"><span></span> Open-source neuroimaging workflow</p>
        <h1>Curate BIDS data<br /><b>with precision.</b></h1>
        <p class="hero__tagline">${escapeHtml(config.intro)}</p>
        <nav class="hero__modalities" aria-label="Tutorial shortcuts">
          ${shortcuts}
        </nav>
      </div>
      <div class="hero__visual" data-radar-toggle data-hero-variants="${HERO_VARIANT_IDS.join(" ")}" aria-hidden="true">
        <div class="hero__mesh-base"></div>
        <div class="hero__activation"></div>
        <div class="hero__scanline"></div>
        ${coordinates}
      </div>
    </div>
  </section>

  <section class="section" id="tutorials">
    <div class="container">
      <div class="section__head">
        <div>
          <p class="section__eyebrow">Tutorials</p>
          <h2>Learn by doing.</h2>
        </div>
        <p class="section__lead">Practical protocols for moving real neuroimaging data from acquisition to a validated, shareable BIDS dataset.</p>
      </div>
      <div class="cards">${cards}</div>
    </div>
  </section>

  <section class="section section--tools" id="tools">
    <div class="container">
      <div class="section__head">
        <div>
          <p class="section__eyebrow">Under the hood</p>
          <h2>Proven tools,<br />one clear workflow.</h2>
        </div>
        <p class="section__lead">BIDSvue brings established open-source projects into one inspectable workflow. The underlying tools remain visible, attributable, and independently useful.</p>
      </div>
      <div class="tools">${tools}</div>
    </div>
  </section>`

  return layout({
    title: `${config.title} demos — ${config.tagline}`,
    description: config.intro,
    base: "",
    path: "",
    main,
    headExtra: `<script>${HERO_VARIANT_SCRIPT}</script>`,
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

async function buildTutorial(t: (typeof config.tutorials)[number], outputRoot: string): Promise<void> {
  const dir = join(ROOT, t.slug)
  const md = await Bun.file(join(dir, "README.md")).text()
  // Resolve each figure's real size so the browser reserves its box (no CLS).
  const { title, leadHtml, panelsHtml, imageRefs } = mdToPanels(md, (href) => pngSize(join(dir, href)))

  // Warn (don't fail) on referenced local images that don't exist — catches
  // typos and missing screenshots before they 404 on the live site. Checks the
  // raw hrefs from the token pass (lead + panels), so real filenames — even ones
  // with characters HTML-escaping would mangle — resolve correctly.
  for (const src of imageRefs) {
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
    path: `${t.slug}/`,
    main,
  })

  const outDir = join(outputRoot, t.slug)
  await mkdir(outDir, { recursive: true })
  await Bun.write(join(outDir, "index.html"), html)

  // Copy every asset in the tutorial folder except the source Markdown, the
  // generated page, and dotfiles. `recursive` handles nested asset directories.
  for (const entry of await readdir(dir)) {
    if (entry === "README.md" || entry === "index.html" || entry.startsWith(".")) continue
    await cp(join(dir, entry), join(outDir, entry), { recursive: true })
  }
}

function backArrow(): string {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`
}

// ------- about page ---------------------------------------------------------

// Canonical project links, gathered in one place. The About page exists partly
// so a human — and a domain-reputation crawler (Cisco Talos/Umbrella, Zscaler,
// …) — can see at a glance that this is legitimate, funded, open-source science
// and categorize the new domain accordingly rather than blocking an unknown.
const REPO = config.appUrl // single source of truth for the project repo URL
const LINKS = {
  bids: "https://bids.neuroimaging.io/",
  team: "https://niivue.com/",
  lead: "https://scholar.google.com/citations?user=00jLGq8AAAAJ&hl=en",
  award: "https://reporter.nih.gov/search/6jGLf73uBUWBbKBDMHhH5Q/project-details/10724895",
  source: REPO,
  issues: `${REPO}/issues`,
  license: `${REPO}/blob/main/LICENSE`,
}

function aboutLink(label: string, sub: string, href: string): string {
  return `
      <a class="about-link" href="${escapeHtml(href)}">
        <span class="about-link__label">${escapeHtml(label)}${ARROW}</span>
        <span class="about-link__sub">${escapeHtml(sub)}</span>
      </a>`
}

export function aboutPage(): string {
  const links = [
    aboutLink("Funding", "NIH BRAIN Initiative · RF1MH133701", LINKS.award),
    aboutLink("Lead", "Chris Rorden · Google Scholar", LINKS.lead),
    aboutLink("Team", "The NiiVue team", LINKS.team),
    aboutLink("Source", "Code on GitHub", LINKS.source),
    aboutLink("Issues", "Report a bug or ask a question", LINKS.issues),
    aboutLink("License", "BSD 2-Clause · open source", LINKS.license),
  ].join("")

  const main = `
  <section class="section about">
    <div class="container">
      <a class="back" href="../index.html">${backArrow()} Back to demos</a>
      <div class="section__head">
        <p class="section__eyebrow">About</p>
        <h2>A free, open-source neuroscience project</h2>
      </div>
      <div class="about__prose">
        <p class="about__lead">${escapeHtml(config.title)} is a free, open-source neuroscience tool for creating, curating, de-identifying, and sharing <a href="${escapeHtml(LINKS.bids)}">BIDS</a> datasets. It is developed and maintained by the <a href="${escapeHtml(LINKS.team)}">NiiVue team</a>. Development is led by <a href="${escapeHtml(LINKS.lead)}">Chris Rorden</a> and supported by the NIH BRAIN Initiative award <a href="${escapeHtml(LINKS.award)}">RF1MH133701</a>.</p>
        <p class="about__note">This site is static documentation hosted on GitHub Pages. It sets no cookies, runs no analytics or trackers, and collects no personal data.</p>
      </div>
      <div class="about-links">${links}</div>
    </div>
  </section>`

  // schema.org metadata — machine-readable provenance (author, funder, license)
  // for search engines and reputation crawlers.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: config.title,
    applicationCategory: "Neuroscience / medical-imaging software",
    operatingSystem: "Windows, macOS, Linux",
    url: `${config.siteUrl}/`,
    isAccessibleForFree: true,
    license: LINKS.license,
    codeRepository: REPO,
    author: { "@type": "Person", name: "Chris Rorden", sameAs: LINKS.lead },
    publisher: { "@type": "Organization", name: "NiiVue", url: LINKS.team },
    funder: {
      "@type": "Organization",
      name: "NIH BRAIN Initiative",
      identifier: "RF1MH133701",
      url: LINKS.award,
    },
    sameAs: [REPO, LINKS.team],
  }

  return layout({
    title: `About — ${config.title} demos`,
    description:
      `${config.title} is a free, open-source neuroscience tool from the NiiVue team, ` +
      "led by Chris Rorden and funded by the NIH BRAIN Initiative (RF1MH133701).",
    base: "../",
    path: "about/",
    main,
    // Escape `<` so a value can never break out of the <script> context (JSON
    // itself doesn't neutralize a literal `</script>`). All values are trusted
    // today; this keeps it safe if a Markdown-derived field is ever added.
    headExtra: `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`,
  })
}

// ------- 404 ----------------------------------------------------------------

// GitHub Pages serves 404.html for any missing path, at any depth, so it can't
// rely on relative asset paths (they'd resolve against the wrong URL). It's
// therefore self-contained: CSS inlined, favicon as a data URI, and the "home"
// link is the apex root ("/") — correct for the custom domain this site targets
// (bidsvue.org), not a project-subpath deployment.
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
.notfound__home { display: inline-flex; align-items: center; gap: 0.5ch; font-weight: 650; text-decoration: none; color: var(--accent-control-text); background: var(--accent); padding: 0.75rem 1.3rem; border-radius: 12px; box-shadow: 0 10px 30px -14px var(--accent-glow); }
.notfound__home:hover { background: var(--accent-control-hover); color: var(--accent-control-hover-text); }</style>
</head>
<body>
<main class="notfound">
  <p class="notfound__code">404</p>
  <h1>This page wandered off.</h1>
  <p class="notfound__lead">The page you’re looking for isn’t here — it may have moved, or never existed.</p>
  <a class="notfound__home" href="/">${ARROW} Back to the demos</a>
</main>
</body>
</html>`
}

// ------- orchestration ------------------------------------------------------

async function buildInto(outputRoot: string, canonical: boolean): Promise<void> {
  await assertCssAssetsExist()
  // Disposable dev-server trees never contain hand-edited generated assets;
  // the promotion guard protects only the canonical deploy output.
  if (canonical) await assertDistAssetsSafe()
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })

  await Bun.write(join(outputRoot, "index.html"), landingPage())
  await mkdir(join(outputRoot, "about"), { recursive: true })
  await Bun.write(join(outputRoot, "about", "index.html"), aboutPage())
  await Bun.write(join(outputRoot, "404.html"), await notFoundPage())
  // GitHub Pages: skip Jekyll so `assets/` etc. are served verbatim.
  await Bun.write(join(outputRoot, ".nojekyll"), "")
  // Custom apex domain, derived from the one source of truth (config.siteUrl).
  // Emitting CNAME on every deploy keeps Pages from clearing the domain on an
  // Actions redeploy.
  await Bun.write(join(outputRoot, "CNAME"), `${new URL(config.siteUrl).host}\n`)

  // Crawlability signals: a robots.txt + sitemap help reputation/search crawlers
  // discover and categorize the site as legitimate content (see aboutPage).
  const urls = ["", "about/", ...config.tutorials.map((t) => `${t.slug}/`)]
  await Bun.write(
    join(outputRoot, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${config.siteUrl}/sitemap.xml\n`,
  )
  await Bun.write(
    join(outputRoot, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${config.siteUrl}/${u}</loc></url>`).join("\n") +
      `\n</urlset>\n`,
  )

  for (const t of config.tutorials) await buildTutorial(t, outputRoot)

  await cp(ASSETS, join(outputRoot, "assets"), { recursive: true })
  if (canonical) await writeAssetManifest()
}

export async function build(): Promise<void> {
  await buildInto(DIST, true)
}

/** Rebuilds a disposable dev tree, restricted to the operating-system temp directory. */
export async function buildIsolated(outputRoot: string): Promise<void> {
  const requestedOutput = resolve(outputRoot)
  const requestedTemp = resolve(tmpdir())
  const outputName = basename(requestedOutput)
  const ownershipError = () =>
    new Error(`Isolated build output must be an owned dev temporary directory: ${outputRoot}`)
  if (dirname(requestedOutput) !== requestedTemp || !outputName.startsWith("bidsvue-demos-dev-")) {
    throw ownershipError()
  }

  const resolvedTemp = await realpath(requestedTemp)
  // If the OS reaps an active dev tree, keep the validated canonical candidate;
  // buildInto() will recreate it. Existing paths are realpathed to reject links.
  let resolvedOutput = join(resolvedTemp, outputName)
  try {
    resolvedOutput = await realpath(requestedOutput)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw ownershipError()
  }
  if (dirname(resolvedOutput) !== resolvedTemp || basename(resolvedOutput) !== outputName) {
    throw ownershipError()
  }
  await buildInto(resolvedOutput, false)
}

if (import.meta.main) {
  const t0 = performance.now()
  await build()
  const ms = Math.round(performance.now() - t0)
  const pages = config.tutorials.length + 3 // home + about + 404 + one per tutorial
  console.log(`✓ Built ${pages} pages → dist/  (${ms}ms)`)
}
