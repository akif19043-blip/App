# ---------------------------------------------------------------------------
# DEADLINE game server
#
# Multi-stage build from the monorepo root:
#   docker build -f apps/game-server/Dockerfile -t deadline-game-server .
#
# The image only contains the server and the workspace packages it needs — the
# Next.js app is deployed separately (Vercel or any Node host).
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- dependencies ---------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/game-core/package.json packages/game-core/
COPY packages/persistence/package.json packages/persistence/
COPY packages/ui/package.json packages/ui/
COPY apps/game-server/package.json apps/game-server/
RUN pnpm install --frozen-lockfile \
      --filter @deadline/game-server... \
      --filter @deadline/config

# ---- build ----------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/game-server/ apps/game-server/
RUN pnpm --filter @deadline/shared build \
 && pnpm --filter @deadline/game-core build \
 && pnpm --filter @deadline/persistence build \
 && pnpm --filter @deadline/game-server build

# ---- runtime --------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV GAME_SERVER_PORT=2567
# Demo auth and the debug panel are development-only affordances.
ENV ALLOW_DEMO_AUTH=false
ENV ENABLE_DEBUG_TOOLS=false

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/game-server ./apps/game-server

WORKDIR /app/apps/game-server
EXPOSE 2567

# The server answers GET /health with {"status":"ok"}.
HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.GAME_SERVER_PORT||2567)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
