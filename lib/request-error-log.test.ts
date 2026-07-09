import { describe, expect, it } from "vitest"

import { buildNextRequestErrorLog, buildNodeRuntimeErrorLog } from "./request-error-log"

describe("request error log helpers", () => {
  it("redacts query values and keeps only diagnostic request headers", () => {
    const log = buildNextRequestErrorLog(
      Object.assign(new Error("controller[kState].transformAlgorithm is not a function"), {
        digest: "3379220355",
      }),
      {
        method: "GET",
        path: "/zh/skill/free-directory-submission?token=secret&q=test",
        headers: {
          "user-agent": "Googlebot\nbad",
          cookie: "session=secret",
          authorization: "Bearer secret",
          referer: "https://www.aat.ee/dashboard?apiKey=secret",
          "x-zeabur-request-id": "z-1",
          "cf-ray": "ray-1",
        },
      },
      {
        routerKind: "App Router",
        routePath: "/[locale]/skill/free-directory-submission",
        routeType: "render",
        renderSource: "server-rendering",
        revalidateReason: undefined,
      },
      new Date("2026-07-09T00:00:00Z"),
    )

    expect(log.request.path).toBe(
      "/zh/skill/free-directory-submission?token=[redacted]&q=[redacted]",
    )
    expect(log.request.userAgent).toBe("Googlebot bad")
    expect(log.request.referer).toBe("https://www.aat.ee/dashboard?apiKey=[redacted]")
    expect(log.request.zeaburRequestId).toBe("z-1")
    expect(JSON.stringify(log)).not.toContain("session=secret")
    expect(JSON.stringify(log)).not.toContain("Bearer secret")
    expect(log.error.digest).toBe("3379220355")
  })

  it("serializes runtime monitor errors without changing process behavior", () => {
    const log = buildNodeRuntimeErrorLog(
      new TypeError("controller[kState].transformAlgorithm is not a function"),
      "uncaughtException",
      new Date("2026-07-09T00:00:00Z"),
    )

    expect(log).toMatchObject({
      source: "node_runtime_error",
      origin: "uncaughtException",
      error: {
        name: "TypeError",
        message: "controller[kState].transformAlgorithm is not a function",
      },
    })
  })
})
