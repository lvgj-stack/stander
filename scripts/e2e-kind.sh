#!/usr/bin/env bash
#
# Stands the whole stack up on a throwaway Kubernetes cluster and checks that
# it actually serves traffic: MySQL, the API, the singleton worker and the
# admin console, deployed from the same manifests production uses.
#
# This is what CI runs. It is a plain script rather than steps inside a
# workflow file so the same thing can be reproduced locally:
#
#   scripts/e2e-kind.sh                 # build images, create cluster, test, tear down
#   KEEP_CLUSTER=1 scripts/e2e-kind.sh  # leave it running to poke at
#
# Requires: docker, kind, kubectl.
#
# SAFETY: this script writes its own kubeconfig into a temporary directory and
# exports KUBECONFIG to point at it, so kubectl here can only ever see the kind
# cluster it created. It never reads or modifies ~/.kube/config. That matters:
# a developer machine or a CI runner may well have a real cluster as its
# current context, and "kubectl apply -k overlays/dev" against production is
# not a mistake worth leaving available.
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-stander-e2e}"
# Pinned rather than left to kind's default, for two reasons: the default moves
# with every kind release, and it should track the Kubernetes version actually
# being deployed to. Bump this when the real cluster is upgraded.
#
# Note that node images from 1.33 onward need a cgroup v2 host. On a cgroup v1
# machine the kubelet dies with "cgroup [kubelet kubepods] has some missing
# paths" and the cluster never finishes coming up.
KIND_NODE_IMAGE="${KIND_NODE_IMAGE:-kindest/node:v1.32.2}"
# Passed through to the Go image build. Override on a network that cannot reach
# proxy.golang.org: GOPROXY=https://goproxy.cn,direct scripts/e2e-kind.sh
GOPROXY="${GOPROXY:-https://proxy.golang.org,direct}"
# Same idea for the base images: Docker Hub rate-limits anonymous pulls per
# source IP, so point the builds at a pull-through mirror when the budget for
# this egress is gone: DOCKER_MIRROR=mirror.gcr.io scripts/e2e-kind.sh
DOCKER_MIRROR="${DOCKER_MIRROR:-docker.io}"
NAMESPACE=stander-dev
IMAGE_TAG="${IMAGE_TAG:-e2e}"
KEEP_CLUSTER="${KEEP_CLUSTER:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Read out of the overlay rather than repeated here, so bumping MySQL in the
# manifest cannot leave this script side-loading a tag nothing will use.
MYSQL_IMAGE="$(awk '/^ *image: mysql:/ {print $2; exit}' deploy/k8s/overlays/dev/mysql.yaml)"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
# Under Actions the reason also goes out as a workflow error, which puts it on
# the run's summary page. Otherwise it exists only in the step log, and reading
# that needs push access to the repository — so the one person most likely to
# be looking at a red build from the outside is the one who cannot see why.
fail() {
  printf '\033[1;31mFAIL:\033[0m %s\n' "$*" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::error::%s\n' "$*"; fi
  exit 1
}

for tool in docker kind kubectl; do
  command -v "$tool" >/dev/null || fail "$tool is required but not on PATH"
done

WORK_DIR="$(mktemp -d)"
# Deliberately not ~/.kube/config. See the SAFETY note above.
export KUBECONFIG="$WORK_DIR/kubeconfig"
KCTX="kind-$CLUSTER_NAME"

PORT_FORWARD_PIDS=()
cleanup() {
  local status=$?
  for pid in "${PORT_FORWARD_PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  if [ $status -ne 0 ]; then
    log "Failed. Dumping cluster state."
    kubectl --context "$KCTX" -n "$NAMESPACE" get pods -o wide 2>/dev/null || true
    kubectl --context "$KCTX" -n "$NAMESPACE" get events --sort-by=.lastTimestamp 2>/dev/null | tail -30 || true
    for d in stander-server stander-web mysql; do
      echo "--- logs: $d ---"
      kubectl --context "$KCTX" -n "$NAMESPACE" logs "deploy/$d" --tail=50 --all-containers 2>/dev/null || true
    done
  fi
  if [ -z "$KEEP_CLUSTER" ]; then
    log "Deleting cluster $CLUSTER_NAME"
    kind delete cluster --name "$CLUSTER_NAME" >/dev/null 2>&1 || true
    rm -rf "$WORK_DIR"
  else
    log "Cluster $CLUSTER_NAME kept. Talk to it with:"
    echo "    export KUBECONFIG=$KUBECONFIG"
  fi
  exit $status
}
trap cleanup EXIT

