# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build ----
# Node is only needed to turn the Lucide packages into data/icons.js. The
# runtime image below keeps none of it.
FROM node:22-alpine AS build

WORKDIR /app

# Copied on their own so the dependency layer survives source-only edits.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tools/ ./tools/
COPY src/ ./src/
COPY index.html ./

# build-icons writes data/icons.js; build-single writes dist/icon-creator.html.
RUN node tools/build-icons.mjs && node tools/build-single.mjs

# -------------------------------------------------------------- runtime ----
FROM nginx:1.27-alpine AS runtime

LABEL org.opencontainers.image.title="Icon Creator" \
      org.opencontainers.image.description="Design app icons from the Lucide icon set and export them as PNG, SVG, WebP, JPEG or ICO." \
      org.opencontainers.image.licenses="MIT"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html
RUN rm -rf ./*

COPY --from=build /app/index.html ./
COPY --from=build /app/src/ ./src/
COPY --from=build /app/data/ ./data/

# The same app as one portable file, for anyone who wants to download and keep it.
COPY --from=build /app/dist/icon-creator.html ./standalone.html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/healthz || exit 1
