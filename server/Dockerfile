FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

FROM base AS deps
RUN npm ci
RUN npx prisma generate

FROM deps AS dev
COPY . .
EXPOSE 8081
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx watch src/main.ts"]

FROM deps AS build
COPY . .
RUN npm run build

FROM node:24-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY prisma ./prisma/
RUN npx prisma generate
COPY --from=build /app/dist ./dist/
EXPOSE 8081
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
