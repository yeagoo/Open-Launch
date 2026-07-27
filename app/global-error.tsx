"use client"

/* eslint-disable @next/next/no-html-link-for-pages --
   global-error replaces the root layout when it fires; the App Router
   context <Link> needs may not be available, so a plain <a> is the
   reliable choice here. */

// Root error boundary. Any server component error without a closer
// boundary used to fall through to Next.js' default page; this keeps the
// recovery UI branded and gives users a way back. Must render <html>/<body>
// itself (it replaces the root layout when it fires).
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#71717a", marginBottom: 24 }}>
            An unexpected error occurred. Please try again — if it keeps happening, contact us at
            contact@aat.ee.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{
                background: "#18181b",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                border: "1px solid #d4d4d8",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 14,
                textDecoration: "none",
                color: "#18181b",
              }}
            >
              Back to home
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
