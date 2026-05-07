#!/bin/bash

################################################################################
# Project Related Products Cron 脚本
#
# 功能: 调用 /api/cron/relate-projects，为缺失相关产品记录的项目用 DeepSeek
#       从候选集中挑选最多 4 个相关产品（每次最多处理 3 个项目）。
# 推荐执行频率: 每 5 分钟一次
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOG_DIR}/relate-projects-$(date +%Y%m%d).log"
CRON_API_KEY="${CRON_API_KEY}"
API_URL="${API_URL:-https://www.aat.ee}"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

if [ -z "$CRON_API_KEY" ]; then
    log "❌ ERROR: CRON_API_KEY environment variable is not set"
    exit 1
fi

log "🔗 Triggering relate-projects cron at $API_URL"

RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${CRON_API_KEY}" \
    -H "Content-Type: application/json" \
    "${API_URL}/api/cron/relate-projects")

HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" -eq 200 ]; then
    if command -v jq &> /dev/null; then
        WRITTEN=$(echo "$HTTP_BODY" | jq -r '.written // 0')
        FAILED=$(echo "$HTTP_BODY" | jq -r '.failed // 0')
        SUBJECTS=$(echo "$HTTP_BODY" | jq -r '.subjects // 0')
        log "✅ subjects=$SUBJECTS written=$WRITTEN failed=$FAILED"
    else
        log "✅ Response: $HTTP_BODY"
    fi
    exit 0
else
    log "❌ Failed with HTTP $HTTP_CODE: $HTTP_BODY"
    exit 1
fi
