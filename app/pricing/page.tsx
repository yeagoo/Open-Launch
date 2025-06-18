import Link from "next/link"

import { RiArticleLine, RiCheckboxCircleFill, RiInformationLine, RiLinkM } from "@remixicon/react"

import { DOMAIN_AUTHORITY, LAUNCH_LIMITS, LAUNCH_SETTINGS } from "@/lib/constants"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export const metadata = {
  title: "Pricing - Open-Launch",
  description: "Choose the perfect plan for your project launch",
}

const faqItems = [
  {
    id: "1",
    title: "When do launches happen?",
    content: `All launches happen at 8:00 AM UTC. We launch a limited number of projects each day to ensure quality visibility.`,
  },
  {
    id: "2",
    title: "How many projects are launched each day?",
    content: `We launch up to ${LAUNCH_LIMITS.FREE_DAILY_LIMIT} free projects and ${LAUNCH_LIMITS.PREMIUM_DAILY_LIMIT} premium projects daily.`,
  },
  {
    id: "3",
    title: "How far in advance can I schedule my launch?",
    content: `Free users can schedule up to ${LAUNCH_SETTINGS.MAX_DAYS_AHEAD} days in advance and Premium users up to ${LAUNCH_SETTINGS.PREMIUM_MAX_DAYS_AHEAD} days.`,
  },
  {
    id: "4",
    title: "What is the refund policy for the SEO Growth Package?",
    content: `We do not offer refunds for the SEO Growth Package. Once purchased, the service is considered final and non-refundable. However, we do our best to ensure customer satisfaction and work closely with you throughout the process.`,
  },
  {
    id: "5",
    title: "How is the SEO Growth Package content created?",
    content: `Our content creation process involves thorough product testing, note-taking, screenshots, and custom illustrations. While we use AI assistance to optimize our workflow after testing your product, all content is carefully reviewed, edited, and finalized by us, a human team, to ensure quality and accuracy.`,
  },
]

