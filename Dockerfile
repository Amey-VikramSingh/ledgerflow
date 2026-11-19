# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci installs exactly what the lockfile pins — reproducible builds.
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# node-pg-migrate is a production dependency, so this same image runs
# migrations (fly.toml release_command, docker compose `migrate` service).
COPY migrations ./migrations
# The API reads its OpenAPI spec from the working directory at startup.
COPY openapi.yaml ./
# Single-container start (migrations + API + worker) for Render's free tier.
COPY scripts ./scripts

# Run as a non-root user.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
