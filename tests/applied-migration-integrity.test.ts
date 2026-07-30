import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const appliedProductionHashes = {
  "0049_hot_path_indexes.sql": "0a364f2ac0785b88ad30803c05e50fee7d3db826855c048b91b08ae22125d519",
  "0053_search_indexes.sql": "d4b54b20ba05955f0d370c3a5eba3c85077813ab088f62fa10a36d0993b2ec15",
} as const

describe("applied production migration integrity", () => {
  for (const [filename, expectedHash] of Object.entries(appliedProductionHashes)) {
    it(`keeps ${filename} byte-for-byte immutable`, () => {
      const content = readFileSync(new URL(`../drizzle/migrations/${filename}`, import.meta.url))

      expect(createHash("sha256").update(content).digest("hex")).toBe(expectedHash)
    })
  }
})
