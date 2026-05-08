import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

// Launch status enum
export const launchStatus = {
  PAYMENT_PENDING: "payment_pending",
  PAYMENT_FAILED: "payment_failed",
  SCHEDULED: "scheduled",
  ONGOING: "ongoing",
  LAUNCHED: "launched",
} as const

export type LaunchStatus = (typeof launchStatus)[keyof typeof launchStatus]

// Launch type enum
export const launchType = {
  FREE: "free",
  FREE_WITH_BADGE: "free_with_badge",
  PREMIUM: "premium",
  PREMIUM_PLUS: "premium_plus",
} as const

export type LaunchType = (typeof launchType)[keyof typeof launchType]

// Ajouter de nouveaux enums pour les projets tech
export const pricingType = {
  FREE: "free",
  FREEMIUM: "freemium",
  PAID: "paid",
} as const

export const platformType = {
  WEB: "web",
  MOBILE: "mobile",
  DESKTOP: "desktop",
  API: "api",
  OTHER: "other",
} as const

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  role: text("role"),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  isBot: boolean("is_bot").default(false),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
})

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull(),
    websiteUrl: text("website_url").notNull().unique(),
    logoUrl: text("logo_url").notNull(),
    coverImageUrl: text("cover_image_url"),
    productImage: text("product_image"),
    githubUrl: text("github_url"),
    twitterUrl: text("twitter_url"),
    techStack: text("tech_stack").array(), // Array des technologies
    pricing: text("pricing").notNull().default(pricingType.FREE),
    platforms: text("platforms").array(), // Array des plateformes supportées
    launchStatus: text("launch_status").notNull().default(launchStatus.SCHEDULED),
    scheduledLaunchDate: timestamp("scheduled_launch_date"),
    launchType: text("launch_type").default(launchType.FREE),
    featuredOnHomepage: boolean("featured_on_homepage").default(false),
    dailyRanking: integer("daily_ranking"),
    hasBadgeVerified: boolean("has_badge_verified").default(false),
    badgeVerifiedAt: timestamp("badge_verified_at"),
    sourceLocale: text("source_locale").notNull().default("en"),
    relatedAttemptedAt: timestamp("related_attempted_at"),
    alternativesAttemptedAt: timestamp("alternatives_attempted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => {
    return {
      nameIdx: index("project_name_idx").on(table.name),
    }
  },
)

// ─── Project translations (description per locale) ───────────────────────────
export const projectTranslation = pgTable(
  "project_translation",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    description: text("description").notNull(),
    isSource: boolean("is_source").notNull().default(false),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    longDescription: text("long_description"),
    longDescriptionGeneratedAt: timestamp("long_description_generated_at"),
  },
  (table) => {
    return {
      pk: primaryKey(table.projectId, table.locale),
      projectIdIdx: index("project_translation_project_id_idx").on(table.projectId),
      localeIdx: index("project_translation_locale_idx").on(table.locale),
    }
  },
)

// AI-picked related/alternative products, regenerated by the relate-projects cron.
// (project_id, rank) is unique — concurrent runs trying to insert duplicate
// ranks will fail and the catch handler in the cron logs + skips.
export const projectRelated = pgTable(
  "project_related",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    relatedProjectId: text("related_project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      pk: primaryKey(table.projectId, table.relatedProjectId),
      projectIdIdx: index("project_related_project_id_idx").on(table.projectId),
      projectRankUniq: uniqueIndex("project_related_project_rank_uniq").on(
        table.projectId,
        table.rank,
      ),
    }
  },
)

export const category = pgTable(
  "category",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      nameIdx: index("category_name_idx").on(table.name),
    }
  },
)

// Junction table for many-to-many relationship between projects and categories
export const projectToCategory = pgTable(
  "project_to_category",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
  },
  (table) => {
    return {
      pk: primaryKey(table.projectId, table.categoryId),
    }
  },
)

// Interactions
export const upvote = pgTable("upvote", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Tables pour Fuma Comment
export const fumaRoles = pgTable("fuma_roles", {
  userId: varchar("user_id", { length: 256 }).primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  canDelete: boolean("can_delete").notNull(),
})

export const fumaComments = pgTable("fuma_comments", {
  id: serial("id").primaryKey().notNull(),
  page: varchar("page", { length: 256 }).notNull(),
  thread: integer("thread"),
  author: varchar("author", { length: 256 }).notNull(),
  content: json("content").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
})

export const fumaRates = pgTable(
  "fuma_rates",
  {
    userId: varchar("user_id", { length: 256 }).notNull(),
    commentId: integer("comment_id").notNull(),
    like: boolean("like").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.commentId] }),
    index("comment_idx").on(table.commentId),
  ],
)

// New table for tracking daily launches
export const launchQuota = pgTable("launch_quota", {
  id: text("id").primaryKey(),
  date: timestamp("date").notNull().unique(),
  freeCount: integer("free_count").notNull().default(0),
  badgeCount: integer("badge_count").notNull().default(0),
  premiumCount: integer("premium_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// New table for tracking project submissions during coming soon phase
export const waitlistSubmission = pgTable("waitlist_submission", {
  id: text("id").primaryKey(),
  projectUrl: text("project_url").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
})

export const seoArticle = pgTable(
  "seo_article",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    content: text("content").notNull(), // Contenu MDX complet
    image: text("image"), // URL de l'image principale
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    publishedAt: timestamp("published_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      slugIdx: index("seo_article_slug_idx").on(table.slug),
    }
  },
)

export const blogArticle = pgTable(
  "blog_article",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    content: text("content").notNull(), // Contenu MDX complet
    image: text("image"), // URL de l'image principale
    tags: text("tags").array(), // Array des tags
    author: text("author").notNull().default("Open Launch Team"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    publishedAt: timestamp("published_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      slugIdx: index("blog_article_slug_idx").on(table.slug),
      publishedAtIdx: index("blog_article_published_at_idx").on(table.publishedAt),
    }
  },
)

// Promo Code tables
export const promoCode = pgTable(
  "promo_code",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    discountAmount: text("discount_amount").notNull().default("2.99"),
    usageLimit: integer("usage_limit"), // NULL means unlimited
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      codeIdx: index("promo_code_code_idx").on(table.code),
      expiresAtIdx: index("promo_code_expires_at_idx").on(table.expiresAt),
    }
  },
)

