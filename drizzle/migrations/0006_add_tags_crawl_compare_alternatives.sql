-- Tags table
CREATE TABLE IF NOT EXISTS "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"moderation_status" text DEFAULT 'approved' NOT NULL,
	"moderation_note" text,
	"project_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tag_name_unique" UNIQUE("name"),
	CONSTRAINT "tag_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tag_slug_idx" ON "tag" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tag_moderation_status_idx" ON "tag" USING btree ("moderation_status");
--> statement-breakpoint

-- Project to Tag junction table
CREATE TABLE IF NOT EXISTS "project_to_tag" (
	"project_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "project_to_tag_project_id_tag_id_pk" PRIMARY KEY("project_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "project_to_tag" ADD CONSTRAINT "project_to_tag_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_to_tag" ADD CONSTRAINT "project_to_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_to_tag_tag_id_idx" ON "project_to_tag" USING btree ("tag_id");
--> statement-breakpoint

-- Crawled data cache table
CREATE TABLE IF NOT EXISTS "crawled_data" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"project_id" text,
	"content" text NOT NULL,
	"content_hash" text,
	"crawled_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crawled_data_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "crawled_data" ADD CONSTRAINT "crawled_data_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawled_data_url_idx" ON "crawled_data" USING btree ("url");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawled_data_project_id_idx" ON "crawled_data" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawled_data_expires_at_idx" ON "crawled_data" USING btree ("expires_at");
--> statement-breakpoint

-- Comparison pages table
CREATE TABLE IF NOT EXISTS "comparison_page" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"project_a_id" text NOT NULL,
	"project_b_id" text NOT NULL,
	"category_id" text,
	"title" text NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"content" text NOT NULL,
	"structured_data" json,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comparison_page_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "comparison_page" ADD CONSTRAINT "comparison_page_project_a_id_project_id_fk" FOREIGN KEY ("project_a_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comparison_page" ADD CONSTRAINT "comparison_page_project_b_id_project_id_fk" FOREIGN KEY ("project_b_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comparison_page" ADD CONSTRAINT "comparison_page_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_page_slug_idx" ON "comparison_page" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_page_project_a_idx" ON "comparison_page" USING btree ("project_a_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_page_project_b_idx" ON "comparison_page" USING btree ("project_b_id");
--> statement-breakpoint

-- Alternative pages table
CREATE TABLE IF NOT EXISTS "alternative_page" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"subject_project_id" text NOT NULL,
	"title" text NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"content" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alternative_page_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "alternative_page" ADD CONSTRAINT "alternative_page_subject_project_id_project_id_fk" FOREIGN KEY ("subject_project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alternative_page_slug_idx" ON "alternative_page" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alternative_page_subject_project_id_idx" ON "alternative_page" USING btree ("subject_project_id");
--> statement-breakpoint

-- Alternative page to project junction table
CREATE TABLE IF NOT EXISTS "alternative_page_to_project" (
	"alternative_page_id" text NOT NULL,
	"project_id" text NOT NULL,
	"ai_score" integer,
	"pros_cons_json" json,
	"use_cases" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "alternative_page_to_project_alternative_page_id_project_id_pk" PRIMARY KEY("alternative_page_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "alternative_page_to_project" ADD CONSTRAINT "alt_page_to_project_alternative_page_id_fk" FOREIGN KEY ("alternative_page_id") REFERENCES "public"."alternative_page"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "alternative_page_to_project" ADD CONSTRAINT "alt_page_to_project_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alt_page_to_project_page_id_idx" ON "alternative_page_to_project" USING btree ("alternative_page_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alt_page_to_project_project_id_idx" ON "alternative_page_to_project" USING btree ("project_id");
