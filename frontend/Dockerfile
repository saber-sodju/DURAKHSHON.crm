FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# When set, bakes an absolute backend URL into the build so the browser calls the
# backend directly (e.g. on Railway, where frontend and backend are separate origins).
# Left unset, the app calls the relative '/api' path proxied by nginx below.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
