FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node server ./server
COPY --chown=node:node package.json ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
CMD ["node", "server/main.mjs"]
