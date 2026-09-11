import { HeroLab } from "./hero-lab"
import { HERO_LAB_COUNTDOWN, HERO_LAB_LABELS, type HeroConceptProps } from "./hero-lab/shared"
import { HOME_FIXTURE_DATA } from "./home-fixture"

const LAB_PROPS: HeroConceptProps = {
  labels: HERO_LAB_LABELS,
  projects: HOME_FIXTURE_DATA.projects,
  stats: HOME_FIXTURE_DATA.stats,
  // The lab's concepts still draw an avatar row; the product hero no longer has
  // one, so this fixture supplies its own rather than borrowing the product's.
  makers: [
    { id: "m1", name: "Ada", image: null },
    { id: "m2", name: "Kenji", image: null },
    { id: "m3", name: "Lena", image: null },
    { id: "m4", name: "Omar", image: null },
    { id: "m5", name: "Yuki", image: null },
  ],
  countdownInitial: HERO_LAB_COUNTDOWN,
  primaryHref: HOME_FIXTURE_DATA.primaryCtaHref,
  secondaryHref: HOME_FIXTURE_DATA.secondaryCtaHref,
}

/**
 * Renders all six hero candidates against the same fixture the home page
 * preview uses. Same data, same copy, six structures — so the only variable
 * left is the layout.
 */
export function HeroLabFixture() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="border-home-hairline mb-10 border-b pb-6">
          <p className="text-muted-foreground font-mono text-[11px] tracking-[0.16em] uppercase">
            aat.ee · home v2 · hero lab
          </p>
          <h1 className="font-editorial mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Hero 方案对比 — 6 个结构不同的版本
          </h1>
          <p className="text-muted-foreground mt-3 max-w-3xl text-sm">
            六个方案的标题、副标题、CTA 完全一致，只有版式与「主角」不同 ——
            这样你选的是结构而不是文案。每个都用同一套色板令牌，因此浅色与深色都成立。
          </p>
        </header>

        <HeroLab {...LAB_PROPS} />
      </div>
    </div>
  )
}
