FROM node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS build
WORKDIR /app
COPY package.json package-lock.json VERSION ./
RUN npm ci --ignore-scripts
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY server ./server
COPY test ./test
RUN node --test --test-timeout=20000 && node node_modules/vite/bin/vite.js build

# The runtime needs no packages: the server uses Node's own modules and serves the built app.
FROM node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3231
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/package.json /app/VERSION ./
USER node
EXPOSE 3231
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3231/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/server.js"]
