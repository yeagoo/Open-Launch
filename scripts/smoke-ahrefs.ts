/**
 * One-shot probe of both Ahrefs RapidAPI providers.
 *
 * Usage:
 *   bun run scripts/smoke-ahrefs.ts                 # default: aat.ee
 *   bun run scripts/smoke-ahrefs.ts mf8.biz         # specific domain
 *
 * Prints status + parsed DR + raw response for each provider so you
 * can confirm the response shape before turning on the cron in prod.
 * If `dr` is null but the body contains a number, copy the path into
 * lib/ahrefs.ts → pickDR().
 */
import { fetchDomainRating, PROVIDER_ORDER } from "@/lib/ahrefs"

const domain = process.argv[2] ?? "aat.ee"

console.log(`Probing ${domain} via providers in order: ${PROVIDER_ORDER.join(", ")}\n`)

const result = await fetchDomainRating(domain)

console.log("Result:")
console.log(`  domain:      ${result.domain}`)
console.log(`  provider:    ${result.provider ?? "(none — all failed)"}`)
console.log(`  dr:          ${result.dr ?? "null"}`)
console.log(`  http_status: ${result.httpStatus}`)
if (result.error) console.log(`  error:       ${result.error}`)
console.log("\nRaw response body:")
console.log(JSON.stringify(result.raw, null, 2))

process.exit(0)
