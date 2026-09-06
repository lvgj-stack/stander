#!/usr/bin/env bash
#
# Installs (or upgrades) the stander forwarding agent as a systemd service.
#
#   curl -fsSL https://raw.githubusercontent.com/lvgj-stack/stander/main/scripts/install.sh \
#     | bash -s -- <controller-addr:8123> <node-key> [extra agent args...]
#
#   # or, cloned:
#   sudo scripts/install.sh <controller-addr:8123> <node-key>
#   sudo scripts/install.sh uninstall
#
# Environment overrides:
#   STANDER_VERSION   release to install (default: latest)
#   STANDER_REPO      owner/repo to download from (default: lvgj-stack/stander)
#   SKIP_CHECKSUM     set to 1 to skip SHA256 verification (not recommended)
#   STANDER_ASSET_BASE  full URL to download assets from, e.g. an internal
#                       mirror; overrides STANDER_REPO/STANDER_VERSION
#
# The binary is published by .github/workflows/release.yml on every version
# tag, one static build per architecture, alongside a SHA256SUMS file.
set -euo pipefail

REPO="${STANDER_REPO:-lvgj-stack/stander}"
VERSION="${STANDER_VERSION:-latest}"
INSTALL_DIR="${STANDER_INSTALL_DIR:-/usr/local/bin}"
BIN_NAME="stander-agent"
BIN_PATH="$INSTALL_DIR/$BIN_NAME"
SERVICE_NAME="stander-agent"
SYSTEMD_UNIT_DIR="${STANDER_SYSTEMD_DIR:-/etc/systemd/system}"
SERVICE_FILE="$SYSTEMD_UNIT_DIR/$SERVICE_NAME.service"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m警告:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m错误:\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  [ "$(id -u)" -eq 0 ] || die "请以 root 运行（或加 sudo）"
}

# Downloads $1 to $2 with whichever of curl/wget exists. Fails on HTTP errors
# rather than saving an error page, which is what silently bricked the old
# installer when a URL 404'd.
fetch() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fSL --retry 3 --connect-timeout 15 -o "$dest" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$dest" "$url"
  else
    die "需要 curl 或 wget，但都没找到"
  fi
}

# Maps uname's machine name to the GOARCH the release assets are named with.
detect_arch() {
  local m
  m="$(uname -m)"
  case "$m" in
    x86_64 | amd64) echo amd64 ;;
    aarch64 | arm64) echo arm64 ;;
    *) die "不支持的架构：$m（发布产物只有 amd64 与 arm64）" ;;
  esac
}

# The download base for the chosen version. "latest" uses GitHub's stable
# redirect so no API call (and no rate limit) is involved.
asset_base() {
  if [ -n "${STANDER_ASSET_BASE:-}" ]; then
    echo "${STANDER_ASSET_BASE%/}"
  elif [ "$VERSION" = latest ]; then
    echo "https://github.com/$REPO/releases/latest/download"
  else
    echo "https://github.com/$REPO/releases/download/$VERSION"
  fi
}

uninstall() {
  require_root
  info "停止并移除 $SERVICE_NAME"
  systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$SERVICE_FILE"
  systemctl daemon-reload
  rm -f "$BIN_PATH"
  info "已卸载。（gost 若单独安装，请用 install_gost.sh 处理）"
}

