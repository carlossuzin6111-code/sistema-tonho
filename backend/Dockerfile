FROM node:20-slim AS dependencies

# Install system dependencies for sqlite3 if needed (though prebuilts usually work)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --build-from-source

FROM node:20-slim AS runtime

WORKDIR /app

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

# Fresh Docker volumes inherit this ownership. Existing volumes require a
# one-time ownership migration before switching from the historical root user.
RUN mkdir -p /app/data && chown node:node /app/data

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

USER node

CMD ["node", "src/index.js"]
