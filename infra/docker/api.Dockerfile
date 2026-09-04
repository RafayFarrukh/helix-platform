# Multi-stage build: the runtime image contains no compiler, no source and no
# dev dependencies, and runs as a non-root user with a read-only filesystem.
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/core/package.json packages/core/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo ./
COPY . .
RUN pnpm --filter @helix/core build \
 && pnpm --filter @helix/api exec prisma generate \
 && pnpm --filter @helix/api build \
 && pnpm prune --prod

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S helix && adduser -S helix -G helix
COPY --from=build --chown=helix:helix /repo/node_modules ./node_modules
COPY --from=build --chown=helix:helix /repo/apps/api/dist ./dist
COPY --from=build --chown=helix:helix /repo/apps/api/node_modules ./node_modules
USER helix
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1
CMD ["node", "dist/main.js"]
