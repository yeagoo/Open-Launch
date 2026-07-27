import { MetadataRoute } from "next"

import { routing } from "@/i18n/routing"

// Private/auth-gated paths. With localePrefix "as-needed", non-default
// locales serve the same pages under /<locale>/..., so every entry must
// exist in both the bare and the locale-prefixed form — otherwise
// /zh/dashboard etc. stay crawlable.
function privatePaths(): string[] {
  const bare = ["/dashboard", "/settings", "/projects/submit", "/notifications"]
  const localized = routing.locales
    .filter((locale) => locale !== routing.defaultLocale)
    .flatMap((locale) => bare.map((path) => `/${locale}${path}`))
  return [
    ...bare,
    ...bare.map((path) => `${path}/*`),
    ...localized,
    ...localized.map((p) => `${p}/*`),
  ]
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/", "/admin/", ...privatePaths()],
      },
      {
        userAgent: [
          "GPTBot", // OpenAI GPT
          "ChatGPT-User", // ChatGPT
          "Google-Extended", // Google AI/Bard
          "anthropic-ai", // Claude
          "ClaudeBot", // Claude
          "Claude-Web", // Claude
          "cohere-ai", // Cohere
        ],
        allow: "/",
        disallow: ["/api/", "/admin/", ...privatePaths()],
        crawlDelay: 10,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
