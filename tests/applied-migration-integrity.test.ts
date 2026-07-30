import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const appliedProductionHashes = {
  "0049_hot_path_indexes.sql": "331b022ee55467938a32e3bd6ee77e61aeaee57c04edbc59bcfcd007dabee5cc",
  "0053_search_indexes.sql": "85ed9876dae0da36bd48324695e087f083a55a5330419ab6f5ab0245d37bb5db",
} as const

describe("applied production migration integrity", () => {
  for (const [filename, expectedHash] of Object.entries(appliedProductionHashes)) {
    it(`keeps ${filename} byte-for-byte immutable`, () => {
      const content = readFileSync(new URL(`../drizzle/migrations/${filename}`, import.meta.url))

      expect(createHash("sha256").update(content).digest("hex")).toBe(expectedHash)
    })
  }
})
