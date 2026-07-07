import type { Metadata } from "next"
import Image from "next/image"

import { Link } from "@/i18n/navigation"
import {
  RiArrowRightLine,
  RiCodeLine,
  RiDashboardLine,
  RiKey2Line,
  RiRobot2Line,
  RiShieldCheckLine,
  RiSparkling2Line,
  RiTimeLine,
} from "@remixicon/react"
import { setRequestLocale } from "next-intl/server"

import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import { skillPublicationSites } from "@/lib/skill-sites"
import { Button } from "@/components/ui/button"

type Lang = "en" | "zh"
type L = { en: string; zh: string }

const PATH = "/skill/free-directory-submission"
const sites = skillPublicationSites()

function langOf(locale: string): Lang {
  return locale.startsWith("zh") ? "zh" : "en"
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
  eyebrow: { en: "Skill-driven free distribution", zh: "Skill 驱动的免费分发" },
  name: { en: "AAT Free Directory Submission", zh: "AAT 免费导航站提交" },
  headline: {
    en: "Your agent writes the listings. aat.ee handles the slow, safe rollout.",
    zh: "你的 Agent 生成收录文案，aat.ee 负责缓慢、安全地分发。",
  },
  body: {
    en: "Verify ownership once, submit 12 differentiated variants, then watch the free nofollow queue publish across our navigation receivers with canary checks, quotas, and takedown controls.",
    zh: "一次验证域名，提交 12 个差异化版本，然后由免费 nofollow 队列分批发布到我们的导航站，并带有 canary 复查、配额和下架控制。",
  },
  primary: { en: "Create API key", zh: "创建 API Key" },
  secondary: { en: "Read the flow", zh: "查看流程" },
}

const STATS: Array<{ value: string; label: L }> = [
  { value: "12", label: { en: "owned receiver sites", zh: "自有导航站" } },
  { value: "2", label: { en: "canary pages first", zh: "首批 canary 页面" } },
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
    title: { en: "Mint a Skill API key", zh: "生成 Skill API Key" },
    body: {
      en: "Keys are per-user, revocable, and tracked from the dashboard.",
      zh: "每个 key 绑定用户，可撤销，并在 dashboard 中管理。",
    },
  },
  {
    icon: RiShieldCheckLine,
    title: { en: "Verify the domain", zh: "验证域名所有权" },
    body: {
      en: "Use HTML file, DNS TXT, or homepage meta tag before any submit is accepted.",
      zh: "可用 HTML 文件、DNS TXT 或首页 meta 标签；未验证域名无法提交。",
    },
  },
  {
    icon: RiRobot2Line,
    title: { en: "Generate 12 variants", zh: "生成 12 个版本" },
    body: {
      en: "Your Claude Code, Codex, or opencode skill writes one differentiated listing per receiver.",
      zh: "你的 Claude Code、Codex 或 opencode Skill 为每个站点写一版差异化文案。",
    },
  },
  {
    icon: RiTimeLine,
    title: { en: "Queue the nofollow rollout", zh: "进入 nofollow 队列" },
    body: {
      en: "Two canaries publish first; later batches wait for AI re-check and the global free budget.",
      zh: "先发 2 个 canary；后续批次等待 AI 复查和全局免费额度。",
    },
  },
]

const SAFETY: Array<{ title: L; body: L }> = [
  {
    title: { en: "Domain ownership gate", zh: "域名所有权硬门槛" },
    body: {
      en: "Submissions must match a verified account-domain pair.",
      zh: "提交域名必须匹配当前账号已验证的域名。",
    },
  },
  {
    title: { en: "Similarity guard", zh: "相似度守卫" },
    body: {
      en: "Near-identical bodies are rejected before queueing.",
      zh: "近似重复的 12 版内容会在入队前被拒绝。",
    },
  },
  {
    title: { en: "AI abuse review", zh: "AI 风险审查" },
    body: {
      en: "Spam, scams, adult, gambling, illegal, malware, and impersonation are blocked.",
      zh: "垃圾、诈骗、成人、博彩、违法、恶意软件和冒充类内容会被拦截。",
    },
  },
  {
    title: { en: "Automatic takedown", zh: "自动下架" },
    body: {
      en: "If canary pages fail the live check, sent listings are unpublished and the rollout stops.",
      zh: "如果 canary 页面复查失败，已发布页面会被下架，后续分发停止。",
    },
  },
]

