"use client"

import { useEffect, useRef, useState } from "react"

import { SearchResult } from "@/app/api/search/route"

interface UseSearchOptions {
  debounceMs?: number
  minLength?: number
}

interface UseSearchResult {
  query: string
  setQuery: (query: string) => void
  results: SearchResult[]
  totalCount: number
  isLoading: boolean
  error: string | null
}

// Interface pour la validation des résultats
interface ResultValidation {
  id: string
  name: string
  type: string
  [key: string]: unknown
}

// Interface pour les erreurs API
interface ApiError {
  error: string
  message: string
  reset?: number
}

export function useSearch({
  debounceMs = 300,
  minLength = 2,
}: UseSearchOptions = {}): UseSearchResult {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Référence pour le timeout de debounce
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  // AbortController for the in-flight request: a slow earlier response must
  // never overwrite the results of a newer query (the previous version had
  // no cancellation, so stale responses raced and won).
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    // Any new query invalidates the previous in-flight request.
    abortRef.current?.abort()
    abortRef.current = null

    // Réinitialiser les résultats si la requête est trop courte
    if (!query || query.length < minLength) {
      const resetTimer = setTimeout(() => {
        setResults([])
        setTotalCount(0)
        setIsLoading(false)
        setError(null)
      }, 0)
      return () => clearTimeout(resetTimer)
    }

    timeoutRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      setIsLoading(true)
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })

        const data = await response.json()

        if (!response.ok) {
          const apiError = data as ApiError

          if (response.status === 429) {
            setError(apiError.message || `Too many requests. Please wait before trying again.`)
          } else {
            throw new Error(apiError.message || `Search request failed (${response.status})`)
          }

          setResults([])
          setTotalCount(0)
          return
        }

        if (data && data.results && Array.isArray(data.results)) {
          const validResults = data.results.filter(
            (result: ResultValidation) =>
              result &&
              typeof result === "object" &&
              "id" in result &&
              "name" in result &&
              "type" in result,
          )
          setResults(validResults as SearchResult[])
          setTotalCount(typeof data.totalCount === "number" ? data.totalCount : validResults.length)
          setError(null)
        } else {
          setResults([])
          setTotalCount(0)
        }
      } catch (err) {
        // Aborted because a newer query superseded this one — not an error.
        if (err instanceof DOMException && err.name === "AbortError") return
        console.error("[useSearch] Search error:", err)
        setError(
          err instanceof Error
            ? err.message
            : "An error occurred while searching. Please try again later.",
        )
        setResults([])
        setTotalCount(0)
      } finally {
        // Only the latest request may clear the loading flag; an aborted
        // earlier request must not flip it while its successor is running.
        if (abortRef.current === controller) {
          setIsLoading(false)
          abortRef.current = null
        }
      }
    }, debounceMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      // Unmount (or next effect run) aborts anything still in flight.
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [query, debounceMs, minLength])

  return {
    query,
    setQuery,
    results,
    totalCount,
    isLoading,
    error,
  }
}
