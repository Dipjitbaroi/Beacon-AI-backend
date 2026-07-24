# syntax=docker/dockerfile:1.6

# ---- builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# bge-m3 model files are downloaded at runtime, but @xenova/transformers
# expects onnxruntime-node. Pre-install native build deps so the postinstall
# succeeds.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-bookworm-slim AS runner
ARG PORT=8080
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=${PORT}
EXPOSE ${PORT}

# tini gives us a proper init (PID 1) so SIGTERM is forwarded and zombies
# are reaped when `docker stop` is called.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY src ./src

# Run src/ directly via `tsx` so ESM extensionless imports resolve at
# runtime without a separate build step in the runner image.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "src/server.ts"]