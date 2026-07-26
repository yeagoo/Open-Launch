import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import type { Metadata } from "sharp"

import { auth } from "@/lib/auth"
import { uploadFileToR2 } from "@/lib/r2-client"
import { checkByteBudget, checkRateLimit } from "@/lib/rate-limit"

// 文件大小限制（1MB）
const MAX_FILE_SIZE = 1024 * 1024
const MAX_MULTIPART_BODY_SIZE = MAX_FILE_SIZE + 128 * 1024
const MAX_INPUT_PIXELS = 16_000_000
const MAX_IMAGE_DIMENSION = 4096
const MAX_GIF_PAGES = 200

// 每用户每小时累计上传字节预算。按当前 1MB × 20 次/小时的限制不会
// 触发——它的作用是兜底：将来上调单文件或次数限制时，存储消耗
// 依然有硬上限。
const BYTE_BUDGET_PER_HOUR = 50 * 1024 * 1024

// 允许的文件类型
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
])
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif"])

class PayloadTooLargeError extends Error {}
class InvalidImageError extends Error {}

async function readBodyWithinLimit(request: NextRequest): Promise<ArrayBuffer> {
  const contentLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_SIZE) {
    throw new PayloadTooLargeError("Request body exceeds upload limit")
  }
  if (!request.body) throw new InvalidImageError("Missing request body")

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_MULTIPART_BODY_SIZE) {
        await reader.cancel()
        throw new PayloadTooLargeError("Request body exceeds upload limit")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body.buffer as ArrayBuffer
}

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const contentType = request.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json({ error: "Expected multipart form data" }, { status: 415 })
    }

    // Rate limit: 20 uploads per hour per user. fail-closed so a Redis
    // outage doesn't let unlimited R2 uploads through.
    const { success: rateLimitOk, reset } = await checkRateLimit(
      `upload:${user.id}`,
      20,
      60 * 60 * 1000,
      { onRedisError: "fail-closed" },
    )
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: `Upload limit exceeded. Try again in ${reset} seconds.` },
        { status: 429 },
      )
    }

    // Read the stream through an application-level hard cap before parsing
    // multipart data. This also covers chunked requests without Content-Length.
    const requestBody = await readBodyWithinLimit(request)
    const formData = await new Response(requestBody, {
      headers: { "content-type": contentType },
    }).formData()
    const file = formData.get("file") as File | null
    const folder = formData.get("folder") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // 验证文件夹
    if (folder !== "avatars" && folder !== "logos" && folder !== "products") {
      return NextResponse.json({ error: "Invalid folder type" }, { status: 400 })
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: JPEG, PNG, WEBP, GIF, AVIF" },
        { status: 400 },
      )
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size exceeds 1MB limit" }, { status: 400 })
    }

    // 字节预算：在 sharp 转码（CPU）和 R2 上传（存储）之前检查
    const byteBudget = await checkByteBudget(
      `upload:${user.id}`,
      file.size,
      BYTE_BUDGET_PER_HOUR,
      60 * 60 * 1000,
    )
    if (!byteBudget.success) {
      return NextResponse.json(
        { error: `Hourly upload volume exceeded. Try again in ${byteBudget.reset} seconds.` },
        { status: 429 },
      )
    }

    // 转换文件为 Buffer
    const arrayBuffer = await file.arrayBuffer()
    const inputBuffer = Buffer.from(arrayBuffer)
    // Authentication and inexpensive input checks happen before loading
    // Sharp's native module for this request.
    const { default: sharp } = await import("sharp")

    let metadata: Metadata
    try {
      metadata = await sharp(inputBuffer, {
        animated: true,
        failOn: "error",
        limitInputPixels: MAX_INPUT_PIXELS,
      }).metadata()
    } catch {
      throw new InvalidImageError("Invalid or unsafe image")
    }

    if (
      !metadata.format ||
      !ALLOWED_FORMATS.has(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS ||
      (metadata.pages ?? 1) > MAX_GIF_PAGES
    ) {
      throw new InvalidImageError("Invalid or unsupported image dimensions")
    }

    let finalBuffer: Buffer
    let finalFileName: string
    let finalContentType: string

    // GIF 保持原格式（可能包含动画），其他格式转换为 AVIF
    if (metadata.format === "gif") {
      finalBuffer = inputBuffer
      finalFileName = "upload.gif"
      finalContentType = "image/gif"
    } else {
      // 使用 sharp 转换为 AVIF 格式（高质量，更小体积）
      const maxOutputDimension = folder === "avatars" ? 512 : folder === "logos" ? 1024 : 2048
      finalBuffer = await sharp(inputBuffer, {
        failOn: "error",
        limitInputPixels: MAX_INPUT_PIXELS,
      })
        .rotate()
        .resize({
          width: maxOutputDimension,
          height: maxOutputDimension,
          fit: "inside",
          withoutEnlargement: true,
        })
        .avif({
          quality: folder === "avatars" ? 82 : 90,
          effort: 6,
        })
        .toBuffer()

      finalFileName = "upload.avif"
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
    console.error("Upload error:", error)
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 })
    }
    if (error instanceof InvalidImageError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
