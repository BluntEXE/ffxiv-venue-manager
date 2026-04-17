FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma prisma/
RUN npm install && npm cache clean --force
RUN npx prisma generate

# Development dependencies (needed for Next build)
FROM base AS dev-deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma prisma/
RUN npm install --include=dev && npm cache clean --force

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=dev-deps /app/node_modules ./node_modules
COPY . .

# Build Next.js (standalone output). Schema migrations intentionally NOT run here
# (they need a live DB that only exists at compose-runtime). Run migrations via
# the separate 'migrate' compose service, or manually via prisma db push.
RUN npm run build

# Production image — minimal runtime, no prisma CLI
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
