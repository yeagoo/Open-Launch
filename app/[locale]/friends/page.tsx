import type { Metadata } from "next"

import { Link } from "@/i18n/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { buildLocaleAlternates } from "@/lib/i18n-metadata"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "friends" })
  return {
    title: `${t("title")} | aat.ee`,
    description: t("subtitle"),
    alternates: buildLocaleAlternates("/friends", locale),
  }
}

const friendGroups = [
  {
    key: "linuxCommunities",
    links: [
      { name: "Debian.Club", href: "https://debian.club/", desc: "Debian community" },
      { name: "HestiaCP CN", href: "https://hestiacp.cn/", desc: "HestiaCP Chinese community" },
      {
        name: "AlmaLinuxCN",
        href: "https://www.almalinux.com.cn/",
        desc: "AlmaLinux Chinese community",
      },
    ],
  },
  {
    key: "toolsServices",
    links: [
      { name: "PortCyou", href: "https://portcyou.com/", desc: "Port monitoring" },
      { name: "CloudFan", href: "https://cloud.fan/", desc: "Cloud services" },
      { name: "BigKr", href: "https://bigkr.com/", desc: "Product discovery" },
      { name: "ScreenHello", href: "https://www.screenhello.com/", desc: "Screen sharing tool" },
      { name: "FreeHost", href: "https://freehost.work/", desc: "Free hosting resources" },
      { name: "WebCasa", href: "https://web.casa", desc: "AI Native server control panel" },
      { name: "LiteHTTPD", href: "https://litehttpd.com", desc: "Lightweight web server" },
      { name: "LLStack", href: "https://llstack.com", desc: "Stack management" },
      { name: "HiEmdash", href: "https://hiemdash.com", desc: "Dashboard tool" },
    ],
  },
  {
    key: "directories",
    links: [
      { name: "P.Cafe", href: "https://p.cafe/", desc: "Product cafe" },
      { name: "RankFan", href: "https://www.rank.fan/", desc: "Rankings" },
      { name: "APP on ARM", href: "https://www.apponarm.com/", desc: "ARM app directory" },
      { name: "MF8", href: "https://mf8.biz/", desc: "Tech resource hub" },
      { name: "AAT.ee", href: "https://aat.ee/", desc: "Product launch platform" },
      { name: "II.Pe", href: "https://ii.pe/", desc: "Short links" },
      { name: "QOO.IM", href: "https://qoo.im", desc: "QOO.IM" },
    ],
  },
  {
    key: "knowledgeReference",
    links: [
      { name: "EOL.Wiki", href: "https://eol.wiki/", desc: "Software end-of-life tracker" },
      { name: "GEO.Fan", href: "https://geo.fan/", desc: "GEO Fan" },
    ],
  },
] as const

export default async function FriendsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("friends")
  const tGroups = await getTranslations("friends.groups")
  return (
    <main className="bg-muted/30 min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
        <div className="mb-8">
          <h1 className="text-foreground text-2xl font-bold md:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{t("subtitle")}</p>
        </div>

        <div className="space-y-8">
          {friendGroups.map((group) => (
            <section key={group.key}>
              <h2 className="text-foreground mb-4 text-lg font-semibold">{tGroups(group.key)}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {group.links.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-background border-border/40 hover:border-primary/30 hover:bg-muted/50 flex flex-col rounded-lg border p-4 transition-colors"
                  >
                    <span className="text-foreground text-sm font-medium">{link.name}</span>
                    <span className="text-muted-foreground mt-1 text-xs">{link.desc}</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-muted-foreground hover:text-primary text-sm transition-colors"
          >
            &larr; {t("backToHome")}
          </Link>
        </div>
      </div>
    </main>
  )
}
