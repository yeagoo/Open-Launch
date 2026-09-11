import { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { RiCheckLine, RiRocketLine, RiSpeedLine, RiStarLine } from "@remixicon/react"
import { getTranslations } from "next-intl/server"

import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import { SerifHeading } from "@/components/ds/serif-heading"
import { Breadcrumb } from "@/components/layout/breadcrumb"
import { BreadcrumbSchema } from "@/components/seo/structured-data"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "metadata.badge" })
  const path = "/badge"
  return {
    title: t("title"),
    description: t("description"),
    alternates: buildLocaleAlternates(path, locale),
    openGraph: {
      title: t("title"),
      description: t("description"),
      ...buildLocaleOpenGraph(path, locale),
      siteName: "aat.ee",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      site: "@aat_ee",
      creator: "@aat_ee",
      title: t("title"),
      description: t("description"),
    },
  }
}

const badgeCodeLight = `<a href="https://www.aat.ee/?ref=badge" target="_blank" rel="noopener" title="Featured on aat.ee">
  <img 
    src="https://www.aat.ee/images/badges/featured-badge-light.svg" 
    alt="Featured on aat.ee" 
    width="200"
    height="54"
    class="block dark:hidden"
  />
  <img 
    src="https://www.aat.ee/images/badges/featured-badge-dark.svg" 
    alt="Featured on aat.ee" 
    width="200"
    height="54"
    class="hidden dark:block"
  />
</a>`

const badgeCode = badgeCodeLight // For backwards compatibility

