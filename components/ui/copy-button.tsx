"use client"

import { useState } from "react"

import { RiCheckLine, RiFileCopyLine } from "@remixicon/react"

import { Button } from "./button"

interface CopyButtonProps {
  text: string
  className?: string
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <Button variant="outline" size="sm" className={className} onClick={handleCopy}>
      {copied ? (
        <>
          <RiCheckLine className="mr-1 h-4 w-4" />
          Copied!
        </>
      ) : (
        <>
          <RiFileCopyLine className="mr-1 h-4 w-4" />
          Copy Code
        </>
      )}
    </Button>
  )
}
