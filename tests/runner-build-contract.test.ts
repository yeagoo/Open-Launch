import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8")
const buildScript = readFileSync(
  new URL("../scripts/build-immutable-runner.sh", import.meta.url),
  "utf8",
)

describe("immutable runner public build contract", () => {
  it("forwards every supported public Docker build input", () => {
    const dockerPublicArguments = [
      ...dockerfile.matchAll(/^ARG (NEXT_PUBLIC_[A-Z0-9_]+)(?:=.*)?$/gm),
    ].map(([, name]) => name)

    expect(dockerPublicArguments).toEqual([
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_CONTACT_EMAIL",
      "NEXT_PUBLIC_GA_MEASUREMENT_ID",
      "NEXT_PUBLIC_ONE_TAP_CLIENT_ID",
      "NEXT_PUBLIC_PREMIUM_PAYMENT_LINK",
      "NEXT_PUBLIC_PREMIUM_PLUS_PAYMENT_LINK",
      "NEXT_PUBLIC_TURNSTILE_SITE_IDENTIFIER",
      "NEXT_PUBLIC_URL",
    ])

    for (const name of dockerPublicArguments) {
      if (name === "NEXT_PUBLIC_TURNSTILE_SITE_IDENTIFIER") {
        expect(buildScript).toContain(
          "NEXT_PUBLIC_TURNSTILE_SITE_IDENTIFIER=$NEXT_PUBLIC_TURNSTILE_SITE_KEY",
        )
      } else {
        expect(buildScript).toContain(name)
      }
    }
  })

  it("keeps the Server Actions encryption key on the BuildKit secret path", () => {
    expect(buildScript).toContain(
      '--secret "id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,src=$secret_file"',
    )
    expect(buildScript).not.toMatch(/--build-arg\s+["']?NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/)
  })

  it("keeps the Phase 9 migrator scoped to migration 0058 and non-root", () => {
    const migrator = dockerfile.match(
      /FROM dependencies AS cron_ledger_migrator([\s\S]*?)\nFROM base AS builder/,
    )?.[1]

    expect(migrator).toBeDefined()
    expect(migrator).toContain('ee.aat.open-launch.migration="0058_cron_job_ledger.sql"')
    expect(migrator).toContain("USER nextjs")
    expect(migrator).toContain('ENTRYPOINT ["bun", "scripts/apply-pending-sql.ts"]')
    expect(migrator).toContain('CMD ["--apply", "0058_cron_job_ledger.sql"]')
  })
})
