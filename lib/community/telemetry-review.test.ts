import { describe, expect, it } from "vitest"

import {
  COMMUNITY_TELEMETRY_MAX_NON_EMPTY_LINES,
  evaluateCommunityTelemetryBudget,
  parseCommunityTelemetryArguments,
  parseCommunityTelemetryNdjson,
  summarizeCommunityTelemetry,
} from "./telemetry-review"

function record(fields: Record<string, unknown>): string {
  return JSON.stringify(fields)
}

describe("community telemetry export parser", () => {
  it("keeps only the fixed Community telemetry contract and returns aggregates", () => {
    const parsed = parseCommunityTelemetryNdjson(
      [
        record({
          timestamp: "2026-09-15T01:00:00.000Z",
          level: "info",
          event: "unrelated_event",
        }),
        record({
          timestamp: "2026-09-15T01:00:02.000Z",
          level: "warn",
          event: "community_operation_slow",
          request_id: "trace-1",
          route: "/community",
          status: "completed",
          duration_ms: 1_200,
          provider: "community",
          context: {
            operation: "feed-page",
            mode: "read",
            access: "standard",
            outcome: "completed",
          },
        }),
        record({
          timestamp: "2026-09-15T01:00:04.000Z",
          level: "error",
          event: "community_service_error",
          route: "/community",
          status: "failed",
          duration_ms: 33,
          provider: "community",
          context: {
            operation: "publish",
            mode: "write",
            access: "moderator",
            outcome: "failed",
          },
          error: { message: "not inspected by the parser" },
        }),
      ].join("\n"),
    )

    expect(parsed).toMatchObject({ nonEmptyLineCount: 3, ignoredRecordCount: 1 })
    expect(summarizeCommunityTelemetry(parsed)).toEqual({
      nonEmptyLineCount: 3,
      ignoredRecordCount: 1,
      communityEventCount: 2,
      firstEventAt: "2026-09-15T01:00:02.000Z",
      lastEventAt: "2026-09-15T01:00:04.000Z",
      slowEventCount: 1,
      errorEventCount: 1,
      missingRequestIdEventCount: 1,
      slowDuration: { minMs: 1200, medianMs: 1200, p95Ms: 1200, maxMs: 1200 },
      operations: [
        { operation: "feed-page", slowEventCount: 1, errorEventCount: 0 },
        { operation: "publish", slowEventCount: 0, errorEventCount: 1 },
      ],
    })
  })

  it("rejects malformed records and never includes the offending log value in its error", () => {
    const privateValue = "private search term must not reach terminal output"
    const source = record({
      timestamp: "2026-09-15T01:00:00.000Z",
      level: "warn",
      event: "community_operation_slow",
      request_id: "trace-1",
      route: "/community",
      status: "completed",
      duration_ms: 1_000,
      provider: "community",
      context: {
        operation: "feed-page",
        mode: "read",
        access: "standard",
        outcome: "completed",
        privateValue,
      },
    })

    try {
      parseCommunityTelemetryNdjson(source)
      throw new Error("expected parser to reject expanded context")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain("invalid context fields on line 1")
      expect((error as Error).message).not.toContain(privateValue)
    }
  })

  it("requires an integer duration at or above the current slow-operation threshold", () => {
    const source = record({
      timestamp: "2026-09-15T01:00:00.000Z",
      level: "warn",
      event: "community_operation_slow",
      route: "/community",
      status: "completed",
      duration_ms: 999,
      provider: "community",
      context: {
        operation: "feed-page",
        mode: "read",
        access: "standard",
        outcome: "completed",
      },
    })
    expect(() => parseCommunityTelemetryNdjson(source)).toThrow("invalid duration on line 1")
  })

  it.each([
    ["timestamp", "2026-09-15T01:00:00Z", "invalid timestamp"],
    ["level", "info", "invalid level"],
    ["route", "/community/private", "invalid route"],
    ["provider", "other", "invalid provider"],
    ["request_id", "unsafe\nrequest-id", "invalid request ID"],
  ])("rejects an unexpected %s", (field, value, message) => {
    const source = record({
      timestamp: "2026-09-15T01:00:00.000Z",
      level: "warn",
      event: "community_operation_slow",
      request_id: "trace-1",
      route: "/community",
      status: "completed",
      duration_ms: 1_000,
      provider: "community",
      context: {
        operation: "feed-page",
        mode: "read",
        access: "standard",
        outcome: "completed",
      },
      [field]: value,
    })
    expect(() => parseCommunityTelemetryNdjson(source)).toThrow(`${message} on line 1`)
  })

  it("bounds the number of non-empty records before reviewing an export", () => {
    const source = Array.from(
      { length: COMMUNITY_TELEMETRY_MAX_NON_EMPTY_LINES + 1 },
      () => '{"event":"unrelated_event"}',
    ).join("\n")
    expect(() => parseCommunityTelemetryNdjson(source)).toThrow(
      "at most 100000 non-empty JSON lines",
    )
  })
})

