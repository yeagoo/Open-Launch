/**
 * Project search — relevance-ranked, typo-tolerant, pagination-ready.
 *
 * Matching strategy (migration 0053 has the supporting indexes):
 *   - similarity(name, q) > threshold        — trigram; catches typos and
 *                                              works for CJK names, which
 *                                              tsvector can't segment
 *   - tsvector(name + tag-stripped description) @@ query  — longer English
 *                                              text relevance
 *   - source-locale tagline similarity/FTS   — one-line marketing summary
 *   - queries < 3 chars fall back to an ILIKE prefix (trigrams are useless
 *                                              below 3 characters)
 *
 * The tsvector EXPRESSIONS here must stay byte-identical to the ones in
 * drizzle/migrations/0053_search_indexes.sql or the expression indexes
 * silently stop being used.
 */

import { db } from "@/drizzle/db"
import { sql } from "drizzle-orm"

export interface ProjectSearchHit {
  id: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
}

export interface ProjectSearchPage {
  hits: ProjectSearchHit[]
  totalCount: number
}

// Matching uses the `%` trigram operator (index-backed via gin_trgm_ops);
// similarity() itself is only used for ORDER BY ranking because a bare
// `similarity(...) > x` predicate CANNOT use the index and would seq-scan
// the whole project table on every keystroke. `%` honors the session's
// pg_trgm.similarity_threshold (default 0.3 — a sane precision/recall
// point; the ranking below still prefers the closest matches).
// `<%` is the word-similarity variant (index-backed as well): it matches
// a typo'd single WORD inside a longer name ("prduct" ~ "Product
// Launchify"), which whole-string `%` is too strict to catch. The ILIKE
// contains arm preserves the pre-upgrade substring behavior (gin_trgm_ops
// accelerates ILIKE too, so it stays index-backed).

