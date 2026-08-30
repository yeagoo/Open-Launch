# Dependency override register

`package.json#overrides` is a security and runtime-compatibility control. It is
not a general “latest version” list. Every override must have a reason, a
removal condition and a reproducible lockfile review.

Last reviewed: **2026-08-30**

Owner: **Open Launch maintainers**

Review cadence: **monthly after `bun audit`, and on every direct framework
upgrade**

[GitHub Dependabot supports Bun's text `bun.lock`](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories#bun)
(Bun 1.1.39+). This repository uses Bun 1.3.14 and enables weekly Bun and GitHub
Actions update PRs in `.github/dependabot.yml`. Both update streams use an
explicit seven-day cooldown; security updates are not delayed by version-update
cooldowns. The legacy `bun.lockb` format was the blocker and has been removed.

## Current decisions

| Override                    | Decision                             | Evidence / origin                                                            | Remove or update when                                                                   |
| --------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `brace-expansion@5.0.9`     | Security floor                       | Bun audit remediation on 2026-08-30                                          | The full graph resolves to an equal/newer audited version without the override          |
| `fast-uri@3.1.5`            | Security floor                       | Bun audit remediation on 2026-08-30                                          | Same as above                                                                           |
| `nanoid@3.3.18`             | Security floor                       | GHSA-2v37-7h3g-55p8; transitive through PostCSS                              | PostCSS no longer resolves an affected Nano ID range                                    |
| `undici@7.29.0`             | Security floor and graph convergence | Direct dependency plus the jsdom path previously resolved different versions | All direct/transitive consumers accept an equal/newer audited version                   |
| `next@16.2.12`              | Framework release pin                | Production build/runtime release gate                                        | A separately reviewed Next upgrade passes build, browser and route-budget gates         |
| `postcss@8.5.23`            | Build-tool release pin               | Production CSS/build compatibility                                           | A reviewed Tailwind/PostCSS upgrade removes the need for convergence                    |
| `sharp@0.35.3`              | Native runtime pin                   | Production linux/x64 standalone import gate                                  | A reviewed Sharp/libvips upgrade passes dependency and standalone runtime checks        |
| `js-yaml@3.15.1`            | Security-review convergence          | Payment reconciliation hardening change set                                  | The dependency graph naturally resolves to an equal/newer audited version               |
| `@babel/core@7.29.7`        | Security-review convergence          | Security remediation change set `b7f0540`                                    | The graph naturally resolves to an equal/newer audited version                          |
| `@babel/runtime@7.29.7`     | Security-review convergence          | Security remediation change set `b7f0540`                                    | Same as above                                                                           |
| `@eslint/plugin-kit@0.4.1`  | Security-review convergence          | Security remediation change set `b7f0540`                                    | Same as above                                                                           |
| `esbuild@0.28.1`            | Security/build convergence           | Project submission/payment hardening dependency review                       | Same as above, after build and browser gates                                            |
| `flatted@3.4.2`             | Security-review convergence          | Security remediation change set `b7f0540`                                    | The graph naturally resolves to an equal/newer audited version                          |
| `kysely@0.28.17`            | Security-review convergence          | Security remediation change set `b7f0540`                                    | Same as above, after auth/database tests                                                |
| `linkify-it@5.0.2`          | Rich-text security convergence       | Security remediation change set `b7f0540`                                    | Same as above, after rich-text sanitization tests                                       |
| `markdown-it@14.3.0`        | Rich-text security convergence       | Security remediation change set `b7f0540`                                    | Same as above, after rich-text rendering tests                                          |
| `mdast-util-to-hast@13.2.1` | Markdown pipeline convergence        | Security remediation change set `b7f0540`                                    | Same as above, after markdown rendering tests                                           |
| `minimatch@3.1.5`           | Security floor with local patch      | Security remediation change set `b7f0540`; see `patchedDependencies`         | Upstream range includes the fix and `patches/minimatch@3.1.5.patch` is no longer needed |
| `picomatch@4.0.5`           | Security-review convergence          | Security remediation change set `b7f0540`                                    | The graph naturally resolves to an equal/newer audited version                          |
| `prismjs@1.30.0`            | Rich-text/code-rendering convergence | Security remediation change set `b7f0540`                                    | Same as above, after code-rendering tests                                               |
| `shell-quote@1.9.0`         | Security-review convergence          | Security remediation change set `b7f0540`                                    | The graph naturally resolves to an equal/newer audited version                          |
| `vite@8.1.4`                | Test/build tool convergence          | Security remediation change set `b7f0540`                                    | A reviewed Vitest/Vite upgrade resolves it naturally                                    |
| `yaml@2.9.0`                | Security-review convergence          | Security remediation change set `b7f0540`                                    | The graph naturally resolves to an equal/newer audited version                          |

“Security-review convergence” records the provenance honestly: the original
change set did not retain a per-package advisory identifier. Do not invent one
after the fact. A future update should attach an advisory or compatibility issue
when one exists.

## Review procedure

1. Use the repository-pinned Bun version from `Dockerfile` and CI.
2. Run `bun pm why <package>` before changing an override; record every direct
   and transitive path.
3. Change one related group at a time, regenerate the text `bun.lock`, and
   inspect its diff.
4. Run frozen install, `bun audit`, TypeScript, ESLint, Vitest and the relevant
   release gates. Framework/native pins also require a production standalone
   build; payment/database pins require their integration suites.
5. Remove an override only when the unlocked graph is proven to select the
   intended safe version. A passing audit alone does not prove runtime
   compatibility.
