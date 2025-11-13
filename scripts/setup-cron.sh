#!/bin/bash

################################################################################
# Cron Job 安装脚本
# 
# 功能: 自动配置 Linux Cron Job 用于 ProductHunt 导入
# 使用方式: sudo bash scripts/setup-cron.sh
################################################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=========================================="
echo -e "🔧 ProductHunt Cron Job 安装程序"
echo -e "==========================================${NC}"

# 获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CRON_SCRIPT="${PROJECT_ROOT}/scripts/cron-import-producthunt.sh"

echo ""
echo -e "${YELLOW}📂 项目路径: ${PROJECT_ROOT}${NC}"
echo -e "${YELLOW}📜 Cron 脚本: ${CRON_SCRIPT}${NC}"
echo ""

# 检查 cron 脚本是否存在
if [ ! -f "$CRON_SCRIPT" ]; then
    echo -e "${RED}❌ 错误: Cron 脚本不存在${NC}"
    exit 1
fi

# 设置执行权限
echo -e "${GREEN}✅ 设置脚本执行权限...${NC}"
chmod +x "$CRON_SCRIPT"

# 读取环境变量
echo ""
echo -e "${YELLOW}📋 请提供以下信息:${NC}"
echo ""

read -p "🔑 CRON_SECRET (用于 API 认证): " CRON_SECRET
if [ -z "$CRON_SECRET" ]; then
    echo -e "${RED}❌ CRON_SECRET 不能为空${NC}"
    exit 1
fi

read -p "🌐 API_URL (默认: https://aat.ee): " API_URL
API_URL=${API_URL:-https://aat.ee}

# 询问执行时间
echo ""
echo -e "${YELLOW}⏰ 设置 Cron 执行时间${NC}"
echo "  格式: 分 时 日 月 周"
echo "  示例: 0 1 * * * (每天 01:00 UTC)"
echo "  示例: 30 0 * * * (每天 00:30 UTC)"
echo ""
read -p "⏰ Cron 时间表达式 (默认: 0 1 * * *): " CRON_SCHEDULE
CRON_SCHEDULE=${CRON_SCHEDULE:-0 1 * * *}

# 创建环境变量文件
ENV_FILE="${PROJECT_ROOT}/.env.cron"
echo -e "${GREEN}✅ 创建环境变量文件: ${ENV_FILE}${NC}"
cat > "$ENV_FILE" << EOF
# ProductHunt Cron Job 环境变量
# 生成时间: $(date)
CRON_SECRET="${CRON_SECRET}"
API_URL="${API_URL}"
EOF
chmod 600 "$ENV_FILE"

# 创建 cron wrapper 脚本
WRAPPER_SCRIPT="${PROJECT_ROOT}/scripts/cron-wrapper.sh"
echo -e "${GREEN}✅ 创建 Cron Wrapper 脚本: ${WRAPPER_SCRIPT}${NC}"
cat > "$WRAPPER_SCRIPT" << EOF
#!/bin/bash
# 加载环境变量
if [ -f "${ENV_FILE}" ]; then
    export \$(cat "${ENV_FILE}" | grep -v '^#' | xargs)
fi

# 执行 cron 脚本
${CRON_SCRIPT}
EOF
chmod +x "$WRAPPER_SCRIPT"

# 添加到 crontab
echo ""
echo -e "${GREEN}✅ 配置 Crontab...${NC}"

# 检查是否已存在
EXISTING_CRON=$(crontab -l 2>/dev/null | grep -F "$WRAPPER_SCRIPT" || true)

if [ -n "$EXISTING_CRON" ]; then
    echo -e "${YELLOW}⚠️  检测到已存在的 Cron Job:${NC}"
    echo "   $EXISTING_CRON"
    echo ""
    read -p "是否替换? (y/N): " REPLACE
    if [ "$REPLACE" != "y" ] && [ "$REPLACE" != "Y" ]; then
        echo -e "${YELLOW}⏭️  跳过 Crontab 配置${NC}"
        exit 0
    fi
    
    # 删除旧的
    crontab -l 2>/dev/null | grep -vF "$WRAPPER_SCRIPT" | crontab -
fi

# 添加新的
(crontab -l 2>/dev/null; echo "$CRON_SCHEDULE $WRAPPER_SCRIPT >> ${PROJECT_ROOT}/logs/cron.log 2>&1") | crontab -

echo ""
echo -e "${GREEN}=========================================="
echo -e "✅ Cron Job 安装完成!"
echo -e "==========================================${NC}"
echo ""
echo -e "${YELLOW}📋 配置信息:${NC}"
echo "   API URL: $API_URL"
echo "   执行时间: $CRON_SCHEDULE"
echo "   日志目录: ${PROJECT_ROOT}/logs/"
echo ""
echo -e "${YELLOW}📝 验证 Crontab:${NC}"
echo "   运行: crontab -l"
echo ""
echo -e "${YELLOW}🧪 测试执行:${NC}"
echo "   运行: bash $WRAPPER_SCRIPT"
echo ""
echo -e "${YELLOW}📊 查看日志:${NC}"
echo "   运行: tail -f ${PROJECT_ROOT}/logs/producthunt-import-*.log"
echo ""