describe("community telemetry review budgets", () => {
  const parsed = parseCommunityTelemetryNdjson(
    [1_000, 1_400, 2_000]
      .map((durationMs, index) =>
        record({
          timestamp: `2026-09-15T01:00:0${index}.000Z`,
          level: "warn",
          event: "community_operation_slow",
          request_id: `trace-${index}`,
          route: "/community",
          status: "completed",
          duration_ms: durationMs,
          provider: "community",
          context: {
            operation: "feed-page",
            mode: "read",
            access: "standard",
            outcome: "completed",
          },
        }),
      )
      .join("\n"),
  )
  const report = summarizeCommunityTelemetry(parsed)

  it("observes without inventing thresholds and applies only explicit limits", () => {
    expect(evaluateCommunityTelemetryBudget({ inputPath: "export.ndjson" }, report)).toEqual({
      passed: true,
      violations: [],
    })
    expect(
      evaluateCommunityTelemetryBudget(
        { inputPath: "export.ndjson", maxSlowEvents: 2, maxP95SlowDurationMs: 1_500 },
        report,
      ),
    ).toEqual({
      passed: false,
      violations: ["slow event count 3 exceeds 2", "slow-operation p95 2000 ms exceeds 1500 ms"],
    })
    expect(
      evaluateCommunityTelemetryBudget(
        { inputPath: "export.ndjson", maxErrorEvents: 0, maxMissingRequestIdEvents: 0 },
        { ...report, errorEventCount: 1, missingRequestIdEventCount: 2 },
      ),
    ).toEqual({
      passed: false,
      violations: ["error event count 1 exceeds 0", "events without request ID 2 exceeds 0"],
    })
  })
})

describe("community telemetry arguments", () => {
  it("accepts a local input and explicitly supplied aggregate limits", () => {
    expect(
      parseCommunityTelemetryArguments([
        "--input",
        "community.ndjson",
        "--max-slow-events",
        "4",
        "--max-error-events",
        "0",
        "--max-missing-request-id-events",
        "1",
        "--max-p95-slow-duration-ms",
        "1800",
      ]),
    ).toEqual({
      inputPath: "community.ndjson",
      maxSlowEvents: 4,
      maxErrorEvents: 0,
      maxMissingRequestIdEvents: 1,
      maxP95SlowDurationMs: 1800,
    })
  })

  it.each([
    [[], "--input is required"],
    [["--input", "export.ndjson", "--max-error-events", "-1"], "must be an integer"],
    [["--input", "export.ndjson", "--input", "second.ndjson"], "Duplicate argument"],
    [["--input", "export.ndjson", "--unknown", "1"], "Unknown argument"],
  ])("rejects invalid arguments", (argv, message) => {
    expect(() => parseCommunityTelemetryArguments(argv)).toThrow(message)
  })
})
