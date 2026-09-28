# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- serve stage ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback so client-side routes work on refresh; proxy /api to backend.
RUN printf 'server {\n listen 80;\n location /api/ {\n  proxy_pass http://backend:8000/;\n }\n location / {\n  root /usr/share/nginx/html;\n  try_files $uri $uri/ /index.html;\n }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
