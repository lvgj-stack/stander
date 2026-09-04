# Builds the admin console into a static site served by nginx.
#
# VITE_API_BASE_URL is baked in at build time, because Vite substitutes it into
# the bundle rather than reading it at runtime. Leaving it empty makes the app
# call same-origin paths, which whatever fronts this image — the nginx config
# below under docker compose, or the Ingress under Kubernetes — routes to the
# backend. That keeps the captcha's session cookie same-origin.
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build

# The unprivileged variant, not plain nginx: it runs as uid 101 and listens on
# 8080, which is what lets the Kubernetes Deployment use the same
# runAsNonRoot / readOnlyRootFilesystem settings as the Go workloads.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Where to reverse-proxy the API to. nginx's entrypoint substitutes this into
# the template at container start, so one image works against any backend.
#
# Under Kubernetes the Ingress routes the API paths straight to the stander
# Service and never exercises this proxy; it is what makes the image work on
# its own (docker compose, a plain `docker run`).
ENV STANDER_API_UPSTREAM=http://stander:8123

EXPOSE 8080
