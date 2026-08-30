# Rate-limiting boundaries

The repository has three deliberately different limiting mechanisms. Their
names describe the boundary; they are not interchangeable.

| Module                                | Boundary                                       | Coordination                                      | Failure policy                                     | Typical caller                |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- | ----------------------------- |
| `lib/rate-limit.ts`                   | Inbound abuse control, dedupe and reservations | Redis, with explicitly selected bounded fallbacks | Chosen per call; money-sensitive paths fail closed | API routes and Server Actions |
| `lib/comment-rate-limit.ts`           | Comment/upvote policy presets                  | Delegates to `rate-limit.ts`                      | Fail closed                                        | Fuma Comment route            |
| `lib/sliding-window-queue-limiter.ts` | Outbound provider throughput                   | One Node process, FIFO queue                      | Bounded wait then rejection                        | Tinyfish Fetch                |

`lib/rate-limiter.ts` is a compatibility re-export only. New code must import
`SlidingWindowQueueLimiter` from its explicit module. Do not use the
process-local queue to protect rankings, payments, uploads or any route that can
be served by more than one replica.

Thresholds that express product policy belong in `lib/constants.ts` or the
domain-specific wrapper. Storage/coordination behavior belongs in the limiter
implementation. This separation prevents a provider throughput cap from being
mistaken for a security boundary.
