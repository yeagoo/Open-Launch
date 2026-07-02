import { describe, expect, it, vi } from "vitest"

import { SKILL_PUBLICATION_SITE_COUNT, type SkillPublicationScheduleRow } from "./skill-sites"
import {
  SKILL_DOMAIN_PENDING_LOCK_TTL_SECONDS,
  SkillMonthlyQuotaExceededError,
  submitSkillSubmission,
  type SkillSubmitDependencies,
  type SkillSubmitInput,
} from "./skill-submit"

const ACCOUNT_ID = "user-1"
const NOW = new Date("2026-07-01T12:00:00Z")

const schedule: SkillPublicationScheduleRow[] = Array.from(
  { length: SKILL_PUBLICATION_SITE_COUNT },
  (_, index) => ({
    site: `site-${index + 1}`,
    name: `Site ${index + 1}`,
    domain: `site-${index + 1}.example.com`,
    dr: index,
    batchDay: index < 2 ? 1 : 2 + Math.floor((index - 2) / 3),
    scheduledFor: "2026-07-01",
  }),
)

const VALID_BODIES = [
  "A workflow analytics command center for SaaS teams that need funnel visibility and weekly investor metrics.",
  "A cohort reporting product that helps founders explain retention, activation, and revenue movement without spreadsheet cleanup.",
  "A lightweight alerting layer that watches acquisition channels and notifies operators before conversion drops become expensive.",
  "A dashboard builder for product-led companies that want clean board updates from live usage and billing data.",
  "A metrics workspace for indie software teams comparing experiments, funnels, and onboarding quality across customer segments.",
  "A revenue operations view that connects subscription movement with product usage so teams can find expansion signals quickly.",
  "A founder-friendly analytics suite focused on launch traction, first-week activation, and the evidence investors ask for.",
  "A reporting hub for customer success teams that need to spot churn risk from behavior changes instead of manual account notes.",
  "A product intelligence layer that turns raw event streams into plain-language growth signals for small SaaS teams.",
  "A launch-monitoring cockpit that combines traffic sources, signup quality, and early retention into one operational view.",
  "A compact business intelligence tool for bootstrapped founders tracking experiments, pricing changes, and conversion paths.",
  "A metrics assistant that summarizes funnel health, cohort anomalies, and growth opportunities from connected product data.",
  "A data room companion that keeps acquisition, retention, and revenue charts ready for investor conversations.",
  "A product analytics product that emphasizes clean weekly decisions for small teams rather than heavyweight enterprise BI.",
]

function input(overrides: Partial<SkillSubmitInput> = {}): SkillSubmitInput {
  return {
    domain: "example.com",
    websiteUrl: "https://example.com",
    tosAccepted: true,
    locale: "en",
    variants: schedule.map((row, index) => ({
      site: row.site,
      title: `Acme Metrics ${index + 1}`,
      tagline: `Analytics for team ${index + 1}`,
      bodyMd: VALID_BODIES[index],
      lang: "en",
    })),
    ...overrides,
  }
}

function deps(overrides: Partial<SkillSubmitDependencies> = {}) {
  const calls = {
    quota: vi.fn(async () => ({
      success: true as const,
      remaining: 2,
      reset: 60,
      token: "quota-token",
    })),
    quotaRelease: vi.fn(async () => undefined),
    reserve: vi.fn(async () => true),
    release: vi.fn(async () => undefined),
    review: vi.fn(async () => ({ score: 85, reasons: ["Clear product"] })),
    persist: vi.fn(async ({ status }) => ({ id: "sub-1", status })),
  }

  const fakeDeps: SkillSubmitDependencies = {
    now: () => NOW,
    targetSites: () => schedule,
    findVerifiedDomain: vi.fn(async () => true),
    findExistingSubmission: vi.fn(async () => null),
    checkQuota: calls.quota,
    releaseQuotaReservation: calls.quotaRelease,
    reserveDomain: calls.reserve,
    releaseDomainReservation: calls.release,
    review: calls.review,
    persist: calls.persist,
    ...overrides,
  }

  return { deps: fakeDeps, calls }
}

