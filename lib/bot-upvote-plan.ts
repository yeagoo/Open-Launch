/**
 * Bot upvote planning.
 *
 * Each ongoing project is assigned a *daily* vote target that stays stable
 * across every cron tick within the same launch window, then bot votes ramp
 * toward that target as the day progresses. Paid launches (premium /
 * premium_plus) are guaranteed a higher band so they visibly out-perform the
 * free queue.
 *
 * Everything here is pure and deterministic — the cron passes in the project
 * id, the launch window, and the current time, so behaviour is reproducible
 * and unit-testable (no Math.random / Date.now inside).
 */

export interface VoteTargetRange {
  min: number
  max: number
}

// Free queue: a wide band so the daily board looks organic instead of every
// project converging on the same number.
export const FREE_VOTE_RANGE: VoteTargetRange = { min: 50, max: 200 }

// Paid launches (premium / premium_plus): guaranteed high band.
export const PAID_VOTE_RANGE: VoteTargetRange = { min: 200, max: 250 }

// Launch types that count as "paid" for the guaranteed vote band.
const PAID_LAUNCH_TYPES = new Set(["premium", "premium_plus"])

export function isPaidLaunchType(launchType: string | null | undefined): boolean {
  return launchType != null && PAID_LAUNCH_TYPES.has(launchType)
}

// FNV-1a, 32-bit. Stable across runs and machines.
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// mulberry32 single step — maps a 32-bit seed to a uniform value in [0, 1).
export function seededUnit(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Deterministic daily vote target for a project. Same (projectId, window,
 * tier) always yields the same number, so the target doesn't jump between the
 * day's cron runs.
 */
export function dailyVoteTarget(
  projectId: string,
  launchWindowStartMs: number,
  isPaid: boolean,
): number {
  const range = isPaid ? PAID_VOTE_RANGE : FREE_VOTE_RANGE
  const u = seededUnit(hashSeed(`${projectId}:${launchWindowStartMs}:${isPaid ? "paid" : "free"}`))
  return range.min + Math.floor(u * (range.max - range.min + 1))
}

// The ramp reaches the full target at this fraction of the window, not at the
// very end. A project is only ONGOING during its own launch day, so once the
// window rolls over (08:00 UTC) it drops out of the cron's scope — the last
// effective tick of the `0 */2 * * *` schedule is 06:00, ~22/24 through the
// window. Completing the ramp earlier (by default 75% in, i.e. 02:00 UTC)
// guarantees several full-target ticks before the project ages out, so paid
// launches actually reach their 200-250 band instead of topping out ~92%.
export const RAMP_COMPLETE_FRACTION = 0.75

/**
 * How many votes a project *should* have accumulated by `nowMs`, ramping
 * linearly from 0 at the window start to the full target once `nowMs` reaches
 * `RAMP_COMPLETE_FRACTION` of the window, then holding at the target.
 * Clamped so ticks before/after the window stay in [0, target].
 */
export function votesDueByNow(
  target: number,
  launchWindowStartMs: number,
  launchWindowEndMs: number,
  nowMs: number,
  rampCompleteFraction: number = RAMP_COMPLETE_FRACTION,
): number {
  const span = launchWindowEndMs - launchWindowStartMs
  if (span <= 0) return target
  const elapsed = (nowMs - launchWindowStartMs) / span
  const fraction = Math.min(1, Math.max(0, elapsed / rampCompleteFraction))
  return Math.round(target * fraction)
}
