import { expect, test } from "bun:test"
import { mdToPanels } from "./render.ts"

test("prose and callouts keep document order", () => {
  const { panelsHtml } = mdToPanels(`# T
## Notes

para-A

> [!NOTE]
> note-X

para-B
`)
  const a = panelsHtml.indexOf("para-A")
  const n = panelsHtml.indexOf("note-X")
  const b = panelsHtml.indexOf("para-B")
  expect(a).toBeGreaterThanOrEqual(0)
  expect(a).toBeLessThan(n) // callout stays between the two paragraphs
  expect(n).toBeLessThan(b)
})

test("figure alt/caption are not double-escaped", () => {
  const { panelsHtml } = mdToPanels(`# T
## Sec

![the sidecar's field](x.png)
`)
  expect(panelsHtml).toContain(`alt="the sidecar&#39;s field"`)
  expect(panelsHtml).not.toContain("&amp;#39;")
})

test("a numbered step pulls its first figure into the media column", () => {
  const { panelsHtml } = mdToPanels(`# T
## 1. Do it

body-text

![shot](s.png)
`)
  expect(panelsHtml).toContain('class="step"')
  expect(panelsHtml).toContain('class="step__media"')
  expect(panelsHtml).toContain("body-text")
})
