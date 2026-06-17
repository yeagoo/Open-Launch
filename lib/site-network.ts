/**
 * The aat.ee promotion network — pure data, no DB/runtime imports, so
 * it's safe to import from client or server components.
 *
 * Two classes of sites back the paid tiers, and they do fundamentally
 * different SEO jobs:
 *
 *  1. DIRECTORY NETWORK ("导航站") — AI-tool / product directories with
 *     broad cross-language reach. Their value is link equity + fast
 *     search-engine indexing + referral traffic + domain authority.
 *     Listings here are published automatically with a dofollow link
 *     (the toolso-ai-open external-launch system; see DEPLOY notes).
 *
 *  2. AUTHORITY NETWORK ("权威文档站") — high-authority technical-docs
 *     sites. Their value is GEO / AIEO: being cited as an authoritative
 *     reference so your brand gets surfaced by LLMs (ChatGPT, Claude,
 *     Perplexity, Gemini) and search engines. Placements here are
 *     hand-written blog / docs articles, done editorially (manual).
 *
 * DR (Domain Rating) for the directory domains is read from the
 * `domain_dr_cache` via `getDRBatch` and refreshed by the refresh-dr
 * cron. New domains report DR `null` until the first fetch lands — add
 * them to `ALL_TRACKED_DOMAINS` (lib/dr-domains.ts) to have the cron
 * pick them up.
 */

export interface DirectorySite {
  /** Bare host as tracked in domain_dr_cache — used to join DR data. */
  domain: string
  /** Brand / display name. */
  brand: string
  /** Public URL (with scheme). */
  href: string
  /** One-line positioning, per locale. */
  tagline: { en: string; zh: string }
  /** Short language tags shown as chips (the audiences this site reaches). */
  langs: string[]
}

export interface AuthoritySite {
  domain: string
  href: string
  /** Topic the site is an authority on, per locale. */
  topic: { en: string; zh: string }
}

/**
 * Class 1 — the directory network (13 sites). `domain` matches the
 * bare host tracked for DR (e.g. `aat.ee`, not `www.aat.ee`).
 */
export const DIRECTORY_NETWORK: DirectorySite[] = [
  {
    domain: "aat.ee",
    brand: "aat.ee",
    href: "https://www.aat.ee",
    tagline: {
      en: "The modern Product Hunt alternative for makers and early adopters.",
      zh: "面向创造者与早期用户的新一代 Product Hunt 替代品。",
    },
    langs: ["EN"],
  },
  {
    domain: "mifar.net",
    brand: "MiFar",
    href: "https://mifar.net",
    tagline: {
      en: "Discover the best AI tools — 简体 · 繁體 · 한국어 · 日本語, all in one place.",
      zh: "发现最好用的 AI 工具——简体 · 繁體 · 한국어 · 日本語，一站直达。",
    },
    langs: ["简体", "繁體", "한국어", "日本語"],
  },
  {
    domain: "qoo.im",
    brand: "Qoo.IM",
    href: "https://qoo.im",
    tagline: {
      en: "Discover and explore the best AI tools — in English, Español, and Português.",
      zh: "在英语、西语、葡语三语中发现并探索最好的 AI 工具。",
    },
    langs: ["EN", "ES", "PT"],
  },
  {
    domain: "fastd.top",
    brand: "FastD",
    href: "https://fastd.top",
    tagline: {
      en: "The fastest way to discover new and trending AI tools.",
      zh: "最快发现新晋与热门 AI 工具的方式。",
    },
    langs: ["EN"],
  },
  {
    domain: "xlayers.dev",
    brand: "Xlayers",
    href: "https://xlayers.dev",
    tagline: {
      en: "AI tools for developers — code, automate, and ship faster.",
      zh: "面向开发者的 AI 工具——编码、自动化、更快交付。",
    },
    langs: ["EN"],
  },
  {
    domain: "upperstory.io",
    brand: "Upperstory",
    href: "https://upperstory.io",
    tagline: {
      en: "The creator's guide to AI — design, video, image, and writing tools.",
      zh: "创作者的 AI 指南——设计、视频、图像与写作工具。",
    },
    langs: ["EN"],
  },
  {
    domain: "xemvip.com",
    brand: "XemVIP",
    href: "https://xemvip.com",
    tagline: {
      en: "An AI tool hub for creators — discover, create, break through.",
      zh: "面向创作者的 AI 工具中心——发现、创作、突破。",
    },
    langs: ["Tiếng Việt"],
  },
  {
    domain: "skachat.xyz",
    brand: "SkaChat",
    href: "https://skachat.xyz",
    tagline: {
      en: "AI tools for chat, communication, and productivity — in German & Russian.",
      zh: "面向聊天、沟通与效率的 AI 工具——德语与俄语。",
    },
    langs: ["DE", "RU"],
  },
  {
    domain: "nexablocks.com",
    brand: "NexaBlocks",
    href: "https://nexablocks.com",
    tagline: {
      en: "WordPress plugins, themes, and AI tools — all in one directory.",
      zh: "WordPress 插件、主题与 AI 工具——尽在一处。",
    },
    langs: ["EN"],
  },
  {
    domain: "blackhawkegames.com",
    brand: "BlackHawkGame",
    href: "https://blackhawkegames.com",
    tagline: {
      en: "Discover great games and sharpen your aim.",
      zh: "发现好游戏，磨练你的枪法。",
    },
    langs: ["EN"],
  },
  {
    domain: "hicyou.com",
    brand: "HiCyou",
    href: "https://hicyou.com",
    tagline: {
      en: "A free, open-source directory helping SaaS products get discovered.",
      zh: "免费开源的目录平台，助力 SaaS 产品被发现。",
    },
    langs: ["EN"],
  },
  {
    domain: "bigkr.com",
    brand: "BigKr",
    href: "https://bigkr.com",
    tagline: {
      en: "Find AI image generators, video tools, productivity apps, and SaaS.",
      zh: "发现 AI 图像生成、视频工具、效率应用与 SaaS。",
    },
    langs: ["한국어", "EN"],
  },
  {
    domain: "mf8.biz",
    brand: "MF8",
    href: "https://www.mf8.biz",
    tagline: {
      en: "Like harvesting rice — collecting the best websites worth visiting.",
      zh: "像收割稻谷一样，收藏值得一逛的好网站。",
    },
    langs: ["中文"],
  },
]

