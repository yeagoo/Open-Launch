import { createHmac } from "node:crypto"

import { Client } from "pg"

export const releaseFixture = {
  userId: "open-launch-e2e-user",
  sessionId: "open-launch-e2e-session",
  sessionToken: "open-launch-e2e-session-token",
  categoryId: "open-launch-e2e-category",
  projectId: "open-launch-e2e-project",
  projectName: "Release Gate Fixture",
  projectSlug: "release-gate-fixture",
} as const

export const releaseUserAuthFile = "test-results/.auth/release-user.json"
export const communityModeratorAuthFile = "test-results/.auth/community-moderator.json"

/** Forum rows used only by the loopback Playwright release fixture. */
export const communityFixture = {
  authorId: "open-launch-e2e-community-author",
  moderatorId: "open-launch-e2e-community-moderator",
  moderatorSessionId: "open-launch-e2e-community-moderator-session",
  moderatorSessionToken: "open-launch-e2e-community-moderator-session-token",
  threadId: "10000000-0000-4000-8000-000000000001",
  threadTitle: "Release-gate community update",
  threadBody: "A deterministic public community update for the browser release gate.",
  moderationThreadId: "10000000-0000-4000-8000-000000000002",
  moderationTitle: "Release-gate moderation fixture",
  moderationBody: "A deterministic report target for the moderator browser release gate.",
  reportId: "10000000-0000-4000-8000-000000000003",
  reportReason: "The isolated moderator fixture needs review before a public launch.",
} as const

function assertSafeE2EUrl(connectionString: string): URL {
  const url = new URL(connectionString)
  if (
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    !url.pathname.slice(1).startsWith("open_launch_e2e")
  ) {
    throw new Error("E2E_DATABASE_URL must target a loopback database named open_launch_e2e*")
  }
  return url
}

export function signedSessionCookie(token: string, secret: string): string {
  if (!secret.startsWith("open-launch-e2e-")) {
    throw new Error("E2E auth secret must start with open-launch-e2e-")
  }
  // better-call (used by Better Auth 1.6) requires a 44-character padded
  // standard-base64 HMAC, then URL-encodes the complete signed value.
  const signature = createHmac("sha256", secret).update(token).digest("base64")
  return encodeURIComponent(`${token}.${signature}`)
}

/** Read only the moderation state needed to synchronize a loopback browser fixture. */
export async function communityThreadModeration(
  connectionString: string,
  threadId: string,
): Promise<string | null> {
  assertSafeE2EUrl(connectionString)
  const client = new Client({ connectionString })
  await client.connect()
  try {
    const { rows } = await client.query<{ moderation: string }>(
      "SELECT moderation FROM community_thread WHERE id = $1",
      [threadId],
    )
    return rows[0]?.moderation ?? null
  } finally {
    await client.end()
  }
}

