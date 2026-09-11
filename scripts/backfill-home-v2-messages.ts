#!/usr/bin/env bun
/**
 * One-off backfill for the Phase 2 home redesign strings.
 *
 * Kept in the repo (not run automatically) because it documents exactly which
 * keys were added and what each locale says. `--check` verifies the keys are
 * present in every locale without writing, which is what CI-ish review needs.
 */
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const messagesDir = resolve(import.meta.dirname, "../messages")
const LOCALES = ["en", "zh", "es", "pt", "fr", "ja", "ko", "et"] as const

type V2 = {
  hero: {
    title: string
    subtitle: string
    primaryCta: string
    secondaryCta: string
    /** Launch-wall kicker: "{count} products launched", all time. */
    launchedTotal: string
  }
  tabs: { daily: string; weekly: string; monthly: string }
  countdownLabel: string
  feedNote: string
  moreDetails: string
  dailyArchives: string
  empty: string
  showAllProducts: string
  premiumTitle: string
  premiumCta: string
  blogTitle: string
  latestPosts: string
  launchesThisMonth: string
  reviewsCount: string
  /** Screen-reader label for a feed row's rank marker. */
  rankLabel: string
  /** Screen-reader label for the Daily/Weekly/Monthly switcher. */
  tabsLabel: string
}

const WEEK_TITLE: Record<string, string> = {
  en: "Best products this week",
  zh: "本周最佳产品",
  es: "Mejores productos de la semana",
  pt: "Melhores produtos da semana",
  fr: "Meilleurs produits de la semaine",
  ja: "今週のベスト製品",
  ko: "이번 주 베스트 제품",
  et: "Nädala parimad tooted",
}

