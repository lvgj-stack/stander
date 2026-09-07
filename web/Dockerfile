# Builds the admin console into a static site served by nginx.
#
# VITE_API_BASE_URL is baked in at build time, because Vite substitutes it into
# the bundle rather than reading it at runtime. Leaving it empty makes the app
# call same-origin paths, which whatever fronts this image — the nginx config
# below under docker compose, or the Ingress under Kubernetes — routes to the
# backend. Same-origin means no CORS preflight on any of them.

# Both base images come from Docker Hub, which rate-limits anonymous pulls per
# source IP (429 "toomanyrequests" while resolving the manifest, before a single
# layer is fetched). Behind shared egress that budget is not ours to spend, so
# the registry is a build-arg: point it at a pull-through mirror.
#   --build-arg DOCKER_MIRROR=mirror.gcr.io
# The tags below stay exactly as upstream publishes them; only the host moves.
ARG DOCKER_MIRROR=docker.io

# --platform=$BUILDPLATFORM: this stage produces `dist/` — static JS and CSS,
# byte-identical whatever architecture the final image is for. Without it the
# arm64 variant runs pnpm install and the whole Vite build inside an emulated
# arm64 container, which is both slow and pointless. It also means the build
# runs once, not once per architecture, and the toolchain's native binaries
# (rolldown/oxc) stay in this stage rather than being fetched twice.
FROM --platform=$BUILDPLATFORM ${DOCKER_MIRROR}/library/node:24-alpine AS build

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
FROM ${DOCKER_MIRROR}/nginxinc/nginx-unprivileged:1.27-alpine

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
