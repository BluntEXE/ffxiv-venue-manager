FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts

COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
RUN npx tsc

CMD ["node", "dist/index.js"]
