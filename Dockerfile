# syntax=docker/dockerfile:1.10@sha256:865e5dd094beca432e8c0a1d5e1c465db5f998dca4e439981029b3b81fb39ed5

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base

COPY --from=oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
ENV SKIP_INSTALL_SIMPLE_GIT_HOOKS=1
COPY package.json bun.lockb ./
COPY patches ./patches
# The deployed runner is linux/x64. Declare that target explicitly so Bun
# selects sharp's x64 optional packages even when the image is built through a
# multi-platform builder whose host architecture differs from the target.
RUN bun install --frozen-lockfile --os=linux --cpu=x64 \
  && node -e "import('sharp').then((sharp) => console.log('[sharp] dependency runtime', sharp.default.versions.sharp, process.platform, process.arch))"

FROM base AS builder

# Only public/build identifiers and the dedicated Server Action key are needed
# while compiling; runtime provider/database secrets are never copied here.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CONTACT_EMAIL
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ARG NEXT_PUBLIC_ONE_TAP_CLIENT_ID
ARG NEXT_PUBLIC_PREMIUM_PAYMENT_LINK
ARG NEXT_PUBLIC_PREMIUM_PLUS_PAYMENT_LINK
ARG NEXT_PUBLIC_TURNSTILE_SITE_IDENTIFIER
ARG NEXT_PUBLIC_URL=https://www.aat.ee
ARG GIT_COMMIT_SHA
ARG DEPLOYMENT_VERSION
ARG BUILD_INPUT_SHA256

ENV CI=true
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,required=true \
  NEXT_PUBLIC_TURNSTILE_SITE_KEY="${NEXT_PUBLIC_TURNSTILE_SITE_IDENTIFIER}" bun run build \
  && cd .next/standalone \
  && node -e "import('sharp').then((sharp) => console.log('[sharp] standalone runtime', sharp.default.versions.sharp, process.platform, process.arch))"

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runner

ARG GIT_COMMIT_SHA
ARG DEPLOYMENT_VERSION
ARG BUILD_INPUT_SHA256

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080 \
    SERVICE_ROLE=web \
    GIT_COMMIT_SHA=${GIT_COMMIT_SHA} \
    DEPLOYMENT_VERSION=${DEPLOYMENT_VERSION} \
    BUILD_INPUT_SHA256=${BUILD_INPUT_SHA256}

LABEL org.opencontainers.image.source="https://github.com/yeagoo/Open-Launch" \
      org.opencontainers.image.revision="${GIT_COMMIT_SHA}" \
      org.opencontainers.image.version="${DEPLOYMENT_VERSION}" \
      ee.aat.open-launch.build-input-sha256="${BUILD_INPUT_SHA256}"

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs
EXPOSE 8080 8081

# The same immutable image runs the Web server or the independent Cron worker.
# Compose overrides command + SERVICE_ROLE for the worker; both stay non-root.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const worker=process.env.SERVICE_ROLE==='cron-worker';const port=worker?(process.env.CRON_WORKER_HEALTH_PORT||8081):(process.env.PORT||8080);const path=worker?'/health':'/api/health';fetch(\`http://127.0.0.1:\${port}\${path}\`).then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
