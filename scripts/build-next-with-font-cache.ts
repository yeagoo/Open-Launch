#!/usr/bin/env bun
import { spawn } from "node:child_process"
import { resolve } from "node:path"

import { prepareGoogleFontBuildCache } from "./lib/google-font-build-cache"

const cache = await prepareGoogleFontBuildCache()
console.log(
  `[next-fonts] prefetched ${cache.fontFileCount} file(s), ${cache.totalFontBytes} byte(s)`,
)

try {
  const nextBinary = resolve(import.meta.dirname, "../node_modules/next/dist/bin/next")
  const exitCode = await run("node", [nextBinary, "build", "--webpack", ...process.argv.slice(2)], {
    ...process.env,
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: cache.mockFilePath,
  })
  if (exitCode !== 0) process.exitCode = exitCode
} finally {
  await cache.cleanup()
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolveExitCode, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Next build terminated by signal ${signal}`))
        return
      }
      resolveExitCode(code ?? 1)
    })
  })
}
