import { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { RiCheckLine, RiRocketLine, RiSpeedLine, RiStarLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import { Breadcrumb } from "@/components/layout/breadcrumb"
import { BreadcrumbSchema } from "@/components/seo/structured-data"

export const metadata: Metadata = {
  title: "Badge - Get Priority Launch | aat.ee",
  description:
    "Add our badge to your website and get priority launch access. Skip the queue and launch your product faster on aat.ee.",
  alternates: {
    canonical: "/badge",
  },
  openGraph: {
    title: "Badge - Get Priority Launch | aat.ee",
    description:
      "Add our badge to your website and get priority launch access. Skip the queue and launch your product faster on aat.ee.",
    url: `${process.env.NEXT_PUBLIC_URL}/badge`,
    siteName: "aat.ee",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@aat_ee",
    creator: "@aat_ee",
    title: "Badge - Get Priority Launch | aat.ee",
    description:
      "Add our badge to your website and get priority launch access. Skip the queue and launch your product faster on aat.ee.",
  },
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

export default function BadgePage() {
  const benefits = [
    {
      icon: RiSpeedLine,
      title: "Priority Launch",
      description: "Launch your product within 24 hours instead of waiting weeks or months",
    },
    {
      icon: RiRocketLine,
      title: "Skip the Queue",
      description: "Bypass the regular free launch queue and get scheduled for the next day",
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
        items={[{ name: "Home", url: `${process.env.NEXT_PUBLIC_URL}` }, { name: "Badge" }]}
      />

      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Breadcrumb items={[{ name: "Badge" }]} />
        </div>

        {/* Hero Section */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-3xl font-bold sm:text-4xl">
            Get Priority Launch with Our Badge
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            Add our badge to your website and launch your product within 24 hours. No payment
            required - it&apos;s completely free!
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="mb-12 grid gap-6 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <div key={benefit.title} className="bg-card border-border rounded-xl border p-6">
              <div className="bg-primary/10 text-primary mb-4 inline-flex rounded-lg p-3">
                <benefit.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{benefit.title}</h3>
              <p className="text-muted-foreground text-sm">{benefit.description}</p>
            </div>
          ))}
        </div>

        {/* How It Works */}
        <div className="bg-muted/30 mb-12 rounded-2xl p-8">
          <h2 className="mb-6 text-2xl font-bold">How It Works</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="bg-primary text-primary-foreground flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold">
                1
              </div>
              <div>
                <h3 className="mb-1 font-semibold">Copy the Badge Code</h3>
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
                <h3 className="mb-1 font-semibold">Submit Your Product</h3>
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
                <h3 className="mb-1 font-semibold">Get Verified &amp; Launch Fast</h3>
                <p className="text-muted-foreground text-sm">
                  Once verified, your product will be scheduled to launch within 24 hours instead of
                  waiting in the regular queue.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Badge Preview and Code */}
        <div className="bg-card border-border mb-8 rounded-2xl border p-8">
          <h2 className="mb-6 text-2xl font-bold">Badge Code</h2>

          {/* Preview */}
          <div className="mb-6">
            <h3 className="text-muted-foreground mb-3 text-sm font-medium uppercase">Preview</h3>

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
            <h3 className="text-muted-foreground mb-3 text-sm font-medium uppercase">HTML Code</h3>
            <div className="relative">
              <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-sm">
                <code>{badgeCode}</code>
              </pre>
              <CopyButton text={badgeCode} className="absolute top-4 right-4" />
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-primary/5 rounded-2xl p-8 text-center">
          <h2 className="mb-3 text-2xl font-bold">Ready to Launch Fast?</h2>
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
          <h2 className="mb-6 text-2xl font-bold">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold">
                Do I need to keep the badge on my website forever?
              </h3>
              <p className="text-muted-foreground text-sm">
                Yes, the badge should remain visible on your website to maintain your dofollow
                backlink and priority status. If removed, your backlink will be changed to nofollow.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Where should I place the badge?</h3>
              <p className="text-muted-foreground text-sm">
                The badge should be placed in a visible location on your website, such as the
                footer, about page, or partners section. We need to be able to detect it
                automatically.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">
                What if the badge is not detected automatically?
              </h3>
              <p className="text-muted-foreground text-sm">
                Make sure the badge code is added exactly as shown above, including the correct URL
                and image source. If you&apos;re still having issues, contact us for manual
                verification.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Can I style the badge differently?</h3>
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
