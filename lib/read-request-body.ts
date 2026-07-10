export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`)
    this.name = "RequestBodyTooLargeError"
  }
}

/** Read a Web Request body while enforcing a hard byte limit for chunked bodies. */
export async function readRequestTextBounded(request: Request, maxBytes: number): Promise<string> {
  const declared = request.headers.get("content-length")
  if (declared !== null) {
    const declaredBytes = Number(declared)
    if (!Number.isFinite(declaredBytes) || declaredBytes < 0) {
      throw new Error("Invalid Content-Length")
    }
    if (declaredBytes > maxBytes) throw new RequestBodyTooLargeError(maxBytes)
  }

  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel("request body too large").catch(() => undefined)
        throw new RequestBodyTooLargeError(maxBytes)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body)
}

export async function readRequestJsonBounded(request: Request, maxBytes: number): Promise<unknown> {
  const text = await readRequestTextBounded(request, maxBytes)
  return text ? JSON.parse(text) : null
}
