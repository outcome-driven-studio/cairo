FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY *.js ./
COPY bin/ ./bin/
COPY src/ ./src/
COPY llms.txt ./
COPY start.sh ./

RUN chmod +x ./start.sh
RUN ls -la ./src/migrations/

RUN addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001
USER nodeuser

EXPOSE 8080

CMD ["./start.sh"]
