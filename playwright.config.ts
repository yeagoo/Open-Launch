import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100"
const target = new URL(baseURL)
if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
  throw new Error("E2E_BASE_URL must target loopback")
}
const serverPort = target.port || (target.protocol === "https:" ? "443" : "80")
const databaseUrl = process.env.E2E_DATABASE_URL
const redisUrl = process.env.E2E_REDIS_URL ?? process.env.REDIS_URL
const authSecret = process.env.BETTER_AUTH_SECRET ?? "open-launch-e2e-auth-secret-32-bytes"

if (!databaseUrl) {
  throw new Error("E2E_DATABASE_URL is required")
}
if (!redisUrl) {
  throw new Error("E2E_REDIS_URL or REDIS_URL is required")
}

const runtimeEnv = {
  ...process.env,
  NODE_ENV: "production",
  PORT: serverPort,
  HOSTNAME: target.hostname,
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  BETTER_AUTH_SECRET: authSecret,
  BETTER_AUTH_URL: baseURL,
  NEXT_PUBLIC_URL: baseURL,
  GOOGLE_CLIENT_ID: "open-launch-e2e",
  GOOGLE_CLIENT_SECRET: "open-launch-e2e",
  GITHUB_CLIENT_ID: "open-launch-e2e",
  GITHUB_CLIENT_SECRET: "open-launch-e2e",
  TURNSTILE_SECRET_KEY: "open-launch-e2e",
  STRIPE_SECRET_KEY: "sk_test_open_launch_e2e",
  STRIPE_WEBHOOK_SECRET: "whsec_open_launch_e2e",
  RESEND_API_KEY: "re_open_launch_e2e",
  R2_ACCOUNT_ID: "open-launch-e2e",
  R2_ACCESS_KEY_ID: "open-launch-e2e",
  R2_SECRET_ACCESS_KEY: "open-launch-e2e",
  R2_BUCKET_NAME: "open-launch-e2e",
  R2_PUBLIC_DOMAIN: "static.example.invalid",
  CRON_API_KEY: "open-launch-e2e-cron-key",
  EMBEDDED_CRON_DISABLED: "true",
} satisfies Record<string, string | undefined>

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "node .next/standalone/server.js",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: runtimeEnv,
  },
  projects: [
    {
      name: "setup",
      testMatch: /setup\/.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /setup\/.*\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
