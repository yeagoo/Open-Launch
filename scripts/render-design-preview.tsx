#!/usr/bin/env bun
/**
 * Renders the home v2 design artifacts to standalone HTML files.
 *
 * Why this exists: `/design-preview` renders inside the app's root layout,
 * which resolves a session, which needs the database. This exporter compiles
 * the real `app/globals.css` with the real Tailwind pipeline and renders the
 * same components the site ships, so the reviewed artifact cannot drift from
 * the shipped markup while needing no DB, no server and no login.
 *
 * Two documents are produced:
 *   index.html    Phase 1 — the palette/atom specimen (4 palettes × 2 themes)
 *   home-v2.html  Phase 2 — the real `HomeBody` rendered against fixtures
 *
 * Usage:
 *   bun run design:preview              # HTML + CSS + screenshots
 *   bun run design:preview --no-shots   # skip the Playwright screenshots
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import tailwindcss from "@tailwindcss/postcss"
import { NextIntlClientProvider } from "next-intl"
import postcss from "postcss"
import { renderToStaticMarkup } from "react-dom/server"

import { FooterFixture } from "../app/design-preview/footer-fixture"
import { HERO_CONCEPTS } from "../app/design-preview/hero-lab"
import { HeroLabFixture } from "../app/design-preview/hero-lab-fixture"
import { HomeFixture } from "../app/design-preview/home-fixture"
import { DesignSpecimen, HOME_PALETTES } from "../app/design-preview/specimen"
// The fixture's labels are hardcoded English, but the real components it
// renders (the search trigger, the nav links) read next-intl messages, so the
// provider needs a real message bundle rather than an empty object.
import enMessages from "../messages/en.json"

const repositoryRoot = resolve(import.meta.dirname, "..")
const outputDir = resolve(repositoryRoot, "artifacts/design-preview")
const cssEntry = resolve(repositoryRoot, "app/design-preview/preview.css")
const skipScreenshots = process.argv.includes("--no-shots")

/**
 * Offline stand-ins for the CSS variables next/font injects at runtime. Without
 * them `font-family: var(--font-sans)` is invalid-at-computed-value-time and
 * the whole page silently falls back to the browser's default serif.
 *
 * The Google Fonts link is the one intentional network dependency of the
 * exported file: it lets the IBM Plex Serif display face actually render
 * instead of degrading to Georgia. The preview stays readable offline.
 */
const FONT_FALLBACKS = `
    :root {
      --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-heading: var(--font-sans);
      --font-editorial: "IBM Plex Serif", ui-serif, Georgia, "Times New Roman", serif;
    }
`

async function buildCss(): Promise<string> {
  const source = await readFile(cssEntry, "utf8")
  // `from` anchors Tailwind's @source resolution and error messages to the real
  // entry file, not to this script's cwd.
  const result = await postcss([tailwindcss()]).process(source, { from: cssEntry })
  return result.css
}

/**
 * The export is opened straight from `file://`, where Next's own asset URLs
 * (`/images/img1.png`, `/_next/image?url=…`) resolve against the filesystem
 * root and render as broken icons. Rewrite them to relative paths into `public/`
 * so the review artifact shows the real images.
 *
 * Preview-only cosmetic shim: nothing in the app goes through this, and images
 * that are already data URIs or absolute URLs are left untouched.
 */
function rewriteAssetUrls(html: string): string {
  return html
    .replace(/\ssrcSet="[^"]*"/g, "")
    .replace(/src="\/_next\/image\?url=([^"&]+)[^"]*"/g, (_match, encoded: string) => {
      try {
        return `src="../../public${decodeURIComponent(encoded)}"`
      } catch {
        return 'src=""'
      }
    })
    .replace(/src="\/(?!\/)([^"]*)"/g, 'src="../../public/$1"')
}

