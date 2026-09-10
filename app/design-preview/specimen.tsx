import * as React from "react"

import { PillButton } from "@/components/ds/pill-button"
import { RankBadge } from "@/components/ds/rank-badge"
import { SerifHeading } from "@/components/ds/serif-heading"
import { SoftCard } from "@/components/ds/soft-card"
import { StatPill } from "@/components/ds/stat-pill"
import { TagPill } from "@/components/ds/tag-pill"

/**
 * Specimen board for the home v2 design system.
 *
 * This is the single source of truth for "what the new home page looks like":
 * the in-app route (`/design-preview`) and the offline static export
 * (`bun run design:preview`) both render THIS component, so the reviewed
 * artifact can never drift from the shipped components.
 *
 * The palette id is exported so the export script can screenshot one board per
 * palette instead of emitting a single 20k-pixel-tall image.
 *
 * Everything here is static markup — no DB, no i18n, no images — which is what
 * makes the offline export possible.
 */

export interface HomePalette {
  id: "orange" | "green" | "green-orange" | "orange-green"
  label: string
  title: string
  note: string
  ratio: string
}

/**
 * Palette options. The ids map 1:1 to the `[data-home-palette="…"]` blocks in
 * app/globals.css; the contrast figures are measured, not estimated (see the
 * scripted table in the same file).
 *
 * `orange-green` is FIRST because it is the shipped default — the others are
 * kept as reviewable alternatives, not as dead code.
 */
export const HOME_PALETTES: HomePalette[] = [
  {
    id: "orange-green",
    label: "Orange + Green ★",
    title: "橙主 + 绿点缀（已选定 = 默认色板）",
    note: "CTA、按钮、排名沿用参考图的橙；评论数、票数、标签、博客封面用品牌绿。不挂 data-home-palette 属性时渲染的就是这一套。",
    ratio: "橙 CTA 3.01:1（AA 大字号）· 绿胶囊文字 6.02:1（AA）",
  },
  {
    id: "green-orange",
    label: "Green + Orange",
    title: "绿主 + 橙点缀",
    note: "反向组合：CTA、按钮、排名用绿，暖色胶囊用橙。全部达 AA，但 CTA 会与导航/旧按钮撞色。",
    ratio: "绿 CTA 4.79:1（AA）· 橙胶囊文字 4.90:1（AA）",
  },
  {
    id: "green",
    label: "Green",
    title: "纯绿（品牌同族）",
    note: "主次色同为 emerald 族，信息层级最平，但和现有品牌资产完全一致。",
    ratio: "浅色 CTA 白字 4.79:1（AA）· 深色 7.39:1（AAA）",
  },
  {
    id: "orange",
    label: "Orange",
    title: "纯橙（参考图原色）",
    note: "最贴近 uneed，但绿色品牌完全缺席。",
    ratio: "浅色 CTA 白字 3.01:1（AA 大字号）· 深色 7.15:1（AAA）",
  },
]

const TOKENS: { name: string; className: string; note: string }[] = [
  { name: "home-accent", className: "bg-home-accent", note: "CTA 填充色" },
  { name: "home-accent-strong", className: "bg-home-accent-strong", note: "浅底上的文字色" },
  { name: "home-accent-soft", className: "bg-home-accent-soft", note: "主色 chip 底色" },
  { name: "home-highlight", className: "bg-home-highlight", note: "次色（暖色点缀）" },
  { name: "home-highlight-strong", className: "bg-home-highlight-strong", note: "次色文字" },
  { name: "home-highlight-soft", className: "bg-home-highlight-soft", note: "次色 chip 底色" },
  { name: "home-ink", className: "bg-home-ink", note: "黑色胶囊，暗色自动反相" },
  { name: "home-surface-muted", className: "bg-home-surface-muted", note: "次级块底色" },
] as const

