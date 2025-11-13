#!/bin/bash

################################################################################
# ProductHunt 自动导入 Cron 脚本
# 
# 功能: 每天自动从 ProductHunt 导入 Top 5 产品
# 执行时间: 每天 UTC 01:00 (北京时间 09:00)
# 
# 使用方式:
#   1. chmod +x scripts/cron-import-producthunt.sh
#   2. 添加到 crontab: 0 1 * * * /path/to/scripts/cron-import-producthunt.sh
################################################################################

# 设置错误处理
set -e

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOG_DIR}/producthunt-import-$(date +%Y%m%d).log"
CRON_SECRET="${CRON_SECRET}"
API_URL="${API_URL:-https://aat.ee}"

# 创建日志目录
mkdir -p "$LOG_DIR"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "🚀 Starting ProductHunt import cron job"
log "=========================================="

# 检查环境变量
if [ -z "$CRON_SECRET" ]; then
    log "❌ ERROR: CRON_SECRET environment variable is not set"
    exit 1
fi

log "📍 API URL: $API_URL"
log "📂 Project root: $PROJECT_ROOT"

# 调用 API
log "📡 Calling import API..."
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    "${API_URL}/api/cron/import-producthunt")

# 分离响应体和状态码
HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

log "📊 HTTP Status: $HTTP_CODE"

# 检查状态码
if [ "$HTTP_CODE" -eq 200 ]; then
    log "✅ Import completed successfully"
    log "📄 Response: $HTTP_BODY"
    
    # 解析结果（如果安装了 jq）
    if command -v jq &> /dev/null; then
        IMPORTED=$(echo "$HTTP_BODY" | jq -r '.summary.imported // 0')
        SKIPPED=$(echo "$HTTP_BODY" | jq -r '.summary.skipped // 0')
        ERRORS=$(echo "$HTTP_BODY" | jq -r '.summary.errors // 0')
        log "📈 Summary: Imported=$IMPORTED, Skipped=$SKIPPED, Errors=$ERRORS"
    fi
    
    exit 0
else
    log "❌ Import failed with status code: $HTTP_CODE"
    log "📄 Response: $HTTP_BODY"
    exit 1
fi

