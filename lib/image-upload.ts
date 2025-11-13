/**
 * 图片下载和上传工具
 * 用于从外部 URL 下载图片并上传到 R2
 */

import { uploadFileToR2 } from "./r2-client"

interface DownloadImageResult {
  success: boolean
  url?: string
  error?: string
}

/**
 * 从 URL 下载图片并上传到 R2
 * @param imageUrl 图片 URL
 * @param folder R2 文件夹 ("logos" | "products")
 * @param fallbackUrl 失败时的回退 URL
 * @returns 上传后的 R2 URL 或回退 URL
 */
export async function downloadAndUploadImage(
  imageUrl: string,
  folder: "logos" | "products" = "logos",
  fallbackUrl?: string,
): Promise<DownloadImageResult> {
  try {
    // 验证 URL
    if (!imageUrl || !imageUrl.startsWith("http")) {
      console.error("❌ Invalid image URL:", imageUrl)
      return {
        success: false,
        url: fallbackUrl,
        error: "Invalid URL",
      }
    }

    console.log(`📥 Downloading image from: ${imageUrl}`)

    // 下载图片
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "aat.ee/1.0",
      },
      signal: AbortSignal.timeout(10000), // 10 秒超时
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // 检查内容类型
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.startsWith("image/")) {
      throw new Error(`Invalid content type: ${contentType}`)
    }

    // 检查文件大小（限制 5MB）
    const contentLength = response.headers.get("content-length")
    if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
      throw new Error(`Image too large: ${contentLength} bytes`)
    }

    // 转换为 Buffer
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log(`✅ Downloaded ${buffer.length} bytes, type: ${contentType}`)

    // 生成文件名
    const extension = getExtensionFromContentType(contentType) || getExtensionFromUrl(imageUrl)
    const fileName = `image.${extension}`

    // 上传到 R2
    console.log(`📤 Uploading to R2...`)
    const r2Url = await uploadFileToR2(buffer, fileName, contentType, folder)

    console.log(`✅ Uploaded to R2: ${r2Url}`)

    return {
      success: true,
      url: r2Url,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error(`❌ Failed to download/upload image:`, errorMessage)

    return {
      success: false,
      url: fallbackUrl,
      error: errorMessage,
    }
  }
}

/**
 * 批量下载并上传图片
 * @param imageUrls 图片 URL 数组
 * @param folder R2 文件夹
 * @returns 上传结果数组
 */
export async function downloadAndUploadImages(
  imageUrls: string[],
  folder: "logos" | "products" = "logos",
): Promise<DownloadImageResult[]> {
  const results: DownloadImageResult[] = []

  for (const url of imageUrls) {
    const result = await downloadAndUploadImage(url, folder)
    results.push(result)

    // 避免并发过多，每次上传后稍作延迟
    if (result.success) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  return results
}

/**
 * 从 Content-Type 获取文件扩展名
 */
function getExtensionFromContentType(contentType: string): string {
  const typeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  }

  return typeMap[contentType.toLowerCase()] || "jpg"
}

/**
 * 从 URL 获取文件扩展名
 */
function getExtensionFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const match = pathname.match(/\.([a-z0-9]+)$/i)
    if (match) {
      return match[1].toLowerCase()
    }
  } catch {
    // 忽略错误
  }
  return "jpg"
}

/**
 * 验证图片 URL 是否有效
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false
  }

  try {
    const urlObj = new URL(url)
    return urlObj.protocol === "http:" || urlObj.protocol === "https:"
  } catch {
    return false
  }
}
