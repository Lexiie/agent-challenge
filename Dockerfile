# syntax=docker/dockerfile:1

FROM node:lts AS build

# Enable and prepare pnpm so it's available in the container
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV DISABLE_TELEMETRY=true
ENV POSTHOG_DISABLED=true
ENV MASTRA_TELEMETRY_DISABLED=true
ENV DO_NOT_TRACK=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy manifest files first (for Docker layer cache)
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies)
# If you don't have pnpm-lock.yaml, drop the --frozen-lockfile flag
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

# Copy the rest of the source code
COPY . .

# Optional: print Node and pnpm versions and list workspaces for debugging
RUN node -v && pnpm -v && pnpm -r ls --depth -1 || true

# Run build for all workspaces that define a build script; skip packages without a build script
RUN pnpm run build:ci

# -------- Runtime stage --------
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

# Use npm start defined in package.json
ENTRYPOINT ["npm", "start"]

