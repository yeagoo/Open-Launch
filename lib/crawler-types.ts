export interface CrawlResult {
  url: string
  markdown: string
  title?: string
  crawledAt: Date
}

export class CrawlError extends Error {
  constructor(
    public url: string,
    message: string,
  ) {
    super(`CrawlError [${url}]: ${message}`)
    this.name = "CrawlError"
  }
}

export interface CrawlOptions {
  timeout?: number
}
