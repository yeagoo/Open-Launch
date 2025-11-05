import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// 初始化 R2 客户端
export function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 配置缺失，请检查环境变量")
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
}

// 生成预签名上传 URL
export async function getUploadUrl(
  fileName: string,
  fileType: string,
  folder: "logos" | "products",
): Promise<{ uploadUrl: string; fileUrl: string }> {
  const client = getR2Client()
  const bucketName = process.env.R2_BUCKET_NAME

  if (!bucketName) {
    throw new Error("R2_BUCKET_NAME 环境变量未设置")
  }

  // 生成唯一文件名
  const timestamp = Date.now()
  const randomString = Math.random().toString(36).substring(2, 15)
  const extension = fileName.split(".").pop()
  const key = `${folder}/${timestamp}-${randomString}.${extension}`

  // 创建 PutObject 命令
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: fileType,
  })

  // 生成预签名 URL（有效期 10 分钟）
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 })

  // 构建公共访问 URL
  const publicDomain = process.env.R2_PUBLIC_DOMAIN
  const fileUrl = publicDomain ? `${publicDomain}/${key}` : uploadUrl.split("?")[0]

  return { uploadUrl, fileUrl }
}

// 直接上传文件到 R2
export async function uploadFileToR2(
  file: Buffer,
  fileName: string,
  fileType: string,
  folder: "logos" | "products",
): Promise<string> {
  const client = getR2Client()
  const bucketName = process.env.R2_BUCKET_NAME

  if (!bucketName) {
    throw new Error("R2_BUCKET_NAME 环境变量未设置")
  }

  // 生成唯一文件名
  const timestamp = Date.now()
  const randomString = Math.random().toString(36).substring(2, 15)
  const extension = fileName.split(".").pop()
  const key = `${folder}/${timestamp}-${randomString}.${extension}`

  // 上传文件
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file,
    ContentType: fileType,
  })

  await client.send(command)

  // 返回公共访问 URL
  const publicDomain = process.env.R2_PUBLIC_DOMAIN
  if (!publicDomain) {
    throw new Error("R2_PUBLIC_DOMAIN 环境变量未设置")
  }

  return `${publicDomain}/${key}`
}

