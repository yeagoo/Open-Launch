#!/bin/bash

################################################################################
# Project Translations Cron 脚本
#
# 功能: 调用 /api/cron/translate-projects，批量为缺失翻译的项目生成 7 个非源
#       语言版本（每次最多处理 5 个项目 × 7 locale = 35 次 AI 调用）。
# 推荐执行频率: 每 5 分钟一次
#
# 使用方式:
#   1. chmod +x scripts/cron-translate-projects.sh
#   2. 添加到 crontab: */5 * * * * /path/to/scripts/cron-translate-projects.sh
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOG_DIR}/translate-projects-$(date +%Y%m%d).log"
CRON_API_KEY="${CRON_API_KEY}"
API_URL="${API_URL:-https://aat.ee}"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

if [ -z "$CRON_API_KEY" ]; then
    log "❌ ERROR: CRON_API_KEY environment variable is not set"
    exit 1
fi

log "🌍 Triggering translate-projects cron at $API_URL"

RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${CRON_API_KEY}" \
    -H "Content-Type: application/json" \
    "${API_URL}/api/cron/translate-projects")

HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" -eq 200 ]; then
    if command -v jq &> /dev/null; then
        TRANSLATED=$(echo "$HTTP_BODY" | jq -r '.translated // 0')
        FAILED=$(echo "$HTTP_BODY" | jq -r '.failed // 0')
        CANDIDATES=$(echo "$HTTP_BODY" | jq -r '.candidates // 0')
        log "✅ candidates=$CANDIDATES translated=$TRANSLATED failed=$FAILED"
    else
        log "✅ Response: $HTTP_BODY"
    fi
    exit 0
else
    log "❌ Failed with HTTP $HTTP_CODE: $HTTP_BODY"
    exit 1
fi