/**
 * Class 2 — the authority / GEO network (26 sites). Topics are
 * best-effort labels; treat them as editable copy, not ground truth.
 */
export const AUTHORITY_NETWORK: AuthoritySite[] = [
  {
    domain: "debian.club",
    href: "https://debian.club",
    topic: { en: "Debian Linux", zh: "Debian Linux" },
  },
  {
    domain: "ubuntu.fan",
    href: "https://ubuntu.fan",
    topic: { en: "Ubuntu Linux", zh: "Ubuntu Linux" },
  },
  {
    domain: "almalinux.com.cn",
    href: "https://almalinux.com.cn",
    topic: { en: "AlmaLinux", zh: "AlmaLinux" },
  },
  {
    domain: "runentlinux.com",
    href: "https://runentlinux.com",
    topic: { en: "Enterprise Linux", zh: "企业级 Linux" },
  },
  {
    domain: "eol.wiki",
    href: "https://eol.wiki",
    topic: { en: "Version end-of-life", zh: "版本生命周期" },
  },
  {
    domain: "litehttpd.com",
    href: "https://litehttpd.com",
    topic: { en: "Web servers", zh: "Web 服务器" },
  },
  {
    domain: "portcyou.com",
    href: "https://portcyou.com",
    topic: { en: "Ports & networking", zh: "端口与网络" },
  },
  {
    domain: "rank.fan",
    href: "https://rank.fan",
    topic: { en: "SEO & ranking", zh: "SEO 与排名" },
  },
  { domain: "geo.fan", href: "https://geo.fan", topic: { en: "GEO / AIEO", zh: "GEO / AIEO" } },
  {
    domain: "mariadb.edu.rich",
    href: "https://mariadb.edu.rich",
    topic: { en: "MariaDB", zh: "MariaDB" },
  },
  {
    domain: "valkey.edu.rich",
    href: "https://valkey.edu.rich",
    topic: { en: "Valkey / Redis", zh: "Valkey / Redis" },
  },
  {
    domain: "libmir.org",
    href: "https://libmir.org",
    topic: { en: "D & numerical computing", zh: "D 语言与数值计算" },
  },
  {
    domain: "mydll.wang",
    href: "https://mydll.wang",
    topic: { en: "Windows DLLs", zh: "Windows DLL" },
  },
  {
    domain: "deepposekit.org",
    href: "https://deepposekit.org",
    topic: { en: "Pose estimation / ML", zh: "姿态估计 / 机器学习" },
  },
  {
    domain: "asimovjs.org",
    href: "https://asimovjs.org",
    topic: { en: "JavaScript framework", zh: "JavaScript 框架" },
  },
  {
    domain: "silverblog.org",
    href: "https://silverblog.org",
    topic: { en: "Blogging / CMS", zh: "博客 / CMS" },
  },
  {
    domain: "claygl.xyz",
    href: "https://claygl.xyz",
    topic: { en: "WebGL graphics", zh: "WebGL 图形" },
  },
  {
    domain: "itoffers.online",
    href: "https://itoffers.online",
    topic: { en: "IT careers", zh: "IT 求职" },
  },
  { domain: "patet.xyz", href: "https://patet.xyz", topic: { en: "Dev notes", zh: "开发笔记" } },
  {
    domain: "sabwap.xyz",
    href: "https://sabwap.xyz",
    topic: { en: "Dev resources", zh: "开发资源" },
  },
  {
    domain: "thanktolaw.com",
    href: "https://thanktolaw.com",
    topic: { en: "Legal & compliance", zh: "法律与合规" },
  },
  {
    domain: "cms-joomla-help.com",
    href: "https://cms-joomla-help.com",
    topic: { en: "Joomla CMS", zh: "Joomla CMS" },
  },
  {
    domain: "themescorners.com",
    href: "https://themescorners.com",
    topic: { en: "Themes & templates", zh: "主题与模板" },
  },
  {
    domain: "material-theme.dev",
    href: "https://material-theme.dev",
    topic: { en: "Material design", zh: "Material 设计" },
  },
  {
    domain: "pastecode.xyz",
    href: "https://pastecode.xyz",
    topic: { en: "Code snippets", zh: "代码片段" },
  },
  {
    domain: "techvibeblog.org",
    href: "http://techvibeblog.org",
    topic: { en: "Tech blog", zh: "技术博客" },
  },
]

/** Bare hosts of every directory-network site — for DR batch lookups. */
export const DIRECTORY_NETWORK_DOMAINS: string[] = DIRECTORY_NETWORK.map((s) => s.domain)

/** Bare hosts of every authority-network site. */
export const AUTHORITY_NETWORK_DOMAINS: string[] = AUTHORITY_NETWORK.map((s) => s.domain)
