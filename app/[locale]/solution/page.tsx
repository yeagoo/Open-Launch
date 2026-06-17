import type { Metadata } from "next"
import Link from "next/link"

import {
  RiArrowRightLine,
  RiArrowRightUpLine,
  RiCheckLine,
  RiDoubleQuotesL,
} from "@remixicon/react"
import { setRequestLocale } from "next-intl/server"

import { DIRECTORY_PROMO } from "@/lib/directory-tiers"
import { getDRBatch, type DRRecord } from "@/lib/dr"
import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import {
  AUTHORITY_NETWORK,
  DIRECTORY_NETWORK,
  DIRECTORY_NETWORK_DOMAINS,
  type AuthoritySite,
  type DirectorySite,
} from "@/lib/site-network"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { DrBadge } from "@/components/dr/dr-badge"
import { CopyPromoCode } from "@/components/pricing/copy-promo-code"

// ISR: per-locale cache, hourly regen (DR is 3-day cached anyway).
// Never `force-static` — that would serve one default-locale render to
// every locale.
export const revalidate = 3600

// ─── Self-contained bilingual copy (en + zh, en fallback). v4 keeps its
//     strings inline so the editorial design can be iterated on without
//     touching the shared 8-locale next-intl message files. ───
type Lang = "en" | "zh"
type L = { en: string; zh: string }

function langOf(locale: string): Lang {
  return locale.startsWith("zh") ? "zh" : "en"
}

const META: { title: L; description: L } = {
  title: {
    en: "The solution — one launch, from search to AI",
    zh: "解决方案 — 一次发布，从搜索到 AI",
  },
  description: {
    en: "How it works: two SEO mechanisms in one launch — a 13-site directory network for domain authority and traffic, and a 26-site authority network so ChatGPT, Claude, Perplexity and Gemini cite your brand.",
    zh: "运作方式：一次发布，两种 SEO 机制——13 个导航站构成的网络带来域名权重与流量，26 个权威文档站让 ChatGPT、Claude、Perplexity、Gemini 引用你的品牌。",
  },
}

const HERO = {
  eyebrow: { en: "A field guide to launching", zh: "发布指南" },
  heading: {
    en: "Every launch is a story told twice — once to Google, once to the AI engines.",
    zh: "每一次发布，都要讲两遍——一遍讲给 Google，一遍讲给 AI 引擎。",
  },
  subheading: {
    en: "Search engines reward domain authority and links. AI engines reward being cited by sources they already trust. We built two networks so a single launch speaks to both. Read on.",
    zh: "搜索引擎看重域名权重与外链，AI 引擎看重被它已经信任的来源引用。我们搭建了两张网络，让一次发布同时打动两者。继续往下读。",
  },
  scroll: { en: "Start reading", zh: "开始阅读" },
}

const SECTION1 = {
  num: "01",
  label: { en: "Network 1 · The Directory", zh: "网络一 · 导航站" },
  title: { en: "First, you earn authority.", zh: "第一步，赢得权重。" },
  lede: {
    en: "A new product is invisible to search engines until trusted sites point at it. The Directory Network is how you go from cold start to indexed — fast.",
    zh: "在被可信站点指向之前，新产品对搜索引擎是隐形的。导航网络让你从冷启动走向被收录——而且很快。",
  },
  body1: {
    en: "Thirteen AI-tool and product directories list your launch with a permanent dofollow link. Each one passes real domain authority, accelerates indexing, and sends referral traffic — the classic SEO compounding loop. Because the sites span many languages and countries, you reach audiences a single homepage never could.",
    zh: "13 个 AI 工具与产品导航站，会带着永久 dofollow 外链收录你的发布。每一个都传递真实的域名权重、加速收录、带来引荐流量——这正是经典 SEO 的复利循环。这些站点覆盖多语言、多国家，触达范围远超单一首页。",
  },
  body2: {
    en: "It is hands-off: listings are published automatically and are typically live within one to three days. Basic seeds one site, Plus selects the five strongest domains, and Pro covers all thirteen.",
    zh: "全程无需操心：收录自动发布，通常 1–3 天内上线。Basic 先布一站，Plus 精选 5 个权重最高的域名，Pro 则覆盖全部 13 个。",
  },
  pull: {
    en: "Domain authority is borrowed before it is earned. A directory network lends you theirs on day one.",
    zh: "域名权重，是先借来、后赚到的。导航网络在第一天就把它借给你。",
  },
  gridLabel: { en: "The thirteen", zh: "十三个站点" },
  drNote: {
    en: "Live Domain Rating, refreshed every 3 days.",
    zh: "实时 Domain Rating，每 3 天刷新。",
  },
}

