/**
 * Rendering helpers: the shared HTML shell (top bar, theme controls, footer)
 * and the Markdown → step-panels transform.
 *
 * Authoring convention (stays 100% GitHub-native Markdown):
 *   # Page title
 *   Intro paragraph(s) before the first `##` become the page lead.
 *   ## Requirements          → a plain prose panel
 *   ## 1. Do the thing       → a numbered STEP panel; a screenshot in the
 *   ...text...                 body floats into an alternating media column
 *   ![caption](shot.png)       with the translucent accent glow.
 *   > [!NOTE] ...            → a styled callout (GitHub alert syntax)
 */

import { marked, type Token, type Tokens } from "marked"
import config from "../site.config.ts"

// ------- small utils --------------------------------------------------------

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

type TokenList = Token[] & { links?: Record<string, { href: string; title?: string }> }

function renderTokens(tokens: Token[], links: TokenList["links"]): string {
  const list = tokens as TokenList
  list.links = links ?? {}
  return marked.parser(list)
}

/** A paragraph that is just one or more images (a "figure" line). */
/** A paragraph token that is nothing but image(s) (a "figure" line). */
function paragraphImages(tok: Token): Tokens.Image[] | null {
  if (tok.type !== "paragraph") return null
  const kids = (tok as Tokens.Paragraph).tokens ?? []
  const isImage = (k: Token): k is Tokens.Image => k.type === "image"
  const isBlank = (k: Token) => k.type === "text" && !k.raw.trim()
  if (kids.length === 0 || !kids.every((k) => isImage(k) || isBlank(k))) return null
  return kids.filter(isImage)
}

const ALERT_ICON: Record<string, string> = {
  NOTE: "ℹ",
  TIP: "✦",
  IMPORTANT: "★",
  WARNING: "▲",
  CAUTION: "▲",
}

/** Convert a GitHub `> [!NOTE]` alert blockquote into a callout, else null. */
function alertCallout(tok: Token): string | null {
  if (tok.type !== "blockquote") return null
  const raw = (tok as Tokens.Blockquote).raw
  const m = raw.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i)
  if (!m) return null
  // strip the leading `>` and the [!TYPE] marker, render the rest as prose
  const inner = raw
    .replace(/^\s*>\s?/gm, "")
    .replace(/\[!\w+\]\s*/i, "")
    .trim()
  const body = marked.parse(inner, { async: false }) as string
  return `<aside class="callout"><span class="callout__icon" aria-hidden="true">${ALERT_ICON[m[1].toUpperCase()]}</span><div>${body}</div></aside>`
}

// ------- Markdown → panels --------------------------------------------------

export type ParsedDoc = {
  title: string
  leadHtml: string
  panelsHtml: string
}

export function mdToPanels(md: string): ParsedDoc {
  const tokens = marked.lexer(md) as TokenList
  const links = tokens.links

  let title = ""
  const leadTokens: Token[] = []
  type Section = { heading: Tokens.Heading; body: Token[] }
  const sections: Section[] = []
  let cur: Section | null = null

  for (const tok of tokens) {
    if (tok.type === "heading" && (tok as Tokens.Heading).depth === 1 && !title) {
      title = (tok as Tokens.Heading).text
      continue
    }
    if (tok.type === "heading" && (tok as Tokens.Heading).depth === 2) {
      cur = { heading: tok as Tokens.Heading, body: [] }
      sections.push(cur)
      continue
    }
    if (cur) cur.body.push(tok)
    else if (tok.type !== "space") leadTokens.push(tok)
  }

  const leadHtml = leadTokens.length ? renderTokens(leadTokens, links) : ""

  const panels = sections.map((sec, i) => renderSection(sec, links, i))
  return { title, leadHtml, panelsHtml: panels.join("\n") }
}

