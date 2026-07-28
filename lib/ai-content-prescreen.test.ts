import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { prescreenAlternatives } from "@/lib/ai-content"

const mocks = vi.hoisted(() => ({
  assertAiAvailable: vi.fn(),
  fetchWithTimeout: vi.fn(),
  logAiUsage: vi.fn(),
  noteAiResponse: vi.fn(),
}))

vi.mock("@/lib/ai-circuit", () => ({
  assertAiAvailable: mocks.assertAiAvailable,
  noteAiResponse: mocks.noteAiResponse,
}))

vi.mock("@/lib/ai-usage", () => ({
  logAiUsage: mocks.logAiUsage,
}))

vi.mock("@/lib/fetch-timeout", () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}))

const subject = {
  name: "Subject",
  description: "<p>Subject description</p>",
  techStack: ["TypeScript"],
}

const candidates = [
  {
    id: "candidate-1",
    name: "Candidate One",
    description: "<p>First candidate</p>",
    techStack: ["React"],
  },
  {
    id: "candidate-2",
    name: "Candidate Two",
    description: "<p>Second candidate</p>",
    techStack: ["Vue"],
  },
]

function deepSeekResponse(content: string | null) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  )
}

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key"
  process.env.DEEPSEEK_MODEL = "deepseek-v4-flash"
  mocks.fetchWithTimeout.mockReset()
  mocks.logAiUsage.mockReset().mockResolvedValue(undefined)
  mocks.assertAiAvailable.mockReset()
  mocks.noteAiResponse.mockReset()
})

afterEach(() => {
  delete process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_MODEL
})

describe("prescreenAlternatives", () => {
  it("treats an explicit empty array as a definitive no-match result", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(deepSeekResponse("[]"))

    await expect(prescreenAlternatives(subject, candidates)).resolves.toEqual([])

    const request = mocks.fetchWithTimeout.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "deepseek-v4-flash",
      thinking: { type: "disabled" },
      max_tokens: 200,
    })
  })

  it("returns known candidate IDs in provider order", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(deepSeekResponse('["candidate-2", "candidate-1"]'))

    await expect(prescreenAlternatives(subject, candidates)).resolves.toEqual([
      "candidate-2",
      "candidate-1",
    ])
  })

  it("throws on an empty provider response so the cron can retry", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(deepSeekResponse(""))

    await expect(prescreenAlternatives(subject, candidates)).rejects.toThrow(
      "No content generated from DeepSeek API",
    )
  })

  it("throws on a wrong-shape provider response instead of treating it as no matches", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(deepSeekResponse('{"ids":["candidate-1"]}'))

    await expect(prescreenAlternatives(subject, candidates)).rejects.toThrow(
      "Invalid alternatives pre-screen response: expected an array",
    )
  })

  it("throws on unknown candidate IDs instead of collapsing them to an empty result", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(deepSeekResponse('["unknown"]'))

    await expect(prescreenAlternatives(subject, candidates)).rejects.toThrow(
      "Invalid alternatives pre-screen response: returned unknown candidate IDs",
    )
  })
})
