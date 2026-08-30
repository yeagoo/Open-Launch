/**
 * @deprecated Import `SlidingWindowQueueLimiter` from
 * `@/lib/sliding-window-queue-limiter` so this process-local outbound throttle
 * is not confused with the Redis-backed inbound limiter in `rate-limit.ts`.
 */
export {
  SlidingWindowQueueLimiter,
  SlidingWindowQueueLimiter as RateLimiter,
} from "@/lib/sliding-window-queue-limiter"
