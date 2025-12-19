# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# Dependencies stage
FROM base AS deps
RUN apk add --no-cache libc6-compat

# Copy package files
COPY server/package*.json ./server/

# Install dependencies
WORKDIR /app/server
RUN npm install --production

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy dependencies from deps stage
COPY --from=deps --chown=nodejs:nodejs /app/server/node_modules ./server/node_modules

# Copy application files
COPY --chown=nodejs:nodejs server ./server
COPY --chown=nodejs:nodejs public ./public
COPY --chown=nodejs:nodejs assets ./assets
COPY --chown=nodejs:nodejs package.json ./

USER nodejs

EXPOSE 3000

CMD ["node", "server/server.js"]
