FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json .npmrc pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile --ignore-scripts

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web ./apps/web
COPY packages/types ./packages/types
WORKDIR /app/apps/web
RUN npx prisma generate
RUN pnpm build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy standalone bundle (mirrors monorepo structure due to outputFileTracingRoot)
COPY --from=builder /app/apps/web/.next/standalone ./
# Overlay static assets and public at the paths server.js expects
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
# Prisma schema for runtime queries
COPY --from=builder /app/apps/web/prisma ./apps/web/prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/web/server.js"]
