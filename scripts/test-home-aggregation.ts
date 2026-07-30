import { Client } from "pg"

const connectionString = process.env.HOME_QUERY_TEST_DATABASE_URL
if (!connectionString) {
  throw new Error("HOME_QUERY_TEST_DATABASE_URL is required")
}

const target = new URL(connectionString)
const databaseName = target.pathname.replace(/^\//, "")
if (
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname) ||
  !databaseName.startsWith("open_launch_home_test")
) {
  throw new Error(
    "Refusing home query test: target must be loopback and named open_launch_home_test*",
  )
}

const schemaName = `home_query_test_${process.pid}_${crypto.randomUUID().replaceAll("-", "")}`
const client = new Client({ connectionString })
await client.connect()

const legacyQuery = `
  SELECT
    p.id,
    count(DISTINCT u.id)::int AS upvote_count,
    count(DISTINCT c.id)::int AS comment_count
  FROM project p
  LEFT JOIN upvote u ON u.project_id = p.id
  LEFT JOIN fuma_comments c ON c.page::text = p.id
  GROUP BY p.id
  ORDER BY upvote_count DESC, p.id
`

const aggregatedQuery = `
  WITH upvote_counts AS (
    SELECT project_id, count(id)::int AS upvote_count
    FROM upvote
    GROUP BY project_id
  ),
  comment_counts AS (
    SELECT page::text AS project_id, count(id)::int AS comment_count
    FROM fuma_comments
    GROUP BY page
  )
  SELECT
    p.id,
    coalesce(u.upvote_count, 0)::int AS upvote_count,
    coalesce(c.comment_count, 0)::int AS comment_count
  FROM project p
  LEFT JOIN upvote_counts u ON u.project_id = p.id
  LEFT JOIN comment_counts c ON c.project_id = p.id
  ORDER BY upvote_count DESC, p.id
`

try {
  await client.query(`CREATE SCHEMA "${schemaName}"`)
  await client.query(`SET search_path TO "${schemaName}", public`)
  await client.query(`
    CREATE TABLE project (
      id text PRIMARY KEY,
      name text NOT NULL
    );
    CREATE TABLE upvote (
      id serial PRIMARY KEY,
      project_id text NOT NULL REFERENCES project(id)
    );
    CREATE INDEX upvote_project_id_idx ON upvote(project_id);
    CREATE TABLE fuma_comments (
      id serial PRIMARY KEY,
      page varchar(256) NOT NULL
    );
    CREATE INDEX fuma_comments_page_idx ON fuma_comments(page);
  `)
  await client.query(`
    INSERT INTO project (id, name)
    VALUES ('zero', 'Zero'), ('one', 'One'), ('many', 'Many'), ('comments-only', 'Comments only');

    INSERT INTO upvote (project_id) VALUES ('one');
    INSERT INTO fuma_comments (page) VALUES ('one');
    INSERT INTO upvote (project_id)
    SELECT 'many' FROM generate_series(1, 300);
    INSERT INTO fuma_comments (page)
    SELECT 'many' FROM generate_series(1, 250);
    INSERT INTO fuma_comments (page)
    SELECT 'comments-only' FROM generate_series(1, 7);
    ANALYZE;
  `)

  const [legacy, aggregated] = await Promise.all([
    client.query(legacyQuery),
    client.query(aggregatedQuery),
  ])
  assert(
    JSON.stringify(legacy.rows) === JSON.stringify(aggregated.rows),
    `aggregated counts changed results:\nlegacy=${JSON.stringify(legacy.rows)}\naggregated=${JSON.stringify(aggregated.rows)}`,
  )
  assert(
    JSON.stringify(aggregated.rows) ===
      JSON.stringify([
        { id: "many", upvote_count: 300, comment_count: 250 },
        { id: "one", upvote_count: 1, comment_count: 1 },
        { id: "comments-only", upvote_count: 0, comment_count: 7 },
        { id: "zero", upvote_count: 0, comment_count: 0 },
      ]),
    "0/1/many fixture did not return the expected counts and ordering",
  )

  const [legacyPlanResult, aggregatedPlanResult] = await Promise.all([
    client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${legacyQuery}`),
    client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${aggregatedQuery}`),
  ])
  const legacyPlan = legacyPlanResult.rows[0]["QUERY PLAN"][0]
  const aggregatedPlan = aggregatedPlanResult.rows[0]["QUERY PLAN"][0]
  const legacyPeakRows = peakActualRows(legacyPlan.Plan)
  const aggregatedPeakRows = peakActualRows(aggregatedPlan.Plan)

  assert(
    legacyPeakRows > aggregatedPeakRows * 10,
    `expected pre-aggregation to eliminate the U×C intermediate (${legacyPeakRows} vs ${aggregatedPeakRows})`,
  )

  console.log(
    JSON.stringify(
      {
        status: "passed",
        fixtures: aggregated.rows,
        legacy: {
          executionTimeMs: legacyPlan["Execution Time"],
          peakActualRows: legacyPeakRows,
        },
        aggregated: {
          executionTimeMs: aggregatedPlan["Execution Time"],
          peakActualRows: aggregatedPeakRows,
        },
      },
      null,
      2,
    ),
  )
} finally {
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
  await client.end()
}

function peakActualRows(plan: Record<string, unknown>): number {
  const ownRows = Number(plan["Actual Rows"] ?? 0)
  const childRows = Array.isArray(plan.Plans)
    ? plan.Plans.map((child) => peakActualRows(child as Record<string, unknown>))
    : []
  return Math.max(ownRows, ...childRows)
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
