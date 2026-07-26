const MAX_PROFILE_IMAGE_URL_LENGTH = 2048

export function isSafeProfileImageUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true
  if (typeof value !== "string" || value.length > MAX_PROFILE_IMAGE_URL_LENGTH) return false

  try {
    const url = new URL(value)
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
  } catch {
    return false
  }
}
