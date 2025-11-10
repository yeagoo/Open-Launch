#!/bin/bash

# Resend 配置快速检查脚本
# 使用方法: ./scripts/check-resend-config.sh

echo "🔍 Resend 配置检查"
echo "=========================================="
echo ""

# 检查 .env.local 文件
if [ -f .env.local ]; then
    echo "✅ 找到 .env.local 文件"
    echo ""
    
    # 检查 RESEND_API_KEY
    if grep -q "RESEND_API_KEY=" .env.local; then
        API_KEY=$(grep "RESEND_API_KEY=" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")
        if [ -n "$API_KEY" ]; then
            echo "✅ RESEND_API_KEY: 已设置"
            echo "   前缀: ${API_KEY:0:10}..."
            
            if [[ $API_KEY == re_* ]]; then
                echo "   ✅ 格式正确 (以 're_' 开头)"
            else
                echo "   ⚠️  格式可能不正确 (应该以 're_' 开头)"
            fi
        else
            echo "❌ RESEND_API_KEY: 已定义但为空"
        fi
    else
        echo "❌ RESEND_API_KEY: 未设置"
    fi
    
    echo ""
    
    # 检查 RESEND_FROM_EMAIL
    if grep -q "RESEND_FROM_EMAIL=" .env.local; then
        FROM_EMAIL=$(grep "RESEND_FROM_EMAIL=" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")
        if [ -n "$FROM_EMAIL" ]; then
            echo "✅ RESEND_FROM_EMAIL: $FROM_EMAIL"
            
            if [[ $FROM_EMAIL == *"resend.dev"* ]]; then
                echo "   ⚠️  使用测试域名 (仅用于开发)"
                echo "   💡 生产环境请使用已验证的自定义域名"
            else
                echo "   ✅ 使用自定义域名"
                echo "   💡 请确保该域名已在 Resend 中验证"
            fi
        else
            echo "⚠️  RESEND_FROM_EMAIL: 已定义但为空"
            echo "   将使用默认值: onboarding@resend.dev"
        fi
    else
        echo "⚠️  RESEND_FROM_EMAIL: 未设置"
        echo "   将使用默认值: onboarding@resend.dev"
    fi
    
else
    echo "⚠️  未找到 .env.local 文件"
    echo "   请创建 .env.local 并添加 Resend 配置"
fi

echo ""
echo "=========================================="
echo "📝 下一步操作:"
echo "=========================================="
echo ""
echo "1. 运行测试脚本:"
echo "   bun tsx scripts/test-resend-email.ts your-email@example.com"
echo ""
echo "2. 如果测试失败，查看故障排查指南:"
echo "   docs/cursor/RESEND_TROUBLESHOOTING.md"
echo ""
echo "3. 验证 Resend 配置:"
echo "   - API Keys: https://resend.com/api-keys"
echo "   - Domains:  https://resend.com/domains"
echo "   - Logs:     https://resend.com/logs"
echo ""

