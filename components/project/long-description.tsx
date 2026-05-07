import { SafeMarkdown } from "@/components/ui/safe-markdown"

interface LongDescriptionProps {
  heading: string
  markdown: string
}

/**
 * Render AI-generated long-form product overview as markdown.
 * Delegates to SafeMarkdown for renderer hardening (image whitelist,
 * scheme guard on links, heading downgrade).
 */
export function LongDescription({ heading, markdown }: LongDescriptionProps) {
  return (
    <section className="border-border mt-8 border-t pt-8">
      <h2 className="mb-4 text-xl font-semibold sm:text-2xl">{heading}</h2>
      <div className="prose prose-zinc dark:prose-invert prose-headings:font-semibold prose-h3:mt-6 prose-h3:text-lg prose-h4:mt-4 prose-h4:text-base prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:not-italic prose-blockquote:font-medium max-w-none">
        <SafeMarkdown downgradeHeadings>{markdown}</SafeMarkdown>
      </div>
    </section>
  )
}
