import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // React Compiler rules shipped in eslint-config-next 16. All flag
    // real concerns but pre-existing call sites pre-date the rules —
    // demote to warning so the Next 16 upgrade lands without unrelated
    // refactors; sweep the call sites in a follow-up.
    //
    // - set-state-in-effect: setState inside useEffect body
    // - purity:              Date.now()/Math.random() during render
    // - static-components:   defining components during render
    // - immutability:        const reassignment via TDZ-style access
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // Scripts and tests have lower bars than the main app code.
    files: ["scripts/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
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
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
]

export default eslintConfig
