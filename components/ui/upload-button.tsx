"use client"

import { useState } from "react"

import { RiImageAddLine, RiLoader4Line } from "@remixicon/react"

interface UploadButtonProps {
  endpoint: "projectLogo" | "projectProductImage"
  onUploadBegin?: () => void
  onClientUploadComplete?: (
    res: Array<{ serverData: { fileUrl: string; uploadedBy: string } }>,
  ) => void
  onUploadError?: (error: Error) => void
  appearance?: {
    button?: string
    allowedContent?: string
  }
  content?: {
    button?: (params: { ready: boolean; isUploading: boolean }) => React.ReactNode
  }
}

export function UploadButton({
  endpoint,
  onUploadBegin,
  onClientUploadComplete,
  onUploadError,
  appearance,
  content,
}: UploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false)

  // 根据 endpoint 确定文件夹
  const folder = endpoint === "projectLogo" ? "logos" : "products"

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setIsUploading(true)
      onUploadBegin?.()

      // 创建 FormData
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folder", folder)

      // 上传文件
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "上传失败")
      }

      // 调用成功回调
      onClientUploadComplete?.([
        {
          serverData: {
            fileUrl: data.fileUrl,
            uploadedBy: data.uploadedBy,
          },
        },
      ])
    } catch (error) {
      console.error("上传错误:", error)
      onUploadError?.(error instanceof Error ? error : new Error("上传失败"))
    } finally {
      setIsUploading(false)
      // 重置文件输入
      event.target.value = ""
    }
  }

  const buttonContent = content?.button?.({ ready: !isUploading, isUploading })

  return (
    <div className={appearance?.allowedContent}>
      <label className={appearance?.button || "cursor-pointer"}>
        <input
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/avif"
          onChange={handleFileChange}
          disabled={isUploading}
          className="hidden"
        />
        {buttonContent || (
          <span className="flex items-center gap-2">
            {isUploading ? (
              <RiLoader4Line className="h-4 w-4 animate-spin" />
            ) : (
              <RiImageAddLine className="h-4 w-4" />
            )}
            {isUploading ? "上传中..." : "上传图片"}
          </span>
        )}
      </label>
    </div>
  )
}