describe("submitSkillSubmission", () => {
  it("uses a short pending domain lock; the database unique index is the permanent dedupe", () => {
    expect(SKILL_DOMAIN_PENDING_LOCK_TTL_SECONDS).toBe(15 * 60)
  })

  it("rejects when the domain reservation is already held without consuming quota", async () => {
    const { deps: fakeDeps, calls } = deps({
      reserveDomain: vi.fn(async () => false),
    })

    const result = await submitSkillSubmission(ACCOUNT_ID, input(), fakeDeps)

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 409,
      code: "domain_already_submitted",
    })
    expect(calls.quota).not.toHaveBeenCalled()
    expect(calls.review).not.toHaveBeenCalled()
  })

  it("rejects the 4th monthly submission and releases the domain reservation", async () => {
    const { deps: fakeDeps, calls } = deps({
      checkQuota: vi.fn(async () => ({ success: false as const, remaining: 0, reset: 123 })),
    })

    const result = await submitSkillSubmission(ACCOUNT_ID, input(), fakeDeps)

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 429,
      code: "monthly_quota_exceeded",
      reset: 123,
    })
    expect(calls.reserve).toHaveBeenCalledTimes(1)
    expect(calls.release).toHaveBeenCalledTimes(1)
    expect(calls.quotaRelease).not.toHaveBeenCalled()
    expect(calls.review).not.toHaveBeenCalled()
  })

  it("blocks a domain that already has a submission record", async () => {
    const { deps: fakeDeps, calls } = deps({
      findExistingSubmission: vi.fn(async () => ({ id: "existing", status: "publishing" })),
    })

    const result = await submitSkillSubmission(ACCOUNT_ID, input(), fakeDeps)

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 409,
      code: "domain_already_submitted",
    })
    expect(calls.quota).not.toHaveBeenCalled()
    expect(calls.reserve).not.toHaveBeenCalled()
  })

  it("rejects near-identical variants before quota or AI review", async () => {
    const duplicateInput = input({
      variants: schedule.map((row, index) => ({
        site: row.site,
        title: `Acme Metrics ${index + 1}`,
        tagline: "Analytics for SaaS founders",
        bodyMd:
          "Acme Metrics is an analytics workspace for SaaS founders. It unifies funnels, cohorts, alerts, and investor-ready reporting in one dashboard.",
        lang: "en",
      })),
    })
    const { deps: fakeDeps, calls } = deps()

    const result = await submitSkillSubmission(ACCOUNT_ID, duplicateInput, fakeDeps)

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 422,
      code: "similarity_rejected",
    })
    expect(calls.quota).not.toHaveBeenCalled()
    expect(calls.review).not.toHaveBeenCalled()
    expect(calls.persist).not.toHaveBeenCalled()
  })

  it("stores a rejected submission for high-risk AI verdicts without variants", async () => {
    const { deps: fakeDeps, calls } = deps({
      review: vi.fn(async () => ({ score: 10, reasons: ["Scam pattern"] })),
    })

    const result = await submitSkillSubmission(ACCOUNT_ID, input(), fakeDeps)

    expect(result).toMatchObject({
      ok: true,
      uuid: "sub-1",
      status: "rejected",
      reviewScore: 10,
    })
    expect(calls.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "rejected",
        variants: [],
      }),
    )
  })

  it("does not persist when automated review is temporarily unavailable", async () => {
    const { deps: fakeDeps, calls } = deps({
      review: vi.fn(async () => {
        throw new Error("DeepSeek timeout")
      }),
    })

    const result = await submitSkillSubmission(ACCOUNT_ID, input(), fakeDeps)

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 503,
      code: "review_unavailable",
    })
    expect(calls.release).toHaveBeenCalledTimes(1)
    expect(calls.quotaRelease).toHaveBeenCalledWith(ACCOUNT_ID, "quota-token")
    expect(calls.persist).not.toHaveBeenCalled()
  })

  it("returns a domain dedupe conflict when the database unique index wins a race", async () => {
    const uniqueViolation = Object.assign(new Error("duplicate key value"), { code: "23505" })
    const { deps: fakeDeps, calls } = deps({
      persist: vi.fn(async () => {
        throw uniqueViolation
      }),
    })

    const result = await submitSkillSubmission(ACCOUNT_ID, input(), fakeDeps)

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 409,
      code: "domain_already_submitted",
    })
    expect(calls.release).not.toHaveBeenCalled()
    expect(calls.quotaRelease).toHaveBeenCalledWith(ACCOUNT_ID, "quota-token")
  })

  it("returns quota exceeded when the transactional quota check wins a race", async () => {
    const { deps: fakeDeps, calls } = deps({
      persist: vi.fn(async () => {
        throw new SkillMonthlyQuotaExceededError(456)
      }),
    })

    const result = await submitSkillSubmission(ACCOUNT_ID, input(), fakeDeps)

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 429,
      code: "monthly_quota_exceeded",
      reset: 456,
    })
    expect(calls.release).toHaveBeenCalledTimes(1)
    expect(calls.quotaRelease).toHaveBeenCalledWith(ACCOUNT_ID, "quota-token")
  })

  it("persists publishing submissions with ordered variants and schedule", async () => {
    const shuffled = input({
      variants: [...input().variants].reverse(),
    })
    const { deps: fakeDeps, calls } = deps()

    const result = await submitSkillSubmission(ACCOUNT_ID, shuffled, fakeDeps)

    expect(result).toMatchObject({
      ok: true,
      uuid: "sub-1",
      status: "publishing",
      reviewScore: 85,
    })
    expect(calls.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "publishing",
        variants: expect.arrayContaining([expect.objectContaining({ site: "site-1" })]),
        schedule,
      }),
    )
    const persisted = calls.persist.mock.calls[0][0] as Parameters<
      SkillSubmitDependencies["persist"]
    >[0]
    expect(persisted.variants.map((variant) => variant.site)).toEqual(
      schedule.map((row) => row.site),
    )
    expect(calls.quotaRelease).toHaveBeenCalledWith(ACCOUNT_ID, "quota-token")
  })
})