const SECTION2 = {
  num: "02",
  label: { en: "Network 2 · The Authority", zh: "网络二 · 权威文档" },
  title: { en: "Then, you become a citation.", zh: "第二步，成为被引用的来源。" },
  lede: {
    en: "Search is no longer the only front door. People ask ChatGPT, Claude, Perplexity and Gemini — and those engines answer with sources they trust.",
    zh: "搜索不再是唯一的入口。人们会问 ChatGPT、Claude、Perplexity、Gemini——而这些引擎用它们信任的来源来回答。",
  },
  body1: {
    en: "This is GEO — Generative Engine Optimization, or AIEO. The Authority Network is twenty-six high-authority technical-docs sites. We hand-write editorial articles that position your brand as an authoritative reference within their subject, so when an AI engine composes an answer in your space, your name is in the room.",
    zh: "这就是 GEO——生成式引擎优化，又称 AIEO。权威网络由 26 个高权威技术文档站组成。我们人工撰写编辑文章，把你的品牌确立为该主题下的权威参考——当 AI 引擎在你的领域组织答案时，你的名字就在其中。",
  },
  body2: {
    en: "These placements are made by hand. We match your product to the most topically relevant sites and write the articles ourselves, which is why they take longer than the automated directory listings — and why they work.",
    zh: "这些内容由人工完成。我们将你的产品匹配到主题最相关的站点，并亲自撰写文章——这也是它比自动收录更慢、却更有效的原因。",
  },
  pull: {
    en: "Tomorrow's discovery happens inside an answer, not a results page. GEO puts your brand inside the answer.",
    zh: "未来的发现，发生在一段回答里，而不是搜索结果页。GEO 把你的品牌放进那段回答。",
  },
  gridLabel: { en: "The twenty-six", zh: "二十六个站点" },
}

const BRIDGE = {
  en: "Basic, Plus and Pro deepen the directory network — that is your SEO foundation. Ultra and Ultra Plus build on full directory reach and add the authority network on top — that is GEO. Same launch, two mechanisms.",
  zh: "Basic、Plus、Pro 在加深导航网络——这是你的 SEO 地基。Ultra、Ultra Plus 在完整导航覆盖之上，再叠加权威网络——这就是 GEO。同一次发布，两种机制。",
}

interface TierDef {
  id: string
  group: "directory" | "authority"
  name: string
  price: string
  original: string | null
  tagline: L
  reach: L
  features: L[]
  badge: L | null
  featured: boolean
}