install_agent() {
  # Defaulted so `set -u` does not abort before the friendly checks below when
  # a required argument is missing.
  local controller_addr="${1:-}" node_key="${2:-}"
  [ "$#" -ge 2 ] && shift 2 || shift "$#"
  local extra_args=("$@")

  require_root
  [ -n "$controller_addr" ] || die "缺少参数：控制面地址（controller-addr:port）"
  [ -n "$node_key" ] || die "缺少参数：节点密钥（node-key）"

  local arch base
  arch="$(detect_arch)"
  base="$(asset_base)"
  # `tmp` is deliberately not local. The EXIT trap below is evaluated when the
  # script exits, by which point this function has returned and a local would
  # be gone — under `set -u` the trap then dies with "tmp: unbound variable"
  # and takes the exit status to 1. Every successful install used to end that
  # way: an error line and a failure code after everything had worked, which
  # through `curl | sudo bash` is all the operator sees.
  tmp="$(mktemp -d)"
  # EXIT rather than RETURN: die() calls exit, which would skip a RETURN trap
  # and leave the temp dir behind.
  trap 'rm -rf "$tmp"' EXIT

  info "下载 stander ($VERSION, linux/$arch)"
  fetch "$base/stander_linux_$arch" "$tmp/stander" \
    || die "下载失败：$base/stander_linux_$arch"

  # Verify against the published checksums. A truncated download or a wrong
  # asset is caught here rather than by systemd failing to exec later.
  if [ "${SKIP_CHECKSUM:-}" = 1 ]; then
    warn "已跳过校验（SKIP_CHECKSUM=1）"
  elif fetch "$base/SHA256SUMS" "$tmp/SHA256SUMS" 2>/dev/null; then
    local want got
    want="$(awk '/stander_linux_'"$arch"'$/ {print $1}' "$tmp/SHA256SUMS")"
    got="$(sha256sum "$tmp/stander" | awk '{print $1}')"
    [ -n "$want" ] || die "SHA256SUMS 里没有 stander_linux_$arch 的记录"
    [ "$want" = "$got" ] || die "校验和不匹配（期望 $want，实际 $got）"
    info "校验和通过"
  else
    warn "该版本没有 SHA256SUMS，跳过校验"
  fi

  chmod +x "$tmp/stander"
  # Smoke-test before installing: proves the download is a working binary for
  # this architecture, so a bad asset never reaches systemd.
  "$tmp/stander" version >/dev/null 2>&1 \
    || die "下载的二进制无法执行（架构不符或文件损坏）"
  info "已下载：$("$tmp/stander" version)"

  # Restart only when the binary actually changed, so re-running the installer
  # to tweak args does not needlessly drop forwarding for an unchanged binary.
  local changed=1
  if [ -f "$BIN_PATH" ] && cmp -s "$tmp/stander" "$BIN_PATH"; then
    changed=0
    info "二进制未变化，保留现有文件"
  else
    install -m 0755 "$tmp/stander" "$BIN_PATH"
    info "已安装到 $BIN_PATH"
  fi

  write_unit "$controller_addr" "$node_key" "${extra_args[@]:-}"

  info "重载 systemd 并启动服务"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
  # restart (not start) so a re-run with new args or a new binary takes effect.
  if [ "$changed" -eq 1 ] || ! systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl restart "$SERVICE_NAME"
  else
    systemctl reload-or-restart "$SERVICE_NAME" 2>/dev/null || systemctl restart "$SERVICE_NAME"
  fi

  sleep 1
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    info "完成，服务运行中。查看日志：journalctl -u $SERVICE_NAME -f"
  else
    systemctl --no-pager --lines=20 status "$SERVICE_NAME" || true
    die "服务未能启动，见上方状态输出"
  fi
}

write_unit() {
  local controller_addr="$1" node_key="$2"
  shift 2
  local extra=""
  # ${*} of an empty array is empty under set -u thanks to the :- default.
  [ -n "${*:-}" ] && extra=" $*"

  info "写入 systemd unit：$SERVICE_FILE"
  cat > "$SERVICE_FILE" <<UNIT
[Unit]
Description=Stander 转发节点 Agent
Documentation=https://github.com/$REPO
# Forwarding needs the network up before the agent tries to reach the controller.
After=network-online.target
Wants=network-online.target
ConditionFileIsExecutable=$BIN_PATH
# systemd 230+ keeps the rate limit in [Unit]; 5 failures per minute is enough
# to stop a crash loop without giving up on a flaky network.
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
ExecStart=$BIN_PATH agent -a $controller_addr -k $node_key$extra
Restart=always
RestartSec=5
WorkingDirectory=/root

[Install]
WantedBy=multi-user.target
UNIT
}

usage() {
  cat <<'USAGE'
安装/升级 stander 转发节点 agent（systemd 服务）。

用法：
  curl -fsSL .../scripts/install.sh | bash -s -- <控制面地址:8123> <节点密钥> [额外 agent 参数...]
  sudo scripts/install.sh <控制面地址:8123> <节点密钥>
  sudo scripts/install.sh uninstall

环境变量：
  STANDER_VERSION      安装的版本（默认 latest）
  STANDER_REPO         下载来源 owner/repo（默认 lvgj-stack/stander）
  STANDER_ASSET_BASE   自定义下载基址（内网镜像/离线安装），覆盖上面两项
  SKIP_CHECKSUM=1      跳过 SHA256 校验（不推荐）
USAGE
}

case "${1:-}" in
  "" | -h | --help)
    usage
    exit 0
    ;;
  uninstall)
    uninstall
    ;;
  *)
    install_agent "$@"
    ;;
esac
