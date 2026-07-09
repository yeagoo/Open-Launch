import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { sendEmail } from "./email"

const fetchWithTimeoutMock = vi.hoisted(() => vi.fn())
const withTimeoutMock = vi.hoisted(() => vi.fn((promise: Promise<unknown>) => promise))

vi.mock("@/lib/fetch-timeout", () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
  withTimeout: withTimeoutMock,
}))

const originalEnv = { ...process.env }

beforeEach(() => {
  fetchWithTimeoutMock.mockReset()
  withTimeoutMock.mockClear()
  process.env = {
    ...originalEnv,
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "AAT <noreply@aat.ee>",
    RESEND_REPLY_TO: "contact@aat.ee",
  }
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe("sendEmail", () => {
  it("sends email through the Resend REST API without the Resend SDK", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(resendResponse(200, { id: "email_123" }))

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Welcome\r\nBcc: attacker@example.com",
      html: "<p>Hello</p>",
    })

    expect(result).toEqual({ success: true, data: { id: "email_123" } })
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test",
          "Content-Type": "application/json",
          "User-Agent": "aat.ee/1.0",
        }),
        redirect: "error",
      }),
      10_000,
      "Resend email API",
    )

    const requestBody = JSON.parse(fetchWithTimeoutMock.mock.calls[0][1].body)
    expect(requestBody).toEqual({
      from: "AAT <noreply@aat.ee>",
      to: "user@example.com",
      subject: "Welcome Bcc: attacker@example.com",
      html: "<p>Hello</p>",
      reply_to: "contact@aat.ee",
    })
  })

  it("lets an explicit replyTo override the environment default", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(resendResponse(200, { id: "email_123" }))

    await sendEmail({
      to: "user@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      replyTo: "support@example.com",
    })

    const requestBody = JSON.parse(fetchWithTimeoutMock.mock.calls[0][1].body)
    expect(requestBody.reply_to).toBe("support@example.com")
  })

  it("throws on Resend API errors", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(
      resendResponse(403, { name: "invalid_from_address", message: "Invalid from address" }),
    )

    await expect(
      sendEmail({
        to: "user@example.com",
        subject: "Subject",
        html: "<p>Hello</p>",
      }),
    ).rejects.toThrow("Resend API error: Invalid from address")
  })

  it("throws when Resend returns an invalid success body", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(resendResponse(200, { ok: true }))

    await expect(
      sendEmail({
        to: "user@example.com",
        subject: "Subject",
        html: "<p>Hello</p>",
      }),
    ).rejects.toThrow("Resend API error: invalid success response")
  })

  it("throws when RESEND_API_KEY is not configured", async () => {
    delete process.env.RESEND_API_KEY

    await expect(
      sendEmail({
        to: "user@example.com",
        subject: "Subject",
        html: "<p>Hello</p>",
      }),
    ).rejects.toThrow("Missing RESEND_API_KEY")
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
  })
})

function resendResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    text: vi.fn(async () => JSON.stringify(body)),
  }
}