# kubectl, always against the kind cluster and nothing else.
k() { kubectl --context "$KCTX" "$@"; }

# ---------------------------------------------------------------------------

log "Building images ($IMAGE_TAG)"
docker build -q -t "stander:$IMAGE_TAG" \
  --build-arg VERSION="$IMAGE_TAG" \
  --build-arg GOPROXY="$GOPROXY" \
  --build-arg DOCKER_MIRROR="$DOCKER_MIRROR" \
  --build-arg COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)" .
docker build -q -t "stander-web:$IMAGE_TAG" \
  --build-arg DOCKER_MIRROR="$DOCKER_MIRROR" ./web

log "Creating kind cluster $CLUSTER_NAME"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"; then
  echo "reusing existing cluster"
  kind export kubeconfig --name "$CLUSTER_NAME" --kubeconfig "$KUBECONFIG"
else
  kind create cluster --name "$CLUSTER_NAME" --image "$KIND_NODE_IMAGE" \
    --kubeconfig "$KUBECONFIG" --wait 180s
fi

# Belt and braces: prove the context really is the kind cluster before anything
# is applied. If the kubeconfig ever came from somewhere else, stop here rather
# than deploy into it.
server=$(k config view --minify -o jsonpath='{.clusters[0].cluster.server}')
k get node "$CLUSTER_NAME-control-plane" >/dev/null 2>&1 \
  || fail "context $KCTX does not look like a kind cluster (server: $server) — refusing to apply"
log "Target cluster: $server"

# kind nodes cannot pull from the host daemon, so the images are side-loaded.
#
# MySQL goes in the same way rather than being pulled by the kubelet. The host
# has already authenticated to Docker Hub and may have the layers cached, while
# a kind node pulls anonymously — which is what runs into Hub's rate limit on a
# busy CI account, and fails outright on a network that only lets the host out.
log "Loading images into the cluster"
docker image inspect "$MYSQL_IMAGE" >/dev/null 2>&1 || docker pull -q "$MYSQL_IMAGE"
kind load docker-image --name "$CLUSTER_NAME" \
  "stander:$IMAGE_TAG" "stander-web:$IMAGE_TAG" "$MYSQL_IMAGE"

log "Applying deploy/k8s/overlays/dev"
# The overlay deliberately does not carry sql/init.sql — kustomize will not
# read files outside its own directory, and a copy here would become a second
# source of truth. It is created from the real schema instead.
k create namespace "$NAMESPACE" --dry-run=client -o yaml | k apply -f -
k -n "$NAMESPACE" create configmap stander-schema \
  --from-file=init.sql=sql/init.sql \
  --dry-run=client -o yaml | k apply -f -

# Point the overlay at the images just built, the way a deploy would. Done on a
# copy so the working tree is left alone.
cp -r deploy/k8s "$WORK_DIR/k8s"
python3 - "$WORK_DIR/k8s/overlays/dev/kustomization.yaml" "$IMAGE_TAG" <<'PY'
import pathlib, re, sys
path, tag = sys.argv[1], sys.argv[2]
p = pathlib.Path(path)
p.write_text(re.sub(r'newTag: \S+', f'newTag: {tag}', p.read_text()))
PY
k apply -k "$WORK_DIR/k8s/overlays/dev"

log "Waiting for rollouts"
k -n "$NAMESPACE" rollout status deploy/mysql --timeout=240s
k -n "$NAMESPACE" rollout status deploy/stander-server --timeout=240s
k -n "$NAMESPACE" rollout status deploy/stander-web --timeout=180s

# ---------------------------------------------------------------------------
# Checks. Each one asserts something that unit tests cannot reach and that
# would otherwise only show up in production: a pod that starts but never
# becomes ready, a console that serves its shell but cannot reach the API, a
# login that cannot get past the console's nginx proxy.

log "Checking the singleton worker invariant"
worker_replicas=$(k -n "$NAMESPACE" get deploy stander-worker -o jsonpath='{.spec.replicas}')
[ "$worker_replicas" = "0" ] \
  || fail "dev overlay should keep the worker at 0 (the server runs it in-process), got $worker_replicas"

