const required = { major: 24, minor: 15, patch: 0 }
const current = process.versions.node.split(".").map(Number)

const supported =
  current[0] === required.major &&
  (current[1] > required.minor || (current[1] === required.minor && current[2] >= required.patch))

if (!supported) {
  console.error(
    `[runtime] Node ${process.versions.node} is unsupported. ` +
      "Use Node >=24.15.0 <25; earlier releases contain the TransformStream " +
      "cancel/write race that crashes Next.js SSR.",
  )
  process.exit(1)
}

console.log(`[runtime] Node ${process.versions.node} satisfies >=24.15.0 <25`)