const FEED_ROWS = [
  {
    rank: 1,
    name: "Nimbus Analytics",
    desc: "Privacy-first product analytics with warehouse sync",
    tags: ["Analytics", "SaaS"],
    votes: 312,
    comments: 24,
  },
  {
    rank: 2,
    name: "Slate Notes",
    desc: "Markdown notebook that publishes straight to the web",
    tags: ["Productivity"],
    votes: 268,
    comments: 11,
  },
  {
    rank: 3,
    name: "Pixelforge",
    desc: "Generate app store screenshots from one Figma frame",
    tags: ["Design", "Developer Tools"],
    votes: 194,
    comments: 7,
  },
  {
    rank: 4,
    name: "Mailstrait",
    desc: "Deliverability monitoring for transactional email",
    tags: ["Marketing"],
    votes: 88,
    comments: 3,
  },
  {
    rank: 12,
    name: "Quiet Hours",
    desc: "Focus timer that blocks notifications across devices",
    tags: ["Productivity"],
    votes: 41,
    comments: 1,
  },
] as const

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-home-hairline rounded-home-card border p-5 sm:p-6">
      <SerifHeading as="h2" size="card" kicker={hint}>
        {title}
      </SerifHeading>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function FeedRow({ row }: { row: (typeof FEED_ROWS)[number] }) {
  return (
    <SoftCard interactive padding="sm" className="flex items-center gap-3 sm:gap-4 sm:p-3.5">
      <div className="flex items-center gap-3">
        <RankBadge rank={row.rank} />
        <div className="from-home-accent-soft to-home-surface-muted border-home-hairline flex size-10 flex-shrink-0 items-center justify-center rounded-[10px] border bg-gradient-to-br text-sm font-bold">
          {row.name.slice(0, 1)}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{row.name}</span>
          {/* The chip is the first thing to go on narrow screens: keeping it
              inline squeezed the product name into a truncated stub. */}
          <TagPill tone="highlight" className="hidden sm:inline-flex">
            {row.comments} reviews
          </TagPill>
        </div>
        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[13px]">{row.desc}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {row.tags.map((tag) => (
            <TagPill key={tag}>{tag}</TagPill>
          ))}
          {/* …and it reappears here on mobile, where there is room for it. */}
          <TagPill tone="highlight" className="sm:hidden">
            {row.comments} reviews
          </TagPill>
        </div>
      </div>
      <div className="flex flex-col items-center px-1">
        <span className="text-home-highlight-strong text-[10px] leading-none">▲</span>
        <span className="font-mono text-sm font-semibold tabular-nums">{row.votes}</span>
      </div>
    </SoftCard>
  )
}

