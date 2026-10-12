# Sintonia — imagem de produção (app + API + motor + imagens OG num único processo Node).
#
#   docker compose build            (recomendado: ver docker-compose.yml e DEPLOY.md)
#   docker build -t sintonia-app .  (avulso; rode com --init e um volume em /var/lib/sintonia)
#
# Base Debian (glibc), não Alpine: o @resvg/resvg-js usa binário nativo e a imagem fica previsível em x64 e arm64.
# Nada aqui depende de rede além do registro do npm. Em ambientes com proxy TLS próprio (não é o caso de uma VPS
# comum), passe a CA como segredo opcional:  --secret id=ca_extra,src=/caminho/ca.crt

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- dependências completas (build) --------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca_extra \
    --mount=type=cache,target=/root/.npm,sharing=locked \
    if [ -s /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra npm_config_cafile=/run/secrets/ca_extra; fi; \
    npm ci

# ---- dependências de execução (sem devDependencies) ---------------------------------------------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
ENV npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca_extra \
    --mount=type=cache,target=/root/.npm,sharing=locked \
    if [ -s /run/secrets/ca_extra ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_extra npm_config_cafile=/run/secrets/ca_extra; fi; \
    npm ci --omit=dev \
 && node -e "require('@resvg/resvg-js'); require.resolve('@fontsource/jetbrains-mono/package.json')"

# ---- build: dist/ (SPA + dataset) e dist-server/ (servidor + fontes das imagens) -----------------
FROM deps AS build
# URL pública do site gravada no app (links de compartilhar, código dos widgets). Vazia = endereço da página.
ARG VITE_SITE_URL=
COPY . .
RUN npm run build \
 && test -f dist/index.html && test -f dist/data/meta.json && test -f dist-server/main.js \
 && test -f dist-server/assets/fonts/Inter-Regular.ttf

# ---- imagem final -------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DIST_DIR=/app/dist \
    DATA_DIR=/app/dist/data \
    STATE_DIR=/var/lib/sintonia
WORKDIR /app
# estado do admin (admin.json, tse-historico.json): única pasta gravável, dono = usuário sem privilégios
RUN mkdir -p /var/lib/sintonia && chown node:node /var/lib/sintonia && chmod 700 /var/lib/sintonia
# package.json traz "type": "module" (o dist-server/main.js é ESM)
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY deploy/healthcheck.mjs ./healthcheck.mjs

ARG GIT_COMMIT=
ARG BUILD_DATE=
LABEL org.opencontainers.image.title="Sintonia" \
      org.opencontainers.image.description="Apuração do 2º turno de 2026, Teste Cego e imagens de compartilhamento" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}"
ENV SINTONIA_COMMIT=${GIT_COMMIT} \
    SINTONIA_BUILD_DATE=${BUILD_DATE}

# usuário "node" da imagem base (uid/gid 1000), numérico para qualquer orquestrador conferir que não é root
USER 1000:1000
EXPOSE 8787
VOLUME ["/var/lib/sintonia"]
# /healthz em até 5 s; 5 falhas seguidas depois de já ter respondido = processo travado → reinício (healthcheck.mjs)
HEALTHCHECK --interval=15s --timeout=8s --start-period=60s --retries=3 CMD ["node", "/app/healthcheck.mjs"]
# node direto (sem npm) para receber SIGTERM; use --init (ou init: true no compose) para um PID 1 de verdade
CMD ["node", "--enable-source-maps", "dist-server/main.js"]
