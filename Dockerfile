# Build stage: frontend
FROM node:20-alpine AS frontend
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY src ./src
COPY public ./public

RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY create-admin.js ./
COPY --from=frontend /app/dist ./dist

RUN mkdir -p uploads && chown -R app:app uploads

USER app

ENV NODE_ENV=production
ENV SERVE_APP=1
EXPOSE 8888

CMD ["node", "server/index.js"]
