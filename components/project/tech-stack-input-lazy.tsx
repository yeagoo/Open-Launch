"use client"

import dynamic from "next/dynamic"

import type { TechStackInputProps } from "./tech-stack-input"

const TechStackInput = dynamic(
  () => import("./tech-stack-input").then((module) => module.TechStackInput),
  {
    ssr: false,
    loading: () => (
      <div
        className="bg-muted/20 mt-1 h-10 animate-pulse rounded-md border"
        role="status"
        aria-label="Loading tag input"
      />
    ),
  },
)

export function TechStackInputLazy(props: TechStackInputProps) {
  return <TechStackInput {...props} />
}