export async function searchProjects({
  query,
  limit,
  offset,
}: {
  query: string
  limit: number
  offset: number
}): Promise<ProjectSearchPage> {
  const q = query.trim()
  if (q.length < 2) return { hits: [], totalCount: 0 }

  const result = await db.execute<{
    id: string
    name: string
    slug: string
    description: string | null
    logo_url: string | null
    total: number
  }>(sql`
    WITH q AS (SELECT ${q}::text AS term),
    matched AS (
      SELECT
        p.id,
        p.name,
        p.slug,
        p.description,
        p.logo_url,
        similarity(p.name, q.term) AS name_sim,
        ts_rank(
          to_tsvector('simple', p.name || ' ' || regexp_replace(p.description, '<[^>]*>', ' ', 'g')),
          plainto_tsquery('simple', q.term)
        ) AS fts_rank,
        COALESCE((
          SELECT max(similarity(t.tagline, q.term))
          FROM project_translation t
          WHERE t.project_id = p.id AND t.is_source AND t.tagline IS NOT NULL
        ), 0) AS tagline_sim
      FROM project p, q
      WHERE p.launch_status IN ('ongoing', 'launched')
        AND (
          p.name % q.term
          OR q.term <% p.name
          OR p.name ILIKE '%' || q.term || '%'
          OR to_tsvector('simple', p.name || ' ' || regexp_replace(p.description, '<[^>]*>', ' ', 'g'))
             @@ plainto_tsquery('simple', q.term)
          OR (length(q.term) < 3 AND p.name ILIKE q.term || '%')
          OR EXISTS (
            SELECT 1 FROM project_translation t
            WHERE t.project_id = p.id AND t.is_source AND t.tagline IS NOT NULL
              AND (
                t.tagline % q.term
                OR q.term <% t.tagline
                OR t.tagline ILIKE '%' || q.term || '%'
                OR to_tsvector('simple', coalesce(t.tagline, '')) @@ plainto_tsquery('simple', q.term)
              )
          )
        )
    )
    SELECT id, name, slug, description, logo_url, count(*) OVER()::int AS total
    FROM matched
    ORDER BY name_sim DESC, fts_rank DESC, tagline_sim DESC, name ASC
    LIMIT ${limit} OFFSET ${offset}
  `)

  let rows = result.rows
  let totalCount = rows[0]?.total ?? 0

  // count(*) OVER() only rides along on returned rows — a page beyond the
  // last match returns zero rows and would falsely report totalCount=0
  // (and lose the pagination path back). Re-count only in that rare case.
  if (rows.length === 0 && offset > 0) {
    const countResult = await db.execute<{ total: number }>(sql`
      WITH q AS (SELECT ${q}::text AS term)
      SELECT count(*)::int AS total
      FROM project p, q
      WHERE p.launch_status IN ('ongoing', 'launched')
        AND (
          p.name % q.term
          OR q.term <% p.name
          OR p.name ILIKE '%' || q.term || '%'
          OR to_tsvector('simple', p.name || ' ' || regexp_replace(p.description, '<[^>]*>', ' ', 'g'))
             @@ plainto_tsquery('simple', q.term)
          OR (length(q.term) < 3 AND p.name ILIKE q.term || '%')
          OR EXISTS (
            SELECT 1 FROM project_translation t
            WHERE t.project_id = p.id AND t.is_source AND t.tagline IS NOT NULL
              AND (
                t.tagline % q.term
                OR q.term <% t.tagline
                OR t.tagline ILIKE '%' || q.term || '%'
                OR to_tsvector('simple', coalesce(t.tagline, '')) @@ plainto_tsquery('simple', q.term)
              )
          )
        )
    `)
    totalCount = countResult.rows[0]?.total ?? 0
  }

  // Recall path: the index-backed operators above use fixed GUC
  // thresholds (similarity 0.3 / word_similarity 0.6), so a strong typo
  // can score below both and return nothing. Only when the PRIMARY search
  // has zero matches in total — never on the hot path — fall back to a
  // full similarity() scan at a low threshold (can't use the trgm index,
  // but zero-match queries are rare). Runs for any offset so fallback-only
  // result sets paginate consistently.
  if (totalCount === 0) {
    const fallback = await db.execute<{
      id: string
      name: string
      slug: string
      description: string | null
      logo_url: string | null
      total: number
    }>(sql`
      WITH q AS (SELECT ${q}::text AS term),
      matched AS (
        SELECT
          p.id, p.name, p.slug, p.description, p.logo_url,
          similarity(p.name, q.term) AS name_sim
        FROM project p, q
        WHERE p.launch_status IN ('ongoing', 'launched')
          AND (
            similarity(p.name, q.term) > 0.15
            OR EXISTS (
              SELECT 1 FROM project_translation t
              WHERE t.project_id = p.id AND t.is_source AND t.tagline IS NOT NULL
                AND similarity(t.tagline, q.term) > 0.2
            )
          )
      )
      SELECT id, name, slug, description, logo_url, count(*) OVER()::int AS total
      FROM matched
      ORDER BY name_sim DESC, name ASC
      LIMIT ${limit} OFFSET ${offset}
    `)
    rows = fallback.rows
    totalCount = fallback.rows[0]?.total ?? 0

    // Same empty-page edge as the primary path: an offset beyond the last
    // fallback row returns no rows, so re-count instead of reporting 0.
    if (fallback.rows.length === 0 && offset > 0) {
      const fallbackCount = await db.execute<{ total: number }>(sql`
        WITH q AS (SELECT ${q}::text AS term)
        SELECT count(*)::int AS total
        FROM project p, q
        WHERE p.launch_status IN ('ongoing', 'launched')
          AND (
            similarity(p.name, q.term) > 0.15
            OR EXISTS (
              SELECT 1 FROM project_translation t
              WHERE t.project_id = p.id AND t.is_source AND t.tagline IS NOT NULL
                AND similarity(t.tagline, q.term) > 0.2
            )
          )
      `)
      totalCount = fallbackCount.rows[0]?.total ?? 0
    }
  }

  return {
    hits: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      logoUrl: r.logo_url,
    })),
    totalCount,
  }
}
