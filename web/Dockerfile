# Builds the admin console into a static site served by nginx.
#
# VITE_API_BASE_URL is baked in at build time, because Vite substitutes it into
# the bundle rather than reading it at runtime. Leaving it empty makes the app
# call same-origin paths, which the nginx config below reverse-proxies to the
# backend — that keeps the captcha's session cookie same-origin and avoids
# needing CORS at all.
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Where to reverse-proxy the API to. nginx's entrypoint substitutes this into
# the template at container start, so one image works against any backend.
ENV STANDER_API_UPSTREAM=http://stander:8123

EXPOSE 80
