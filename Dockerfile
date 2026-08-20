# ---- build the SPA ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY server ./server
COPY config ./config
COPY --from=build /app/dist ./dist

EXPOSE 8090
CMD ["node", "server/index.js"]
