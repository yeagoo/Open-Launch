/**
 * The brand marks that drift behind the hero copy.
 *
 * Sourced from [theSVG](https://thesvg.org) and vendored into `public/brand`
 * rather than hot-linked, so the hero has no runtime dependency on a third
 * party: an outage or a rename there cannot leave a hole in the page.
 *
 * Chosen for being real SaaS products a maker would recognise without being
 * household names — the wall is texture, and putting the largest logos in the
 * industry behind someone else's launch would read as an endorsement none of
 * these companies has given. The best-known candidates (Supabase, Resend,
 * Linear, n8n and others) were dropped for that reason, and so were marks that
 * only work as artwork: a wordmark (`cal-com` is 64x14 of ink), or a
 * self-contained tile that fills its canvas (`directus`, `postmark`, `twenty`).
 *
 * **Trademarks.** theSVG's tooling is MIT, but every mark remains the property
 * of its owner and is offered there for nominative use. A wall of third-party
 * logos is decoration, not a partnership claim, and nothing here should be read
 * as one. If a brand owner objects, removing its slug from this list removes it
 * everywhere.
 */
export const HERO_BRANDS = [
  { slug: "attio", title: "Attio" },
  { slug: "baserow", title: "Baserow" },
  { slug: "bonusly", title: "Bonusly" },
  { slug: "cap", title: "Cap" },
  { slug: "chatwoot", title: "Chatwoot" },
  { slug: "coder", title: "Coder" },
  { slug: "coolify", title: "Coolify" },
  { slug: "deskera", title: "Deskera" },
  { slug: "documenso", title: "Documenso" },
  { slug: "dub", title: "Dub" },
  { slug: "formbricks", title: "Formbricks" },
  { slug: "fusionauth", title: "FusionAuth" },
  { slug: "gitpod", title: "Gitpod" },
  { slug: "hoppscotch", title: "Hoppscotch" },
  { slug: "listmonk", title: "listmonk" },
  { slug: "medusa", title: "Medusa" },
  { slug: "meilisearch", title: "Meilisearch" },
  { slug: "minio", title: "MinIO" },
  { slug: "novu", title: "Novu" },
  { slug: "okteto", title: "Okteto" },
  { slug: "opensearch", title: "OpenSearch" },
  { slug: "ory", title: "Ory" },
  { slug: "outline", title: "Outline" },
  { slug: "plane", title: "Plane" },
  { slug: "supertokens", title: "SuperTokens" },
  { slug: "turso", title: "Turso" },
  { slug: "typesense", title: "Typesense" },
  { slug: "umami", title: "Umami" },
  { slug: "upsales", title: "Upsales" },
  { slug: "zulip", title: "Zulip" },
] as const

const ROW_SIZE = Math.ceil(HERO_BRANDS.length / 2)

interface BrandMark {
  slug: string
  title: string
}

/**
 * One drifting row.
 *
 * Each mark sits on a **fixed light chip** rather than directly on the page,
 * and the chip deliberately does not follow the theme. That is the only
 * treatment that keeps every logo exactly as its owner published it *and* stays
 * legible in both themes, which is not obvious until the alternatives are
 * measured:
 *
 * - Rendered bare, the set is a mix of black marks and white marks.
 *   `documenso` and `dub` publish white ink and vanish on a light background;
 *   `deskera`, `umami` and `upsales` publish near-black ink and vanish on a
 *   dark one.
 * - Recoloured through a CSS mask, every mark survives — but a mask keeps only
 *   the silhouette, so the white counter-forms that make `zulip`, `medusa` and
 *   `turso` recognisable are filled in and the logos become blobs.
 *
 * A light chip has its own requirement, so the marks were screened for it:
 * `documenso` and `dub` publish a dark-ink variant, which is what is vendored
 * here, and the other twenty-eight are light enough as published.
 *
 * The list is rendered twice and the animation translates the track by half its
 * width, which is what makes the loop seamless without measuring anything at
 * runtime. The duplicate is `aria-hidden` so a screen reader hears thirty
 * brands, not sixty — though the whole wall is decorative and hidden from
 * assistive technology anyway.
 */
function MarqueeRow({
  brands,
  direction,
}: {
  brands: readonly BrandMark[]
  direction: "left" | "right"
}) {
  const items = [...brands, ...brands]
  return (
    <div className="flex overflow-hidden">
      <div className="home-marquee-track" data-direction={direction} aria-hidden="true">
        {items.map((brand, index) => (
          <span
            key={`${brand.slug}-${index}`}
            className="mx-3 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-black/5 bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:mx-5 sm:h-16 sm:w-16 sm:p-3"
          >
            {/* Plain <img>: thirty decorative marks routed through the image
                optimizer would cost more than they save. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/brand/${brand.slug}.svg`}
              alt=""
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="h-full w-full object-contain"
            />
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The hero's logo wall, as two rows drifting in opposite directions.
 *
 * The scrim is applied by the caller so the headline keeps its contrast; this
 * component only lays out the rows.
 */
export function HeroBrandMarquee() {
  return (
    <div className="space-y-5 sm:space-y-7">
      <MarqueeRow brands={HERO_BRANDS.slice(0, ROW_SIZE)} direction="left" />
      <MarqueeRow brands={HERO_BRANDS.slice(ROW_SIZE)} direction="right" />
    </div>
  )
}
