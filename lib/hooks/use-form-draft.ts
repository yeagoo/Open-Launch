"use client"

import { useEffect, useRef } from "react"

const SCHEMA_VERSION = 1
const DEBOUNCE_MS = 1_000

interface DraftEnvelope<T> {
  version: number
  savedAt: number
  data: T
}

/**
 * Persist a serializable form-state object to localStorage with a debounced
 * write, and restore it once on mount. Designed for multi-step forms where
 * losing typed-in data on accidental refresh is the worst-case experience.
 *
 * - `key` should be globally unique per form + per user (e.g.
 *   `submit-form-draft:<userId>`) so two accounts in the same browser
 *   don't collide.
 * - `restore(data)` is called at most once with the parsed payload. Return
 *   void; the caller decides what to merge / discard / ask the user about.
 *   Side-effects like toast notifications belong in this callback.
 * - Drafts older than `maxAgeMs` (default 14d) are dropped silently. Stale
 *   drafts often have outdated category IDs / pricing schema and are more
 *   confusing than helpful.
 *
 * Returns a `clear()` you should call after a successful submit so the
 * draft doesn't pop back on the next visit.
 */
export function useFormDraft<T>(
  key: string,
  formData: T,
  restore: (data: T) => void,
  options?: { maxAgeMs?: number },
) {
  const maxAgeMs = options?.maxAgeMs ?? 14 * 24 * 60 * 60 * 1_000
  const restoredRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore once on mount (client-only).
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const env = JSON.parse(raw) as DraftEnvelope<T>
      if (env.version !== SCHEMA_VERSION) {
        localStorage.removeItem(key)
        return
      }
      if (Date.now() - env.savedAt > maxAgeMs) {
        localStorage.removeItem(key)
        return
      }
      restore(env.data)
    } catch {
      localStorage.removeItem(key)
    }
    // restore is intentionally not in deps — we only want to fire once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, maxAgeMs])

  // Debounced write on every formData change.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try {
        const env: DraftEnvelope<T> = {
          version: SCHEMA_VERSION,
          savedAt: Date.now(),
          data: formData,
        }
        localStorage.setItem(key, JSON.stringify(env))
      } catch {
        // QuotaExceeded / private mode: silently degrade. The draft is a
        // safety net, not a feature the user explicitly asked for.
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [key, formData])

  function clear() {
    if (typeof window === "undefined") return
    localStorage.removeItem(key)
  }

  return { clear }
}
