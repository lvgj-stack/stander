#!/bin/bash
# 从数据库重新生成 internal/model 下的 entity 与 dal 代码。
set -euo pipefail
cd "$(dirname "$(dirname "$0")")"
go run . gen -c "${1:-etc/stander.yaml}"
