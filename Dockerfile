# No `# syntax=` directive on purpose: it names an image that BuildKit fetches
# from Docker Hub before it parses anything, so no build-arg can redirect it —
# and on a rate-limited egress that fetch is exactly what fails. Nothing here
# needs a newer frontend than BuildKit's built-in one.

# Docker Hub rate-limits anonymous pulls per source IP; override the registry to
# build through a pull-through mirror: --build-arg DOCKER_MIRROR=mirror.gcr.io
# The runtime image below is on gcr.io, which has no such limit, so it is fixed.
ARG DOCKER_MIRROR=docker.io

# --platform=$BUILDPLATFORM pins this stage to the machine doing the building,
# so a linux/arm64 image is cross-compiled rather than built inside an emulated
# arm64 container. With CGO off, Go cross-compiles for free; QEMU does not.
# Measured on the v0.0.1-alpha.1 release run: the same `go build` took 66.8s
# native and 639.2s emulated, and `go mod download` 9.2s against 65.9s.
#
# Everything up to `COPY . .` is now identical for every target platform, so
# BuildKit runs the dependency download once instead of once per architecture.
# That is also why TARGETOS/TARGETARCH are declared just above the build and
# not at the top: naming them earlier would split those layers again.
FROM --platform=$BUILDPLATFORM ${DOCKER_MIRROR}/library/golang:1.25-alpine AS build
WORKDIR /src

# Overridable so the image can be built behind a corporate or regional module
# mirror: --build-arg GOPROXY=https://goproxy.cn,direct
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}

# Dependencies are their own layer so source edits do not re-download the module
# cache on every build.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
ARG VERSION=dev
ARG COMMIT=unknown
# Set by BuildKit from the platform being built for, not the one building.
ARG TARGETOS
ARG TARGETARCH
# CGO off keeps the binary static, which is what the distroless static image
# expects, and is what makes the cross-compile above a plain GOARCH switch.
# -trimpath keeps build paths out of the binary.
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath \
      -ldflags="-s -w -X github.com/lvgj-stack/stander/cmd.version=${VERSION} -X github.com/lvgj-stack/stander/cmd.commit=${COMMIT}" \
      -o /out/stander .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/stander /usr/local/bin/stander

# Runs as uid 65532. The process binds 8123, which needs no privilege.
USER nonroot:nonroot
EXPOSE 8123
ENTRYPOINT ["/usr/local/bin/stander"]
CMD ["server"]
