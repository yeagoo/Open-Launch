# Community Phase 9 browser reply-race gate

Date: 2026-09-15. Scope: prove the Phase 8 reply-submission guard through a
hydrated production standalone build and a real Next Server Action request. No
application behavior, migration, feature flag or remote target was changed.

## Delivered

- Added a Playwright member-flow test that opens the seeded public thread,
  fills a unique reply and dispatches two synchronous `submit` events to the
  actual reply form.
- The release test requires exactly one route-local `next-action` POST, one
  matching rendered reply, and a reply-heading increase of exactly one.
- The request observer keeps only a numeric count. It neither records nor
  prints request bodies, cookies, action IDs or response data.
- The existing moderator flow now waits for the isolated fixture's persisted
  moderation state before navigating away from its Server Action response.

## Review findings and corrections

| Finding                                                                                                                                                                 | Resolution                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The Phase 8 jsdom regression proved client behavior but did not exercise Next's hydrated Server Action transport.                                                       | Add the scenario to the existing authenticated Playwright release fixture.                                                                  |
| The first version of the new test tried to read the reply heading before navigating to the fixture thread.                                                              | Navigate explicitly before selecting the heading; the corrected focused browser run passes.                                                 |
| Keeping action URLs in the test listener was unnecessary for the assertion.                                                                                             | Count only matching requests, reducing retained test data to the minimum needed.                                                            |
| The moderator test treated receipt of an action response header as proof that its mutation was visible, then occasionally navigated early and cancelled the RSC stream. | Match the actual `next-action` request and poll the loopback fixture's `community_thread.moderation` value before the visibility assertion. |
| A real browser run must not use an existing developer database or Redis instance.                                                                                       | Start temporary loopback PostgreSQL and Redis containers on random ports, apply migrations there, then remove both containers.              |

## Validation

The focused browser test and the complete 21-test Playwright release gate passed
against a standalone build, a fresh loopback PostgreSQL database with all 65
hand-written migrations, and an isolated Redis instance. The temporary
containers were removed after the run.

The existing Phase 8 unit, database and static checks remain required; this gate
adds transport-level coverage rather than replacing them. No staging or
production action was performed.
