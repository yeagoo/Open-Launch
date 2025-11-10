#!/bin/bash

# Resend 邮件测试脚本包装器
# 使用方法: ./scripts/run-test-email.sh your-email@example.com

if [ -z "$1" ]; then
    echo "❌ 错误: 请提供测试邮箱地址"
    echo ""
    echo "使用方法:"
    echo "  ./scripts/run-test-email.sh your-email@example.com"
    echo ""
    exit 1
fi

echo "📧 准备发送测试邮件到: $1"
echo ""

# 检查 .env.local 文件
if [ ! -f .env.local ]; then
    echo "❌ 错误: 未找到 .env.local 文件"
    echo "   请创建 .env.local 并添加 Resend 配置"
    exit 1
fi

# 加载环境变量并运行测试
set -a
source .env.local
set +a

bun tsx scripts/test-resend-email.ts "$1"

