"use client"

import { useEffect, useRef, useState } from "react"

import { useTranslations } from "next-intl"

import { checkUserLaunchLimit } from "@/app/actions/launch"

interface UseLaunchDateLimitInput {
  date: string | null
  enabled: boolean
  userId: string
}

export function useLaunchDateLimit({ date, enabled, userId }: UseLaunchDateLimitInput) {
  const t = useTranslations("submitProject")
  const requestId = useRef(0)
  const [isOverLimit, setIsOverLimit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const currentRequest = ++requestId.current
    if (!date || !enabled || !userId) {
      queueMicrotask(() => {
        if (requestId.current !== currentRequest) return
        setIsOverLimit(false)
        setError(null)
        setIsLoading(false)
      })
      return
    }

    queueMicrotask(async () => {
      if (requestId.current !== currentRequest) return
      setIsLoading(true)
      setError(null)
      try {
        const result = await checkUserLaunchLimit(date)
        if (requestId.current !== currentRequest) return
        if (!result.allowed) {
          setIsOverLimit(true)
          setError(
            t("errors.fields.scheduledDateOverLimitDetail", {
              count: result.count,
              limit: result.limit,
            }),
          )
        } else {
          setIsOverLimit(false)
        }
      } catch (caught) {
        if (requestId.current !== currentRequest) return
        console.error("Error checking launch date limit:", caught)
        setIsOverLimit(false)
        setError(t("errors.fields.scheduledDateCheckFailed"))
      } finally {
        if (requestId.current === currentRequest) setIsLoading(false)
      }
    })
  }, [date, enabled, t, userId])

  function clearError() {
    setError(null)
  }

  return { isOverLimit, error, isLoading, clearError }
}
