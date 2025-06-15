/* eslint-disable @next/next/no-img-element */
import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ArrowLeft, Calendar, Clock, User } from "lucide-react"

import { ArticleFooter } from "@/components/blog/article-footer"
import { getReadingTimeForArticle } from "@/components/blog/reading-time"
import TableOfContents from "@/components/blog/table-of-contents"

async function getMdxContent(slug: string) {
  try {
    const mdxModule = await import(`@/content/blog/${slug}.mdx`)
    return {
      frontmatter: mdxModule.metadata,
      content: mdxModule.default,
    }
  } catch {
    return null
  }
}

export async function generateStaticParams() {
  const { articles } = await import("@/content/blog/index")
  return articles.map((article) => ({ slug: article.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const mdxData = await getMdxContent(slug)

  if (!mdxData) {
    return {
      title: "Article not found | Open Launch",
      description: "The article you're looking for doesn't exist or has been removed.",
    }
  }

  const { frontmatter } = mdxData
  const title = frontmatter.title
  const description = frontmatter.description
  const imageUrl = frontmatter.image

  return {
    title: `${title} | Open Launch`,
    description,
    keywords: frontmatter.tags?.join(", ") || "insights, tutorials, resources",
    authors: frontmatter.author ? [{ name: frontmatter.author }] : [{ name: "Open Launch Team" }],
    category: "Technology",
    openGraph: {
      title: `${title} | Open Launch`,
      description,
      type: "article",
      publishedTime: frontmatter.publishedAt,
      modifiedTime: frontmatter.publishedAt,
      tags: frontmatter.tags || [],
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      siteName: "Open Launch",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Open Launch`,
      description,
      images: [imageUrl],
      creator: "@openlaunch",
      site: "@openlaunch",
    },
    alternates: {
      canonical: `/blog/${slug}`,
    },
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const mdxData = await getMdxContent(slug)

  if (!mdxData) {
    notFound()
  }

  const { frontmatter, content: MDXContent } = mdxData
  const readingTime = await getReadingTimeForArticle(slug)

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Button */}
        <div className="mb-8">
          <Link
            href="/blog"
            className="text-muted-foreground hover:text-foreground inline-flex items-center transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Blog
          </Link>
        </div>

        <article>
          {/* Article Header */}
          <header className="mb-8">
            {/* Meta Information */}
            <div className="text-muted-foreground mb-4 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <time dateTime={frontmatter.publishedAt}>
                  {formatDate(frontmatter.publishedAt)}
                </time>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{readingTime}</span>
              </div>
              {frontmatter.author && (
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  <span>By {frontmatter.author}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {frontmatter.tags && frontmatter.tags.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2 text-xs">
                {frontmatter.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Title */}
            <h1 className="mb-4 text-2xl font-bold md:text-4xl">{frontmatter.title}</h1>

            {/* Description */}
            <p className="mb-6 leading-relaxed">{frontmatter.description}</p>

            {/* Hero Image */}
            {frontmatter.image && (
              <div className="bg-muted mb-8 aspect-[16/9] overflow-hidden rounded-lg">
                <img
                  src={frontmatter.image}
                  alt={frontmatter.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </header>

          {/* Table of Contents */}
          <div className="mb-8">
            <TableOfContents />
          </div>

          {/* Article Content */}
          <div>
            <MDXContent />
          </div>

          <ArticleFooter />
        </article>
      </div>
    </div>
  )
}
