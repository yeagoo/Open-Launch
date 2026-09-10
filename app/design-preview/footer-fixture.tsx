import Footer from "@/components/layout/footer"

/**
 * Offline render of the site footer.
 *
 * The footer is the one piece of site chrome that can be rendered without a
 * database: the nav needs a session, but the footer only needs the taxonomy
 * columns (fixture data below) and the build-time friend-links snapshot.
 *
 * Fidelity note: `usePathname()` returns null outside a Next router, so the
 * home-only Friends block and the AIEO badge stay hidden in this export. That
 * is a harness limitation, not the shipped markup.
 */

const FIXTURE_SITES = [
  { name: "aat.ee", url: "https://www.aat.ee/", domain: "aat.ee", logo: null, deemphasized: false },
  {
    name: "MiFar",
    url: "https://mifar.net/",
    domain: "mifar.net",
    logo: null,
    deemphasized: false,
  },
  { name: "Qoo.IM", url: "https://qoo.im/", domain: "qoo.im", logo: null, deemphasized: false },
  { name: "FastD", url: "https://fastd.top/", domain: "fastd.top", logo: null, deemphasized: true },
  {
    name: "Xlayers",
    url: "https://xlayers.dev/",
    domain: "xlayers.dev",
    logo: null,
    deemphasized: false,
  },
  {
    name: "Upperstory",
    url: "https://upperstory.io/",
    domain: "upperstory.io",
    logo: null,
    deemphasized: false,
  },
]

const FIXTURE_TAXONOMY = {
  categories: [
    { id: "ai", name: "Artificial Intelligence", count: 1089 },
    { id: "productivity", name: "Productivity", count: 649 },
    { id: "developer-tools", name: "Developer Tools", count: 482 },
    { id: "saas", name: "SaaS", count: 450 },
    { id: "marketing-tools", name: "Marketing Tools", count: 299 },
    { id: "design-tools", name: "Design Tools", count: 214 },
  ],
  tags: [
    { slug: "ai", name: "AI", count: 812 },
    { slug: "saas", name: "SaaS", count: 604 },
    { slug: "open-source", name: "Open Source", count: 388 },
    { slug: "productivity", name: "Productivity", count: 341 },
    { slug: "developer-tools", name: "Developer Tools", count: 297 },
    { slug: "no-code", name: "No Code", count: 188 },
    { slug: "marketing", name: "Marketing", count: 164 },
    { slug: "analytics", name: "Analytics", count: 141 },
  ],
}

export function FooterFixture() {
  return (
    <div className="bg-background text-foreground">
      <div className="text-muted-foreground border-home-hairline border-b px-4 py-3 text-center font-mono text-[11px]">
        ↑ 页脚（Friends 区块与 AIEO 徽章仅在站点首页渲染；离线导出无路由上下文，故此处不显示）
      </div>
      <Footer navSites={FIXTURE_SITES} taxonomy={FIXTURE_TAXONOMY} />
    </div>
  )
}
