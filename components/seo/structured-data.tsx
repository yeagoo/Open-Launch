import { serializeJsonLd } from "@/lib/safe-json-ld"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

// Organization Schema - 网站整体
export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "aat.ee",
    alternateName: "aat.ee - Product Hunt Alternative",
    url: baseUrl,
    description:
      "Modern Product Hunt alternative for discovering startups, AI tools, and SaaS launches",
    publisher: {
      "@type": "Organization",
      "@id": `${baseUrl}/#organization`,
      name: "aat.ee",
      url: baseUrl,
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/logo.png`,
        width: 512,
        height: 512,
      },
    },
  }

  return (
    <script
      id="schema-organization"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  )
}

// Product Schema - 项目页面
interface ProjectSchemaProps {
  name: string
  slug: string
  description: string
  websiteUrl: string
  imageUrl: string
  upvoteCount: number
  commentCount: number
  scheduledLaunchDate?: Date | null
}

export function ProjectSchema({
  name,
  slug,
  description,
  websiteUrl,
  imageUrl,
  upvoteCount,
  commentCount,
  scheduledLaunchDate,
}: ProjectSchemaProps) {
  // We track upvotes + comments, not 1–5 star reviews, so emitting an
  // AggregateRating would be fabricated data — Google flags that and
  // strips rich-result eligibility. interactionStatistic is the honest
  // way to report engagement (same field YouTube uses for likes/views).
  const interactionStatistic: Array<Record<string, unknown>> = []
  if (upvoteCount > 0) {
    interactionStatistic.push({
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/LikeAction",
      userInteractionCount: upvoteCount,
    })
  }
  if (commentCount > 0) {
    interactionStatistic.push({
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: commentCount,
    })
  }

  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description,
    url: `${baseUrl}/projects/${slug}`,
    image: imageUrl,
    mainEntity: {
      "@type": "Thing",
      name,
      url: websiteUrl,
    },
    ...(interactionStatistic.length > 0 && { interactionStatistic }),
    author: {
      "@type": "Organization",
      name: "aat.ee",
    },
    ...(scheduledLaunchDate && {
      datePublished: scheduledLaunchDate.toISOString(),
    }),
  }

  return (
    <script
      id="schema-product"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  )
}

// Article Schema - 博客文章 / reviews 长文
interface ArticleSchemaProps {
  headline: string
  description: string
  image?: string | null
  datePublished: Date
  dateModified: Date
  author: string
  slug: string
  // Canonical path prefix without the slug, e.g. "/blog" or "/reviews".
  // Required since 2026-07: previously hardcoded /blog, which mislabeled
  // reviews articles as blog URLs when the component was reused.
  basePath: string
}

export function ArticleSchema({
  headline,
  description,
  image,
  datePublished,
  dateModified,
  author,
  slug,
  basePath,
}: ArticleSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    ...(image && { image }),
    datePublished: datePublished.toISOString(),
    dateModified: dateModified.toISOString(),
    author: {
      "@type": "Person",
      name: author,
      url: baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "aat.ee",
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}${basePath}/${slug}`,
    },
  }

  return (
    <script
      id="schema-article"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  )
}

// BreadcrumbList Schema - 面包屑导航
interface BreadcrumbItem {
  name: string
  url?: string
}

interface BreadcrumbSchemaProps {
  items: BreadcrumbItem[]
}

export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url && { item: item.url }),
    })),
  }

  return (
    <script
      id="schema-breadcrumb"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  )
}

// Comparison Schema - 对比页面
interface ComparisonSchemaProps {
  projectAName: string
  projectAUrl: string
  projectBName: string
  projectBUrl: string
  slug: string
  description: string
}

export function ComparisonSchema({
  projectAName,
  projectAUrl,
  projectBName,
  projectBUrl,
  slug,
  description,
}: ComparisonSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${projectAName} vs ${projectBName}`,
    description,
    url: `${baseUrl}/compare/${slug}`,
    about: [
      {
        "@type": "Thing",
        name: projectAName,
        url: projectAUrl,
      },
      {
        "@type": "Thing",
        name: projectBName,
        url: projectBUrl,
      },
    ],
    publisher: {
      "@type": "Organization",
      name: "aat.ee",
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/logo.png`,
      },
    },
  }

  return (
    <script
      id="schema-comparison"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  )
}

// ItemList Schema - 列表页面
interface ItemListItem {
  name: string
  slug: string
  logoUrl: string
}

interface ItemListSchemaProps {
  name: string
  description: string
  items: ItemListItem[]
  listType?: "project" | "blog"
}

export function ItemListSchema({
  name,
  description,
  items,
  listType = "project",
}: ItemListSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": listType === "project" ? "Thing" : "Article",
        name: item.name,
        url: `${baseUrl}/${listType === "project" ? "projects" : "blog"}/${item.slug}`,
        image: item.logoUrl,
      },
    })),
  }

  return (
    <script
      id="schema-itemlist"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  )
}
