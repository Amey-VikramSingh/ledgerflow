# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci installs exactly what the lockfile pins — reproducible builds.
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- runtime stage ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# node-pg-migrate is a production dependency, so this same image can run
# migrations:  docker run <image> npm run migrate:up
COPY migrations ./migrations

# Run as a non-root user.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
