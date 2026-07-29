import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { sendAdminOperationalAlert } from "./transactional-emails"

const sendEmailMock = vi.hoisted(() => vi.fn())
const sendDiscordAlertMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}))

vi.mock("@/lib/discord-notification", () => ({
  sendDiscordAlert: sendDiscordAlertMock,
}))

const originalEnv = { ...process.env }

beforeEach(() => {
  sendEmailMock.mockReset()
  sendDiscordAlertMock.mockReset()
  process.env = {
    ...originalEnv,
    ADMIN_EMAIL: "ops@example.com",
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...originalEnv }
})

describe("sendAdminOperationalAlert", () => {
  it("uses an operations-specific subject and safely renders alert details", async () => {
    sendEmailMock.mockResolvedValueOnce({ success: true, data: { id: "email_123" } })

    await sendAdminOperationalAlert({
      monitor: "cron-health",
      title: "CRON HEALTH alert: 1 stale task(s)",
      details: "Import Product Hunt\n<script>alert('x')</script>",
    })

    expect(sendEmailMock).toHaveBeenCalledOnce()
    const payload = sendEmailMock.mock.calls[0][0]
    expect(payload.to).toBe("ops@example.com")
    expect(payload.subject).toBe("⚠️ CRON HEALTH alert: 1 stale task(s)")
    expect(payload.html).toContain("Open Launch operational alert")
    expect(payload.html).toContain("Monitor: cron-health")
    expect(payload.html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;")
    expect(payload.html).not.toContain("Orphan Payment")
    expect(payload.html).not.toContain("Stripe charged the buyer")
    expect(payload.html).not.toContain("Amount: 0")
  })

  it("falls back to Discord when the email channel fails", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("resend unavailable"))
    sendDiscordAlertMock.mockResolvedValueOnce(true)
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const result = await sendAdminOperationalAlert({
      monitor: "webhook-health",
      title: "WEBHOOK HEALTH alert: 2 unprocessed events",
      details: "Check event deliveries.",
    })

    expect(sendDiscordAlertMock).toHaveBeenCalledWith(
      "⚠️ WEBHOOK HEALTH alert: 2 unprocessed events",
      expect.stringContaining("Monitor: webhook-health"),
    )
    expect(result).toEqual({ success: false, data: null })
  })

  it("propagates the email failure when both admin channels fail", async () => {
    const emailError = new Error("resend unavailable")
    sendEmailMock.mockRejectedValueOnce(emailError)
    sendDiscordAlertMock.mockResolvedValueOnce(false)
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      sendAdminOperationalAlert({
        monitor: "cron-health",
        title: "CRON HEALTH alert: dispatcher down",
        details: "No recent runs.",
      }),
    ).rejects.toBe(emailError)
  })

  it("describes non-Error email failures in the Discord fallback", async () => {
    sendEmailMock.mockRejectedValueOnce("provider unavailable")
    sendDiscordAlertMock.mockResolvedValueOnce(true)
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await sendAdminOperationalAlert({
      monitor: "cron-health",
      title: "CRON HEALTH alert: dispatcher down",
      details: "No recent runs.",
    })

    expect(sendDiscordAlertMock).toHaveBeenCalledWith(
      "⚠️ CRON HEALTH alert: dispatcher down",
      expect.stringContaining("email channel down — provider unavailable"),
    )
  })
})
