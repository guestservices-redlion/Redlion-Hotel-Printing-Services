FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends clamav clamav-freshclam ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data /var/lib/clamav \
    && chown -R node:node /app /var/lib/clamav

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src

USER node
ENV NODE_ENV=production HOST=0.0.0.0 DATA_DIR=/app/data COOKIE_SECURE=true
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/bin/sh", "-c", "freshclam || true; exec node src/server.js"]
