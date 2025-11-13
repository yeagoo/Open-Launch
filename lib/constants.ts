export const LAUNCH_LIMITS = {
  FREE_DAILY_LIMIT: 5, // 基础免费配额
  BADGE_DAILY_LIMIT: 5, // Badge 验证用户额外配额
  PREMIUM_DAILY_LIMIT: 10, // 保留但不再使用
  PREMIUM_PLUS_DAILY_LIMIT: 0, // 保留但不再使用
  TOTAL_DAILY_LIMIT: 10, // 总配额：5 基础 + 5 Badge
} as const

// 用户每日发布限制（不再区分 Premium）
export const USER_DAILY_LAUNCH_LIMIT = 5 // 所有用户每天最多 5 个项目

export const PROJECT_LIMITS_VARIABLES = {
  TODAY_LIMIT: 20, // par defaut
  YESTERDAY_LIMIT: 5, // par defaut
  MONTH_LIMIT: 5, // par defaut
  VIEW_ALL_PAGE_TODAY_YESTERDAY_LIMIT: 20, // Nombre de lancements max par jour
  VIEW_ALL_PAGE_MONTH_LIMIT: 20,
} as const

export const LAUNCH_SETTINGS = {
  PREMIUM_PRICE: 2.99, // USD - Premium Launch 价格
  ARTICLE_PRICE: 50, // USD - SEO Growth Package 价格
  MIN_DAYS_AHEAD: 1, // Minimum days ahead for scheduling (starting from tomorrow)
  MAX_DAYS_AHEAD: 180, // Maximum days ahead for scheduling (6 months)
  PREMIUM_MIN_DAYS_AHEAD: 1, // Premium Launch 最早发布时间
  PREMIUM_MAX_DAYS_AHEAD: 30, // Premium Launch 最晚发布时间
  DAYS_PER_PAGE: 7, // Nombre de jours à afficher par page
  LAUNCH_HOUR_UTC: 8, // All launches happen at 8 AM UTC
} as const

export const LAUNCH_TYPES = {
  FREE: "free",
  FREE_WITH_BADGE: "free_with_badge", // 使用 Badge 配额的免费发布
  PREMIUM: "premium", // Premium Launch（加速发布）
} as const

// 优惠码配置
export const PROMO_CODE_SETTINGS = {
  MAX_USES_PER_USER: 10, // 每个用户最多使用 10 次优惠码
  VALIDITY_DAYS: 30, // 优惠码有效期 30 天
  DISCOUNT_AMOUNT: 2.99, // 优惠金额（抵扣 Premium Launch 费用）
} as const

export const DATE_FORMAT = {
  DISPLAY: "EEE, MMM d, yyyy", // Format: Mon, Jan 1, 2024
  DISPLAY_MONTH: "MMMM yyyy", // Format: January 2024
  DISPLAY_DAY: "EEE d", // Format: Mon 1
  API: "yyyy-MM-dd",
  FULL: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", // Full ISO format with time
} as const

// Rate limits spécifiques pour différentes API
export const API_RATE_LIMITS = {
  SEARCH: {
    REQUESTS: 15, // 15 requêtes
    WINDOW: 60 * 1000, // par minute
  },
  DEFAULT: {
    REQUESTS: 10, // 10 requêtes
    WINDOW: 60 * 1000, // par minute
  },
} as const

// Limites pour les upvotes
export const UPVOTE_LIMITS = {
  ACTIONS_PER_WINDOW: 100, // Nombre maximal d'actions d'upvote par fenêtre de temps
  TIME_WINDOW_MS: 5 * 60 * 1000, // Fenêtre de temps pour le rate limit (5 minutes)
  TIME_WINDOW_MINUTES: 5, // Fenêtre de temps pour le rate limit (5 minutes)
  MIN_TIME_BETWEEN_ACTIONS_MS: 2000, // Temps minimum entre deux actions sur le même projet (2 secondes)
  MIN_TIME_BETWEEN_ACTIONS_SECONDS: 2, // Temps minimum entre deux actions sur le même projet (2 secondes)
  DEBOUNCE_TIME_MS: 500, // Temps de debounce côté client (500ms)
} as const

// Premium Launch 支付链接 ($2.99/次)
export const PREMIUM_PAYMENT_LINK = process.env.NEXT_PUBLIC_PREMIUM_PAYMENT_LINK!
// SEO Growth Package 支付链接 ($50)
export const SEO_ARTICLE_PAYMENT_LINK = process.env.NEXT_PUBLIC_PREMIUM_PLUS_PAYMENT_LINK!

export const SPONSORSHIP_SLOTS = {
  TOTAL: 3,
  USED: 2,
} as const

export const DOMAIN_AUTHORITY = 37
