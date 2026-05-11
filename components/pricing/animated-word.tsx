"use client"

import { useEffect, useRef, useState } from "react"

// Each rotation cycles through a small palette so the same word
// never appears in the same colour twice in a row. Tailwind needs
// the full class strings present at build time for the JIT compiler,
// which is why this is an explicit list and not template-string
// interpolation.
const COLORS = [
  "text-emerald-600 dark:text-emerald-400",
  "text-blue-600 dark:text-blue-400",
  "text-amber-600 dark:text-amber-400",
  "text-violet-600 dark:text-violet-400",
  "text-rose-600 dark:text-rose-400",
]

interface AnimatedWordProps {
  words: string[]
  // Rotation interval in ms. 2000 reads as deliberate without feeling
  // sluggish; bumping past 2500 starts to feel stuck.
  intervalMs?: number
}

export function AnimatedWord({ words, intervalMs = 2000 }: AnimatedWordProps) {
  const [i, setI] = useState(0)
  const wordRef = useRef<HTMLSpanElement>(null)
  // Container width tracks the *current* word's natural width, so
  // neighbouring text ("seen", "across", …) sits flush instead of
  // floating in dead space when a shorter word is showing. The CSS
  // transition turns the snap into a smooth slide.
  const [width, setWidth] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (words.length <= 1) return
    const id = setInterval(() => setI((prev) => (prev + 1) % words.length), intervalMs)
    return () => clearInterval(id)
  }, [words.length, intervalMs])

  // Measure after paint so the container width state matches whatever
  // word just rendered. We use `useEffect` (not `useLayoutEffect`) so
  // SSR doesn't print a "useLayoutEffect does nothing on the server"
  // warning — the CSS width transition cushions the (single-frame)
  // gap between paint and re-measure.
  useEffect(() => {
    if (wordRef.current) {
      setWidth(wordRef.current.scrollWidth)
    }
  }, [i])

  return (
    <span
      className="relative inline-block overflow-hidden align-baseline transition-[width] duration-300 ease-out"
      style={{ width: width !== undefined ? `${width}px` : undefined }}
    >
      <span
        ref={wordRef}
        key={i}
        className={`animate-in fade-in slide-in-from-bottom-1 inline-block whitespace-nowrap duration-500 ${COLORS[i % COLORS.length]}`}
      >
        {words[i]}
      </span>
    </span>
  )
}
