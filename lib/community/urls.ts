import { postTypes, type FeedQuery } from "./contracts"

type SearchValue = string | string[] | undefined
export type CommunitySearchParams = Record<string, SearchValue>

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Parse only the small, documented URL surface; the server validates again. */
export function parseCommunityFeedQuery(params: CommunitySearchParams): FeedQuery {
  const typeValue = first(params.type)?.toLowerCase()
  const type = postTypes.find((candidate) => candidate.toLowerCase() === typeValue) ?? "All"
  const viewValue = first(params.view)
  const view = viewValue === "mine" || viewValue === "saved" ? viewValue : "all"
  const sortValue = first(params.sort)
  return {
    view,
    type,
    // Hot is a shared public ranking snapshot. Personal views deliberately
    // stay in stable chronological order even when a handcrafted URL asks for
    // `sort=hot`.
    sort: view === "all" && sortValue === "hot" ? "Hot" : "Latest",
    search: (first(params.q) ?? "").slice(0, 200),
    cursor: first(params.cursor)?.slice(0, 1600),
  }
}

export function communityFeedHref(query: FeedQuery): string {
  const params = new URLSearchParams()
  if (query.type !== "All") params.set("type", query.type.toLowerCase())
  if (query.view !== "all") params.set("view", query.view)
  if (query.sort === "Hot" && query.view === "all") params.set("sort", "hot")
  if (query.search) params.set("q", query.search)
  if (query.cursor) params.set("cursor", query.cursor)
  const search = params.toString()
  return search ? `/community?${search}` : "/community"
}

export function communityPostHref(id: string): string {
  return `/community/t/${encodeURIComponent(id)}`
}
