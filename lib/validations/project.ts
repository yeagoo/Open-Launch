import { z } from "zod"

const plainText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), {
      message: `${label} contains control characters`,
    })

export const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === "http:" || protocol === "https:"
  }, "Only HTTP/HTTPS URLs are supported")

const optionalHttpUrl = z.union([httpUrlSchema, z.literal(""), z.null()]).optional()
const boundedList = (label: string, options: { min?: number; max?: number } = {}) =>
  z
    .array(plainText(label, 100))
    .min(options.min ?? 0)
    .max(options.max ?? 10)
    .refine(
      (items) => new Set(items.map((item) => item.trim().toLowerCase())).size === items.length,
      `${label} values must be unique`,
    )

export const projectSubmissionSchema = z.object({
  name: plainText("Project name", 100),
  tagline: z.union([plainText("Tagline", 60), z.literal(""), z.null()]).optional(),
  description: z.string().trim().min(1).max(50_000),
  sourceLocale: z.string().trim().max(10).optional(),
  websiteUrl: httpUrlSchema,
  logoUrl: httpUrlSchema,
  productImage: optionalHttpUrl,
  categories: boundedList("Category", { min: 1 }),
  techStack: boundedList("Technology", { min: 1 }),
  platforms: boundedList("Platform", { min: 1 }),
  pricing: plainText("Pricing", 32),
  githubUrl: optionalHttpUrl,
  twitterUrl: optionalHttpUrl,
  hasBadgeVerified: z.boolean().optional(),
  tags: boundedList("Tag").optional(),
})

export const projectUpdateSchema = z
  .object({
    name: plainText("Project name", 100).optional(),
    tagline: z.union([plainText("Tagline", 60), z.literal(""), z.null()]).optional(),
    description: z.string().trim().min(1).max(50_000).optional(),
    categories: boundedList("Category", { min: 1 }).optional(),
    websiteUrl: httpUrlSchema.optional(),
    logoUrl: httpUrlSchema.optional(),
    productImage: optionalHttpUrl,
    techStack: boundedList("Technology", { min: 1 }).optional(),
    platforms: boundedList("Platform", { min: 1 }).optional(),
    pricing: plainText("Pricing", 32).optional(),
    githubUrl: optionalHttpUrl,
    twitterUrl: optionalHttpUrl,
  })
  .strict()

export type ProjectSubmissionInput = z.infer<typeof projectSubmissionSchema>
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>
