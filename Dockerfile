FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY server.js ./
RUN addgroup -S app && adduser -S app -G app
USER app
ENV PORT=8787 HOST=0.0.0.0
EXPOSE 8787
CMD ["node", "server.js"]
