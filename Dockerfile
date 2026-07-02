FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN corepack prepare pnpm@10.14.0 --activate && pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack prepare pnpm@10.14.0 --activate && pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/db/migrations ./src/db/migrations
COPY --from=builder /app/scripts/start-production.sh ./scripts/start-production.sh
RUN chmod +x ./scripts/start-production.sh
EXPOSE 3000
CMD ["./scripts/start-production.sh"]
