import { describe, expect, it } from "vitest"

import { checkSkillVariantSimilarity, SKILL_SIMILARITY_THRESHOLD } from "./skill-similarity"

describe("checkSkillVariantSimilarity", () => {
  it("rejects near-identical variant bodies", () => {
    const variants = Array.from({ length: 14 }, (_, index) => ({
      site: `site-${index + 1}`,
      bodyMd:
        "Acme Metrics is an analytics workspace for SaaS founders. It unifies funnels, cohorts, alerts, and investor-ready reporting in one dashboard.",
    }))

    const result = checkSkillVariantSimilarity(variants)

    expect(result.ok).toBe(false)
    expect(result.violation).toMatchObject({
      leftSite: "site-1",
      rightSite: "site-2",
      similarity: 1,
    })
  })

  it("allows differentiated copy below the lenient threshold", () => {
    const variants = [
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
    ].map((bodyMd, index) => ({ site: `site-${index + 1}`, bodyMd }))

    const result = checkSkillVariantSimilarity(variants)

    expect(result.ok).toBe(true)
    expect(result.maxSimilarity).toBeLessThan(SKILL_SIMILARITY_THRESHOLD)
  })
})
