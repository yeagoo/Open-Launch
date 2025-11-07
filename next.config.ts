import type { NextConfig } from "next"

import createMDX from "@next/mdx"
import remarkGfm from "remark-gfm"

const nextConfig: NextConfig = {
  /* config options here */

  // Configuration pour MDX
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  images: {
    remotePatterns: [
      // 如果需要通过 Next.js Image 组件优化 R2 图片，请取消注释并填入您的 R2 公开域名
       {
         protocol: "https",
         hostname: "statics.aat.ee", // 或您的自定义域名
       },
      {
        protocol: "https",
        hostname: "yt3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "designmodo.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "nexty.dev",
      },
    ],
  },
}

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm],
  },
})

// Combine MDX and Next.js config
export default withMDX(nextConfig)
