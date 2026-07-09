import type { Metadata } from "next"

import { Link } from "@/i18n/navigation"
import {
  RiArrowRightLine,
  RiCheckLine,
  RiCodeLine,
  RiDashboardLine,
  RiKey2Line,
  RiRobot2Line,
  RiShieldCheckLine,
  RiSparkling2Line,
  RiTimeLine,
} from "@remixicon/react"
import { setRequestLocale } from "next-intl/server"

import { buildLocaleCanonical, ogLocaleFor } from "@/lib/i18n-metadata"
import { buildSkillPublicationSchedule } from "@/lib/skill-sites"
import { getDRBatch } from "@/lib/dr"
import { Button } from "@/components/ui/button"
import { DrBadge } from "@/components/dr/dr-badge"

type Lang = "en" | "zh"
type L = { en: string; zh: string }

const PATH = "/skill/free-directory-submission"
const DASHBOARD_SKILL_KEYS_HREF = "/dashboard#skill-api-keys"

function langOf(locale: string): Lang {
  return locale.startsWith("zh") ? "zh" : "en"
}

function buildSkillAlternates(locale: string): Metadata["alternates"] {
  const enUrl = buildLocaleCanonical(PATH, "en")
  const zhUrl = buildLocaleCanonical(PATH, "zh")
  const canonical = langOf(locale) === "zh" ? zhUrl : enUrl

  return {
    canonical,
    languages: {
      en: enUrl,
      zh: zhUrl,
      "x-default": enUrl,
    },
  }
}

function buildSkillOpenGraph(locale: string) {
  const contentLocale = langOf(locale)
  return {
    locale: ogLocaleFor(contentLocale),
    alternateLocale: [ogLocaleFor(contentLocale === "zh" ? "en" : "zh")],
    url: buildLocaleCanonical(PATH, contentLocale),
  }
}

const META: { title: L; description: L } = {
  title: {
    en: "AAT Free Directory Submission Skill",
    zh: "AAT 免费导航站提交 Skill",
  },
  description: {
    en: "Use your coding agent to verify a domain, generate 12 differentiated nofollow directory variants, and queue a slow free rollout across aat.ee's owned navigation sites.",
    zh: "用你的编码 Agent 验证域名、生成 12 个差异化 nofollow 导航站文案，并排队发布到 aat.ee 自有导航站网络。",
  },
}

const HERO = {
  eyebrow: { en: "Skill-driven free distribution", zh: "Skill 驱动的免费分发" } as L,
  headline: {
    en: "Your agent writes the listings. aat.ee ships them slowly and safely.",
    zh: "你的 Agent 写文案，aat.ee 慢速、安全地分发。",
  } as L,
  body: {
    en: "Verify ownership once, queue 12 nofollow variants across our navigation receivers, with canary checks and a daily free cap.",
    zh: "一次验证域名，把 12 个 nofollow 版本排队发布到我们的导航站，并带有灰度页复查和每日免费上限。",
  } as L,
  primary: { en: "Create API key", zh: "创建 API Key" } as L,
  secondary: { en: "See the flow", zh: "查看流程" } as L,
}

const STATS: Array<{ value: string; label: L }> = [
  { value: "12", label: { en: "owned receivers", zh: "自有导航站" } },
  { value: "2", label: { en: "canaries first", zh: "首批灰度页" } },
  { value: "10/day", label: { en: "global free cap", zh: "全局免费日上限" } },
  { value: "0", label: { en: "dofollow claims", zh: "dofollow 承诺" } },
]

