FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .

RUN mkdir -p /app/.next && touch /app/.next/.keep && chown -R node:node /app
USER node

EXPOSE 3000

CMD ["npm", "run", "dev"]