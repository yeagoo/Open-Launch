#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { lstat, readFile, readlink } from "node:fs/promises"

const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  encoding: "buffer",
})
if (listed.status !== 0) {
  process.stderr.write(listed.stderr)
  process.exit(listed.status ?? 1)
}

const paths = listed.stdout.toString("utf8").split("\0").filter(Boolean).sort()
const hash = createHash("sha256")

for (const path of paths) {
  const metadata = await lstat(path)
  if (!metadata.isFile() && !metadata.isSymbolicLink()) continue
  hash.update(path)
  hash.update("\0")
  hash.update(metadata.mode.toString(8))
  hash.update("\0")
  hash.update(metadata.isSymbolicLink() ? await readlink(path) : await readFile(path))
  hash.update("\0")
}

process.stdout.write(`${hash.digest("hex")}\n`)
