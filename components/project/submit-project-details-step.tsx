"use client"

import { useId, useMemo, useState } from "react"

import { RiLoader4Line } from "@remixicon/react"
import type { Tag } from "emblor"
import { useTranslations } from "next-intl"

import { platformType, pricingType } from "@/lib/project-enums"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { TechStackInputLazy } from "@/components/project/tech-stack-input-lazy"

interface ProjectDetailsValue {
  categories: string[]
  techStack: string[]
  platforms: string[]
  pricing: string
  githubUrl?: string
  twitterUrl?: string
}

interface SubmitProjectDetailsStepProps {
  value: ProjectDetailsValue
  categories: { id: string; name: string }[]
  isLoadingCategories: boolean
  popularTags: string[]
  tags: Tag[]
  fieldErrors: Record<string, string>
  onChange: (patch: Partial<ProjectDetailsValue>) => void
  onTagsChange: (tags: Tag[]) => void
  onFieldError: (field: string, message: string) => void
}

export function SubmitProjectDetailsStep({
  value,
  categories,
  isLoadingCategories,
  popularTags,
  tags,
  fieldErrors,
  onChange,
  onTagsChange,
  onFieldError,
}: SubmitProjectDetailsStepProps) {
  const t = useTranslations("submitProject")
  const tagInputId = useId()
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null)
  const autocompleteOptions = useMemo(
    () => popularTags.map((name) => ({ id: `popular-${name}`, text: name })),
    [popularTags],
  )

  const fieldError = (field: string) =>
    fieldErrors[field] ? (
      <p className="mt-1 text-xs text-red-600" role="alert">
        {fieldErrors[field]}
      </p>
    ) : null

  function toggleList(field: "categories" | "platforms", item: string, checked: boolean) {
    const current = value[field]
    onChange({ [field]: checked ? [...current, item] : current.filter((entry) => entry !== item) })
  }

  return (
    <div className="space-y-8">
      <div id="categories">
        <Label className="mb-2 block">
          {t("step2.categories.label")} <span className="text-red-500">*</span>
          <span className="text-muted-foreground ml-2 text-xs">
            {t("step2.categories.counter", { count: value.categories.length })}
          </span>
        </Label>
        {isLoadingCategories ? (
          <div className="text-muted-foreground flex items-center gap-2">
            <RiLoader4Line className="h-4 w-4 animate-spin" /> {t("step2.categories.loading")}
          </div>
        ) : categories.length > 0 ? (
          <div className="max-h-60 space-y-3 overflow-y-auto rounded-md border p-4">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`cat-${category.id}`}
                  checked={value.categories.includes(category.id)}
                  onCheckedChange={(checked) => {
                    if (checked && value.categories.length >= 3) {
                      onFieldError("categories", t("errors.fields.categoriesMax"))
                      return
                    }
                    onFieldError("categories", "")
                    toggleList("categories", category.id, Boolean(checked))
                  }}
                />
                <Label htmlFor={`cat-${category.id}`} className="cursor-pointer font-normal">
                  {category.name}
                </Label>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t("step2.categories.empty")}</p>
        )}
        <p className="text-muted-foreground mt-1 text-xs">{t("step2.categories.help")}</p>
        {fieldError("categories")}
      </div>

      <div id="techStack">
        <Label htmlFor={tagInputId}>
          {t("step2.tags.label")} <span className="text-red-500">*</span>
          <span className="text-muted-foreground ml-2 text-xs">
            {t("step2.tags.counter", { count: value.techStack.length })}
          </span>
        </Label>
        <TechStackInputLazy
          id={tagInputId}
          tags={tags}
          onChange={(resolvedTags) => {
            if (resolvedTags.length > 10) {
              onFieldError("techStack", t("errors.fields.techStackMax"))
              return
            }
            onFieldError("techStack", "")
            onTagsChange(resolvedTags)
          }}
          placeholder={t("step2.tags.placeholder")}
          autocompleteOptions={autocompleteOptions}
          activeTagIndex={activeTagIndex}
          setActiveTagIndex={setActiveTagIndex}
        />
        <p className="text-muted-foreground mt-1 text-xs">{t("step2.tags.help")}</p>
        {fieldError("techStack")}
      </div>

      <div id="platforms">
        <Label className="mb-2 block">
          {t("step2.platforms.label")} <span className="text-red-500">*</span>
        </Label>
        <div className="space-y-3 rounded-md border p-4">
          {Object.entries(platformType).map(([key, platform]) => (
            <div key={platform} className="flex items-center space-x-2">
              <Checkbox
                id={`platform-${platform}`}
                checked={value.platforms.includes(platform)}
                onCheckedChange={(checked) => toggleList("platforms", platform, Boolean(checked))}
              />
              <Label
                htmlFor={`platform-${platform}`}
                className="cursor-pointer font-normal capitalize"
              >
                {t(`step2.platforms.options.${key.toLowerCase() as "web"}`)}
              </Label>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{t("step2.platforms.help")}</p>
        {fieldError("platforms")}
      </div>

      <div id="pricing">
        <Label className="mb-2 block">
          {t("step2.pricing.label")} <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={value.pricing}
          onValueChange={(pricing) => onChange({ pricing })}
          className="flex flex-col gap-4 sm:flex-row"
        >
          {Object.entries(pricingType).map(([key, pricing]) => (
            <div key={pricing} className="flex-1">
              <Label
                htmlFor={`pricing-${pricing}`}
                className="hover:bg-muted/50 flex h-full cursor-pointer items-center space-x-2 rounded-md border p-3 transition-colors"
              >
                <RadioGroupItem value={pricing} id={`pricing-${pricing}`} />
                <span className="font-normal capitalize">
                  {t(`step2.pricing.options.${key.toLowerCase() as "free"}`)}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        {fieldError("pricing")}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <Label htmlFor="githubUrl">{t("step2.githubUrl.label")}</Label>
          <Input
            id="githubUrl"
            name="githubUrl"
            type="url"
            value={value.githubUrl ?? ""}
            onChange={(event) => onChange({ githubUrl: event.target.value })}
            placeholder={t("step2.githubUrl.placeholder")}
          />
        </div>
        <div>
          <Label htmlFor="twitterUrl">{t("step2.twitterUrl.label")}</Label>
          <Input
            id="twitterUrl"
            name="twitterUrl"
            type="url"
            value={value.twitterUrl ?? ""}
            onChange={(event) => onChange({ twitterUrl: event.target.value })}
            placeholder={t("step2.twitterUrl.placeholder")}
          />
        </div>
      </div>
    </div>
  )
}
