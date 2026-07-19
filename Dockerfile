FROM node:22-alpine

RUN mkdir -p /app/data && chown -R node:node /app

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src

USER node
ENV NODE_ENV=production HOST=0.0.0.0 DATA_DIR=/app/data COOKIE_SECURE=true
EXPOSE 3000

CMD ["node", "src/server.js"]
