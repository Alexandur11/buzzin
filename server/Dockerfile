FROM node:20-alpine

WORKDIR /app

# Install production dependencies deterministically
COPY package*.json ./
# Prefer `npm ci` when a lockfile is present for deterministic installs,
# otherwise fall back to `npm install` so builds don't fail on repos
# without a lockfile.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --silent; else npm install --production --silent; fi

# Copy app sources
COPY . .

EXPOSE 4000

CMD ["node", "index.js"]
