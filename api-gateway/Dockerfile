FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN node -e "require('./middleware/auth')"

EXPOSE 9000

CMD ["npm", "start"]
