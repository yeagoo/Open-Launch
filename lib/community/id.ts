/**
 * Shared identifier format for Community records. Keep this lightweight so the
 * Proxy can reject unusable thread paths before an App Router response streams.
 */
export const communityIdPattern =
  /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i

export function isCommunityId(value: string): boolean {
  return communityIdPattern.test(value)
}