const TIERS: TierDef[] = [
  {
    id: "basic",
    group: "directory",
    name: "Basic",
    price: "$3.99",
    original: null,
    tagline: { en: "A foot in the door on aat.ee.", zh: "在 aat.ee 先迈出第一步。" },
    reach: { en: "1 site · aat.ee", zh: "1 个站点 · aat.ee" },
    features: [
      { en: "Skip the review queue on aat.ee", zh: "免审核，直接发布到 aat.ee" },
      { en: "Permanent dofollow backlink", zh: "永久 dofollow 外链" },
      { en: "Live within ~1 day", zh: "约 1 天内上线" },
    ],
    badge: null,
    featured: false,
  },
  {
    id: "plus",
    group: "directory",
    name: "Plus",
    price: "$6.99",
    original: "$9.99",
    tagline: {
      en: "The five strongest domains in the network.",
      zh: "网络中权重最高的 5 个域名。",
    },
    reach: { en: "5 directory sites · DR 35+", zh: "5 个导航站 · DR 35+" },
    features: [
      { en: "Everything in Basic", zh: "包含 Basic 全部" },
      { en: "Published to 5 directory sites with DR 35+", zh: "发布到 5 个 DR 35+ 的导航站" },
      { en: "5 independent dofollow domains", zh: "5 个独立域名的 dofollow 外链" },
    ],
    badge: null,
    featured: false,
  },
  {
    id: "pro",
    group: "directory",
    name: "Pro",
    price: "$15.99",
    original: "$39.99",
    tagline: {
      en: "The whole directory — full SEO reach.",
      zh: "完整导航网络——SEO 覆盖拉满。",
    },
    reach: { en: "All 13 directory sites", zh: "全部 13 个导航站" },
    features: [
      { en: "Everything in Plus", zh: "包含 Plus 全部" },
      { en: "Published to ALL 13 directory sites", zh: "发布到全部 13 个导航站" },
      { en: "Multi-language, multi-country reach", zh: "多语言、多国家覆盖" },
    ],
    badge: { en: "Most popular", zh: "最受欢迎" },
    featured: true,
  },
  {
    id: "ultra",
    group: "authority",
    name: "Ultra",
    price: "$19.99",
    original: null,
    tagline: {
      en: "Full directory reach, plus your first GEO push.",
      zh: "完整导航覆盖，外加首轮 GEO 推广。",
    },
    reach: { en: "All 13 sites + 3 GEO articles", zh: "全部 13 站 + 3 篇 GEO 文章" },
    features: [
      { en: "Everything in Pro (all 13 directory sites)", zh: "包含 Pro 全部（全部 13 个导航站）" },
      {
        en: "3 editorial articles on topic-matched authority docs",
        zh: "3 篇主题匹配的权威文档站文章",
      },
      {
        en: "Get cited by ChatGPT, Claude, Perplexity & Gemini",
        zh: "被 ChatGPT、Claude、Perplexity、Gemini 引用",
      },
    ],
    badge: null,
    featured: false,
  },
  {
    id: "ultraPlus",
    group: "authority",
    name: "Ultra Plus",
    price: "$25.99",
    original: null,
    tagline: {
      en: "Twice the GEO reach. Maximum AI visibility.",
      zh: "双倍 GEO 覆盖，AI 曝光拉满。",
    },
    reach: { en: "All 13 sites + 6 GEO articles", zh: "全部 13 站 + 6 篇 GEO 文章" },
    features: [
      { en: "Everything in Ultra", zh: "包含 Ultra 全部" },
      {
        en: "6 editorial articles on authority docs (2× GEO reach)",
        zh: "6 篇权威文档站文章（GEO 覆盖翻倍）",
      },
      { en: "Maximum LLM brand visibility", zh: "最大化大模型品牌曝光" },
    ],
    badge: { en: "Best for GEO", zh: "GEO 首选" },
    featured: true,
  },
]

const TIER_GROUPS = {
  directory: {
    eyebrow: { en: "The tiers · part one", zh: "套餐 · 上篇" },
    title: { en: "Directory tiers", zh: "导航套餐" },
    intro: {
      en: "Three ways to deepen your SEO foundation — climb to unlock more of the directory network.",
      zh: "三种加深 SEO 地基的方式——逐级解锁更多导航站。",
    },
  },
  authority: {
    eyebrow: { en: "The tiers · part two", zh: "套餐 · 下篇" },
    title: { en: "Directory + Authority", zh: "导航 + 权威" },
    intro: {
      en: "Full directory reach, with editorial articles layered on so the AI engines cite you by name.",
      zh: "完整导航覆盖，再叠加编辑文章，让 AI 引擎指名引用你。",
    },
  },
}

const UI = {
  oneTime: { en: "One-time payment", zh: "一次性付款" },
  reachLabel: { en: "Reach", zh: "覆盖" },
  cta: { en: "Get started", zh: "立即开始" },
  ctaTier: { en: "Choose", zh: "选择" },
  priceNotice: {
    en: "Discounted launch pricing shown — regular prices apply after the test phase.",
    zh: "当前为优惠上线价，测试期结束后恢复原价。",
  },
  promo: {
    label: { en: "Test-phase promo", zh: "测试期优惠" },
    headline: { en: "Discounted launch pricing", zh: "优惠上线价" },
    subtext: { en: "Apply the code at checkout.", zh: "结账时填入优惠码。" },
    warning: {
      en: "Limited test-phase pricing — may change without notice.",
      zh: "测试期价格，可能随时调整。",
    },
    copy: { en: "Copy", zh: "复制" },
    copied: { en: "Copied", zh: "已复制" },
  },
  faqHeading: { en: "Before you decide", zh: "在你决定之前" },
  footer: {
    eyebrow: { en: "The end of the read", zh: "读到这里" },
    heading: { en: "Now write your own launch.", zh: "现在，写下你自己的发布。" },
    body: {
      en: "Pick a tier and we'll put your product in front of both the search engines and the AI engines — in one launch.",
      zh: "选择一个套餐，我们会让你的产品同时出现在搜索引擎与 AI 引擎面前——只需一次发布。",
    },
  },
}

