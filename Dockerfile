# Stage 1: Deterministic offline/CI build of the static TypeScript + Vite SPA
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY fixtures ./fixtures
RUN npm run build

# Stage 2: Minimal unprivileged Nginx static server for Google Cloud Run (port 8080, scale-to-zero)
FROM nginx:1.27-alpine
COPY deploy/gcp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
