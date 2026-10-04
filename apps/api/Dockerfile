FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @packing-video-manager/api...
COPY apps/api apps/api
RUN pnpm --filter @packing-video-manager/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --prod --filter @packing-video-manager/api...
COPY --from=build /app/apps/api/dist apps/api/dist
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
