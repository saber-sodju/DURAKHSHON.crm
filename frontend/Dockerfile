FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# The app always calls the relative '/api' path; nginx below proxies it to the
# backend (BACKEND_ORIGIN env var). Same-origin keeps the refresh cookie
# first-party, which is required for "remember me" on iPhone Safari.
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# the nginx image entrypoint envsubst's ${BACKEND_ORIGIN}/${BACKEND_HOST} from the
# environment into /etc/nginx/conf.d/default.conf at container start
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
