#!/bin/bash

################################################################################
# 虚拟互动 Cron 脚本
# 
# 功能: 每2小时自动模拟用户点赞和评论
# 执行时间: 每2小时 (0 */2 * * *)
# 
# 使用方式:
#   1. chmod +x scripts/cron-simulate-engagement.sh
#   2. 添加到 crontab: 0 */2 * * * /path/to/scripts/cron-simulate-engagement.sh
################################################################################

# 设置错误处理
set -e

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_ROOT}/logs"
LOG_FILE="${LOG_DIR}/simulate-engagement-$(date +%Y%m%d).log"
CRON_SECRET="${CRON_SECRET}"
API_URL="${API_URL:-https://www.aat.ee}"

# 创建日志目录
mkdir -p "$LOG_DIR"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "🤖 Starting Virtual Engagement cron job"
log "=========================================="

# 检查环境变量
if [ -z "$CRON_SECRET" ]; then
    log "❌ ERROR: CRON_SECRET environment variable is not set"
    exit 1
fi

log "📍 API URL: $API_URL"

# 调用 API
log "📡 Calling simulate-engagement API..."
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "x-cron-secret: ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    "${API_URL}/api/cron/simulate-engagement")

# 分离响应体和状态码
HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

log "📊 HTTP Status: $HTTP_CODE"

# 检查状态码
if [ "$HTTP_CODE" -eq 200 ]; then
    log "✅ Simulation completed successfully"
    log "📄 Response: $HTTP_BODY"
    
    # 解析结果（如果安装了 jq）
    if command -v jq &> /dev/null; then
        UPVOTES=$(echo "$HTTP_BODY" | jq -r '.data.upvotesAdded // 0')
        COMMENTS=$(echo "$HTTP_BODY" | jq -r '.data.commentsPosted // 0')
        log "📈 Summary: Upvotes=$UPVOTES, Comments=$COMMENTS"
    fi
    
    exit 0
else
    log "❌ Simulation failed with status code: $HTTP_CODE"
    log "📄 Response: $HTTP_BODY"
    exit 1
fi