log "Port-forwarding"
k -n "$NAMESPACE" port-forward svc/stander 18123:8123 >/dev/null 2>&1 &
PORT_FORWARD_PIDS+=($!)
k -n "$NAMESPACE" port-forward svc/stander-web 18080:80 >/dev/null 2>&1 &
PORT_FORWARD_PIDS+=($!)

wait_for() {
  local url=$1 name=$2 tries=60
  until curl -sf -o /dev/null "$url" 2>/dev/null; do
    tries=$((tries - 1))
    [ $tries -gt 0 ] || fail "$name never answered at $url"
    sleep 1
  done
}
wait_for http://127.0.0.1:18123/healthz "API"
wait_for http://127.0.0.1:18080/ "console"

log "API health"
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18123/healthz)" = 200 ] || fail "/healthz not 200"
# readyz talks to the database; a 200 here means MySQL is actually reachable
# from the pod, which /healthz deliberately does not tell us.
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18123/readyz)" = 200 ] \
  || fail "/readyz not 200 — the API cannot reach MySQL"
curl -s http://127.0.0.1:18123/metrics | grep -q '^stander_' || fail "/metrics exposed no stander_ series"

log "Console serves the SPA"
curl -s http://127.0.0.1:18080/ | grep -q '<div id="root">' || fail "console did not serve index.html"
# Client-side routes must fall back to index.html, or a refresh on any page 404s.
# Both sides are checked: /portal in particular has to reach the app rather than
# the API, which owns the neighbouring /user prefix in the same nginx config.
for route in /admin/nodes /portal/rules; do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:18080$route")" = 200 ] \
    || fail "SPA fallback missing for $route"
  curl -s "http://127.0.0.1:18080$route" | grep -q '<div id="root">' \
    || fail "$route did not serve index.html — is it being proxied to the API?"
done

log "Login works through the console's nginx proxy"
# A real login with the seeded account, sent at the console rather than at the
# API, so one request proves the whole path: nginx proxies /auth to the
# backend, Hertz routes it, the JSON binds, the user lookup finds the seeded
# row, and a token comes back. A routing failure would 404 or 502 instead.
login=$(curl -s -X POST http://127.0.0.1:18080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"123456"}')
grep -q '"accessToken"' <<<"$login" || fail "login did not return a token: $login"

# The other half of the same handler: a wrong password must not mint one.
bad_login=$(curl -s -X POST http://127.0.0.1:18080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"wrong"}')
grep -q '账号或密码不正确' <<<"$bad_login" || fail "a wrong password was not rejected: $bad_login"

# The two sides of the console are decided by role, so the seeded roles are
# what a fresh database has to have: without SUPER_ADMIN nobody reaches the
# admin side at all.
log "Schema and seed data landed"
# -h127.0.0.1, i.e. TCP, not the default unix socket. On the socket the two
# sides disagree about where it is: mysqld in this pod comes up without reading
# /etc/my.cnf — its pid-file and socket land under /var/lib/mysql, name
# resolution stays on, errmsg.sys is looked for in the wrong place — while the
# client `kubectl exec` starts does read that file and so goes looking in
# /var/run/mysqld/mysqld.sock. Nothing is listening there:
#
#   ERROR 2002 (HY000): Can't connect to local MySQL server through socket
#   '/var/run/mysqld/mysqld.sock' (2)
#
# TCP is also the transport the application uses, so this asks the database the
# same way the thing under test does. deploy/docker-compose.yaml's healthcheck
# avoids the socket for its own version of this reason.
#
# The password goes in MYSQL_PWD rather than -p because the client writes a
# warning about command-line passwords to stderr, and the 2>/dev/null that used
# to silence that warning silenced every real error with it. The socket failure
# above spent every CI run since this job was written arriving here as an empty
# string, failing the comparison, and being announced as a missing seed — a
# fault that never happened, named in place of the one that did, pointing
# whoever read it at sql/init.sql, which was fine all along.
#
# So: keep stderr, and say what came back.
if ! roles=$(k -n "$NAMESPACE" exec deploy/mysql -c mysql -- \
  env MYSQL_PWD=stander mysql -h127.0.0.1 -ustander -Dstander -N -B -e \
  "select count(*) from role where code in ('SUPER_ADMIN','USER')" 2>&1); then
  fail "could not ask the database for the seeded roles: $roles"
fi
[ "$(tr -d '[:space:]' <<<"$roles")" = 2 ] \
  || fail "sql/init.sql did not seed the SUPER_ADMIN / USER roles (query returned: $roles)"

log "All checks passed"