const COMPARISON: Array<{ label: L; free: L; paid: L }> = [
  {
    label: { en: "Link attribute", zh: "链接属性" },
    free: { en: "nofollow", zh: "nofollow" },
    paid: { en: "dofollow", zh: "dofollow" },
  },
  {
    label: { en: "Who writes copy", zh: "文案来源" },
    free: { en: "your agent", zh: "你的 Agent" },
    paid: { en: "aat.ee", zh: "aat.ee" },
  },
  {
    label: { en: "Speed", zh: "速度" },
    free: { en: "slow global queue", zh: "慢速全局队列" },
    paid: { en: "priority rollout", zh: "优先分发" },
  },
  {
    label: { en: "Best for", zh: "适合" },
    free: { en: "cold-start makers", zh: "冷启动项目" },
    paid: { en: "SEO campaigns", zh: "SEO 推广" },
  },
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
    alternates: buildLocaleAlternates(PATH, locale),
    openGraph: {
      title: META.title[lang],
      description: META.description[lang],
      ...buildLocaleOpenGraph(PATH, locale),
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

  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="relative isolate min-h-[calc(88svh-4rem)] overflow-hidden border-b">
        <Image
          src="/og.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-20 grayscale dark:opacity-15"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--background))_0%,hsl(var(--background)/0.94)_38%,hsl(var(--background)/0.72)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(0deg,hsl(var(--background))_0%,transparent_100%)]" />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)] lg:items-center lg:pt-24">
          <div className="max-w-3xl">
            <p className="text-primary mb-5 flex items-center gap-3 font-mono text-[11px] tracking-[0.24em] uppercase">
              <span className="bg-primary inline-block h-px w-8" />
              {t(HERO.eyebrow)}
            </p>
            <h1 className="font-editorial text-4xl leading-[1.04] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              {t(HERO.name)}
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed font-medium text-pretty sm:text-2xl">
              {t(HERO.headline)}
            </p>
            <p className="text-muted-foreground mt-5 max-w-2xl text-base leading-relaxed sm:text-lg">
              {t(HERO.body)}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11">
                <Link href="/dashboard">
                  <RiDashboardLine className="h-4 w-4" />
                  {t(HERO.primary)}
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-11">
                <a href="#flow">
                  {t(HERO.secondary)}
                  <RiArrowRightLine className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          <div className="relative lg:justify-self-end">
            <div className="border-border/70 grid min-h-[430px] max-w-[520px] grid-rows-[auto_1fr_auto] overflow-hidden rounded-lg border bg-[#11110f] text-white shadow-2xs">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <span className="font-mono text-[11px] text-white/50">skill-run.json</span>
              </div>

              <div className="grid grid-cols-3 gap-px p-3">
                {sites.map((site, index) => (
                  <div
                    key={site.site}
                    className="min-h-20 border border-white/10 bg-white/[0.035] p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[11px] text-white/88">
                        {site.site}
                      </span>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          index < 2 ? "bg-amber-300" : index < 5 ? "bg-emerald-300" : "bg-white/35"
                        }`}
                      />
                    </div>
                    <p className="mt-2 truncate text-[11px] text-white/45">{site.domain}</p>
                    <p className="mt-3 font-mono text-[10px] text-white/35">
                      day {index < 2 ? 1 : 2 + Math.floor((index - 2) / 3)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/10 p-4 font-mono text-[11px] leading-relaxed text-white/58">
                <p>
                  <span className="text-emerald-300">verified</span> domain ownership
                </p>
                <p>
                  <span className="text-amber-300">queued</span> 2 canaries before rollout
                </p>
                <p>
                  <span className="text-white">rel</span> nofollow · global cap 10/day
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="border-b">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 py-10 sm:px-6 md:grid-cols-4">
          {STATS.map((item) => (
            <div key={item.value} className="border-border/60 min-h-28 border p-5">
              <p className="font-editorial text-3xl font-semibold tracking-tight">{item.value}</p>
              <p className="text-muted-foreground mt-2 text-sm">{t(item.label)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="flow" className="scroll-mt-20 border-b">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionHeader
            eyebrow={lang === "zh" ? "工作流" : "Workflow"}
            title={
              lang === "zh" ? "从 API key 到 12 站排队发布" : "From API key to a 12-site queue"
            }
            body={
              lang === "zh"
                ? "这个 Skill 不是简单表单。它把域名验证、用户生成文案、服务端审核、canary 发布和慢速队列串成一个可追踪流程。"
                : "This Skill is not a form wrapper. It coordinates ownership proof, agent-written copy, server review, canary publication, and a trackable slow queue."
            }
          />

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-4">
            {FLOW.map((step, index) => {
              const Icon = step.icon
              return (
                <div
                  key={step.title.en}
                  className="border-border bg-card min-h-64 rounded-lg border p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="text-primary h-5 w-5" />
                    <span className="text-muted-foreground font-mono text-xs">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="font-editorial mt-8 text-xl font-semibold tracking-tight">
                    {t(step.title)}
                  </h3>
                  <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                    {t(step.body)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <SectionHeader
            eyebrow={lang === "zh" ? "目标站点" : "Receivers"}
            title={
              lang === "zh"
                ? "明确 allowlist，不碰文档权威站"
                : "Explicit allowlist, not authority docs"
            }
            body={
              lang === "zh"
                ? "Skill 免费通道只发布到 12 个导航 receiver。mariadb、valkey、debian 等权威文档站不在这个队列里。"
                : "The free Skill channel publishes only to 12 navigation receivers. Authority documentation sites such as mariadb, valkey, and debian are not part of this queue."
            }
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sites.map((site, index) => (
              <div
                key={site.site}
                className="border-border bg-background flex min-h-20 items-center justify-between gap-4 rounded-md border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{site.name}</p>
                  <p className="text-muted-foreground mt-1 truncate text-xs">{site.domain}</p>
                </div>
                <span className="bg-muted text-muted-foreground rounded-md px-2 py-1 font-mono text-[11px]">
                  D{index < 2 ? 1 : 2 + Math.floor((index - 2) / 3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <SectionHeader
              eyebrow={lang === "zh" ? "API 契约" : "API contract"}
              title={lang === "zh" ? "可被 Agent 稳定调用" : "Stable enough for coding agents"}
              body={
                lang === "zh"
                  ? "Skill 文件使用普通 HTTP API：注册域名、确认验证、提交 12 个 variants、轮询公开 noindex 状态页。"
                  : "The Skill uses plain HTTP endpoints: register a domain, confirm verification, submit 12 variants, and poll the public noindex status URL."
              }
            />
            <div className="mt-8 overflow-hidden rounded-lg border bg-[#11110f] text-white">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <RiCodeLine className="h-4 w-4 text-emerald-300" />
                <span className="font-mono text-xs text-white/55">submit.sh</span>
              </div>
              <pre className="overflow-x-auto p-5 text-[12px] leading-relaxed text-white/78">
                <code>{CODE}</code>
              </pre>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {SAFETY.map((item) => (
              <div key={item.title.en} className="border-border rounded-lg border p-5">
                <div className="flex items-start gap-3">
                  <RiShieldCheckLine className="text-primary mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium">{t(item.title)}</h3>
                    <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                      {t(item.body)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionHeader
            eyebrow={lang === "zh" ? "免费 vs 付费" : "Free vs paid"}
            title={
              lang === "zh"
                ? "免费通道不会替代付费分发"
                : "The free channel does not replace paid distribution"
            }
            body={
              lang === "zh"
                ? "免费 Skill 是慢速、nofollow、用户自己写文案。需要 dofollow、速度和 aat.ee 代写时，仍然走付费目录分发。"
                : "The free Skill is slow, nofollow, and user-written. Paid syndication remains the path for dofollow links, speed, and copy written by aat.ee."
            }
          />

          <div className="mt-10 overflow-hidden rounded-lg border">
            <div className="bg-muted/50 grid grid-cols-[1fr_1fr_1fr] border-b px-4 py-3 text-sm font-medium">
              <span>{lang === "zh" ? "维度" : "Dimension"}</span>
              <span>{lang === "zh" ? "免费 Skill" : "Free Skill"}</span>
              <span>{lang === "zh" ? "付费分发" : "Paid"}</span>
            </div>
            {COMPARISON.map((row) => (
              <div
                key={row.label.en}
                className="grid min-h-16 grid-cols-[1fr_1fr_1fr] items-center border-b px-4 py-3 text-sm last:border-b-0"
              >
                <span className="font-medium">{t(row.label)}</span>
                <span className="text-muted-foreground">{t(row.free)}</span>
                <span className="text-muted-foreground">{t(row.paid)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-primary mb-4 font-mono text-[11px] tracking-[0.24em] uppercase">
              {lang === "zh" ? "开始使用" : "Get started"}
            </p>
            <h2 className="font-editorial text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
              {lang === "zh"
                ? "让你的 Agent 今天就排队。"
                : "Put your agent in the publication queue today."}
            </h2>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row lg:justify-end">
            <Button asChild size="lg" className="h-11">
              <Link href="/dashboard">
                <RiKey2Line className="h-4 w-4" />
                {lang === "zh" ? "去 Dashboard 创建 Key" : "Create key in Dashboard"}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11">
              <Link href="/pricing">
                <RiSparkling2Line className="h-4 w-4" />
                {lang === "zh" ? "查看付费分发" : "See paid syndication"}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

function SectionHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-primary mb-3 font-mono text-[11px] tracking-[0.24em] uppercase">
        {eyebrow}
      </p>
      <h2 className="font-editorial text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      <p className="text-muted-foreground mt-4 leading-relaxed text-pretty">{body}</p>
    </div>
  )
}
