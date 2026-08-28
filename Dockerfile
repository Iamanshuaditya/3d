# Supported production target for Vortex V1 (#26): a Node standalone build.
#
# Not a Worker: better-sqlite3 and sharp are native modules, so the constraint
# is the runtime itself rather than bundle size. See docs/platform/DEPLOYMENT.md.

# ---- dependencies -----------------------------------------------------------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 compiles from source when no prebuild matches the platform.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build runs before secrets exist, so it must not trip the startup gate.
ENV NODE_ENV=production
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    VORTEX_DATA_DIR=/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1001 --create-home vortex \
    && mkdir -p /data \
    && chown -R vortex:vortex /data

# The standalone output carries only the server's actual dependency closure.
COPY --from=build --chown=vortex:vortex /app/.next/standalone ./
COPY --from=build --chown=vortex:vortex /app/.next/static ./.next/static
COPY --from=build --chown=vortex:vortex /app/public ./public

USER vortex
EXPOSE 3000

# Liveness only. Readiness (/api/ready) is the orchestrator's traffic gate, so
# a database blip drains this instance instead of restarting it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

# Uploads and the SQLite database both live here. Without a real volume every
# customer design is lost on restart.
VOLUME ["/data"]

CMD ["node", "server.js"]