const FAQ: { q: L; a: L }[] = [
  {
    q: {
      en: "What's the difference between the two networks?",
      zh: "两类网络有什么区别？",
    },
    a: {
      en: "The Directory Network passes link equity and drives indexing, traffic, and rankings — classic SEO. The Authority Network places editorial articles on high-authority docs sites so AI engines treat your brand as a trustworthy reference and cite it — that's GEO/AIEO.",
      zh: "导航网络传递链接权重、带来收录、流量与排名——属于传统 SEO。权威文档网络则在高权威文档站发布人工撰写的文章，让 AI 引擎把你的品牌当作可信参考并加以引用——这就是 GEO/AIEO。",
    },
  },
  {
    q: { en: "What is GEO / AIEO?", zh: "什么是 GEO / AIEO？" },
    a: {
      en: "Generative Engine Optimization / AI Engine Optimization — optimizing so that AI assistants like ChatGPT, Claude, Perplexity and Gemini mention and recommend your product in their answers.",
      zh: "生成式引擎优化 / AI 引擎优化——通过优化让 ChatGPT、Claude、Perplexity、Gemini 等 AI 助手在回答中提及并推荐你的产品。",
    },
  },
  {
    q: { en: "How are directory listings published?", zh: "导航站收录是怎么发布的？" },
    a: {
      en: "Automatically across our directory network with a permanent dofollow backlink, typically live within 1–3 days. Plus selects 5 of the strongest (DR 35+) domains; Pro and above publish to all 13.",
      zh: "通过我们的导航网络自动发布，附带永久 dofollow 外链，通常 1–3 天内上线。Plus 选取 5 个权重最高（DR 35+）的域名；Pro 及以上发布到全部 13 个站点。",
    },
  },
  {
    q: { en: "How are the GEO articles produced?", zh: "GEO 文章是如何产出的？" },
    a: {
      en: "Editorially, by hand. We match your product to the most topically relevant authority sites and write 3 (Ultra) or 6 (Ultra Plus) articles. Because they're hand-crafted, these take longer than the automated directory listings.",
      zh: "由人工编辑撰写。我们将你的产品匹配到主题最相关的权威站点，撰写 3 篇（Ultra）或 6 篇（Ultra Plus）文章。由于是人工创作，相比自动收录会需要更长时间。",
    },
  },
  {
    q: { en: "Are these one-time payments?", zh: "这些是一次性付款吗？" },
    a: {
      en: "Yes — every tier here is a one-time payment for a one-time placement. No subscription.",
      zh: "是的——这里每个套餐都是一次性付款、一次性发布，没有订阅。",
    },
  },
]

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const lang = langOf(locale)
  const path = "/solution"
  return {
    title: META.title[lang],
    description: META.description[lang],
    alternates: buildLocaleAlternates(path, locale),
    openGraph: {
      title: META.title[lang],
      description: META.description[lang],
      ...buildLocaleOpenGraph(path, locale),
      siteName: "aat.ee",
      type: "website",
    },
  }
}