function renderSection(
  sec: { heading: Tokens.Heading; body: Token[] },
  links: TokenList["links"],
  index: number,
): string {
  const stepMatch = sec.heading.text.match(/^(\d+)[.)]\s+(.*)$/)

  // Pull out figures (image-only paragraphs) and callouts; keep prose apart.
  const figures: Tokens.Image[] = []
  const proseTokens: Token[] = []
  const calloutHtml: string[] = []

  for (const tok of sec.body) {
    const imgs = paragraphImages(tok)
    if (imgs && imgs.length) {
      figures.push(...imgs)
      continue
    }
    const callout = alertCallout(tok)
    if (callout) {
      calloutHtml.push(callout)
      continue
    }
    proseTokens.push(tok)
  }

  const prose = proseTokens.length ? renderTokens(proseTokens, links) : ""
  const callouts = calloutHtml.join("\n")

  const figureHtml = (img: Tokens.Image) => `
      <figure class="shot">
        <img src="${escapeHtml(img.href)}" alt="${escapeHtml(img.text || "")}" loading="lazy" decoding="async" />
        ${img.text ? `<figcaption>${escapeHtml(img.text)}</figcaption>` : ""}
      </figure>`

  // Numbered step with a screenshot → two-column alternating layout.
  if (stepMatch && figures.length) {
    const [, num, rest] = stepMatch
    const extraFigures = figures.slice(1).map(figureHtml).join("")
    return `
    <section class="step" id="step-${num}">
      <div class="step__body prose">
        <span class="step__num" aria-hidden="true">${num}</span>
        <h2>${escapeHtml(rest)}</h2>
        ${prose}
        ${callouts}
        ${extraFigures}
      </div>
      <div class="step__media">${figureHtml(figures[0])}</div>
    </section>`
  }

  // Numbered step without a screenshot → full-width numbered prose.
  if (stepMatch) {
    const [, num, rest] = stepMatch
    return `
    <section class="panel step-plain" id="step-${num}">
      <div class="prose">
        <span class="step__num" aria-hidden="true">${num}</span>
        <h2>${escapeHtml(rest)}</h2>
        ${prose}
        ${callouts}
      </div>
    </section>`
  }

  // Non-numbered heading (Requirements, etc.) → prose panel.
  const anyFigures = figures.map(figureHtml).join("")
  return `
    <section class="panel" id="section-${index}">
      <div class="prose">
        <h2>${escapeHtml(sec.heading.text)}</h2>
        ${prose}
        ${callouts}
        ${anyFigures}
      </div>
    </section>`
}

// ------- HTML shell ---------------------------------------------------------

const SUN = `<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`
const MOON = `<svg class="moon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`
export const ARROW = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`

const ACCENTS = ["orange", "sage", "garnet", "periwinkle", "violet", "indigo"]

// The floating nav ribbon (top-left): brand + three links.
function topbar(base: string): string {
  const sep = '<span class="topbar__sep" aria-hidden="true">|</span>'
  return `
  <header class="topbar">
    <a class="brand" href="${base}index.html">${escapeHtml(config.title)}<span class="brand__sub">demos</span></a>
    ${sep}
    <a class="topnav-link" href="${base}index.html#tutorials">Tutorials</a>
    ${sep}
    <a class="topnav-link" href="${escapeHtml(config.appUrl)}">Source</a>
    ${sep}
    <a class="topnav-link" href="${escapeHtml(config.releasesUrl)}">Download</a>
  </header>`
}

// The floating controls tab (bottom-right): accent swatches + theme toggle.
function footer(): string {
  const swatches = ACCENTS.map(
    (a) =>
      `<button class="swatch swatch--${a}" data-accent="${a}" title="${a[0].toUpperCase() + a.slice(1)} accent" aria-label="${a} accent"></button>`,
  ).join("")
  return `
  <footer class="site-footer">
    <div class="controls">
      <div class="swatches" role="group" aria-label="Accent color">${swatches}</div>
      <button class="icon-btn" data-theme-toggle type="button" aria-label="Toggle dark mode">${SUN}${MOON}</button>
    </div>
  </footer>`
}

const HEAD_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('bidsvue-demos:theme');if(t)document.documentElement.setAttribute('data-theme',t);var a=localStorage.getItem('bidsvue-demos:accent')||'${config.defaultAccent}';document.documentElement.setAttribute('data-accent',a);}catch(e){document.documentElement.setAttribute('data-accent','${config.defaultAccent}');}})();`

export type LayoutOpts = {
  title: string
  description: string
  /** Relative prefix to site root: "" at root, "../" one level deep. */
  base: string
  main: string
}

export function layout(o: LayoutOpts): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(o.title)}</title>
<meta name="description" content="${escapeHtml(o.description)}" />
<meta name="color-scheme" content="light dark" />
<meta property="og:title" content="${escapeHtml(o.title)}" />
<meta property="og:description" content="${escapeHtml(o.description)}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary" />
<link rel="icon" type="image/png" href="${o.base}assets/favicon.png" />
<link rel="stylesheet" href="${o.base}assets/site.css" />
<script>${HEAD_THEME_SCRIPT}</script>
</head>
<body>
${topbar(o.base)}
<main>
${o.main}
</main>
${footer()}
<script src="${o.base}assets/theme.js" defer></script>
</body>
</html>`
}
