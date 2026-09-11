import manifest from "./logo-wall-quality.json"

/**
 * Measured quality of a logo, as written by `bun run logos:audit`.
 *
 * The data lives in JSON rather than in the database because `project` stores
 * only `logo_url` — there is no column for "does this mark float", and adding
 * one would mean a migration plus a backfill for a property of a decorative
 * wall. A generated file keeps it reviewable and regenerable instead.
 */
export interface LogoQuality {
  width: number
  height: number
  ratio: number
  hasAlpha: boolean
  /** Fraction of pixels that are fully transparent. */
  transparentShare: number
  /** All four corners transparent: a floating mark rather than a filled tile. */
  floating: boolean
  /** 0-100. Higher makes a better wall tile. */
  score: number
}

const byUrl: Record<string, LogoQuality> = manifest

/**
 * True when the logo is a floating mark. An unrated URL returns false, so a new
 * upload has to be audited before it displaces anything on the wall.
 */
export function isFloatingLogo(url: string | null | undefined): boolean {
  return Boolean(url) && byUrl[url as string]?.floating === true
}

/** 0 for unrated logos, which therefore sort last. */
export function logoWallScore(url: string | null | undefined): number {
  return (url ? byUrl[url]?.score : 0) ?? 0
}
