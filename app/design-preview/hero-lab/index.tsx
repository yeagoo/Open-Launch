import { LaunchWindowHero } from "./launch-window"
import { LiveRaceHero } from "./live-race"
import { LogoWallHero } from "./logo-wall"
import { MastheadHero } from "./masthead"
import type { HeroConcept, HeroConceptProps } from "./shared"
import { ShipLogHero } from "./ship-log"
import { TwoDoorsHero } from "./two-doors"

/**
 * The six candidates, in the order they should be reviewed.
 *
 * `idea` is the structural claim (what makes it not just a re-skin), `bestFor`
 * is the strategy it serves, and `watchOut` is the honest cost of picking it.
 */
export const HERO_CONCEPTS: HeroConcept[] = [
  {
    id: "live-race",
    name: "01 · Live Race 今日赛道",
    idea: "左文案 + 右侧今日实时前三榜（带相对票数条），倒计时缝在榜单底部 —— hero 自己就是证据面板。",
    bestFor: "强调「这里有真实流量与竞争」，把可见性直接摆出来。",
    watchOut: "右侧榜单空数据时（冷启动）会显得空，需要空状态设计。",
    Component: LiveRaceHero,
  },
  {
    id: "ship-log",
    name: "02 · Ship Log 提交回执",
    idea: "右半屏是一张终端风的「上架回执」：提交 → 排队 → 徽章 → 外链 → 上线，逐行打勾。",
    bestFor: "开发者/开源受众，「不解释价值，直接展示产物」。",
    watchOut: "深色卡片在浅色页里是强对比块，会抢走部分注意力；文案需随产品能力同步维护。",
    Component: ShipLogHero,
  },
  {
    id: "two-doors",
    name: "03 · Two Doors 双入口",
    idea: "标题下方直接一分为二：左边「我是来发布的」，右边「我是来逛的」，各自带论据与 CTA。",
    bestFor: "两类访客（maker / 早期用户）目标差异大，先分流再讲价值。",
    watchOut: "hero 高度较大，首屏能看到的信息密度低于其他方案。",
    Component: TwoDoorsHero,
  },
  {
    id: "launch-window",
    name: "04 · Launch Window 发射窗口",
    idea: "把站点真实机制（每天 08:00 UTC 一批上架）做成主角：巨大倒计时 + 昨日/今日/下一批时间轴。",
    bestFor: "制造「赶下一班车」的稀缺感，转化提交。",
    watchOut: "倒计时是客户端组件；静态首帧需服务端预算初值，否则会闪。",
    Component: LaunchWindowHero,
  },
  {
    id: "masthead",
    name: "05 · Masthead 日报头版",
    idea: "报纸头版：期号 + 粗细双规线 + 头条（今日第一名当主图）+ 三栏摘要；全篇不用胶囊按钮。",
    bestFor: "建立「每日出版物」的内容气质，长期做 SEO 与回访。",
    watchOut: "风格最强也最挑内容 —— 没有足够好的每日项目时，头版会撑不起来。",
    Component: MastheadHero,
  },
  {
    id: "logo-wall",
    name: "06 · Launch Wall 发布墙 ✅ 已选定",
    idea: "今日项目的 logo 马赛克铺满 hero，渐隐压暗后压上标题，顶部一行实时计数。",
    bestFor: "第一眼回答「这里有多少东西」—— 数量即说服力。",
    watchOut: "唯一用图片做装饰的方案，图块数量必须封顶，否则拖累 LCP。",
    Component: LogoWallHero,
  },
]

/**
 * NOTE ON CONCEPT 06 — this lab is a frozen record of the six candidates as
 * they were reviewed. The winner has since been promoted into
 * `components/home/v2/home-hero.tsx` and evolved there: the kicker numbers now
 * come from real database counts instead of the hardcoded 128/12 below, and the
 * wall caps itself at three rows per breakpoint so a phone never fetches 24
 * decorative images. The copy kept here is deliberately the version that was
 * chosen from, not a mirror of the shipped file.
 */

export function HeroLab(props: HeroConceptProps) {
  return (
    <div className="space-y-14">
      {HERO_CONCEPTS.map((concept) => (
        <section key={concept.id} data-hero-section={concept.id} className="space-y-4">
          <div className="border-home-hairline rounded-home-card border p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-home-ink text-home-ink-foreground rounded-home-pill px-3 py-1 font-mono text-[11px] font-semibold">
                {concept.id}
              </span>
              <h3 className="font-editorial text-base font-semibold">{concept.name}</h3>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
                  结构
                </dt>
                <dd className="mt-1">{concept.idea}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
                  适合
                </dt>
                <dd className="mt-1">{concept.bestFor}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
                  代价
                </dt>
                <dd className="mt-1">{concept.watchOut}</dd>
              </div>
            </dl>
          </div>

          {/* `h2` keeps the harness page to a single h1 while the concepts are
              being compared side by side. */}
          <concept.Component {...props} headingLevel="h2" />
        </section>
      ))}
    </div>
  )
}
