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

export class CrawlSuspendedError extends CrawlError {
  constructor(url: string, suspendedUntil: Date) {
    super(url, `Project crawl suspended until ${suspendedUntil.toISOString()}`)
    this.name = "CrawlSuspendedError"
  }
}

export interface CrawlOptions {
  timeout?: number
}
