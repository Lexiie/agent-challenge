# syntax=docker/dockerfile:1

FROM node:lts AS build

# Enable pnpm properly
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Disable Analytics/Telemetry
ENV DISABLE_TELEMETRY=true
ENV POSTHOG_DISABLED=true
ENV MASTRA_TELEMETRY_DISABLED=true
ENV DO_NOT_TRACK=1

# Ensure logs are visible (disable buffering)
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy manifests first to leverage Docker layer cache
COPY package.json pnpm-lock.yaml ./

# ⬇️ Install ALL deps (build butuh devDeps)
# kalau tidak ada pnpm-lock.yaml, ganti dengan:
# RUN pnpm install --no-frozen-lockfile
RUN pnpm install --frozen-lockfile

# Copy sisa file
COPY . .

# Workspace-aware build (aman untuk project multi-folder)
RUN pnpm -w run build

# ---- runtime stage ----
FROM node:lts AS runtime

RUN groupadd -g 1001 appgroup && \
  useradd -u 1001 -g appgroup -m -d /app -s /bin/false appuser

WORKDIR /app

COPY --from=build --chown=appuser:appgroup /app ./

ENV NODE_ENV=production \
  NODE_OPTIONS="--enable-source-maps"

USER appuser

EXPOSE 3000
EXPOSE 4111

ENTRYPOINT ["npm", "start"]
