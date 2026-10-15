FROM node:22-alpine AS base

ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm install --global pnpm@11.25.0 --registry=${NPM_REGISTRY} \
    && pnpm config set registry ${NPM_REGISTRY}

FROM base AS build

ARG APP_NAME
ENV APP_NAME=${APP_NAME}
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY . .
RUN --mount=type=cache,id=image-set-pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS runtime

ARG APP_NAME
ENV APP_NAME=${APP_NAME}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY --from=build /app /app

CMD ["sh", "-c", "pnpm --filter ${APP_NAME} start"]
