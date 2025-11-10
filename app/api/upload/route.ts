import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import sharp from "sharp"

import { auth } from "@/lib/auth"
import { uploadFileToR2 } from "@/lib/r2-client"

// 文件大小限制（1MB）
const MAX_FILE_SIZE = 1024 * 1024

// 允许的文件类型
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]

// 验证用户身份
async function authenticateUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  const user = session?.user

  if (!user?.id) {
    return null
  }

  return user
}

// POST 处理文件上传
export async function POST(request: NextRequest) {
  try {
    // 验证用户
    const user = await authenticateUser()
    if (!user) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 })
    }

    // 获取表单数据
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const folder = formData.get("folder") as string | null

    if (!file) {
      return NextResponse.json({ error: "未找到文件" }, { status: 400 })
    }

    // 验证文件夹
    if (folder !== "logos" && folder !== "products") {
      return NextResponse.json({ error: "无效的文件夹类型" }, { status: 400 })
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "不支持的文件类型，仅支持图片格式（JPEG, PNG, WEBP, GIF, AVIF）" },
        { status: 400 },
      )
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "文件大小超过 1MB 限制" }, { status: 400 })
    }

    // 转换文件为 Buffer
    const arrayBuffer = await file.arrayBuffer()
    const inputBuffer = Buffer.from(arrayBuffer)

    let finalBuffer: Buffer
    let finalFileName: string
    let finalContentType: string

    // GIF 保持原格式（可能包含动画），其他格式转换为 AVIF
    if (file.type === "image/gif") {
      finalBuffer = inputBuffer
      finalFileName = file.name
      finalContentType = file.type
    } else {
      // 使用 sharp 转换为 AVIF 格式（高质量，更小体积）
      finalBuffer = await sharp(inputBuffer)
        .avif({
          quality: 90, // 高质量 AVIF（接近无损）
          effort: 6, // 更好的压缩（0-9，数值越高压缩越好但速度越慢）
        })
        .toBuffer()

      // 修改文件名为 .avif 扩展名
      finalFileName = file.name.replace(/\.[^.]+$/, ".avif")
      finalContentType = "image/avif"
    }

    // 上传到 R2
    const fileUrl = await uploadFileToR2(finalBuffer, finalFileName, finalContentType, folder)

    return NextResponse.json({
      success: true,
      fileUrl,
      uploadedBy: user.id,
    })
  } catch (error) {
    console.error("文件上传错误:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "文件上传失败" },
      { status: 500 },
    )
  }
}
