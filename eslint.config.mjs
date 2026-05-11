import { dirname } from "path"
import { fileURLToPath } from "url"

import { FlatCompat } from "@eslint/eslintrc"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Anything under `components/` is a candidate to end up in the
    // client bundle. Block direct imports of server-only modules
    // there — value imports of `lib/dr` or `drizzle/db` drag
    // pg/fs/net/tls into the browser bundle and the prod build
    // fails with "Module not found: Can't resolve 'fs'".
    //
    // Server-rendered components in `components/` are still free
    // to fetch from server actions or accept pre-fetched data as
    // props. The whitelist of safe imports is everything that
    // *isn't* in this list.
    files: ["components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          // `allowTypeImports: true` means `import type { ... }`
          // is fine — types are stripped at compile time and don't
          // affect the runtime bundle. We only want to block real
          // value imports that would drag pg/schema into the client.
          paths: [
            {
              name: "@/lib/dr",
              message:
                "Server-only — pulls `pg` into the client bundle. Use `@/lib/dr-domains` for the constants / `DRRecord` type, or call a server action.",
              allowTypeImports: true,
            },
            {
              name: "@/drizzle/db",
              message:
                "Server-only — pulls `pg` into the client bundle. Move the DB read into a server action and call that instead.",
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ["@/drizzle/db/*"],
              message:
                "Server-only. Move enum/data constants to `lib/project-enums` (or similar pure module), or call a server action.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
]

export default eslintConfig
