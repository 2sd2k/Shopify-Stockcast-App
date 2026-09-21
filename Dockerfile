FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

COPY package.json package-lock.json* ./

# Dev dependencies are needed for `react-router build`; pruned below.
RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["npm", "run", "docker-start"]
