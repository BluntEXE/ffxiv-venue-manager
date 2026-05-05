FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

# Install dependencies
FROM base AS deps
WORKDIR /app
# Copy workspace manifests first (layer cache)
COPY pnpm-workspace.yaml package.json .npmrc pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
# Install all workspace deps from root
RUN pnpm install --frozen-lockfile --ignore-scripts

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
# Copy source
COPY pnpm-workspace.yaml package.json .npmrc pnpm-lock.yaml ./
COPY apps/web ./apps/web
COPY packages/types ./packages/types
# Generate Prisma client and build Next.js
WORKDIR /app/apps/web
RUN npx prisma generate
RUN pnpm build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/prisma ./prisma
COPY --from=builder /app/apps/web/package.json ./package.json

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
