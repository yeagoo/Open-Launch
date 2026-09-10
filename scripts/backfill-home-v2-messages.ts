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
    joinMakers: string
    /** Launch-wall kicker: "{count} launched today". */
    launchedToday: string
    /** Launch-wall kicker: "{count} queued". */
    queuedNext: string
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
  makers: string
  partners: string
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
      title: "Where new products get their first push",
      subtitle:
        "Launch your product, earn a verified badge and a do-follow backlink, and discover what other makers shipped today.",
      primaryCta: "Submit your project",
      secondaryCta: "Explore today's launches",
      joinMakers: "Join {count} makers",
      launchedToday: "{count} launched today",
      queuedNext: "{count} queued",
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
    makers: "makers",
    partners: "Our partners",
    reviewsCount: "{count} reviews",
    rankLabel: "Rank {rank}",
    tabsLabel: "Ranking period",
  },
  zh: {
    hero: {
      title: "让新产品在这里拿到第一次曝光",
      subtitle: "提交你的产品，获得认证徽章与 do-follow 外链，同时看看其他开发者今天发布了什么。",
      primaryCta: "提交项目",
      secondaryCta: "看今日新上架",
      joinMakers: "已有 {count} 位创作者加入",
      launchedToday: "{count} 个今日上架",
      queuedNext: "{count} 个排队中",
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
    makers: "位创作者",
    partners: "合作伙伴",
    reviewsCount: "{count} 条评论",
    rankLabel: "第 {rank} 名",
    tabsLabel: "榜单周期",
  },
  es: {
    hero: {
      title: "Donde los productos nuevos reciben su primer empujón",
      subtitle:
        "Publica tu producto, consigue una insignia verificada y un backlink do-follow, y descubre qué han lanzado hoy otros creadores.",
      primaryCta: "Publica tu proyecto",
      secondaryCta: "Ver los lanzamientos de hoy",
      joinMakers: "Únete a {count} creadores",
      launchedToday: "{count} lanzados hoy",
      queuedNext: "{count} en cola",
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
    makers: "creadores",
    partners: "Nuestros socios",
    reviewsCount: "{count} reseñas",
    rankLabel: "Puesto {rank}",
    tabsLabel: "Periodo de clasificación",
  },
  pt: {
    hero: {
      title: "Onde os produtos novos ganham o primeiro impulso",
      subtitle:
        "Publique o seu produto, conquiste um selo verificado e um backlink do-follow, e descubra o que outros criadores lançaram hoje.",
      primaryCta: "Enviar o seu projeto",
      secondaryCta: "Ver os lançamentos de hoje",
      joinMakers: "Junte-se a {count} criadores",
      launchedToday: "{count} lançados hoje",
      queuedNext: "{count} na fila",
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
    makers: "criadores",
    partners: "Nossos parceiros",
    reviewsCount: "{count} avaliações",
    rankLabel: "Posição {rank}",
    tabsLabel: "Período de classificação",
  },
  fr: {
    hero: {
      title: "Là où les nouveaux produits trouvent leur premier élan",
      subtitle:
        "Publiez votre produit, obtenez un badge vérifié et un backlink do-follow, et découvrez ce que les autres créateurs ont lancé aujourd'hui.",
      primaryCta: "Soumettre votre projet",
      secondaryCta: "Voir les lancements du jour",
      joinMakers: "Rejoignez {count} créateurs",
      launchedToday: "{count} lancés aujourd'hui",
      queuedNext: "{count} en attente",
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
    makers: "créateurs",
    partners: "Nos partenaires",
    reviewsCount: "{count} avis",
    rankLabel: "Rang {rank}",
    tabsLabel: "Période de classement",
  },
  ja: {
    hero: {
      title: "新製品が最初の注目を集める場所",
      subtitle:
        "製品を投稿して認定バッジと do-follow バックリンクを獲得し、他のメーカーが今日何をリリースしたかを見つけよう。",
      primaryCta: "プロジェクトを投稿",
      secondaryCta: "今日のローンチを見る",
      joinMakers: "{count} 人のメーカーが参加",
      launchedToday: "本日 {count} 件がローンチ",
      queuedNext: "{count} 件が待機中",
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
    makers: "人のメーカー",
    partners: "パートナー",
    reviewsCount: "{count} 件のレビュー",
    rankLabel: "{rank} 位",
    tabsLabel: "ランキング期間",
  },
  ko: {
    hero: {
      title: "새 제품이 첫 주목을 받는 곳",
      subtitle:
        "제품을 등록하고 인증 배지와 do-follow 백링크를 받으세요. 다른 메이커들이 오늘 무엇을 출시했는지도 확인할 수 있습니다.",
      primaryCta: "프로젝트 등록",
      secondaryCta: "오늘의 런치 보기",
      joinMakers: "{count}명의 메이커 참여",
      launchedToday: "오늘 {count}개 런치",
      queuedNext: "{count}개 대기 중",
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
    makers: "명의 메이커",
    partners: "파트너",
    reviewsCount: "리뷰 {count}개",
    rankLabel: "{rank}위",
    tabsLabel: "랭킹 기간",
  },
  et: {
    hero: {
      title: "Koht, kus uued tooted saavad oma esimese tõuke",
      subtitle:
        "Lisa oma toode, saa kinnitatud märgis ja do-follow tagasilink ning avasta, mida teised tegijad täna välja lasid.",
      primaryCta: "Esita oma projekt",
      secondaryCta: "Vaata tänaseid lanseerimisi",
      joinMakers: "Liitu {count} tegijaga",
      launchedToday: "{count} lanseeritud täna",
      queuedNext: "{count} järjekorras",
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
    makers: "tegijat",
    partners: "Meie partnerid",
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