function buildHtml(markup: string, title: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>aat.ee · ${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:wght@500;600;700&display=swap"
    />
    <link rel="stylesheet" href="./preview.css" />
    <style>${FONT_FALLBACKS}</style>
  </head>
  <body class="font-sans antialiased">
${rewriteAssetUrls(markup)}
  </body>
</html>
`
}

/**
 * The fixture labels are literal English, but the real components inside
 * `HomeBody` (search trigger, nav links) call next-intl hooks, so the provider
 * has to carry a real bundle. Under bun the client-side hooks can resolve a
 * different `use-intl` instance than the provider and log an
 * ENVIRONMENT_FALLBACK error before falling back — the rendered markup is still
 * correct (asserted below), so the noise is left alone rather than papered over.
 *
 * `dark` wraps the page in the same `.dark` scope next-themes applies to
 * `<html>`; it is the only way to review the dark token set without a browser
 * session to toggle it.
 */
function renderHomeFixture(theme: "light" | "dark" = "light"): string {
  const page = (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <HomeFixture />
    </NextIntlClientProvider>
  )
  return renderToStaticMarkup(
    theme === "dark" ? (
      <div className="dark bg-background text-foreground min-h-screen">{page}</div>
    ) : (
      page
    ),
  )
}

/** Site chrome: the footer against fixture taxonomy data. */
function renderFooterFixture(theme: "light" | "dark" = "light"): string {
  const page = (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <FooterFixture />
    </NextIntlClientProvider>
  )
  return renderToStaticMarkup(
    theme === "dark" ? <div className="dark bg-background">{page}</div> : page,
  )
}

/** Hero lab: six structurally different hero candidates over one fixture. */
function renderHeroLab(theme: "light" | "dark" = "light"): string {
  // The concepts use the locale-aware `Link`, so they need the same provider
  // the app's root layout supplies.
  const page = (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <HeroLabFixture />
    </NextIntlClientProvider>
  )
  return renderToStaticMarkup(
    theme === "dark" ? <div className="dark bg-background text-foreground">{page}</div> : page,
  )
}

/**
 * Guards the one invariant that makes the palette decision meaningful: the
 * shipped defaults in `:root` / `.dark` must resolve to exactly the palette
 * that was reviewed and approved. If someone edits one block and forgets the
 * other, the review artifact and the live site silently diverge — so fail the
 * export rather than emit a screenshot nobody can trust.
 */
async function verifyDefaultPaletteMatches(page: import("playwright").Page): Promise<void> {
  const SHIPPED = HOME_PALETTES[0].id
  const result = await page.evaluate((shipped) => {
    const PROPS = [
      "--home-accent",
      "--home-accent-hover",
      "--home-accent-strong",
      "--home-accent-soft",
      "--home-highlight",
      "--home-highlight-strong",
      "--home-highlight-soft",
    ]
    const read = (el: Element) =>
      PROPS.map((prop) => getComputedStyle(el).getPropertyValue(prop).trim())

    const target = document.querySelector(`[data-home-palette="${shipped}"]`)
    if (!target) return { error: `no element carries data-home-palette="${shipped}"` }

    const lightDefault = read(document.documentElement)
    const lightPalette = read(target)

    // No `.dark` wrapper ships in the export, so toggle it on <html> to read
    // the dark defaults straight out of globals.css.
    document.documentElement.classList.add("dark")
    const darkDefault = read(document.documentElement)
    const darkPalette = read(target)
    document.documentElement.classList.remove("dark")

    const mismatches: string[] = []
    PROPS.forEach((prop, index) => {
      if (lightDefault[index] !== lightPalette[index]) {
        mismatches.push(
          `light ${prop}: default=${lightDefault[index]} palette=${lightPalette[index]}`,
        )
      }
      if (darkDefault[index] !== darkPalette[index]) {
        mismatches.push(`dark ${prop}: default=${darkDefault[index]} palette=${darkPalette[index]}`)
      }
    })

    return { mismatches, tokenCount: PROPS.length }
  }, SHIPPED)

  if ("error" in result) throw new Error(`default palette check failed: ${result.error}`)
  if (result.mismatches.length) {
    throw new Error(
      `:root/.dark no longer match the reviewed "${SHIPPED}" palette:\n  ${result.mismatches.join("\n  ")}`,
    )
  }
  console.log(
    `[design-preview] verified :root defaults == "${SHIPPED}" palette (light + dark, ${result.tokenCount} tokens)`,
  )
}

async function captureScreenshots(): Promise<string[]> {
  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const written: string[] = []

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`file://${resolve(outputDir, "index.html")}`, { waitUntil: "load" })
    // Fonts arrive from the network; without this the screenshot can catch
    // the Georgia fallback and misrepresent the serif scale.
    await page.evaluate(() => document.fonts.ready)

    await verifyDefaultPaletteMatches(page)

    // One image per palette instead of a single full-page shot: with four
    // palettes × two themes the page is far too tall to review in one image.
    for (const palette of HOME_PALETTES) {
      const file = resolve(outputDir, `palette-${palette.id}.png`)
      await page.locator(`[data-palette-section="${palette.id}"]`).screenshot({ path: file })
      written.push(file)
    }

    // Narrow viewport for the SHIPPED palette, to confirm the composition
    // survives single-column stacking on the one that matters.
    await page.setViewportSize({ width: 420, height: 900 })
    const mobileFile = resolve(outputDir, `palette-${HOME_PALETTES[0].id}-mobile.png`)
    await page.locator(`[data-palette-section="${HOME_PALETTES[0].id}"]`).screenshot({
      path: mobileFile,
    })
    written.push(mobileFile)

    // Phase 2: the real home body. Full-page shots because the whole point is
    // to judge the three-column composition and where the columns break.
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`file://${resolve(outputDir, "home-v2.html")}`, { waitUntil: "load" })
    await page.evaluate(() => document.fonts.ready)
    const homeDesktop = resolve(outputDir, "home-v2-desktop.png")
    await page.screenshot({ path: homeDesktop, fullPage: true })
    written.push(homeDesktop)

    await page.setViewportSize({ width: 420, height: 900 })
    const homeMobile = resolve(outputDir, "home-v2-mobile.png")
    await page.screenshot({ path: homeMobile, fullPage: true })
    written.push(homeMobile)

    // Dark theme is a shipped requirement ("two token sets, both maintained"),
    // so it gets the same real-component screenshot rather than a promise.
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`file://${resolve(outputDir, "home-v2-dark.html")}`, { waitUntil: "load" })
    await page.evaluate(() => document.fonts.ready)
    const homeDark = resolve(outputDir, "home-v2-dark.png")
    await page.screenshot({ path: homeDark, fullPage: true })
    written.push(homeDark)

    // Hero lab: one image per candidate so they can be compared without
    // scrolling a 12k-pixel page, plus one dark pass over the whole board.
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`file://${resolve(outputDir, "hero-lab.html")}`, { waitUntil: "load" })
    await page.evaluate(() => document.fonts.ready)
    for (const concept of HERO_CONCEPTS) {
      const file = resolve(outputDir, `hero-${concept.id}.png`)
      // Screenshot the concept's hero only — the comparison card above it is
      // notes, not design.
      await page
        .locator(`[data-hero-section="${concept.id}"] > :last-child`)
        .screenshot({ path: file })
      written.push(file)
    }

    await page.goto(`file://${resolve(outputDir, "hero-lab-dark.html")}`, { waitUntil: "load" })
    await page.evaluate(() => document.fonts.ready)
    const heroLabDark = resolve(outputDir, "hero-lab-dark.png")
    await page.screenshot({ path: heroLabDark, fullPage: true })
    written.push(heroLabDark)

    // Site chrome: footer only (the nav needs a session, so it has no offline
    // fixture). Desktop + mobile, because the column count changes at lg.
    for (const [name, width] of [
      ["desktop", 1440],
      ["mobile", 420],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`file://${resolve(outputDir, "chrome.html")}`, { waitUntil: "load" })
      await page.evaluate(() => document.fonts.ready)
      const file = resolve(outputDir, `footer-${name}.png`)
      await page.screenshot({ path: file, fullPage: true })
      written.push(file)
    }

    await page.close()
  } finally {
    await browser.close()
  }

  return written
}

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true })

  const [css, specimenMarkup] = await Promise.all([
    buildCss(),
    Promise.resolve(renderToStaticMarkup(<DesignSpecimen />)),
  ])
  const homeMarkup = renderHomeFixture()
  const homeDarkMarkup = renderHomeFixture("dark")
  const heroLabMarkup = renderHeroLab()
  const heroLabDarkMarkup = renderHeroLab("dark")
  const footerMarkup = renderFooterFixture()
  const footerDarkMarkup = renderFooterFixture("dark")

  const cssPath = resolve(outputDir, "preview.css")
  const specimenPath = resolve(outputDir, "index.html")
  const homePath = resolve(outputDir, "home-v2.html")
  const homeDarkPath = resolve(outputDir, "home-v2-dark.html")
  const heroLabPath = resolve(outputDir, "hero-lab.html")
  const heroLabDarkPath = resolve(outputDir, "hero-lab-dark.html")
  const footerPath = resolve(outputDir, "chrome.html")
  const footerDarkPath = resolve(outputDir, "chrome-dark.html")
  await writeFile(cssPath, css, "utf8")
  await writeFile(specimenPath, buildHtml(specimenMarkup, "home v2 palette review"), "utf8")
  await writeFile(homePath, buildHtml(homeMarkup, "home v2 page"), "utf8")
  await writeFile(homeDarkPath, buildHtml(homeDarkMarkup, "home v2 page (dark)"), "utf8")
  await writeFile(heroLabPath, buildHtml(heroLabMarkup, "hero lab"), "utf8")
  await writeFile(heroLabDarkPath, buildHtml(heroLabDarkMarkup, "hero lab (dark)"), "utf8")
  await writeFile(footerPath, buildHtml(footerMarkup, "site chrome"), "utf8")
  await writeFile(footerDarkPath, buildHtml(footerDarkMarkup, "site chrome (dark)"), "utf8")

  console.log(`[design-preview] css  ${cssPath} (${(css.length / 1024).toFixed(1)} KB)`)
  console.log(`[design-preview] html ${specimenPath}`)
  console.log(`[design-preview] html ${homePath}`)
  console.log(`[design-preview] html ${homeDarkPath}`)
  console.log(`[design-preview] html ${heroLabPath}`)
  console.log(`[design-preview] html ${heroLabDarkPath}`)
  console.log(`[design-preview] html ${footerPath}`)
  console.log(`[design-preview] html ${footerDarkPath}`)

  if (skipScreenshots) return

  try {
    for (const shot of await captureScreenshots()) {
      console.log(`[design-preview] png  ${shot}`)
    }
  } catch (error) {
    // Screenshots are a convenience; a missing browser must not fail the export.
    console.warn(
      `[design-preview] screenshot skipped: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

await main()
