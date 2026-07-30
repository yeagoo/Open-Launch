import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "..")
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

describe("immutable runner supply-chain contract", () => {
  it("uses a required BuildKit secret and pinned build inputs", async () => {
    const dockerfile = await readFile(resolve(repositoryRoot, "Dockerfile"), "utf8")
    const dockerignore = await readFile(resolve(repositoryRoot, ".dockerignore"), "utf8")
    const buildScript = await readFile(
      resolve(repositoryRoot, "scripts/build-immutable-runner.sh"),
      "utf8",
    )

    expect(dockerfile).not.toMatch(/ARG\s+NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/)
    expect(dockerfile).toContain(
      "type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,required=true",
    )
    expect(dockerfile).toMatch(/^# syntax=docker\/dockerfile:1\.10@sha256:[a-f0-9]{64}$/m)
    expect(dockerfile.match(/FROM node:24\.18\.0-bookworm-slim@sha256:[a-f0-9]{64}/g)).toHaveLength(
      2,
    )
    expect(dockerfile).toMatch(/COPY --from=oven\/bun:1\.3\.14@sha256:[a-f0-9]{64}/)
    expect(buildScript).toMatch(
      /generator=docker\/buildkit-syft-scanner:stable-1@sha256:[a-f0-9]{64}/,
    )
    expect(buildScript).not.toContain("--sbom=true")
    expect(dockerignore).toMatch(/^public\/avatars\/pool$/m)
    expect(dockerignore).toMatch(/^\*\.pem$/m)
    expect(dockerignore).toMatch(/^artifacts$/m)
  })

  it("keeps registry-unknown CI validation-only and away from the production key", async () => {
    const workflow = await readFile(
      resolve(repositoryRoot, ".github/workflows/immutable-runner.yml"),
      "utf8",
    )

    expect(workflow).toContain("--validation-only")
    expect(workflow).toContain("openssl rand -base64 32")
    expect(workflow).not.toContain("secrets.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY")
    expect(workflow).not.toMatch(/\bpush:\s*true\b/)
    expect(workflow).not.toContain("docker/login-action")
  })

  it("keeps the final runner HTTP smoke blocking in the main CI graph", async () => {
    const workflow = await readFile(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8")

    expect(workflow).toContain("runner-smoke:")
    expect(workflow).toContain("- release-gates")
    expect(workflow).toContain('run: scripts/smoke-runner-image.sh "open-launch:${{ github.sha }}"')
    expect(workflow).not.toMatch(/runner-smoke:[\s\S]*continue-on-error:\s*true/)
  })

  it("writes a checksum-bound manifest that cannot promote validation artifacts", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "open-launch-runner-contract-"))
    temporaryDirectories.push(directory)
    const metadataPath = resolve(directory, "metadata.json")
    const sbomPath = resolve(directory, "sbom.json")
    const imagePath = resolve(directory, "runner.oci.tar")
    const manifestPath = resolve(directory, "release-manifest.json")
    const image = Buffer.from("synthetic OCI archive")

    await Promise.all([
      writeFile(
        metadataPath,
        JSON.stringify({
          "buildx.build.provenance": { predicateType: "https://slsa.dev/provenance/v1" },
          "containerimage.digest": `sha256:${"a".repeat(64)}`,
        }),
      ),
      writeFile(
        sbomPath,
        JSON.stringify({
          _type: "https://in-toto.io/Statement/v0.1",
          predicateType: "https://spdx.dev/Document",
          predicate: { spdxVersion: "SPDX-2.3" },
        }),
      ),
      writeFile(imagePath, image),
    ])

    const result = spawnSync(
      process.execPath,
      [
        resolve(repositoryRoot, "scripts/create-runner-release-manifest.mjs"),
        metadataPath,
        sbomPath,
        imagePath,
        manifestPath,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          RUNNER_SOURCE_COMMIT: "b".repeat(40),
          RUNNER_SOURCE_DIRTY: "false",
          RUNNER_SOURCE_ON_MAIN: "true",
          RUNNER_VALIDATION_ONLY: "true",
          RUNNER_BUILD_INPUT_SHA256: "c".repeat(64),
        },
      },
    )

    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    expect(manifest).toMatchObject({
      sourceCommit: "b".repeat(40),
      sourceOnMain: true,
      validationOnly: true,
      releasable: false,
      imageArchiveSha256: createHash("sha256").update(image).digest("hex"),
      sbomFormat: "SPDX-2.3",
      sbomEnvelope: "in-toto-statement",
    })
  })

  it("fixes the only documented opsctl binary, registry and state directory", async () => {
    const wrapper = await readFile(resolve(repositoryRoot, "scripts/opsctl-canonical.sh"), "utf8")

    expect(wrapper).toContain("readonly OPSCTL_BINARY=/usr/bin/opsctl")
    expect(wrapper).toContain("readonly OPSCTL_REGISTRY=/srv/server-registry")
    expect(wrapper).toContain("readonly OPSCTL_STATE_DIR=/var/lib/opsctl")
    expect(wrapper).toContain('exec sudo -n "$OPSCTL_BINARY"')
    expect(wrapper).not.toContain("approve ")
    expect(wrapper).not.toContain("--execute")
  })
})
