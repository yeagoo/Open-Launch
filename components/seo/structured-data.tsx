import Script from "next/script"

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
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
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
    <Script
      id="schema-organization"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

// Product Schema - 项目页面
interface ProductSchemaProps {
  name: string
  description: string
  websiteUrl: string
  imageUrl: string
  platforms?: string[]
  pricing: string
  upvoteCount: number
  scheduledLaunchDate?: Date | null
}

export function ProductSchema({
  name,
  description,
  websiteUrl,
  imageUrl,
  platforms,
  pricing,
  upvoteCount,
  scheduledLaunchDate,
}: ProductSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description,
    url: websiteUrl,
    image: imageUrl,
    applicationCategory: "BusinessApplication",
    operatingSystem: platforms?.join(", ") || "Web",
    offers: {
      "@type": "Offer",
      price: pricing === "FREE" ? "0" : "varies",
      priceCurrency: "USD",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.5",
      reviewCount: upvoteCount,
    },
    author: {
      "@type": "Organization",
      name: "aat.ee",
    },
    ...(scheduledLaunchDate && {
      datePublished: scheduledLaunchDate.toISOString(),
    }),
  }

  return (
    <Script
      id="schema-product"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

// Article Schema - 博客文章
interface ArticleSchemaProps {
  headline: string
  description: string
  image?: string | null
  datePublished: Date
  dateModified: Date
  author: string
  slug: string
}

export function ArticleSchema({
  headline,
  description,
  image,
  datePublished,
  dateModified,
  author,
  slug,
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
      "@id": `${baseUrl}/blog/${slug}`,
    },
  }

  return (
    <Script
      id="schema-article"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
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
    <Script
      id="schema-breadcrumb"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
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
        "@type": listType === "project" ? "SoftwareApplication" : "Article",
        name: item.name,
        url: `${baseUrl}/${listType === "project" ? "projects" : "blog"}/${item.slug}`,
        image: item.logoUrl,
      },
    })),
  }

  return (
    <Script
      id="schema-itemlist"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
