"use client"

import { useEffect } from "react"

import type { MetricWithAttribution } from "web-vitals"

import { pushBoundedMatomoCommand, type MatomoWindow } from "@/lib/analytics/matomo-queue"
import {
  buildWebVitalMatomoCommands,
  getWebVitalDeviceClass,
  getWebVitalRouteDimensions,
} from "@/lib/analytics/web-vitals"

export function WebVitalsReporter({ sampleRate }: { sampleRate: number }) {
  useEffect(() => {
    if (sampleRate <= 0 || Math.random() >= sampleRate) return

    let active = true
    const report = (metric: MetricWithAttribution) => {
      if (!active) return
      const navigationUrl = metric.navigationURL || window.location.href
      const route = getWebVitalRouteDimensions(navigationUrl)
      if (!route) return

      const commands = buildWebVitalMatomoCommands(
        metric,
        {
          ...route,
          deviceClass: getWebVitalDeviceClass(window.innerWidth),
        },
        window.location.href,
      )
      for (const command of commands) {
        pushBoundedMatomoCommand(window as MatomoWindow, command)
      }
    }

    void import("web-vitals/attribution")
      .then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
        if (!active) return
        const options = { generateTarget: () => "[omitted]" }
        onCLS(report, options)
        onFCP(report, options)
        onINP(report, options)
        onLCP(report, options)
        onTTFB(report, options)
      })
      .catch(() => {
        // Analytics is optional. A blocked/failed late chunk must not create
        // an unhandled rejection or affect the page experience.
      })

    return () => {
      active = false
    }
  }, [sampleRate])

  return null
}
