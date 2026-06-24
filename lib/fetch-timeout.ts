// Timeout for `fetch` that does NOT abort the request.
//
// Aborting/cancelling a fetch-returned ReadableStream while undici is still
// wiring up its internal Transform corrupts a process-wide web-streams pool,
// after which unrelated SSR renders crash with
// `controller[kState].transformAlgorithm is not a function` (see safe-fetch.ts).
// Reproduced in prod on Node 22.23.0 during crawl-heavy crons, where
// `AbortSignal.timeout` firing mid-wiring was the trigger.
//
// Instead of aborting on timeout, we race the fetch against a timer and, on
// timeout, ABANDON the fetch promise. The in-flight request finishes in the
// background and its (unread) body is GC'd on its own. Abandoning — unlike
// cancelling — does not hit the wiring race, so the stream pool stays intact.
// The cost is a few lingering sockets, far cheaper than losing the worker.

export class FetchTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FetchTimeoutError"
  }
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  label = "request",
): Promise<Response> {
  const fetchPromise = fetch(input, init)
  // The abandoned fetch may settle after the timeout wins; swallow a late
  // rejection so it doesn't surface as an unhandled rejection. The resolved
  // body, if any, is simply never read and gets GC'd.
  fetchPromise.catch(() => {})

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new FetchTimeoutError(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    )
    // Don't let the timer keep the event loop alive on its own.
    timer.unref?.()
  })

  try {
    return await Promise.race([fetchPromise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
