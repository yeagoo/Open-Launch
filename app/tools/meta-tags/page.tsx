"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import { RiArrowLeftLine, RiCheckLine, RiFileCopyLine } from "@remixicon/react"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"
import { SoftCard } from "@/components/ds/soft-card"

type FieldKey = "title" | "description" | "url" | "image"

interface Field {
  key: FieldKey
  label: string
  placeholder: string
  /** Recommended maximum, shown as a counter. Only the copy fields have one. */
  max?: number
}

const FIELDS: Field[] = [
  {
    key: "title",
    label: "Title",
    placeholder: "Hexpack — ship a web app as a desktop app",
    max: 70,
  },
  {
    key: "description",
    label: "Description",
    placeholder: "One command turns your web app into a signed desktop bundle.",
    max: 200,
  },
  { key: "url", label: "URL", placeholder: "https://example.com/hexpack" },
  { key: "image", label: "Image URL", placeholder: "https://example.com/hexpack-cover.png" },
]

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/**
 * Generates the tags a link preview reads.
 *
 * Deliberately a generator and not a checker: checking would mean fetching a
 * URL the visitor typed, which is an SSRF surface for no gain — the tags either
 * exist on the page or they do not, and the visitor can see that for themselves
 * by pasting a link into a chat.
 */
export default function MetaTagsPage() {
  const [values, setValues] = useState<Record<FieldKey, string>>({
    title: "",
    description: "",
    url: "",
    image: "",
  })
  const [copied, setCopied] = useState(false)

  const tags = useMemo(() => {
    const lines: string[] = []
    const push = (tag: string) => lines.push(tag)
    if (values.title) {
      push(`<title>${escapeAttribute(values.title)}</title>`)
      push(`<meta property="og:title" content="${escapeAttribute(values.title)}" />`)
      push(`<meta name="twitter:title" content="${escapeAttribute(values.title)}" />`)
    }
    if (values.description) {
      push(`<meta name="description" content="${escapeAttribute(values.description)}" />`)
      push(`<meta property="og:description" content="${escapeAttribute(values.description)}" />`)
      push(`<meta name="twitter:description" content="${escapeAttribute(values.description)}" />`)
    }
    if (values.url) {
      push(`<link rel="canonical" href="${escapeAttribute(values.url)}" />`)
      push(`<meta property="og:url" content="${escapeAttribute(values.url)}" />`)
    }
    if (values.image) {
      push(`<meta property="og:image" content="${escapeAttribute(values.image)}" />`)
      push(`<meta name="twitter:image" content="${escapeAttribute(values.image)}" />`)
    }
    if (lines.length) {
      push(`<meta property="og:type" content="website" />`)
      // The large card is what renders the image above the text; without it
      // X/Twitter falls back to a small square thumbnail.
      push(`<meta name="twitter:card" content="summary_large_image" />`)
    }
    return lines.join("\n")
  }, [values])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tags)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard denied: the text is selectable, so the visitor can still copy
      // it by hand. Nothing to report.
    }
  }

  const host = (() => {
    try {
      return new URL(values.url).hostname.replace(/^www\./, "")
    } catch {
      return values.url
    }
  })()

  return (
    <div className="bg-secondary/20 min-h-screen">
      <div className="container mx-auto max-w-3xl px-4 pt-8 pb-12">
        <Link
          href="/tools"
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <RiArrowLeftLine className="h-4 w-4" aria-hidden="true" />
          All tools
        </Link>

        <div className="mb-6 space-y-2">
          <SerifHeading as="h1" size="section">
            Social meta tag generator
          </SerifHeading>
          <p className="text-muted-foreground text-sm">
            Fill in the fields, check the preview, paste the tags into your page&apos;s{" "}
            <code className="bg-home-surface-muted rounded px-1 text-xs">&lt;head&gt;</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <label
                  htmlFor={`meta-${field.key}`}
                  className="text-foreground mb-1 block text-sm font-medium"
                >
                  {field.label}
                </label>
                <input
                  id={`meta-${field.key}`}
                  type="text"
                  value={values[field.key]}
                  maxLength={field.max}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
                  }
                  className="border-home-hairline-strong bg-home-surface text-foreground focus-visible:ring-home-accent/40 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
                />
                {field.max && (
                  <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                    {values[field.key].length}/{field.max}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                Preview
              </p>
              <SoftCard padding="none" className="overflow-hidden">
                <div className="bg-home-surface-muted flex aspect-[1.91/1] items-center justify-center">
                  {values.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={values.image}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none"
                      }}
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">Image preview</span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="text-muted-foreground text-xs">{host || "example.com"}</p>
                  <p className="text-foreground line-clamp-2 text-sm font-semibold">
                    {values.title || "Your title appears here"}
                  </p>
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {values.description || "Your description appears here."}
                  </p>
                </div>
              </SoftCard>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  Tags
                </p>
                <PillButton type="button" variant="soft" size="sm" onClick={copy} disabled={!tags}>
                  {copied ? (
                    <RiCheckLine className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <RiFileCopyLine className="h-4 w-4" aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </PillButton>
              </div>
              <pre className="bg-home-ink text-home-ink-foreground overflow-x-auto rounded-lg p-3 text-xs">
                <code>{tags || "Fill in a field to generate tags."}</code>
              </pre>
              <p aria-live="polite" className="sr-only">
                {copied ? "Tags copied to clipboard" : ""}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
