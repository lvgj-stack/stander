#!/usr/bin/env bash
#
# Installs (or upgrades) gost as a systemd service on a forwarding node.
#
# gost is the data plane the agent drives over a local API. The agent connects
# to it at http://127.0.0.1:19123 (hardcoded in internal/client/gost.go), so
# the API bind address here must stay in step with that.
#
#   sudo scripts/install_gost.sh
#   sudo scripts/install_gost.sh uninstall
#
# Environment overrides:
#   GOST_ASSET_BASE   base URL for the gost binary and certs
#                     (default: https://file.byte.gs)
#   GOST_API_ADDR     API listen address (default: 127.0.0.1:19123 — the agent
#                     expects exactly this; change only if you also change the
#                     agent)
set -euo pipefail

ASSET_BASE="${GOST_ASSET_BASE:-https://file.byte.gs}"
API_ADDR="${GOST_API_ADDR:-127.0.0.1:19123}"
INSTALL_DIR="${GOST_INSTALL_DIR:-/usr/local/bin}"
BIN_PATH="$INSTALL_DIR/gost"
CERT_DIR="${GOST_CERT_DIR:-/etc/gost}"
SYSTEMD_UNIT_DIR="${GOST_SYSTEMD_DIR:-/etc/systemd/system}"
SERVICE_NAME="gost"
SERVICE_FILE="$SYSTEMD_UNIT_DIR/$SERVICE_NAME.service"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m警告:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m错误:\033[0m %s\n' "$*" >&2; exit 1; }

require_root() { [ "$(id -u)" -eq 0 ] || die "请以 root 运行（或加 sudo）"; }

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

# gost's version flag is not something this script controls, so instead of
# trusting a self-check it just confirms the download is an ELF executable —
# which is what catches the usual failure of saving an HTML error page.
is_elf() {
  [ "$(head -c4 "$1" | tr -d '\0')" = "$(printf '\x7fELF')" ]
}

uninstall() {
  require_root
  info "停止并移除 $SERVICE_NAME"
  systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$SERVICE_FILE"
  systemctl daemon-reload
  rm -f "$BIN_PATH"
  info "已卸载 gost（证书 $CERT_DIR 保留，如需清理请手动删除）"
}

install_gost() {
  require_root

  local tmp; tmp="$(mktemp -d)"
  # EXIT rather than RETURN: die() calls exit and would skip a RETURN trap.
  trap 'rm -rf "$tmp"' EXIT

  info "下载 gost"
  fetch "$ASSET_BASE/gost" "$tmp/gost" || die "下载失败：$ASSET_BASE/gost"
  is_elf "$tmp/gost" || die "下载的不是可执行文件（可能是错误页面）：$ASSET_BASE/gost"
  chmod +x "$tmp/gost"

  local changed=1
  if [ -f "$BIN_PATH" ] && cmp -s "$tmp/gost" "$BIN_PATH"; then
    changed=0
    info "gost 未变化，保留现有文件"
  else
    install -m 0755 "$tmp/gost" "$BIN_PATH"
    info "已安装到 $BIN_PATH"
  fi

  info "准备证书目录 $CERT_DIR"
  mkdir -p "$CERT_DIR"
  # The agent also fetches these on startup; installing them here means gost
  # has them before its first TLS handshake rather than after a restart.
  fetch "$ASSET_BASE/certFile.pem" "$CERT_DIR/certFile.pem" || die "证书下载失败：certFile.pem"
  fetch "$ASSET_BASE/key.pem" "$CERT_DIR/key.pem" || die "证书下载失败：key.pem"
  chmod 600 "$CERT_DIR/key.pem"

  write_unit

  info "重载 systemd 并启动服务"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
  systemctl restart "$SERVICE_NAME"

  sleep 1
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    info "完成，gost 运行中，API 监听 $API_ADDR"
  else
    systemctl --no-pager --lines=20 status "$SERVICE_NAME" || true
    die "gost 未能启动，见上方状态输出"
  fi
  [ "$changed" -eq 0 ] && info "（二进制未变，仅重启以应用配置）" || true
}

write_unit() {
  info "写入 systemd unit：$SERVICE_FILE"
  cat > "$SERVICE_FILE" <<UNIT
[Unit]
Description=Stander 转发数据面 gost
Documentation=https://github.com/go-gost/gost
After=network-online.target
Wants=network-online.target
ConditionFileIsExecutable=$BIN_PATH
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
Environment=GOST_LOGGER_LEVEL=warn
ExecStart=$BIN_PATH -api $API_ADDR
Restart=always
RestartSec=5
WorkingDirectory=$CERT_DIR

[Install]
WantedBy=multi-user.target
UNIT
}

usage() {
  cat <<'USAGE'
安装/升级 gost 转发数据面（systemd 服务）。agent 通过 127.0.0.1:19123 驱动它。

用法：
  sudo scripts/install_gost.sh
  sudo scripts/install_gost.sh uninstall

环境变量：
  GOST_ASSET_BASE   gost 二进制与证书的下载基址（默认 https://file.byte.gs）
  GOST_API_ADDR     API 监听地址（默认 127.0.0.1:19123，改了要同步改 agent）
USAGE
}

case "${1:-}" in
  -h | --help)
    usage
    ;;
  uninstall)
    uninstall
    ;;
  "")
    install_gost
    ;;
  *)
    die "未知参数：$1（用 --help 查看用法）"
    ;;
esac