export const promoCodeUsage = pgTable(
  "promo_code_usage",
  {
    id: text("id").primaryKey(),
    promoCodeId: text("promo_code_id")
      .notNull()
      .references(() => promoCode.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    usedAt: timestamp("used_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      userIdIdx: index("promo_code_usage_user_id_idx").on(table.userId),
      promoCodeIdIdx: index("promo_code_usage_promo_code_id_idx").on(table.promoCodeId),
    }
  },
)

// ProductHunt import tracking table
export const productHuntImport = pgTable(
  "product_hunt_import",
  {
    id: text("id").primaryKey(),
    productHuntId: text("product_hunt_id").notNull().unique(),
    productHuntUrl: text("product_hunt_url").notNull(),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    votesCount: integer("votes_count"),
    rank: integer("rank"), // 当日排名 1-5
    importedAt: timestamp("imported_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      productHuntIdIdx: index("product_hunt_import_ph_id_idx").on(table.productHuntId),
      projectIdIdx: index("product_hunt_import_project_id_idx").on(table.projectId),
    }
  },
)

// ─── Tag moderation status ───────────────────────────────────────────────────
export const tagModerationStatus = {
  APPROVED: "approved",
  PENDING: "pending",
  FLAGGED: "flagged",
  DELETED: "deleted",
} as const

export type TagModerationStatus = (typeof tagModerationStatus)[keyof typeof tagModerationStatus]

// ─── Tags ────────────────────────────────────────────────────────────────────
export const tag = pgTable(
  "tag",
  {
    id: text("id").primaryKey(), // slugified, e.g. "machine-learning"
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    moderationStatus: text("moderation_status").notNull().default(tagModerationStatus.APPROVED),
    moderationNote: text("moderation_note"),
    projectCount: integer("project_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      slugIdx: index("tag_slug_idx").on(table.slug),
      moderationStatusIdx: index("tag_moderation_status_idx").on(table.moderationStatus),
    }
  },
)

export const projectToTag = pgTable(
  "project_to_tag",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (table) => {
    return {
      pk: primaryKey(table.projectId, table.tagId),
      tagIdIdx: index("project_to_tag_tag_id_idx").on(table.tagId),
    }
  },
)

// ─── Crawl cache ─────────────────────────────────────────────────────────────
export const crawledData = pgTable(
  "crawled_data",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull().unique(),
    projectId: text("project_id").references(() => project.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    contentHash: text("content_hash"),
    crawledAt: timestamp("crawled_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      urlIdx: index("crawled_data_url_idx").on(table.url),
      projectIdIdx: index("crawled_data_project_id_idx").on(table.projectId),
      expiresAtIdx: index("crawled_data_expires_at_idx").on(table.expiresAt),
    }
  },
)

// ─── Comparison pages ────────────────────────────────────────────────────────
export const comparisonPage = pgTable(
  "comparison_page",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    projectAId: text("project_a_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    projectBId: text("project_b_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => category.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    content: text("content").notNull(),
    structuredData: json("structured_data"),
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      slugIdx: index("comparison_page_slug_idx").on(table.slug),
      projectAIdx: index("comparison_page_project_a_idx").on(table.projectAId),
      projectBIdx: index("comparison_page_project_b_idx").on(table.projectBId),
    }
  },
)

// ─── Alternative pages ───────────────────────────────────────────────────────
export const alternativePage = pgTable(
  "alternative_page",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    subjectProjectId: text("subject_project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    content: text("content").notNull(),
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      slugIdx: index("alternative_page_slug_idx").on(table.slug),
      subjectProjectIdIdx: index("alternative_page_subject_project_id_idx").on(
        table.subjectProjectId,
      ),
    }
  },
)

export const alternativePageToProject = pgTable(
  "alternative_page_to_project",
  {
    alternativePageId: text("alternative_page_id")
      .notNull()
      .references(() => alternativePage.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    aiScore: integer("ai_score"),
    prosConsJson: json("pros_cons_json"),
    useCases: text("use_cases"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => {
    return {
      pk: primaryKey(table.alternativePageId, table.projectId),
      pageIdIdx: index("alt_page_to_project_page_id_idx").on(table.alternativePageId),
      projectIdIdx: index("alt_page_to_project_project_id_idx").on(table.projectId),
    }
  },
)

// ─── AI usage log ────────────────────────────────────────────────────────────
// One row per successful DeepSeek call so the admin dashboard can show
// token spend over time, broken down by which library function made the call.
export const aiUsageLog = pgTable(
  "ai_usage_log",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    functionName: text("function_name").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
  },
  (table) => {
    return {
      createdAtIdx: index("ai_usage_created_at_idx").on(table.createdAt),
      functionNameIdx: index("ai_usage_function_name_idx").on(table.functionName),
    }
  },
)

// ─── Admin audit log ─────────────────────────────────────────────────────────
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: json("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      adminUserIdIdx: index("admin_audit_log_admin_user_id_idx").on(table.adminUserId),
      actionIdx: index("admin_audit_log_action_idx").on(table.action),
      createdAtIdx: index("admin_audit_log_created_at_idx").on(table.createdAt),
    }
  },
)
