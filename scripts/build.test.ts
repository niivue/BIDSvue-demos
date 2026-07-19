import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import config from "../site.config.ts"
import { aboutPage, build, findMissingCssAssets, findUnpromotedDistAssets } from "./build.ts"
import { layout } from "./render.ts"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const DIST = join(ROOT, "dist")
const ASSET_MANIFEST = join(ROOT, ".asset-manifest.json")

// These guard the drift-prone generated metadata: a wrong canonical, a broken
// About link, or a repo-URL source-of-truth split would fail here rather than
// only surfacing live.

test("layout emits a correct per-page canonical + social card", () => {
  const html = layout({ title: "T", description: "D", base: "../", path: "about/", main: "" })
  expect(html).toContain(`<link rel="canonical" href="${config.siteUrl}/about/" />`)
  expect(html).toContain(`<meta property="og:url" content="${config.siteUrl}/about/" />`)
  expect(html).toContain(`<meta property="og:image" content="${config.siteUrl}/assets/splash.png" />`)
  expect(html).toContain(`<meta name="twitter:card" content="summary_large_image" />`)
})

test("home canonical is the bare origin with no double slash", () => {
  const html = layout({ title: "T", description: "D", base: "", path: "", main: "" })
  expect(html).toContain(`<link rel="canonical" href="${config.siteUrl}/" />`)
})

test("About links trace back to the single configured repo URL", () => {
  const html = aboutPage()
  expect(html).toContain(`href="${config.appUrl}"`) // Source
  expect(html).toContain(`href="${config.appUrl}/issues"`) // Issues
  expect(html).toContain(`href="${config.appUrl}/blob/main/LICENSE"`) // License
})

test("About page embeds valid JSON-LD provenance", () => {
  const m = aboutPage().match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
  expect(m).not.toBeNull()
  const data = JSON.parse(m![1])
  expect(data["@type"]).toBe("SoftwareApplication")
  expect(data.url).toBe(`${config.siteUrl}/`)
  expect(data.codeRepository).toBe(config.appUrl)
})

test("build emits the full generated-site contract (CNAME/robots/sitemap/404)", async () => {
  await build()
  const read = (p: string) => Bun.file(join(DIST, p)).text()

  // CNAME host derives from the single siteUrl source of truth
  expect((await read("CNAME")).trim()).toBe(new URL(config.siteUrl).host)

  expect(await read("robots.txt")).toContain(`Sitemap: ${config.siteUrl}/sitemap.xml`)

  const sitemap = await read("sitemap.xml")
  for (const path of ["", "about/", ...config.tutorials.map((t) => `${t.slug}/`)]) {
    expect(sitemap).toContain(`<loc>${config.siteUrl}/${path}</loc>`)
  }

  const notFound = await read("404.html")
  expect(notFound).toContain('href="/"') // apex-root home link
  expect(notFound).toContain('name="robots" content="noindex"')

  expect(await Bun.file(join(DIST, ".asset-manifest.json")).exists()).toBe(false)
  const assetManifest = JSON.parse(await Bun.file(ASSET_MANIFEST).text()) as {
    version: number
    files: Record<string, string>
  }
  expect(assetManifest.version).toBe(1)
  expect(assetManifest.files["site.css"]).toMatch(/^[a-f0-9]{64}$/)

  const home = await read("index.html")
  expect(home).toContain('data-radar-toggle')
  expect(home).toContain('data-radar-toggle aria-hidden="true"')
  expect(home).not.toContain('data-radar-toggle role="button"')
  for (const [index, tutorial] of config.tutorials.entries()) {
    expect(home).toContain(
      `<a href="${tutorial.slug}/index.html"><b>${index + 1}</b> ${tutorial.shortcutLabel}</a>`,
    )
  }
})

test("asset guard protects dist-only changes until they are promoted", async () => {
  const root = await mkdtemp(join(tmpdir(), "bidsvue-asset-guard-"))
  const source = join(root, "assets")
  const generated = join(root, "dist", "assets")
  const manifest = join(root, ".asset-manifest.json")

  try {
    await mkdir(source, { recursive: true })
    await mkdir(generated, { recursive: true })
    await Bun.write(join(source, "image.png"), "source-v1")
    await Bun.write(join(generated, "image.png"), "source-v1")
    expect(await findUnpromotedDistAssets(source, generated, manifest)).toEqual([])

    // A missing manifest means this may be stale generated output from another
    // checkout, so even a mismatch is safe on the first build.
    await Bun.write(join(generated, "image.png"), "improved-in-dist")
    expect(await findUnpromotedDistAssets(source, generated, manifest)).toEqual([])
    await Bun.write(join(generated, "stale-orphan.png"), "older-checkout")
    expect(await findUnpromotedDistAssets(source, generated, manifest)).toEqual([])
    await rm(join(generated, "stale-orphan.png"))

    const sourceHash = createHash("sha256").update("source-v1").digest("hex")
    await Bun.write(
      manifest,
      JSON.stringify({ version: 1, files: { "image.png": sourceHash } }),
    )
    expect(await findUnpromotedDistAssets(source, generated, manifest)).toEqual(["image.png"])

    await Bun.write(join(source, "image.png"), "improved-in-dist")
    expect(await findUnpromotedDistAssets(source, generated, manifest)).toEqual([])

    await Bun.write(join(generated, "dist-only.png"), "not-promoted")
    expect(await findUnpromotedDistAssets(source, generated, manifest)).toEqual(["dist-only.png"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("CSS asset guard reports missing local url references", async () => {
  const root = await mkdtemp(join(tmpdir(), "bidsvue-css-assets-"))
  try {
    await Bun.write(join(root, "site.css"), '.a { background: url("present.png") }\n.b { mask: url(missing.png) }')
    await Bun.write(join(root, "present.png"), "present")
    expect(await findMissingCssAssets(join(root, "site.css"), root)).toEqual(["missing.png"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
