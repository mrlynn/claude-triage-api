FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json* ./
# `ci` over `install`: the lockfile is committed, and a production image that
# silently resolves different versions than CI tested is not the same artifact.
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 8790
CMD ["npm", "start"]
