"use client"

import { useState } from "react"

import { RiCheckLine, RiFileCopyLine } from "@remixicon/react"

interface CopyPromoCodeProps {
  code: string
  copyLabel: string
  copiedLabel: string
}

/**
 * Click-to-copy promo code chip. Pure client-side — `navigator.clipboard`
 * needs a secure browser context (HTTPS or localhost). On older
 * browsers or non-secure contexts the clipboard API is undefined, so
 * we guard against that synchronously: the click becomes a no-op
 * (the code is still visible as plain text, so the user can select
 * and copy manually).
 *
 * The "Copied!" confirmation auto-dismisses after 2s and the
 * button keeps a fixed `min-w` so the rest of the row doesn't
 * jitter when the label changes width.
 */
export function CopyPromoCode({ code, copyLabel, copiedLabel }: CopyPromoCodeProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const cb = typeof navigator !== "undefined" ? navigator.clipboard : undefined
    if (!cb?.writeText) return
    cb.writeText(code)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      // Silently swallow — older browsers / non-HTTPS contexts can
      // refuse clipboard access. The user still sees the code in
      // plain text and can copy manually.
      .catch(() => {})
  }

  const ariaLabel = copied ? `${copiedLabel}: ${code}` : `${copyLabel}: ${code}`

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={ariaLabel}
      className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 inline-flex min-w-[170px] items-center justify-between gap-2 rounded-md border px-3 py-1.5 font-mono text-sm font-bold tracking-wider transition-colors"
    >
      <span>{code}</span>
      {copied ? (
        <span className="flex items-center gap-1 text-xs">
          <RiCheckLine className="h-3.5 w-3.5" />
          {copiedLabel}
        </span>
      ) : (
        <RiFileCopyLine className="text-primary/60 h-3.5 w-3.5" />
      )}
    </button>
  )
}