const V2_STRINGS: Record<string, V2> = {
  en: {
    hero: {
      title: "Good work doesn't find its own audience. Don't leave yours in the repo.",
      subtitle:
        "Attention fades. Links last. A badge, a do-follow backlink and your first real users.",
      primaryCta: "Submit your project",
      secondaryCta: "Explore today's launches",
      launchedTotal: "{count} products launched",
    },
    tabs: { daily: "Daily", weekly: "Weekly", monthly: "Monthly" },
    countdownLabel: "New launches in",
    feedNote: "Weekly and monthly winners earn badges and are featured in our newsletter.",
    moreDetails: "More details",
    dailyArchives: "Daily archives",
    empty: "No launches in this window yet.",
    showAllProducts: "Show all products",
    premiumTitle: "This premium spot is available",
    premiumCta: "Get featured",
    blogTitle: "Latest from the blog",
    latestPosts: "Latest posts",
    launchesThisMonth: "launches this month",
    reviewsCount: "{count} reviews",
    rankLabel: "Rank {rank}",
    tabsLabel: "Ranking period",
  },
  zh: {
    hero: {
      title: "酒香也怕巷子深，\n别让项目躺在 Git 仓库里",
      subtitle: "热度会过去，外链会留下。Badge、do-follow 外链和一批真实用户。",
      primaryCta: "提交项目",
      secondaryCta: "看今日新上架",
      launchedTotal: "已上架 {count} 个产品",
    },
    tabs: { daily: "日榜", weekly: "周榜", monthly: "月榜" },
    countdownLabel: "距离下一批上架还有",
    feedNote: "周榜与月榜优胜者将获得徽章，并入选我们的邮件推送。",
    moreDetails: "了解详情",
    dailyArchives: "往期日榜",
    empty: "这个时间窗口还没有上架项目。",
    showAllProducts: "查看全部产品",
    premiumTitle: "这个推荐位正在招租",
    premiumCta: "申请推荐",
    blogTitle: "最新博客",
    latestPosts: "最新动态",
    launchesThisMonth: "本月上架",
    reviewsCount: "{count} 条评论",
    rankLabel: "第 {rank} 名",
    tabsLabel: "榜单周期",
  },
  es: {
    hero: {
      title: "Ser bueno no basta. No dejes tu proyecto durmiendo en el repositorio.",
      subtitle:
        "La atención pasa. Los enlaces quedan. Una insignia, un enlace do-follow y tus primeros usuarios reales.",
      primaryCta: "Publica tu proyecto",
      secondaryCta: "Ver los lanzamientos de hoy",
      launchedTotal: "{count} productos lanzados",
    },
    tabs: { daily: "Diario", weekly: "Semanal", monthly: "Mensual" },
    countdownLabel: "Nuevos lanzamientos en",
    feedNote:
      "Los ganadores semanales y mensuales obtienen insignias y aparecen en nuestro boletín.",
    moreDetails: "Más detalles",
    dailyArchives: "Archivo diario",
    empty: "Todavía no hay lanzamientos en este periodo.",
    showAllProducts: "Ver todos los productos",
    premiumTitle: "Este espacio premium está disponible",
    premiumCta: "Destacar mi producto",
    blogTitle: "Lo último del blog",
    latestPosts: "Últimas publicaciones",
    launchesThisMonth: "lanzamientos este mes",
    reviewsCount: "{count} reseñas",
    rankLabel: "Puesto {rank}",
    tabsLabel: "Periodo de clasificación",
  },
  pt: {
    hero: {
      title: "Ser bom não basta. Não deixe seu projeto parado no repositório.",
      subtitle:
        "A atenção passa. Os links ficam. Um selo, um link do-follow e seus primeiros usuários reais.",
      primaryCta: "Enviar o seu projeto",
      secondaryCta: "Ver os lançamentos de hoje",
      launchedTotal: "{count} produtos lançados",
    },
    tabs: { daily: "Diário", weekly: "Semanal", monthly: "Mensal" },
    countdownLabel: "Novos lançamentos em",
    feedNote: "Os vencedores semanais e mensais recebem selos e aparecem na nossa newsletter.",
    moreDetails: "Mais detalhes",
    dailyArchives: "Arquivo diário",
    empty: "Ainda não há lançamentos neste período.",
    showAllProducts: "Ver todos os produtos",
    premiumTitle: "Este espaço premium está disponível",
    premiumCta: "Quero destaque",
    blogTitle: "Últimas do blog",
    latestPosts: "Últimas publicações",
    launchesThisMonth: "lançamentos este mês",
    reviewsCount: "{count} avaliações",
    rankLabel: "Posição {rank}",
    tabsLabel: "Período de classificação",
  },
  fr: {
    hero: {
      title: "Être bon ne suffit pas. Ne laissez pas votre projet dormir dans le dépôt.",
      subtitle:
        "L'attention passe. Les liens restent. Un badge, un lien do-follow et vos premiers vrais utilisateurs.",
      primaryCta: "Soumettre votre projet",
      secondaryCta: "Voir les lancements du jour",
      launchedTotal: "{count} produits lancés",
    },
    tabs: { daily: "Quotidien", weekly: "Hebdomadaire", monthly: "Mensuel" },
    countdownLabel: "Nouveaux lancements dans",
    feedNote:
      "Les gagnants hebdomadaires et mensuels obtiennent un badge et sont mis en avant dans notre newsletter.",
    moreDetails: "Plus de détails",
    dailyArchives: "Archives quotidiennes",
    empty: "Aucun lancement sur cette période pour le moment.",
    showAllProducts: "Voir tous les produits",
    premiumTitle: "Cet emplacement premium est disponible",
    premiumCta: "Obtenir la mise en avant",
    blogTitle: "Derniers articles du blog",
    latestPosts: "Dernières publications",
    launchesThisMonth: "lancements ce mois-ci",
    reviewsCount: "{count} avis",
    rankLabel: "Rang {rank}",
    tabsLabel: "Période de classement",
  },
  ja: {
    hero: {
      title: "良いものは、放っておけば見つからない。リポジトリに眠らせないで。",
      subtitle:
        "注目は過ぎ去る。リンクは残る。バッジ、do-follow リンク、そして最初のリアルユーザー。",
      primaryCta: "プロジェクトを投稿",
      secondaryCta: "今日のローンチを見る",
      launchedTotal: "{count} 件のプロダクトがローンチ済み",
    },
    tabs: { daily: "日間", weekly: "週間", monthly: "月間" },
    countdownLabel: "次のローンチまで",
    feedNote: "週間・月間の上位はバッジを獲得し、ニュースレターで紹介されます。",
    moreDetails: "詳細を見る",
    dailyArchives: "過去のデイリー",
    empty: "この期間のローンチはまだありません。",
    showAllProducts: "すべての製品を見る",
    premiumTitle: "このプレミアム枠は募集中",
    premiumCta: "掲載を申し込む",
    blogTitle: "最新ブログ",
    latestPosts: "最新の投稿",
    launchesThisMonth: "今月のローンチ",
    reviewsCount: "{count} 件のレビュー",
    rankLabel: "{rank} 位",
    tabsLabel: "ランキング期間",
  },
  ko: {
    hero: {
      title: "좋은 것만으로는 부족합니다. 저장소에만 묻어두지 마세요.",
      subtitle: "관심은 지나가고 링크는 남습니다. 배지, do-follow 링크, 그리고 첫 실제 사용자.",
      primaryCta: "프로젝트 등록",
      secondaryCta: "오늘의 런치 보기",
      launchedTotal: "{count}개 프로덕트 런칭 완료",
    },
    tabs: { daily: "일간", weekly: "주간", monthly: "월간" },
    countdownLabel: "다음 런치까지",
    feedNote: "주간·월간 상위 제품은 배지를 받고 뉴스레터에 소개됩니다.",
    moreDetails: "자세히 보기",
    dailyArchives: "지난 데일리",
    empty: "이 기간에는 아직 등록된 제품이 없습니다.",
    showAllProducts: "모든 제품 보기",
    premiumTitle: "이 프리미엄 자리를 모집 중입니다",
    premiumCta: "추천 신청",
    blogTitle: "최신 블로그",
    latestPosts: "최신 소식",
    launchesThisMonth: "이번 달 런치",
    reviewsCount: "리뷰 {count}개",
    rankLabel: "{rank}위",
    tabsLabel: "랭킹 기간",
  },
  et: {
    hero: {
      title: "Hea toode ei leia ise oma vaatajaid. Ära jäta seda repositooriumisse.",
      subtitle:
        "Tähelepanu kaob, lingid jäävad. Märk, do-follow link ja esimesed tõelised kasutajad.",
      primaryCta: "Esita oma projekt",
      secondaryCta: "Vaata tänaseid lanseerimisi",
      launchedTotal: "{count} toodet on lanseeritud",
    },
    tabs: { daily: "Päevane", weekly: "Nädalane", monthly: "Kuine" },
    countdownLabel: "Uued lanseerimised",
    feedNote: "Nädala ja kuu parimad saavad märgised ning jõuavad meie uudiskirja.",
    moreDetails: "Rohkem detaile",
    dailyArchives: "Päevane arhiiv",
    empty: "Selles ajavahemikus pole veel lanseerimisi.",
    showAllProducts: "Vaata kõiki tooteid",
    premiumTitle: "See premium-koht on saadaval",
    premiumCta: "Soovi esiletõstmist",
    blogTitle: "Viimased blogipostitused",
    latestPosts: "Viimased postitused",
    launchesThisMonth: "lanseerimist sel kuul",
    reviewsCount: "{count} arvustust",
    rankLabel: "{rank}. koht",
    tabsLabel: "Edetabeli periood",
  },
}

