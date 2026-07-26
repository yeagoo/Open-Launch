export function clampInteger(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export function clampPage(value: number, fallback = 1): number {
  return clampInteger(value, fallback, 1, 10_000)
}
