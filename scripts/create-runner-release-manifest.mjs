#!/usr/bin/env node
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"

const [metadataPath, sbomPath, imagePath, outputPath] = process.argv.slice(2)
if (!metadataPath || !sbomPath || !imagePath || !outputPath) {
  throw new Error("usage: create-runner-release-manifest.mjs <metadata> <sbom> <image> <output>")
}

const metadata = JSON.parse(await readFile(metadataPath, "utf8"))
const sbom = JSON.parse(await readFile(sbomPath, "utf8"))
const provenance = metadata["buildx.build.provenance"]
const digest = metadata["containerimage.digest"]
if (!provenance || typeof provenance !== "object") {
  throw new Error("build metadata does not contain provenance")
}
if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
  throw new Error("build metadata does not contain a valid image digest")
}
const spdx =
  sbom.predicateType === "https://spdx.dev/Document" && sbom.predicate ? sbom.predicate : sbom
if (spdx.spdxVersion !== "SPDX-2.2" && spdx.spdxVersion !== "SPDX-2.3") {
  throw new Error("SBOM is not an SPDX 2.2/2.3 document")
}

const commit = requiredEnvironment("RUNNER_SOURCE_COMMIT")
const inputHash = requiredEnvironment("RUNNER_BUILD_INPUT_SHA256")
const sourceDirty = process.env.RUNNER_SOURCE_DIRTY === "true"
const sourceOnMain = process.env.RUNNER_SOURCE_ON_MAIN === "true"
const validationOnly = process.env.RUNNER_VALIDATION_ONLY === "true"
const imageHash = createHash("sha256")
for await (const chunk of createReadStream(imagePath)) imageHash.update(chunk)
const imageArchiveSha256 = imageHash.digest("hex")

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      sourceCommit: commit,
      sourceDirty,
      sourceOnMain,
      validationOnly,
      releasable: !sourceDirty && sourceOnMain && !validationOnly,
      buildInputSha256: inputHash,
      platform: "linux/amd64",
      imageDigest: digest,
      imageArchiveSha256,
      sbomFormat: spdx.spdxVersion,
      sbomEnvelope:
        sbom.predicateType === "https://spdx.dev/Document" ? "in-toto-statement" : "raw-spdx",
      provenance: "buildx.build.provenance",
    },
    null,
    2,
  )}\n`,
)

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}
