import { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/dashboard/*",
          "/settings",
          "/projects/submit",
          "/_next/",
          "/admin/",
        ],
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
        disallow: ["/api/", "/dashboard", "/settings", "/admin/"],
        crawlDelay: 10,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