const checkOnly = process.argv.includes("--check")
const problems: string[] = []

for (const locale of LOCALES) {
  const path = resolve(messagesDir, `${locale}.json`)
  const messages = JSON.parse(await readFile(path, "utf8")) as Record<string, any>
  const v2 = V2_STRINGS[locale]
  if (!v2) throw new Error(`missing translations for locale ${locale}`)

  if (checkOnly) {
    const home = messages.home ?? {}
    for (const [key, value] of Object.entries({ ...v2, weekTitle: WEEK_TITLE[locale] })) {
      if (key === "weekTitle") {
        if (home.sections?.weekTitle !== value) problems.push(`${locale}: home.sections.weekTitle`)
        continue
      }
      if (JSON.stringify(home.v2?.[key]) !== JSON.stringify(value))
        problems.push(`${locale}: home.v2.${key}`)
    }
    continue
  }

  messages.home = messages.home ?? {}
  messages.home.v2 = v2
  messages.home.sections = messages.home.sections ?? {}
  messages.home.sections.weekTitle = WEEK_TITLE[locale]

  await writeFile(path, `${JSON.stringify(messages, null, 2)}\n`, "utf8")
  console.log(`[home-v2-messages] updated ${locale}.json`)
}

if (checkOnly) {
  if (problems.length) {
    console.error(`[home-v2-messages] drift detected:\n  ${problems.join("\n  ")}`)
    process.exit(1)
  }
  console.log(`[home-v2-messages] all ${LOCALES.length} locales carry the home.v2 keys`)
}
