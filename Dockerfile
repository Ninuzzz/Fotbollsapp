# Allsvenskantipset på Fly.io – Next.js + Prisma + SQLite (databasen ligger på en volym under /data)

FROM node:22-slim AS base
# Prisma behöver OpenSSL
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Den publika VAPID-nyckeln bakas in i klientkoden vid bygget (den är inte hemlig)
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_TELEMETRY_DISABLED=1
# Bygget behöver en databas-URL för prisma generate, men rör aldrig databasen
RUN DATABASE_URL="file:/tmp/build.db" npm run build

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Kör inte som root
RUN groupadd -r app && useradd -r -g app -d /app app && mkdir -p /data && chown app:app /data
COPY --from=build --chown=app:app /app ./
USER app
EXPOSE 3000
# Schemat synkas mot databasen på volymen vid varje start (vägrar ändringar som skulle radera data)
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx next start"]
