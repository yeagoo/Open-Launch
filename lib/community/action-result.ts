import type { CommunityErrorCode } from "./contracts"

export type CommunityActionResult<T> =
  { ok: true; value: T } | { ok: false; error: { code: CommunityErrorCode; message: string } }

export function isCommunityActionSuccess<T>(
  result: CommunityActionResult<T>,
): result is { ok: true; value: T } {
  return result.ok
}
