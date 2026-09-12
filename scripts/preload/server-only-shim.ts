// Preload shim for DB-backed maintenance scripts run under plain bun.
//
// `lib/observability/structured-logger.ts` starts with `import "server-only"`.
// Next aliases that specifier to next/dist/compiled/server-only at build time,
// so production is fine — but the `server-only` package is not installed, so a
// bare `bun scripts/seed-blog.ts` fails with:
//
//   error: Cannot find package 'server-only' from 'lib/observability/structured-logger.ts'
//
// Registering an empty module for that specifier fixes it. The script itself
// stays the entrypoint, so its argv is untouched:
//
//   bun --preload ./scripts/preload/server-only-shim.ts scripts/seed-blog.ts --dry-run
import { plugin } from "bun"

plugin({
  name: "server-only-shim",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }))
  },
})
