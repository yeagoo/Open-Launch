/**
 * Pure-data cache-tag constants. Lives outside any `"use server"`
 * file because `"use server"` is only allowed to export async
 * functions — non-function exports there fail the build with
 * "Only async functions are allowed to be exported".
 *
 * Bust these via `revalidateTag(...)` whenever the underlying data
 * shifts in a way that should surface faster than the cache window.
 */

// Home-page project listings (today / yesterday / month). Busted by
// the 8 AM UTC `update-launches` cron when project statuses
// transition, so the new "today" set goes live immediately rather
// than after the 10-minute cache window.
export const HOME_PROJECTS_TAG = "home-projects"

// Top categories shown in the home sidebar. Also busted by the
// launch-transition cron since the project↔category counts change
// when new launches go ONGOING. Also busted by admin moderation
// flows (project edits, category remaps) so the sidebar reflects
// edits without waiting up to an hour.
export const TOP_CATEGORIES_TAG = "top-categories"

// Per-day winners cache (used by `/winners`). Same cron-driven
// invalidation as HOME_PROJECTS_TAG — but kept separate so a
// future "live winners" UI could bust it independently.
export const WINNERS_TAG = "winners"

// AI-generated "related products" recommendations shown on the
// project detail page. Refreshed by the `relate-projects` cron;
// also affected when a project is flagged low-quality (the
// filter drops it from results).
export const PROJECT_RELATED_TAG = "project-related"

// Sidebar comparison + alternatives links shown on the project
// detail page. Refreshed by the `generate-comparisons` and
// `generate-alternatives` crons when they ship new pages.
export const PROJECT_SIDEBAR_LINKS_TAG = "project-sidebar-links"
