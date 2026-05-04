/**
 * Translates messages/en.json to all other locales using DeepSeek.
 *
 * Usage:
 *   bun run scripts/translate-messages.ts            # translate all
 *   bun run scripts/translate-messages.ts zh fr      # translate specific locales
 *
 * Environment:
 *   DEEPSEEK_API_KEY  required
 *   DEEPSEEK_MODEL    defaults to deepseek-v4-flash
 *
 * The script flattens en.json, sends keys/values as a JSON object to the model,
 * and writes the translated result back to messages/<locale>.json preserving structure.
 *
 * Brand names that should NEVER be translated are passed as a do-not-translate list.
 */
import { promises as fs } from "fs"
import * as path from "path"

type LocaleCode = "zh" | "es" | "pt" | "fr" | "ja" | "ko" | "et"

const ALL_LOCALES: LocaleCode[] = ["zh", "es", "pt", "fr", "ja", "ko", "et"]

const LOCALE_NAMES: Record<LocaleCode, string> = {
  zh: "Simplified Chinese",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  ja: "Japanese",
  ko: "Korean",
  et: "Estonian",
}

const DO_NOT_TRANSLATE = [
  "aat.ee",
  "AAT.ee",
  "Open-Launch",
  "Product Hunt",
  "Google",
  "GitHub",
  "Stripe",
  "Resend",
  "Linux",
  "Apache HTTPD",
  "Debian.Club",
  "HestiaCP CN",
  "PortCyou",
  "CloudFan",
  "AlmaLinuxCN",
  "P.Cafe",
  "RankFan",
  "APP on ARM",
  "ScreenHello",
  "MF8",
  "II.Pe",
  "FreeHost",
  "BigKr",
  "EOL.Wiki",
  "GEO.Fan",
  "WebCasa",
  "LiteHTTPD",
  "LLStack",
  "HiEmdash",
  "QOO.IM",
  "Ubuntu.Fan",
  "RunEntLinux",
]

const TERMINOLOGY_HINTS = `
- "Launch" in startup context = the act of publicly releasing a product. Use natural verb forms.
- "Upvote" = like/support button on a product. Keep as a single word in target language.
- "Trending" = currently popular.
- "Sponsor" = paid advertiser/supporter.
- "Badge" = a small visual award/marker.
- "Maker" = the person/team who built the product.
`.trim()

interface FlatEntry {
  path: string
  value: string
}

function flatten(obj: Record<string, unknown>, prefix = ""): FlatEntry[] {
  const entries: FlatEntry[] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") {
      entries.push({ path, value })
    } else if (value && typeof value === "object") {
      entries.push(...flatten(value as Record<string, unknown>, path))
    }
  }
  return entries
}

function unflatten(entries: FlatEntry[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const { path, value } of entries) {
    const parts = path.split(".")
    let current: Record<string, unknown> = out
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in current) || typeof current[part] !== "object") {
        current[part] = {}
      }
      current = current[part] as Record<string, unknown>
    }
    current[parts[parts.length - 1]] = value
  }
  return out
}

async function translateBatch(
  entries: FlatEntry[],
  targetLocale: LocaleCode,
): Promise<Record<string, string>> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set")
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"

  const inputMap: Record<string, string> = {}
  for (const e of entries) inputMap[e.path] = e.value

  const systemPrompt = `You are a professional UI translator. Translate the values of the JSON object below from English to ${LOCALE_NAMES[targetLocale]}.

Rules:
- Preserve all keys exactly. Output a JSON object with the same keys, values translated.
- Preserve placeholders like {count}, {name} verbatim.
- Preserve Markdown / HTML inside strings if any.
- Do NOT translate these brand names; keep them exactly as-is: ${DO_NOT_TRANSLATE.join(", ")}.
- Maintain a professional, friendly tone consistent with a startup product directory.
- Use natural ${LOCALE_NAMES[targetLocale]} that a native speaker would write.

Terminology guidance:
${TERMINOLOGY_HINTS}

Output ONLY a valid JSON object. No prose, no markdown fences.`

  const userPrompt = JSON.stringify(inputMap, null, 2)

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`DeepSeek API error ${response.status}: ${errText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error("DeepSeek returned empty content")

  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    throw new Error(`Failed to parse DeepSeek output as JSON: ${err}\nRaw: ${content}`)
  }

  // Verify all keys returned
  for (const e of entries) {
    if (typeof parsed[e.path] !== "string") {
      console.warn(`  WARN: missing key in response: ${e.path}, falling back to English`)
      parsed[e.path] = e.value
    }
  }

  return parsed
}

async function translateLocale(targetLocale: LocaleCode, enFlat: FlatEntry[]): Promise<void> {
  console.log(`\n→ Translating to ${LOCALE_NAMES[targetLocale]} (${targetLocale})...`)
  const startTime = Date.now()

  const translated = await translateBatch(enFlat, targetLocale)

  const translatedEntries: FlatEntry[] = enFlat.map((e) => ({
    path: e.path,
    value: translated[e.path] ?? e.value,
  }))

  const out = unflatten(translatedEntries)
  const filePath = path.join(process.cwd(), "messages", `${targetLocale}.json`)
  await fs.writeFile(filePath, JSON.stringify(out, null, 2) + "\n", "utf-8")

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`  ✓ Wrote ${filePath} (${elapsed}s, ${enFlat.length} keys)`)
}

async function main() {
  const args = process.argv.slice(2)
  const targets: LocaleCode[] =
    args.length === 0
      ? ALL_LOCALES
      : (args.filter((a) => ALL_LOCALES.includes(a as LocaleCode)) as LocaleCode[])

  if (targets.length === 0) {
    console.error("Usage: bun run scripts/translate-messages.ts [locale...]")
    console.error(`Available locales: ${ALL_LOCALES.join(", ")}`)
    process.exit(1)
  }

  const enPath = path.join(process.cwd(), "messages", "en.json")
  const enJson = JSON.parse(await fs.readFile(enPath, "utf-8"))
  const enFlat = flatten(enJson)

  console.log(`Source: messages/en.json (${enFlat.length} keys)`)
  console.log(`Targets: ${targets.join(", ")}`)

  for (const locale of targets) {
    try {
      await translateLocale(locale, enFlat)
    } catch (error) {
      console.error(`  ✗ ${locale} failed:`, error instanceof Error ? error.message : error)
    }
  }

  console.log("\nDone.")
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
