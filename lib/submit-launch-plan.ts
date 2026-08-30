import { addDays } from "date-fns"

import { LAUNCH_SETTINGS, LAUNCH_TYPES } from "@/lib/constants"
import type { DirectoryTier } from "@/lib/directory-tiers"

export type SubmitLaunchType = (typeof LAUNCH_TYPES)[keyof typeof LAUNCH_TYPES]

interface LaunchSelection {
  launchType: SubmitLaunchType
  directoryTier: DirectoryTier | null
  scheduledDate: string | null
}

export function isFreeSubmitLaunch(type: SubmitLaunchType): boolean {
  return type === LAUNCH_TYPES.FREE || type === LAUNCH_TYPES.FREE_WITH_BADGE
}

export function getSubmitLaunchDateWindow(
  type: SubmitLaunchType,
  today: Date,
): { start: Date; end: Date } {
  if (type === LAUNCH_TYPES.PREMIUM) {
    return {
      start: addDays(today, LAUNCH_SETTINGS.PREMIUM_MIN_DAYS_AHEAD),
      end: addDays(today, LAUNCH_SETTINGS.PREMIUM_MAX_DAYS_AHEAD),
    }
  }
  if (type === LAUNCH_TYPES.FREE_WITH_BADGE) {
    return {
      start: addDays(today, LAUNCH_SETTINGS.BADGE_MIN_DAYS_AHEAD),
      end: addDays(today, LAUNCH_SETTINGS.MAX_DAYS_AHEAD),
    }
  }
  return {
    start: addDays(today, LAUNCH_SETTINGS.MIN_DAYS_AHEAD),
    end: addDays(today, LAUNCH_SETTINGS.MAX_DAYS_AHEAD),
  }
}

export function transitionSubmitLaunchType<T extends LaunchSelection>(
  selection: T,
  type: SubmitLaunchType,
): T {
  return {
    ...selection,
    launchType: type,
    directoryTier: type === LAUNCH_TYPES.PREMIUM ? selection.directoryTier : null,
    scheduledDate: null,
  }
}

export function checkoutTierForSubmitLaunch(
  type: SubmitLaunchType,
  selectedTier: DirectoryTier | null,
): DirectoryTier | null {
  return type === LAUNCH_TYPES.PREMIUM ? (selectedTier ?? "basic") : null
}
