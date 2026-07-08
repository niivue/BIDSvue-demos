import { expect, test } from "bun:test"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import config from "../site.config.ts"
import { aboutPage, build } from "./build.ts"
import { layout } from "./render.ts"

const DIST = join(fileURLToPath(new URL("..", import.meta.url)), "dist")

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
})
