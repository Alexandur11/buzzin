# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Accept API URL at build time (Vite bakes it into the bundle)
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

# Copy package files first to leverage Docker cache and perform a clean install
COPY package*.json ./
# Use `npm ci` when a lockfile exists, otherwise fall back to `npm install`
# to avoid failing builds for repositories without a package-lock.json.
RUN if [ -f package-lock.json ]; then npm ci --silent; else npm install --silent; fi

# Copy rest of the project and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
