import { describe, expect, it } from "vitest"

import {
  collectReferencedClientChunks,
  parseClientReferenceManifest,
  resolveNextChunkPath,
  selectInitialClientChunks,
} from "../scripts/lib/client-reference-manifest"

const routeManifest = {
  clientModules: {
    "app/example.tsx": { chunks: ["static/chunks/a.js"] },
  },
  entryJSFiles: {
    "[project]/app/[locale]/page": ["static/chunks/a.js"],
  },
}

describe("client-reference manifest parser", () => {
  it("parses the compact Webpack format after its initialization statement", () => {
    const webpackManifest = { clientModules: routeManifest.clientModules }
    const source =
      "globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});" +
      `globalThis.__RSC_MANIFEST[\"/[locale]/page\"]=${JSON.stringify(webpackManifest)};`
    expect(parseClientReferenceManifest(source)).toEqual(webpackManifest)
  })

  it("parses the whitespace-padded Turbopack format", () => {
    const source = `globalThis.__RSC_MANIFEST[\"/[locale]/page\"] = ${JSON.stringify(routeManifest)};`
    expect(parseClientReferenceManifest(source)).toEqual(routeManifest)
  })

  it("does not truncate JSON strings containing braces", () => {
    const manifest = {
      ...routeManifest,
      clientModules: { "app/file-}-.tsx": { chunks: ["static/chunks/a.js"] } },
    }
    const source = `globalThis.__RSC_MANIFEST[\"/[locale]/page\"]=${JSON.stringify(manifest)};`
    expect(parseClientReferenceManifest(source)).toEqual(manifest)
  })

  it("rejects generated JavaScript without a route assignment", () => {
    expect(() =>
      parseClientReferenceManifest("globalThis.__RSC_MANIFEST = maliciousCall()"),
    ).toThrow("Unsupported client-reference manifest format")
  })

  it("validates chunk lists after parsing", () => {
    const invalid = { ...routeManifest, entryJSFiles: { route: [1] } }
    const source = `globalThis.__RSC_MANIFEST[\"/page\"]=${JSON.stringify(invalid)};`
    expect(() => parseClientReferenceManifest(source)).toThrow("Invalid entry chunk list")

    const invalidModule = { clientModules: { route: null } }
    const invalidModuleSource = `globalThis.__RSC_MANIFEST[\"/page\"]=${JSON.stringify(invalidModule)};`
    expect(() => parseClientReferenceManifest(invalidModuleSource)).toThrow(
      "Invalid chunk list for client module",
    )
  })

  it("uses entryJSFiles for Turbopack and client module chunks for Webpack", () => {
    expect(selectInitialClientChunks(routeManifest, "[project]/app/[locale]/page")).toEqual({
      chunks: ["/_next/static/chunks/a.js"],
      source: "entryJSFiles",
    })
    const webpackManifest = {
      clientModules: {
        first: { chunks: ["101", "static/chunks/a.js"] },
        second: { chunks: ["static/chunks/a.js", "static/chunks/b.js"] },
      },
    }
    expect(collectReferencedClientChunks(webpackManifest)).toEqual([
      "/_next/static/chunks/a.js",
      "/_next/static/chunks/b.js",
    ])
    expect(selectInitialClientChunks(webpackManifest, "unused")).toEqual({
      chunks: ["/_next/static/chunks/a.js", "/_next/static/chunks/b.js"],
      source: "clientModules-fallback",
    })
  })

  it("resolves encoded chunk paths without allowing build-directory traversal", () => {
    expect(
      resolveNextChunkPath("/repo/.next", "/_next/static/chunks/app/%5Blocale%5D/page.js"),
    ).toBe("/repo/.next/static/chunks/app/[locale]/page.js")
    expect(() =>
      resolveNextChunkPath("/repo/.next", "/_next/static/%2e%2e/%2e%2e/secret.js"),
    ).toThrow("escapes the build directory")
    expect(() => resolveNextChunkPath("/repo/.next", "/other/chunk.js")).toThrow(
      "Invalid Next chunk public path",
    )
    expect(() =>
      resolveNextChunkPath("/repo/.next", "/_next/static/chunks/%5c..%5csecret.js"),
    ).toThrow("Invalid Next chunk public path")
  })
})