export default async function SolutionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const lang = langOf(locale)
  const t = (s: L) => s[lang]

  const drRecords = await getDRBatch(DIRECTORY_NETWORK_DOMAINS)
  const drByDomain = new Map(drRecords.map((r) => [r.domain, r]))

  const directoryTiers = TIERS.filter((tier) => tier.group === "directory")
  const authorityTiers = TIERS.filter((tier) => tier.group === "authority")

  return (
    <main className="bg-background text-foreground min-h-screen">
      {/* ─────────────────────── Editorial hero ─────────────────────── */}
      <header className="border-border/60 relative border-b">
        <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32 lg:py-40">
          <p className="text-primary mb-8 flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] uppercase">
            <span className="bg-primary inline-block h-px w-8" />
            {t(HERO.eyebrow)}
          </p>
          <h1 className="font-editorial max-w-4xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
            {t(HERO.heading)}
          </h1>
          <p className="text-muted-foreground mt-8 max-w-2xl text-lg leading-relaxed sm:text-xl">
            {t(HERO.subheading)}
          </p>
          <div className="mt-10 flex items-center gap-4 text-sm">
            <a
              href="#section-01"
              className="text-foreground hover:text-primary group inline-flex items-center gap-2 font-medium"
            >
              {t(HERO.scroll)}
              <RiArrowRightLine className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </header>

      {/* ───────────────── Section 01 — Directory story ───────────────── */}
      <section id="section-01" className="border-border/60 scroll-mt-12 border-b">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <SectionEyebrow num={SECTION1.num} label={t(SECTION1.label)} />
          <div className="mt-10 grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            {/* Prose column */}
            <div className="max-w-xl">
              <h2 className="font-editorial text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                {t(SECTION1.title)}
              </h2>
              <p className="text-foreground/90 first-letter:font-editorial mt-6 text-lg leading-relaxed first-letter:float-left first-letter:mr-3 first-letter:text-6xl first-letter:leading-[0.8] first-letter:font-semibold">
                {t(SECTION1.lede)}
              </p>
              <p className="text-muted-foreground mt-5 leading-relaxed">{t(SECTION1.body1)}</p>
              <p className="text-muted-foreground mt-5 leading-relaxed">{t(SECTION1.body2)}</p>
              <PullQuote text={t(SECTION1.pull)} />
            </div>

            {/* Sites grid */}
            <div>
              <div className="text-muted-foreground mb-5 flex items-baseline justify-between">
                <span className="font-mono text-[11px] tracking-[0.2em] uppercase">
                  {t(SECTION1.gridLabel)}
                </span>
                <span className="font-mono text-xs tabular-nums">13</span>
              </div>
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border sm:grid-cols-2">
                {DIRECTORY_NETWORK.map((site) => (
                  <DirectoryCell
                    key={site.domain}
                    site={site}
                    lang={lang}
                    record={drByDomain.get(site.domain) ?? null}
                  />
                ))}
              </div>
              <p className="text-muted-foreground/70 mt-4 text-xs">{t(SECTION1.drNote)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────── Section 02 — Authority story ───────────────── */}
      <section id="section-02" className="border-border/60 border-b">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <SectionEyebrow num={SECTION2.num} label={t(SECTION2.label)} align="right" />
          {/* Mirror layout: grid on the left, prose on the right for rhythm */}
          <div className="mt-10 grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            {/* Sites grid (first on lg for the mirror) */}
            <div className="lg:order-1">
              <div className="text-muted-foreground mb-5 flex items-baseline justify-between">
                <span className="font-mono text-[11px] tracking-[0.2em] uppercase">
                  {t(SECTION2.gridLabel)}
                </span>
                <span className="font-mono text-xs tabular-nums">26</span>
              </div>
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border sm:grid-cols-2">
                {AUTHORITY_NETWORK.map((site) => (
                  <AuthorityCell key={site.domain} site={site} lang={lang} />
                ))}
              </div>
            </div>

            {/* Prose column */}
            <div className="max-w-xl lg:order-2 lg:justify-self-end">
              <h2 className="font-editorial text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                {t(SECTION2.title)}
              </h2>
              <p className="text-foreground/90 first-letter:font-editorial mt-6 text-lg leading-relaxed first-letter:float-left first-letter:mr-3 first-letter:text-6xl first-letter:leading-[0.8] first-letter:font-semibold">
                {t(SECTION2.lede)}
              </p>
              <p className="text-muted-foreground mt-5 leading-relaxed">{t(SECTION2.body1)}</p>
              <p className="text-muted-foreground mt-5 leading-relaxed">{t(SECTION2.body2)}</p>
              <PullQuote text={t(SECTION2.pull)} />
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────── Bridge / interstitial ───────────────────── */}
      <section className="border-border/60 border-b">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
          <p className="font-editorial text-foreground/80 text-xl leading-relaxed text-balance sm:text-2xl">
            {t(BRIDGE)}
          </p>
        </div>
      </section>

      {/* ───────────────────────── The tiers ───────────────────────── */}
      <section className="border-border/60 border-b">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          {/* Promo */}
          {DIRECTORY_PROMO.enabled && (
            <div className="border-primary/30 from-primary/[0.07] mb-16 flex flex-col gap-4 rounded-2xl border bg-gradient-to-br to-transparent p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-primary mb-1 font-mono text-[11px] tracking-[0.2em] uppercase">
                  {t(UI.promo.label)}
                </p>
                <p className="font-editorial text-xl font-semibold tracking-tight">
                  {t(UI.promo.headline)}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">{t(UI.promo.subtext)}</p>
              </div>
              <div className="flex-shrink-0">
                <CopyPromoCode
                  code={DIRECTORY_PROMO.code}
                  copyLabel={t(UI.promo.copy)}
                  copiedLabel={t(UI.promo.copied)}
                />
              </div>
            </div>
          )}

          {/* Group one — Directory tiers */}
          <GroupHeader
            eyebrow={t(TIER_GROUPS.directory.eyebrow)}
            title={t(TIER_GROUPS.directory.title)}
            intro={t(TIER_GROUPS.directory.intro)}
          />
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {directoryTiers.map((tier) => (
              <TierCard key={tier.id} tier={tier} lang={lang} />
            ))}
          </div>

          {/* Group two — Directory + Authority */}
          <div className="mt-20">
            <GroupHeader
              eyebrow={t(TIER_GROUPS.authority.eyebrow)}
              title={t(TIER_GROUPS.authority.title)}
              intro={t(TIER_GROUPS.authority.intro)}
            />
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              {authorityTiers.map((tier) => (
                <TierCard key={tier.id} tier={tier} lang={lang} />
              ))}
            </div>
          </div>

          <p className="text-muted-foreground/80 mt-10 text-center text-xs leading-relaxed">
            {t(UI.priceNotice)}
          </p>
        </div>
      </section>

      {/* ───────────────────────────── FAQ ───────────────────────────── */}
      <section className="border-border/60 border-b">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
          <h2 className="font-editorial mb-10 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t(UI.faqHeading)}
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-border/60">
                <AccordionTrigger className="font-editorial py-5 text-left text-lg font-medium">
                  {t(item.q)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 text-[15px] leading-relaxed">
                  {t(item.a)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ───────────────────────── Footer CTA ───────────────────────── */}
      <section>
        <div className="mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
          <p className="text-primary mb-6 flex items-center justify-center gap-3 font-mono text-[11px] tracking-[0.25em] uppercase">
            <span className="bg-primary/40 inline-block h-px w-8" />
            {t(UI.footer.eyebrow)}
            <span className="bg-primary/40 inline-block h-px w-8" />
          </p>
          <h2 className="font-editorial mx-auto max-w-2xl text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            {t(UI.footer.heading)}
          </h2>
          <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg leading-relaxed">
            {t(UI.footer.body)}
          </p>
          <div className="mt-10">
            <Button size="lg" asChild className="h-12 px-8 text-base">
              <Link href="/dashboard">
                {t(UI.cta)}
                <RiArrowRightLine className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

// ─────────────────────────── Inline components ───────────────────────────

function SectionEyebrow({
  num,
  label,
  align = "left",
}: {
  num: string
  label: string
  align?: "left" | "right"
}) {
  return (
    <div
      className={`flex items-end gap-5 ${align === "right" ? "lg:flex-row-reverse lg:text-right" : ""}`}
    >
      <span
        aria-hidden
        className="font-editorial text-primary/20 text-7xl leading-none font-semibold tabular-nums select-none sm:text-8xl"
      >
        {num}
      </span>
      <p className="text-muted-foreground pb-2 font-mono text-[11px] tracking-[0.25em] uppercase">
        {label}
      </p>
    </div>
  )
}

function PullQuote({ text }: { text: string }) {
  return (
    <blockquote className="border-primary mt-10 border-l-2 pl-5">
      <RiDoubleQuotesL className="text-primary/40 mb-2 h-6 w-6" aria-hidden />
      <p className="font-editorial text-foreground text-xl leading-snug font-medium text-balance sm:text-2xl">
        {text}
      </p>
    </blockquote>
  )
}

function DirectoryCell({
  site,
  lang,
  record,
}: {
  site: DirectorySite
  lang: Lang
  record: DRRecord | null
}) {
  const drRecord: DRRecord = record ?? {
    domain: site.domain,
    dr: null,
    fetchedAt: null,
    isFresh: false,
  }
  return (
    <div className="bg-background hover:bg-muted/40 flex flex-col gap-2 p-4 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={site.href}
          target="_blank"
          rel="noopener"
          className="hover:text-primary font-editorial inline-flex items-center gap-1 text-[15px] font-semibold tracking-tight"
        >
          {site.brand}
          <RiArrowRightUpLine className="text-muted-foreground/50 h-3 w-3" />
        </Link>
        <DrBadge record={drRecord} size="sm" />
      </div>
      <p className="text-muted-foreground line-clamp-2 text-[13px] leading-relaxed">
        {site.tagline[lang]}
      </p>
      <div className="mt-auto flex flex-wrap gap-1 pt-1">
        {site.langs.map((l) => (
          <span
            key={l}
            className="border-border/70 text-muted-foreground rounded-full border px-2 py-0.5 font-mono text-[10px]"
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

function AuthorityCell({ site, lang }: { site: AuthoritySite; lang: Lang }) {
  return (
    <Link
      href={site.href}
      target="_blank"
      rel="noopener"
      className="bg-background hover:bg-muted/40 group flex items-baseline justify-between gap-3 p-3.5 transition-colors"
    >
      <span className="truncate font-mono text-[13px] font-medium">{site.domain}</span>
      <span className="text-muted-foreground group-hover:text-foreground flex-shrink-0 text-right text-[11px] transition-colors">
        {site.topic[lang]}
      </span>
    </Link>
  )
}

function GroupHeader({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-primary mb-3 font-mono text-[11px] tracking-[0.25em] uppercase">
        {eyebrow}
      </p>
      <h3 className="font-editorial text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h3>
      <p className="text-muted-foreground mt-3 leading-relaxed">{intro}</p>
    </div>
  )
}

function TierCard({ tier, lang }: { tier: TierDef; lang: Lang }) {
  return (
    <div
      className={`bg-card relative flex flex-col rounded-2xl border p-7 ${
        tier.featured ? "border-primary/60 ring-primary/15 shadow-sm ring-1" : "border-border"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-editorial text-2xl font-semibold tracking-tight">{tier.name}</span>
        {tier.badge && (
          <span className="bg-primary/10 text-primary border-primary/20 rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-wide uppercase">
            {tier.badge[lang]}
          </span>
        )}
      </div>
      <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{tier.tagline[lang]}</p>

      <div className="mt-6 flex items-baseline gap-2.5">
        <span className="font-editorial text-4xl font-semibold tracking-tight tabular-nums">
          {tier.price}
        </span>
        {tier.original && (
          <span className="text-muted-foreground/70 text-base tabular-nums line-through">
            {tier.original}
          </span>
        )}
      </div>
      <p className="text-muted-foreground/80 mt-1.5 font-mono text-[11px] tracking-wide uppercase">
        {UI.oneTime[lang]}
      </p>

      <div className="border-border/60 mt-6 border-t pt-5">
        <p className="text-muted-foreground font-mono text-[10px] tracking-[0.2em] uppercase">
          {UI.reachLabel[lang]}
        </p>
        <p className="mt-1.5 text-sm font-medium">{tier.reach[lang]}</p>
      </div>

      <ul className="mt-5 flex-1 space-y-3 text-sm">
        {tier.features.map((f) => (
          <li key={f.en} className="flex items-start gap-2.5">
            <RiCheckLine className="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
            <span className="text-foreground/90 leading-relaxed">{f[lang]}</span>
          </li>
        ))}
      </ul>

      <Button asChild variant={tier.featured ? "default" : "outline"} className="mt-7 w-full">
        <Link href="/dashboard">{UI.ctaTier[lang]}</Link>
      </Button>
    </div>
  )
}
