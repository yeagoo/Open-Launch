export interface SearchResult {
  id: string
  name: string
  slug: string | null
  description: string | null
  logoUrl: string | null
  type: "project" | "category" | "tag"
}

export interface SearchResponse {
  results: SearchResult[]
  totalCount: number
}
