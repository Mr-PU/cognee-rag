FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install

COPY index.html vite.config.js ./
COPY src ./src

ENV VITE_API_URL=http://localhost:8000
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
