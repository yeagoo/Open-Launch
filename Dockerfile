FROM node:24.18.0-bookworm-slim AS base

COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
ENV SKIP_INSTALL_SIMPLE_GIT_HOOKS=1
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

FROM base AS builder

# Only public/build identifiers and the dedicated Server Action key are needed
# while compiling; runtime provider/database secrets are never copied here.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CONTACT_EMAIL
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ARG NEXT_PUBLIC_ONE_TAP_CLIENT_ID
ARG NEXT_PUBLIC_PREMIUM_PAYMENT_LINK
ARG NEXT_PUBLIC_PREMIUM_PLUS_PAYMENT_LINK
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_URL=https://www.aat.ee
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ARG GIT_COMMIT_SHA
ARG DEPLOYMENT_VERSION

ENV CI=true
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM node:24.18.0-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs
EXPOSE 8080

# Liveness probe against the app port (8080, not the Next default 3000).
# The slim image has no curl/wget; node fetch is enough.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch(\`http://127.0.0.1:\${process.env.PORT || 8080}/api/health\`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