export async function seedReleaseFixture(connectionString: string): Promise<void> {
  assertSafeE2EUrl(connectionString)
  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `INSERT INTO "user"
         (id, name, email, email_verified, created_at, updated_at, role, banned, is_bot)
       VALUES ($1, $2, $3, true, now(), now(), 'user', false, false)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             email = EXCLUDED.email,
             email_verified = true,
             updated_at = now(),
             banned = false`,
      [releaseFixture.userId, "Release Gate User", "release-gate@example.invalid"],
    )
    for (const fixtureUser of [
      {
        id: communityFixture.authorId,
        name: "Community Fixture Author",
        email: "community-author@example.invalid",
        role: "user",
      },
      {
        id: communityFixture.moderatorId,
        name: "Community Fixture Moderator",
        email: "community-moderator@example.invalid",
        role: "admin",
      },
    ]) {
      await client.query(
        `INSERT INTO "user"
           (id, name, email, email_verified, created_at, updated_at, role, banned, is_bot)
         VALUES ($1, $2, $3, true, now(), now(), $4, false, false)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name,
               email = EXCLUDED.email,
               email_verified = true,
               role = EXCLUDED.role,
               updated_at = now(),
               banned = false`,
        [fixtureUser.id, fixtureUser.name, fixtureUser.email, fixtureUser.role],
      )
    }
    await client.query(
      `INSERT INTO session
         (id, expires_at, token, created_at, updated_at, user_id, ip_address, user_agent)
       VALUES ($1, now() + interval '1 day', $2, now(), now(), $3, '127.0.0.1', 'playwright')
       ON CONFLICT (id) DO UPDATE
         SET expires_at = EXCLUDED.expires_at,
             token = EXCLUDED.token,
             updated_at = now(),
             user_id = EXCLUDED.user_id`,
      [releaseFixture.sessionId, releaseFixture.sessionToken, releaseFixture.userId],
    )
    await client.query(
      `INSERT INTO session
         (id, expires_at, token, created_at, updated_at, user_id, ip_address, user_agent)
       VALUES ($1, now() + interval '1 day', $2, now(), now(), $3, '127.0.0.1', 'playwright')
       ON CONFLICT (id) DO UPDATE
         SET expires_at = EXCLUDED.expires_at,
             token = EXCLUDED.token,
             updated_at = now(),
             user_id = EXCLUDED.user_id`,
      [
        communityFixture.moderatorSessionId,
        communityFixture.moderatorSessionToken,
        communityFixture.moderatorId,
      ],
    )
    await client.query(
      `INSERT INTO category (id, name, created_at, updated_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [releaseFixture.categoryId, "Release Engineering"],
    )
    await client.query(
      `INSERT INTO project
         (id, name, slug, description, website_url, logo_url, pricing, platforms,
          launch_status, scheduled_launch_date, launch_type, source_locale,
          is_low_quality, created_at, updated_at, created_by)
       VALUES
         ($1, $2, $3, $4, $5, $6, 'free', ARRAY['web'], 'ongoing', now(),
          'free', 'en', false, now(), now(), $7)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             slug = EXCLUDED.slug,
             description = EXCLUDED.description,
             website_url = EXCLUDED.website_url,
             logo_url = EXCLUDED.logo_url,
             launch_status = EXCLUDED.launch_status,
             scheduled_launch_date = EXCLUDED.scheduled_launch_date,
             updated_at = now(),
             created_by = EXCLUDED.created_by`,
      [
        releaseFixture.projectId,
        releaseFixture.projectName,
        releaseFixture.projectSlug,
        "A deterministic local fixture for release-gate browser tests.",
        "https://release-gate.example.invalid",
        "/logo.svg",
        releaseFixture.userId,
      ],
    )
    await client.query(
      `INSERT INTO project_translation
         (project_id, locale, description, is_source, ai_generated, generated_at, updated_at, tagline)
       VALUES ($1, 'en', $2, true, false, now(), now(), $3)
       ON CONFLICT (project_id, locale) DO UPDATE
         SET description = EXCLUDED.description,
             is_source = true,
             updated_at = now(),
             tagline = EXCLUDED.tagline`,
      [
        releaseFixture.projectId,
        "A deterministic local fixture for release-gate browser tests.",
        "Release confidence without production side effects",
      ],
    )
    await client.query(
      `INSERT INTO project_to_category (project_id, category_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [releaseFixture.projectId, releaseFixture.categoryId],
    )
    // Reset only deterministic loopback forum rows. Deleting the threads
    // cascades replies, reactions and reports so a retried browser run starts
    // with the same public post and moderator queue.
    await client.query("DELETE FROM community_thread WHERE id = ANY($1::uuid[])", [
      [communityFixture.threadId, communityFixture.moderationThreadId],
    ])
    await client.query(
      `DELETE FROM community_thread
       WHERE author_id = $1 AND lifecycle = 'draft'`,
      [releaseFixture.userId],
    )
    await client.query(
      `INSERT INTO community_thread
         (id, author_id, type, project_id, title, body, lifecycle, moderation,
          published_at, created_at, updated_at)
       VALUES
         ($1, $2, 'Shipped', $3, $4, $5, 'published', 'public', now(), now(), now()),
         ($6, $2, 'Question', NULL, $7, $8, 'published', 'public', now(), now(), now())`,
      [
        communityFixture.threadId,
        communityFixture.authorId,
        releaseFixture.projectId,
        communityFixture.threadTitle,
        communityFixture.threadBody,
        communityFixture.moderationThreadId,
        communityFixture.moderationTitle,
        communityFixture.moderationBody,
      ],
    )
    await client.query(
      `INSERT INTO community_report
         (id, reporter_id, thread_id, reason, content_snapshot, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', now())`,
      [
        communityFixture.reportId,
        releaseFixture.userId,
        communityFixture.moderationThreadId,
        communityFixture.reportReason,
        communityFixture.moderationBody,
      ],
    )
    // Setup is intentionally repeatable: retries start from a deterministic
    // vote count and cannot reuse a checkout row from an earlier attempt.
    await client.query(`DELETE FROM upvote WHERE user_id = $1 AND project_id = $2`, [
      releaseFixture.userId,
      releaseFixture.projectId,
    ])
    await client.query(`DELETE FROM directory_order WHERE project_id = $1`, [
      releaseFixture.projectId,
    ])
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    await client.end()
  }
}