export default function PricingPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="mb-3 text-2xl font-bold sm:text-3xl">Choose Your Launch Plan</h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-sm">
          Get the visibility your project deserves with our flexible launch options. All launches
          happen at 8:00 AM UTC.
        </p>
      </div>

      {/* First row: Free and Premium */}
      <div className="mx-auto mb-4">
        <div className="grid grid-cols-1 overflow-hidden rounded-lg border md:grid-cols-10">
          {/* Free Launch Option */}
          <div className="flex h-full flex-col p-5 md:col-span-4">
            <div className="flex-grow">
              <h5 className="mb-2 text-base font-medium">Free Launch</h5>
              <div className="mb-2 text-2xl font-bold">
                $0 <span className="text-muted-foreground text-sm font-normal">/launch</span>
              </div>
              <p className="text-muted-foreground mb-3 text-xs">
                Standard launch with up to {LAUNCH_SETTINGS.MAX_DAYS_AHEAD} days scheduling window.
              </p>

              <ul className="mb-5 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <RiCheckboxCircleFill className="text-muted-foreground h-4 w-4" />
                  <span>{LAUNCH_LIMITS.FREE_DAILY_LIMIT} slots available daily</span>
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckboxCircleFill className="text-muted-foreground h-4 w-4" />
                  <span>Standard launch queue</span>
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckboxCircleFill className="text-muted-foreground h-4 w-4" />
                  <span>Featured on homepage</span>
                </li>
                <li className="flex items-start gap-2">
                  <RiCheckboxCircleFill className="text-muted-foreground mt-1 h-4 w-4" />
                  <div>
                    <span>Dofollow Backlink only if:</span>
                    <div className="text-muted-foreground mt-1.5 space-y-1 text-xs">
                      <div>1. Top 3 daily ranking</div>
                      <div>2. Display our badge on your site</div>
                    </div>
                  </div>
                </li>
              </ul>
            </div>

            <div className="mt-auto pt-3">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href="/projects/submit">Launch for Free</Link>
              </Button>
            </div>
          </div>

          {/* Premium Launch Option */}
          <div className="bg-muted/5 border-t p-5 md:col-span-6 md:border-t-0 md:border-l">
            <div className="flex h-full flex-col">
              <div className="flex-grow">
                <h5 className="mb-2 text-base font-medium">Premium Launch</h5>
                <div className="mb-2 text-2xl font-bold">
                  ${LAUNCH_SETTINGS.PREMIUM_PRICE}{" "}
                  <span className="text-muted-foreground text-sm font-normal">/launch</span>
                </div>
                <p className="text-muted-foreground mb-3 text-xs">
                  Priority scheduling with faster launch dates.
                </p>

                <ul className="mb-5 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <RiCheckboxCircleFill className="text-primary h-4 w-4" />
                    <span className="font-semibold">Skip the Free Queue - Priority access</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckboxCircleFill className="text-primary h-4 w-4" />
                    <span className="font-semibold">
                      Guaranteed Dofollow Backlink{" "}
                      <a
                        href="https://ahrefs.com/website-authority-checker?input=open-launch.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        (DR {DOMAIN_AUTHORITY})
                      </a>
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckboxCircleFill className="text-primary h-4 w-4" />
                    <span>{LAUNCH_LIMITS.PREMIUM_DAILY_LIMIT} premium slots daily</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckboxCircleFill className="text-primary h-4 w-4" />
                    <span>Earlier launch dates</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <RiCheckboxCircleFill className="text-primary h-4 w-4" />
                    <span>Featured on homepage</span>
                  </li>
                </ul>
              </div>

              <div className="mt-auto pt-3">
                <Button size="sm" className="w-full" asChild>
                  <Link href="/projects/submit">Get Premium</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Second row: Article */}
      <div className="mx-auto mb-12 max-w-3xl">
        <div className="border-primary/20 bg-primary/5 rounded-lg border p-5">
          <div className="flex flex-col md:flex-row">
            <div className="mb-6 flex flex-col md:mb-0 md:w-2/5 md:border-r md:pr-6">
              <div className="flex-grow">
                <h5 className="mb-1 text-lg font-semibold">SEO Growth Package</h5>
                <div className="mb-4 flex flex-col gap-1">
                  <div className="flex items-baseline text-3xl font-bold">
                    ${LAUNCH_SETTINGS.ARTICLE_PRICE}
                    <span className="text-muted-foreground ml-2 text-base font-normal line-through">
                      $199
                    </span>
                  </div>

                  <span className="bg-primary/10 text-primary w-fit rounded-full px-2 py-0.5 text-xs font-medium">
                    Only 2 slots left at $99
                  </span>
                </div>
                <p className="text-muted-foreground mb-6 text-xs">
                  Rank on Google with a dedicated SEO article
                </p>
              </div>

              <div className="mt-auto">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" className="w-full" variant="default">
                      Get SEO Growth Package
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto sm:max-w-lg">
                    <DialogHeader className="pb-6">
                      <DialogTitle className="text-xl font-semibold">
                        SEO Growth Package
                      </DialogTitle>
                      <DialogDescription className="text-muted-foreground">
                        Complete SEO solution to rank on Google
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                      {/* Price */}
                      <div className="text-center">
                        <div className="text-3xl font-bold">
                          ${LAUNCH_SETTINGS.ARTICLE_PRICE}
                          <span className="text-muted-foreground ml-2 text-lg font-normal line-through">
                            $199
                          </span>
                        </div>

                        <div className="mt-2 inline-block rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-800">
                          Only 2 slots left at this price
                        </div>
                      </div>

                      {/* What's included */}
                      <div>
                        <h3 className="mb-4 font-medium">What you get:</h3>
                        <div className="space-y-3">
                          <div className="flex gap-3">
                            <div className="bg-primary/10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded">
                              <RiArticleLine className="text-primary h-3 w-3" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium">SEO Article</div>
                              <div className="text-muted-foreground text-xs">
                                Custom &ldquo;[Product] review&rdquo; content
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <div className="bg-primary/10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded">
                              <RiLinkM className="text-primary h-3 w-3" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium">Premium Launch</div>
                              <div className="text-muted-foreground text-xs">
                                DR 32 dofollow backlink included
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Process */}
                      <div>
                        <h3 className="mb-4 font-medium">What happens next:</h3>
                        <div className="space-y-3">
                          <div className="flex gap-3">
                            <div className="bg-primary flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs font-medium text-white">
                              1
                            </div>
                            <div className="text-sm">Pay & secure your slot</div>
                          </div>
                          <div className="flex gap-3">
                            <div className="bg-primary flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs font-medium text-white">
                              2
                            </div>
                            <div className="text-sm">
                              <div>We contact you in 24h</div>
                              <div className="text-muted-foreground text-xs">
                                Product access, keywords, details
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <div className="bg-primary flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs font-medium text-white">
                              3
                            </div>
                            <div className="text-sm">Premium launch next day</div>
                          </div>
                          <div className="flex gap-3">
                            <div className="bg-primary flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs font-medium text-white">
                              4
                            </div>
                            <div className="text-sm">SEO article in 5-7 days</div>
                          </div>
                        </div>
                      </div>

                      {/* Requirement */}
                      <div className="bg-muted/30 rounded p-3">
                        <div className="flex gap-2">
                          <RiInformationLine className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
                          <div className="text-sm">
                            <span className="font-medium">Requirement:</span> Free product access
                            for testing
                          </div>
                        </div>
                      </div>

                      {/* Button */}
                      <Button className="h-11 w-full" asChild>
                        <Link href={process.env.NEXT_PUBLIC_SEO_ARTICLE_LINK!} target="_blank">
                          Get SEO Package - ${LAUNCH_SETTINGS.ARTICLE_PRICE}
                        </Link>
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="md:w-3/5 md:pl-6">
              <h6 className="mb-3 text-sm font-semibold">Complete SEO Package includes:</h6>

              <div className="space-y-1">
                <div className="bg-primary/5 border-primary/20 rounded border p-2">
                  <div className="flex items-start gap-2">
                    <RiCheckboxCircleFill className="text-primary mt-0.5 h-4 w-4" />
                    <div>
                      <p className="text-sm font-semibold">Dedicated SEO Article</p>
                      <p className="text-muted-foreground text-xs">
                        Custom article to rank for{" "}
                        <span className="text-primary/90 font-semibold">
                          &ldquo;[Your Product] review&rdquo;
                        </span>{" "}
                        keywords
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-primary/5 border-primary/20 rounded border p-2">
                  <div className="flex items-start gap-2">
                    <RiCheckboxCircleFill className="text-primary mt-0.5 h-4 w-4" />
                    <div>
                      <p className="text-sm font-semibold">Premium Launch</p>
                      <p className="text-muted-foreground text-xs">
                        Premium spot + dofollow backlink from our{" "}
                        <a
                          href="https://ahrefs.com/website-authority-checker?input=open-launch.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary font-semibold hover:underline"
                        >
                          DR {DOMAIN_AUTHORITY}
                        </a>{" "}
                        domain
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-primary/5 border-primary/20 rounded border p-2">
                  <div className="flex items-start gap-2">
                    <RiCheckboxCircleFill className="text-primary mt-0.5 h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">Google Ranking Strategy</p>
                      <p className="text-muted-foreground text-xs">
                        Optimized content to capture search traffic
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/5 border-primary/20 rounded border p-2">
                  <div className="flex items-start gap-2">
                    <RiCheckboxCircleFill className="text-primary mt-0.5 h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">Long-term SEO Value</p>
                      <p className="text-muted-foreground text-xs">
                        Content that ranks and drives ongoing traffic
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mb-12 max-w-3xl">
        <h2 className="mb-4 text-center text-xl font-bold sm:text-2xl">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="w-full -space-y-px" defaultValue="1">
          {faqItems.map((item) => (
            <AccordionItem
              value={item.id}
              key={item.id}
              className="bg-background has-focus-visible:border-ring has-focus-visible:ring-ring/50 relative border px-4 py-1 outline-none first:rounded-t-md last:rounded-b-md last:border-b has-focus-visible:z-10 has-focus-visible:ring-[3px]"
            >
              <AccordionTrigger className="py-2 text-[15px] leading-6 hover:no-underline focus-visible:ring-0">
                {item.title}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-2">
                {item.content}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  )
}
