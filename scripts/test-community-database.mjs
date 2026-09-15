/** Always creates a new loopback PostgreSQL cluster. Never reads DATABASE_URL. */
import { spawnSync } from "node:child_process"
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifacts = resolve(root, "artifacts/community-database")
mkdirSync(artifacts, { recursive: true })
const cluster = mkdtempSync(resolve(artifacts, "run-"))
const data = resolve(cluster, "data")
const bin = process.env.LOCAL_PG_BIN ?? "/usr/lib/postgresql/18/bin"
const port = await new Promise((resolvePort, reject) => {
  const server = createServer()
  server.on("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    server.close(() => resolvePort(address.port))
  })
})
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`)
}
let started = false
try {
  run(
    resolve(bin, "initdb"),
    ["-D", data, "-U", "postgres", "--auth=trust", "--no-locale", "--encoding=UTF8"],
    { stdio: "pipe" },
  )
  appendFileSync(
    resolve(data, "postgresql.conf"),
    `\nlisten_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories=''\n`,
  )
  run(resolve(bin, "pg_ctl"), ["-D", data, "-l", resolve(cluster, "postgres.log"), "-w", "start"], {
    stdio: "pipe",
  })
  started = true
  run(resolve(bin, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "postgres",
    "community_phase2_test",
  ])
  run(
    process.execPath,
    [
      resolve(root, "node_modules/vitest/vitest.mjs"),
      "run",
      "tests/community-database.integration.test.ts",
    ],
    {
      env: {
        ...process.env,
        COMMUNITY_TEST_DATABASE_URL: `postgresql://postgres@127.0.0.1:${port}/community_phase2_test`,
      },
    },
  )
  console.log("PASS: isolated community PostgreSQL integration; cluster removed.")
} finally {
  if (started)
    run(resolve(bin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "pipe" })
  rmSync(cluster, { recursive: true, force: true })
}
