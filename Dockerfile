# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS build
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
# CGO off keeps the binary static, which is what the distroless static image
# expects. -trimpath keeps build paths out of the binary.
RUN CGO_ENABLED=0 go build -trimpath \
      -ldflags="-s -w -X github.com/lvgj-stack/stander/cmd.version=${VERSION} -X github.com/lvgj-stack/stander/cmd.commit=${COMMIT}" \
      -o /out/stander .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/stander /usr/local/bin/stander

# Runs as uid 65532. The process binds 8123, which needs no privilege.
USER nonroot:nonroot
EXPOSE 8123
ENTRYPOINT ["/usr/local/bin/stander"]
CMD ["server"]