export default async function BadgePage() {
  const tBreadcrumb = await getTranslations("breadcrumb")
  const benefits = [
    {
      icon: RiSpeedLine,
      title: "Priority Launch",
      description: "Launch your product in 2 days instead of waiting weeks or months",
    },
    {
      icon: RiRocketLine,
      title: "Skip the Queue",
      description: "Bypass the regular free launch queue and get scheduled in 2 days",
    },
    {
      icon: RiStarLine,
      title: "Dofollow Backlink",
      description: "Get a valuable dofollow backlink from aat.ee (DA 40+) when you add our badge",
    },
    {
      icon: RiCheckLine,
      title: "100% Free",
      description: "No payment required - just add our badge to your website and verify",
    },
  ]

  return (
    <div className="bg-background min-h-screen">
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema
        items={[
          { name: tBreadcrumb("home"), url: `${process.env.NEXT_PUBLIC_URL}` },
          { name: tBreadcrumb("badge") },
        ]}
      />

      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Breadcrumb items={[{ name: tBreadcrumb("badge") }]} />
        </div>

        {/* Hero Section */}
        <div className="mb-12 text-center">
          <SerifHeading as="h1" size="display" className="mb-4">
            Get Priority Launch with Our Badge
          </SerifHeading>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            Add our badge to your website and launch your product in 2 days. No payment required -
            it&apos;s completely free!
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="mb-12 grid gap-6 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="bg-home-surface border-home-hairline rounded-home-card shadow-home-card border p-6"
            >
              <div className="bg-primary/10 text-primary mb-4 inline-flex rounded-lg p-3">
                <benefit.icon className="h-6 w-6" />
              </div>
              <SerifHeading as="h2" size="card" className="mb-2">
                {benefit.title}
              </SerifHeading>
              <p className="text-muted-foreground text-sm">{benefit.description}</p>
            </div>
          ))}
        </div>

        {/* How It Works */}
        <div className="bg-home-surface-muted rounded-home-card mb-12 p-8">
          <SerifHeading as="h2" size="section" className="mb-6">
            How It Works
          </SerifHeading>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="bg-primary text-primary-foreground flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold">
                1
              </div>
              <div>
                <SerifHeading as="h3" size="card" className="mb-1">
                  Copy the Badge Code
                </SerifHeading>
                <p className="text-muted-foreground text-sm">
                  Copy the HTML code below and paste it into your website&apos;s footer or about
                  page.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="bg-primary text-primary-foreground flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold">
                2
              </div>
              <div>
                <SerifHeading as="h3" size="card" className="mb-1">
                  Submit Your Product
                </SerifHeading>
                <p className="text-muted-foreground text-sm">
                  Go to the project submission form and enter your website URL. We&apos;ll
                  automatically detect the badge.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="bg-primary text-primary-foreground flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold">
                3
              </div>
              <div>
                <SerifHeading as="h3" size="card" className="mb-1">
                  Get Verified &amp; Launch Fast
                </SerifHeading>
                <p className="text-muted-foreground text-sm">
                  Once verified, your product will be scheduled to launch in 2 days instead of
                  waiting in the regular queue.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Badge Preview and Code */}
        <div className="bg-home-surface border-home-hairline rounded-home-card shadow-home-card mb-8 border p-8">
          <SerifHeading as="h2" size="section" className="mb-6">
            Badge Code
          </SerifHeading>

          {/* Preview */}
          <div className="mb-6">
            <SerifHeading as="h3" size="eyebrow" className="mb-3">
              Preview
            </SerifHeading>

            {/* Light Mode Badge */}
            <div className="mb-3">
              <p className="text-muted-foreground mb-2 text-xs font-medium">Light Mode</p>
              <div className="flex items-center justify-center rounded-lg border bg-white p-8">
                <a
                  href="https://www.aat.ee/?ref=badge"
                  target="_blank"
                  rel="noopener"
                  title="Featured on aat.ee"
                >
                  <Image
                    src="/images/badges/featured-badge-light.svg"
                    alt="Featured on aat.ee - Light"
                    width={200}
                    height={54}
                  />
                </a>
              </div>
            </div>

            {/* Dark Mode Badge */}
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">Dark Mode</p>
              <div className="flex items-center justify-center rounded-lg border bg-slate-900 p-8">
                <a
                  href="https://www.aat.ee/?ref=badge"
                  target="_blank"
                  rel="noopener"
                  title="Featured on aat.ee"
                >
                  <Image
                    src="/images/badges/featured-badge-dark.svg"
                    alt="Featured on aat.ee - Dark"
                    width={200}
                    height={54}
                  />
                </a>
              </div>
            </div>
          </div>

          {/* Code */}
          <div>
            <SerifHeading as="h3" size="eyebrow" className="mb-3">
              HTML Code
            </SerifHeading>
            <div className="relative">
              <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-sm">
                <code>{badgeCode}</code>
              </pre>
              <CopyButton text={badgeCode} className="absolute top-4 right-4" />
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-home-accent-soft rounded-home-card p-8 text-center">
          <SerifHeading as="h2" size="section" className="mb-3">
            Ready to Launch Fast?
          </SerifHeading>
          <p className="text-muted-foreground mb-6 text-sm">
            Add the badge to your website and submit your product now. You&apos;ll be live within 24
            hours!
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/projects/submit">Submit Your Product</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/pricing">View All Options</Link>
            </Button>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-12">
          <SerifHeading as="h2" size="section" className="mb-6">
            Frequently Asked Questions
          </SerifHeading>
          <div className="space-y-6">
            <div>
              <SerifHeading as="h3" size="card" className="mb-2">
                Do I need to keep the badge on my website forever?
              </SerifHeading>
              <p className="text-muted-foreground text-sm">
                Yes, the badge should remain visible on your website to maintain your dofollow
                backlink and priority status. If removed, your backlink will be changed to nofollow.
              </p>
            </div>

            <div>
              <SerifHeading as="h3" size="card" className="mb-2">
                Where should I place the badge?
              </SerifHeading>
              <p className="text-muted-foreground text-sm">
                The badge should be placed in a visible location on your website, such as the
                footer, about page, or partners section. We need to be able to detect it
                automatically.
              </p>
            </div>

            <div>
              <SerifHeading as="h3" size="card" className="mb-2">
                What if the badge is not detected automatically?
              </SerifHeading>
              <p className="text-muted-foreground text-sm">
                Make sure the badge code is added exactly as shown above, including the correct URL
                and image source. If you&apos;re still having issues, contact us for manual
                verification.
              </p>
            </div>

            <div>
              <SerifHeading as="h3" size="card" className="mb-2">
                Can I style the badge differently?
              </SerifHeading>
              <p className="text-muted-foreground text-sm">
                You can adjust the size and positioning, but please don&apos;t modify the image URL
                or remove the link back to aat.ee. This is required for verification.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