const FLOW: Array<{
  icon: React.ComponentType<{ className?: string }>
  title: L
  body: L
}> = [
  {
    icon: RiKey2Line,
    title: { en: "Mint a Skill API key", zh: "生成 Skill API Key" } as L,
    body: {
      en: "Per-user, revocable, tracked from your dashboard.",
      zh: "每个 key 绑定用户，可撤销，在 dashboard 中管理。",
    } as L,
  },
  {
    icon: RiShieldCheckLine,
    title: { en: "Verify the domain", zh: "验证域名所有权" } as L,
    body: {
      en: "HTML file, DNS TXT, or homepage meta tag. Unverified domains cannot submit.",
      zh: "可用 HTML 文件、DNS TXT 或首页 meta 标签；未验证域名无法提交。",
    } as L,
  },
  {
    icon: RiRobot2Line,
    title: { en: "Generate 12 variants", zh: "生成 12 个版本" } as L,
    body: {
      en: "Your Claude Code, Codex, or opencode skill writes one differentiated listing per receiver.",
      zh: "你的 Claude Code、Codex 或 opencode Skill 为每个站点写一版差异化文案。",
    } as L,
  },
  {
    icon: RiTimeLine,
    title: { en: "Queue the nofollow rollout", zh: "进入 nofollow 队列" } as L,
    body: {
      en: "Two canaries first; later batches wait for AI re-check and the daily free budget.",
      zh: "先发 2 个灰度页；后续批次等待 AI 复查和每日免费额度。",
    } as L,
  },
]

const SAFETY: Array<{ title: L; body: L }> = [
  {
    title: { en: "Domain ownership gate", zh: "域名所有权硬门槛" } as L,
    body: { en: "Must match a verified account–domain pair.", zh: "必须匹配已验证的域名。" } as L,
  },
  {
    title: { en: "Similarity guard", zh: "相似度守卫" } as L,
    body: { en: "Near-identical bodies are rejected before queueing.", zh: "近似重复版本入队前被拒绝。" } as L,
  },
  {
    title: { en: "AI abuse review", zh: "AI 风险审查" } as L,
    body: {
      en: "Spam, scams, adult, gambling, illegal, malware, impersonation blocked.",
      zh: "垃圾、诈骗、成人、博彩、违法、恶意软件、冒充会被拦截。",
    } as L,
  },
  {
    title: { en: "Automatic takedown", zh: "自动下架" } as L,
    body: {
      en: "If canaries fail the live check, sent listings are unpublished and the rollout stops.",
      zh: "灰度复查失败，已发布页面下架，后续分发停止。",
    } as L,
  },
]

const COMPARE_FREE: L[] = [
  { en: "nofollow links", zh: "nofollow 链接" } as L,
  { en: "your agent writes copy", zh: "你的 Agent 写文案" } as L,
  { en: "slow global queue", zh: "慢速全局队列" } as L,
  { en: "canary + takedown safety", zh: "灰度 + 下架安全" } as L,
  { en: "best for cold-start makers", zh: "适合冷启动项目" } as L,
]

const COMPARE_PAID: L[] = [
  { en: "dofollow links", zh: "dofollow 链接" } as L,
  { en: "aat.ee writes the copy", zh: "aat.ee 代写文案" } as L,
  { en: "priority rollout", zh: "优先分发" } as L,
  { en: "dedicated placement", zh: "独立投放" } as L,
  { en: "best for SEO campaigns", zh: "适合 SEO 推广" } as L,
]

const CODE = `curl -sS -X POST "https://www.aat.ee/api/skill/submit" \\
  -H "Authorization: Bearer $AAT_SKILL_API_KEY" \\
  -H "Content-Type: application/json" \\
  --data @submission.json`

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const lang = langOf(locale)
  return {
    title: META.title[lang],
    description: META.description[lang],
    alternates: buildSkillAlternates(locale),
    openGraph: {
      title: META.title[lang],
      description: META.description[lang],
      ...buildSkillOpenGraph(locale),
      siteName: "aat.ee",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: META.title[lang] }],
    },
    twitter: {
      card: "summary_large_image",
      title: META.title[lang],
      description: META.description[lang],
      images: ["/og.png"],
    },
  }
}

export default async function FreeDirectorySubmissionSkillPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const lang = langOf(locale)
  const t = (value: L) => value[lang]

  const schedule = buildSkillPublicationSchedule()
  // Group sites by rollout day.
  const dayMap = new Map<number, typeof schedule>()
  for (const row of schedule) {
    const list = dayMap.get(row.batchDay) ?? []
    list.push(row)
    dayMap.set(row.batchDay, list)
  }
  const days = Array.from(dayMap.entries()).sort((a, b) => a[0] - b[0])

  // Pull DR for every receiver domain from the build-time
  // directories-links snapshot (see lib/dr.ts → drByDomain).
  const domains = schedule.map((s) => s.domain)
  const drRecords = await getDRBatch(domains)
  const drByDomain = new Map(drRecords.map((r) => [r.domain, r]))

  const toc = [
    { id: "flow", label: lang === "zh" ? "工作流" : "Workflow" },
    { id: "receivers", label: lang === "zh" ? "目标站点" : "Receivers" },
    { id: "api", label: lang === "zh" ? "API 契约" : "API & Safety" },
    { id: "compare", label: lang === "zh" ? "免费 vs 付费" : "Free vs Paid" },
  ]

  const splitHL = (headline: string) =>
    headline
      .split(/(aat\.ee)/)
      .map((part, i) =>
        part === "aat.ee" ? (
          <span key={i} className="text-primary">
            aat.ee
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )

  return (
    <div className="bg-background text-foreground">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="border-b">
        <div className="mx-auto max-w-5xl px-4 pt-20 pb-16 sm:px-6">
          <p className="text-primary mb-6 flex items-center gap-3 font-mono text-[11px] tracking-[0.24em] uppercase">
            <span className="bg-primary inline-block h-px w-8" />
            {t(HERO.eyebrow)}
          </p>
          <h1 className="font-editorial text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            {splitHL(t(HERO.headline))}
          </h1>
          <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
            {t(HERO.body)}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11">
              <Link href={DASHBOARD_SKILL_KEYS_HREF}>
                <RiDashboardLine className="h-4 w-4" />
                {t(HERO.primary)}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11">
              <a href="#flow">{t(HERO.secondary)}</a>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Stats rail ───────────────────────────────────────── */}
      <section className="border-b">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-y-8 px-4 py-12 sm:px-6 md:grid-cols-4 md:border-t md:border-border/40">
          {STATS.map((s) => (
            <div key={s.value} className="md:border-l md:border-border/40 md:px-6 md:first:border-l-0">
              <p className="font-editorial text-3xl font-semibold tracking-tight">{s.value}</p>
              <p className="text-muted-foreground mt-1 text-sm">{t(s.label)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Docs split: sticky TOC + content ─────────────────── */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[180px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-muted-foreground mb-3 font-mono text-[11px] tracking-[0.18em] uppercase">
            {lang === "zh" ? "目录" : "On this page"}
          </p>
          <nav className="space-y-1 text-sm">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="text-muted-foreground hover:text-foreground block py-1 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-16 lg:space-y-20">
          {/* Flow */}
          <section id="flow" className="scroll-mt-24">
            <div className="border-border/40 border-b pb-5">
              <p className="text-primary font-mono text-[11px] tracking-[0.18em] uppercase">
                {lang === "zh" ? "工作流" : "Workflow"}
              </p>
              <h2 className="font-editorial mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {lang === "zh" ? "从 API key 到 12 站排队发布" : "From API key to a 12-site queue"}
              </h2>
              <p className="text-muted-foreground mt-3 max-w-xl leading-relaxed">
                {lang === "zh"
                  ? "这个 Skill 不是简单表单。它把域名验证、Agent 文案、服务端审核、灰度发布与慢速队列串成一个可追踪流程。"
                  : "Not a form wrapper. Coordinates ownership proof, agent copy, server review, canary publication, and a trackable slow queue."}
              </p>
            </div>
            <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FLOW.map((step, i) => {
                const Icon = step.icon
                return (
                  <li key={step.title.en} className="border-border/60 bg-card rounded-lg border p-5">
                    <div className="flex items-center justify-between">
                      <Icon className="text-primary h-5 w-5" />
                      <span className="text-muted-foreground/50 font-mono text-xs">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="font-editorial mt-6 text-lg font-semibold tracking-tight">
                      {t(step.title)}
                    </h3>
                    <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                      {t(step.body)}
                    </p>
                  </li>
                )
              })}
            </ol>
          </section>

          {/* Receivers — domain + DR */}
          <section id="receivers" className="scroll-mt-24">
            <div className="border-border/40 border-b pb-5">
              <p className="text-primary font-mono text-[11px] tracking-[0.18em] uppercase">
                {lang === "zh" ? "目标站点" : "Receivers"}
              </p>
              <h2 className="font-editorial mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {lang === "zh" ? "明确白名单，不碰文档权威站" : "Explicit allowlist, not authority docs"}
              </h2>
              <p className="text-muted-foreground mt-3 max-w-xl leading-relaxed">
                {lang === "zh"
                  ? "免费通道只发布到这 12 个自有导航站点。mariadb、valkey、debian 等文档权威站不在此队列。"
                  : "The free channel publishes only to these 12 owned navigation receivers. Authority docs such as mariadb, valkey, debian are not part of this queue."}
              </p>
            </div>

            <div className="mt-8 overflow-hidden rounded-lg border">
              {/* Header row */}
              <div className="bg-muted/50 grid grid-cols-[5rem_1fr] items-center border-b px-4 py-2.5 sm:grid-cols-[5rem_1fr_8rem]">
                <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
                  {lang === "zh" ? "批次" : "Day"}
                </span>
                <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
                  {lang === "zh" ? "域名 + DR" : "Domain + DR"}
                </span>
                <span className="text-muted-foreground hidden font-mono text-[11px] tracking-wider uppercase sm:block">
                  {lang === "zh" ? "阶段" : "Phase"}
                </span>
              </div>
              {/* Day rows */}
              <ul className="divide-y">
                {days.map(([day, rows]) => (
                  <li
                    key={day}
                    className="grid grid-cols-[5rem_1fr] items-start gap-y-3 px-4 py-4 sm:grid-cols-[5rem_1fr_8rem] sm:items-center"
                  >
                    <span className="font-mono text-sm text-muted-foreground">
                      {lang === "zh" ? `第 ${day} 天` : `Day ${day}`}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {rows.map((row) => {
                        const rec = drByDomain.get(row.domain)
                        if (!rec) {
                          return (
                            <span key={row.domain} className="font-mono text-sm">
                              {row.domain} · DR —
                            </span>
                          )
                        }
                        return <DrBadge key={row.domain} record={rec} size="sm" />
                      })}
                    </div>
                    <span
                      className={`font-mono text-[11px] sm:text-right sm:self-center ${
                        day === 1 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                      }`}
                    >
                      {day === 1
                        ? lang === "zh"
                          ? "灰度先发"
                          : "canary"
                        : lang === "zh"
                          ? "批量发布"
                          : "rollout"}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="bg-muted/30 grid grid-cols-[5rem_1fr] gap-y-1 px-4 py-2.5 font-mono text-[11px] text-muted-foreground sm:grid-cols-[5rem_1fr_8rem]">
                <span>12</span>
                <span>{lang === "zh" ? "总数 · nofollow · 全局 10/天" : "total · nofollow · cap 10/day"}</span>
                <span />
              </div>
            </div>
          </section>

          {/* API + Safety */}
          <section id="api" className="scroll-mt-24">
            <div className="border-border/40 border-b pb-5">
              <p className="text-primary font-mono text-[11px] tracking-[0.18em] uppercase">
                {lang === "zh" ? "API 契约" : "API contract"}
              </p>
              <h2 className="font-editorial mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {lang === "zh" ? "可被 Agent 稳定调用" : "Stable enough for coding agents"}
              </h2>
              <p className="text-muted-foreground mt-3 max-w-xl leading-relaxed">
                {lang === "zh"
                  ? "Skill 使用普通 HTTP 端点：注册域名、确认验证、提交 12 个 variants、轮询公开 noindex 状态页。"
                  : "The Skill uses plain HTTP endpoints: register a domain, confirm verification, submit 12 variants, poll the public noindex status URL."}
              </p>
            </div>

            <div className="mt-8 overflow-hidden rounded-lg border bg-[#0c0c0a] text-white">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <RiCodeLine className="h-4 w-4 text-emerald-300" />
                <span className="font-mono text-xs text-white/55">submit.sh</span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[12px] leading-relaxed text-white/78">
                <code>{CODE}</code>
              </pre>
            </div>

            <h3 className="font-editorial mt-10 text-xl font-semibold tracking-tight">
              {lang === "zh" ? "四道安全闸" : "Four safety gates"}
            </h3>
            <ul className="mt-5 divide-y border-t">
              {SAFETY.map((item) => (
                <li key={item.title.en} className="flex items-start gap-3 py-5">
                  <RiShieldCheckLine className="text-primary mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{t(item.title)}</p>
                    <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{t(item.body)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Free vs Paid */}
          <section id="compare" className="scroll-mt-24">
            <div className="border-border/40 border-b pb-5">
              <p className="text-primary font-mono text-[11px] tracking-[0.18em] uppercase">
                {lang === "zh" ? "免费 vs 付费" : "Free vs paid"}
              </p>
              <h2 className="font-editorial mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {lang === "zh" ? "免费通道不替代付费分发" : "The free channel does not replace paid distribution"}
              </h2>
              <p className="text-muted-foreground mt-3 max-w-xl leading-relaxed">
                {lang === "zh"
                  ? "免费 Skill 是慢速、nofollow、用户自己写文案。需 dofollow、速度与 aat.ee 代写时仍走付费目录分发。"
                  : "The free Skill is slow, nofollow, and user-written. Paid syndication remains the path for dofollow links, speed, and copy written by aat.ee."}
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <article className="border-primary/40 bg-primary/[0.04] rounded-2xl border-2 p-6">
                <header className="flex items-center justify-between">
                  <h3 className="font-editorial text-lg font-semibold tracking-tight">
                    {lang === "zh" ? "免费 Skill" : "Free Skill"}
                  </h3>
                  <span className="text-primary rounded-full border border-dashed px-2.5 py-0.5 font-mono text-[11px] tracking-wider uppercase">
                    {lang === "zh" ? "本页" : "this page"}
                  </span>
                </header>
                <ul className="mt-5 space-y-2.5">
                  {COMPARE_FREE.map((item) => (
                    <li key={item.en} className="flex items-start gap-3 text-sm">
                      <RiCheckLine className="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{t(item)}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="mt-6 w-full">
                  <Link href={DASHBOARD_SKILL_KEYS_HREF}>
                    <RiKey2Line className="h-4 w-4" />
                    {lang === "zh" ? "创建 API Key" : "Create API key"}
                  </Link>
                </Button>
              </article>

              <article className="border-border bg-card rounded-2xl border p-6">
                <header className="flex items-center justify-between">
                  <h3 className="font-editorial text-lg font-semibold tracking-tight">
                    {lang === "zh" ? "付费分发" : "Paid syndication"}
                  </h3>
                  <span className="text-muted-foreground rounded-full border px-2.5 py-0.5 font-mono text-[11px] tracking-wider uppercase">
                    {lang === "zh" ? "另一通道" : "separate"}
                  </span>
                </header>
                <ul className="mt-5 space-y-2.5">
                  {COMPARE_PAID.map((item) => (
                    <li key={item.en} className="flex items-start gap-3 text-sm">
                      <RiCheckLine className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span className="text-muted-foreground">{t(item)}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="ghost" className="mt-6 w-full">
                  <Link href="/pricing">
                    <RiSparkling2Line className="h-4 w-4" />
                    {lang === "zh" ? "查看付费分发" : "See paid syndication"}
                  </Link>
                </Button>
              </article>
            </div>
          </section>

          {/* Final CTA */}
          <section>
            <h2 className="font-editorial text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {lang === "zh" ? "让你的 Agent 今天就进队。" : "Put your agent in the publication queue today."}
            </h2>
            <div className="mt-6">
              <Button asChild size="lg" className="h-12">
                <Link href={DASHBOARD_SKILL_KEYS_HREF}>
                  {lang === "zh" ? "去 Dashboard 创建 Key" : "Create key in Dashboard"}
                  <RiArrowRightLine className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
