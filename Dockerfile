FROM node:24-bookworm-slim AS build
WORKDIR /app/Great_Thinkers_UI
COPY Great_Thinkers_UI/package*.json ./
RUN npm ci
COPY Great_Thinkers_UI/ ./
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app/Great_Thinkers_UI
COPY --from=build --chown=node:node /app/Great_Thinkers_UI/node_modules ./node_modules
COPY --from=build --chown=node:node /app/Great_Thinkers_UI/dist ./dist
COPY --chown=node:node Great_Thinkers_UI/package.json ./package.json
COPY --chown=node:node Great_Thinkers_UI/server ./server
COPY --chown=node:node Great_Thinkers_UI/knowledge ./knowledge
COPY --chown=node:node Great_Thinkers/ /app/Great_Thinkers/
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
