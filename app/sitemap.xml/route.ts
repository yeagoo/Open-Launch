import { serializeSitemapIndex } from "@/lib/sitemap-xml"

export const dynamic = "force-static"

export function GET() {
  return new Response(serializeSitemapIndex(), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
    },
  })
}
