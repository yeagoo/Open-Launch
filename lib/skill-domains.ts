import { randomBytes } from "node:crypto"

import * as z from "zod"

import { isPrivateHostname } from "@/lib/utils"

export const skillDomainMethods = ["html", "dns", "meta"] as const

export type SkillDomainMethod = (typeof skillDomainMethods)[number]

export const registerSkillDomainSchema = z.object({
  domain: z.string().trim().min(1).max(2048),
  method: z.enum(["html", "dns", "meta"]).default("html"),
})

export interface SkillDomainVerificationMethods {
  html: {
    path: string
    content: string
  }
  dns: {
    name: string
    value: string
  }
  meta: {
    name: string
    content: string
  }
}

export function createSkillDomainToken(): string {
  return randomBytes(16).toString("hex")
}

export function normalizeSkillDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null

  const hostname = parsed.hostname.replace(/\.$/, "").toLowerCase()
  if (!hostname || hostname.length > 253) return null
  if (!hostname.includes(".")) return null
  if (isPrivateHostname(hostname)) return null

  return hostname
}

export function buildSkillDomainMethods(
  domain: string,
  token: string,
): SkillDomainVerificationMethods {
  return {
    html: {
      path: `/.well-known/aat-verify-${token}.txt`,
      content: token,
    },
    dns: {
      name: `_aat-verify.${domain}`,
      value: token,
    },
    meta: {
      name: "aat-verify",
      content: token,
    },
  }
}