/** One palette, one theme. The caller supplies the palette/theme wrapper. */
function Board({ label }: { label: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="bg-home-ink text-home-ink-foreground rounded-home-pill px-3 py-1 text-xs font-semibold">
          {label}
        </span>
        <span className="text-muted-foreground text-xs">
          {label === "Light" ? "浅色（默认）" : "深色（.dark）"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Design tokens" hint="色板">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TOKENS.map((token) => (
              <div key={token.name} className="space-y-1.5">
                <div
                  className={`${token.className} border-home-hairline h-10 w-full rounded-lg border`}
                />
                <p className="font-mono text-[10px] leading-none break-all">{token.name}</p>
                <p className="text-muted-foreground text-[10px] leading-tight">{token.note}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons & chips" hint="组件">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <PillButton size="lg">Get started</PillButton>
              <PillButton variant="ink" size="lg">
                Show all products
              </PillButton>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <PillButton>Submit a product</PillButton>
              <PillButton variant="outline">Daily</PillButton>
              <PillButton variant="soft">Get featured</PillButton>
              <PillButton variant="ghost">More details</PillButton>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TagPill>Developer Tools</TagPill>
              <TagPill tone="accent">Accent chip</TagPill>
              <TagPill tone="highlight">12 reviews</TagPill>
              <TagPill tone="ink">New</TagPill>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <RankBadge rank={1} />
              <RankBadge rank={2} />
              <RankBadge rank={3} />
              <RankBadge rank={4} />
              <RankBadge rank={12} />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <StatPill value="37,715" label="visits this month" />
              <StatPill value="312" label="upvotes" tone="highlight" icon={<span>▲</span>} />
              <StatPill value="1,248" label="products" tone="accent" />
            </div>
          </div>
        </Section>
      </div>

      <Section title="Hero + feed composition" hint="首页雏形">
        <div className="border-home-hairline rounded-home-card relative overflow-hidden border">
          {/* The grid and its fade live on a decorative backdrop layer: the
              fade is a mask, so putting it on the content wrapper would fade
              the headline and CTA out along with the grid. */}
          <div
            aria-hidden="true"
            className="home-grid-bg home-grid-fade pointer-events-none absolute inset-0"
          />
          <div className="border-home-hairline relative border-b px-5 py-10 text-center sm:py-12">
            <SerifHeading
              as="p"
              size="display"
              className="mx-auto max-w-2xl text-[1.75rem] sm:text-4xl"
            >
              Launch. Get seen. Grow.
            </SerifHeading>
            <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm">
              Get guaranteed homepage visibility, a backlink, and feedback from a community that
              actually cares.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <div className="flex -space-x-2">
                {["A", "B", "C", "D", "E"].map((initial, index) => (
                  <span
                    key={initial}
                    className="border-home-surface flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-bold text-neutral-800"
                    style={{ background: `hsl(${20 + index * 28} 85% 88%)` }}
                  >
                    {initial}
                  </span>
                ))}
              </div>
              <span className="text-home-highlight-strong text-xs">★★★★★</span>
              <span className="text-muted-foreground text-xs">Join 85,000 makers</span>
            </div>
            <div className="mt-5 flex justify-center">
              <PillButton size="lg">Get started</PillButton>
            </div>
          </div>
          <div className="bg-home-surface-muted/60 space-y-2 p-3 sm:p-4">
            {FEED_ROWS.map((row) => (
              <FeedRow key={row.name} row={row} />
            ))}
            <div className="flex items-center justify-center gap-3 pt-2">
              <PillButton variant="ink">Show all products</PillButton>
              <PillButton variant="soft" size="sm">
                Get featured
              </PillButton>
            </div>
          </div>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Rail block" hint="侧栏">
          <SoftCard padding="lg" className="space-y-3">
            <SerifHeading as="p" size="eyebrow">
              Latest posts
            </SerifHeading>
            {["Weekly recap is live", "How we rank launches", "Submit in 2 minutes"].map(
              (title) => (
                <div key={title} className="flex gap-3">
                  <span className="bg-home-highlight-soft border-home-highlight-soft-border size-7 flex-shrink-0 rounded-full border" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{title}</p>
                    <p className="text-muted-foreground truncate text-[11px]">
                      A short snippet of the post body…
                    </p>
                  </div>
                </div>
              ),
            )}
          </SoftCard>
        </Section>

        <Section title="Blog card" hint="博客">
          <SoftCard interactive padding="none" className="overflow-hidden">
            {/* Cover art is drawn with tokens instead of a bitmap: the arch
                reads as an editorial cover, costs zero image bytes and follows
                the theme in dark mode. */}
            <div className="from-home-highlight-soft to-home-surface relative h-28 overflow-hidden bg-gradient-to-b">
              <div className="from-home-highlight to-home-highlight-soft absolute inset-x-8 top-7 -bottom-1 rounded-t-full bg-gradient-to-b" />
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <TagPill>Tools</TagPill>
                <span className="text-muted-foreground text-[11px]">Sep 3, 2026</span>
              </div>
              <SerifHeading as="p" size="card">
                The best launch checklists for solo makers
              </SerifHeading>
              <p className="text-muted-foreground line-clamp-2 text-[13px]">
                A short abstract of the article so the card reads as editorial rather than as a link
                list…
              </p>
            </div>
          </SoftCard>
        </Section>

        <Section title="Premium spot" hint="空位">
          <div className="border-home-hairline-strong rounded-home-card flex h-full min-h-40 flex-col items-center justify-center gap-3 border border-dashed p-6 text-center">
            <p className="text-muted-foreground text-sm">Available Premium Spot</p>
            <PillButton variant="soft" size="sm">
              Get featured
            </PillButton>
          </div>
        </Section>
      </div>
    </div>
  )
}

export function DesignSpecimen() {
  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10">
        <header className="border-home-hairline border-b pb-6">
          <SerifHeading as="h1" size="section" kicker="aat.ee · home v2">
            Home redesign — Phase 1 palette locked
          </SerifHeading>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            已选定 <strong className="text-foreground">orange-green（橙主 + 绿点缀）</strong>
            ，它就是 <code className="font-mono text-xs">:root</code>{" "}
            里的默认值，不挂属性即生效。下面第一块是上线效果，其余三套是备选，切换只需改
            <code className="font-mono text-xs"> data-home-palette</code> 的值。
          </p>
        </header>

        {HOME_PALETTES.map((palette) => (
          <section key={palette.id} data-palette-section={palette.id} className="space-y-5">
            <div className="border-home-hairline rounded-home-card border p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-home-ink text-home-ink-foreground rounded-home-pill px-3 py-1 font-mono text-[11px] font-semibold">
                  {palette.id}
                </span>
                <SerifHeading as="h2" size="card" className="text-base">
                  {palette.title}
                </SerifHeading>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">{palette.note}</p>
              <p className="text-muted-foreground mt-1 font-mono text-[11px]">{palette.ratio}</p>
            </div>

            {/* The palette attribute and `.dark` sit on the SAME element on
                purpose — see the placement rule in app/globals.css. */}
            <div data-home-palette={palette.id}>
              <Board label="Light" />
            </div>

            <div
              className="dark bg-background text-foreground rounded-home-card p-3 sm:p-4"
              data-home-palette={palette.id}
            >
              <Board label="Dark" />
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
