/* eslint-disable @next/next/no-img-element */
"use client"

import { useEffect, useId, useState } from "react"

import { RiCheckLine, RiCloseCircleLine, RiCloseLine, RiLoader4Line } from "@remixicon/react"
import { Tag, TagInput } from "emblor"
import { toast } from "sonner"

import { platformType, pricingType } from "@/lib/project-enums"
import { UploadButton } from "@/lib/r2-upload"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import { updateProject, type UpdateProjectData } from "@/app/actions/project-details"
import { getAllCategories } from "@/app/actions/projects"

/**
 * Single-page edit form for the maker dashboard / detail-page Edit
 * dialog. Covers every field the project_details.updateProject action
 * accepts. Stays deliberately simpler than SubmitProjectForm — no
 * stepper, no auto-fill, no launch-type selector — because the project
 * already exists and only needs adjustments.
 */
interface EditProjectFormProps {
  projectId: string
  initial: {
    name: string
    tagline: string | null
    description: string
    websiteUrl: string
    logoUrl: string
    productImage: string | null
    techStack: string[]
    platforms: string[]
    pricing: string
    githubUrl: string | null
    twitterUrl: string | null
    categories: { id: string; name: string }[]
  }
  onUpdate: () => void
  onCancel: () => void
}

export function EditProjectForm({ projectId, initial, onUpdate, onCancel }: EditProjectFormProps) {
  const tagInputId = useId()

  const [name, setName] = useState(initial.name)
  const [tagline, setTagline] = useState(initial.tagline ?? "")
  const [description, setDescription] = useState(initial.description)
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl)
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl)
  const [productImage, setProductImage] = useState<string | null>(initial.productImage)
  const [platforms, setPlatforms] = useState<string[]>(initial.platforms)
  const [pricing, setPricing] = useState(initial.pricing)
  const [githubUrl, setGithubUrl] = useState(initial.githubUrl ?? "")
  const [twitterUrl, setTwitterUrl] = useState(initial.twitterUrl ?? "")
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    initial.categories.map((c) => c.id),
  )
  const [techTags, setTechTags] = useState<Tag[]>(
    initial.techStack.map((t, i) => ({ id: `${i}-${t}`, text: t })),
  )
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null)

  const [allCategories, setAllCategories] = useState<{ id: string; name: string }[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isUploadingProduct, setIsUploadingProduct] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoadingCategories(true)
    getAllCategories()
      .then((cats) => {
        if (!cancelled) setAllCategories(cats)
      })
      .catch((err) => {
        console.error("Failed to load categories:", err)
        if (!cancelled) toast.error("Failed to load categories")
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCategories(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleCategory(catId: string, checked: boolean) {
    if (checked && selectedCategoryIds.length >= 3 && !selectedCategoryIds.includes(catId)) {
      setError("Maximum 3 categories")
      return
    }
    setError(null)
    setSelectedCategoryIds((prev) =>
      checked ? [...prev.filter((c) => c !== catId), catId] : prev.filter((c) => c !== catId),
    )
  }

  function togglePlatform(value: string, checked: boolean) {
    setPlatforms((prev) =>
      checked ? [...prev.filter((p) => p !== value), value] : prev.filter((p) => p !== value),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Project name is required")
      return
    }
    if (!description.trim()) {
      setError("Description is required")
      return
    }
    if (!logoUrl) {
      setError("Logo is required")
      return
    }
    if (selectedCategoryIds.length === 0) {
      setError("Pick at least one category")
      return
    }
    if (techTags.length === 0) {
      setError("Add at least one tag")
      return
    }
    if (platforms.length === 0) {
      setError("Pick at least one platform")
      return
    }
    if (!pricing) {
      setError("Pick a pricing model")
      return
    }
    try {
      new URL(websiteUrl)
    } catch {
      setError("Website URL is invalid")
      return
    }

    setIsSaving(true)
    try {
      const payload: UpdateProjectData = {
        name: name.trim(),
        tagline: tagline.trim() || null,
        description,
        websiteUrl: websiteUrl.trim(),
        logoUrl,
        productImage,
        techStack: techTags.map((t) => t.text),
        platforms,
        pricing,
        githubUrl: githubUrl.trim() || null,
        twitterUrl: twitterUrl.trim() || null,
        categories: selectedCategoryIds,
      }
      const result = await updateProject(projectId, payload)
      if (result.success) {
        toast.success("Project updated")
        onUpdate()
      } else {
        setError(result.error || "Failed to update project")
      }
    } catch (err) {
      console.error("Edit submit failed:", err)
      setError("An unexpected error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="edit-name">
          Project Name <span className="text-red-500">*</span>
        </Label>
        <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <Label htmlFor="edit-tagline">
          Tagline <span className="text-muted-foreground">(Optional, ≤60)</span>
        </Label>
        <Input
          id="edit-tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          maxLength={60}
          placeholder="e.g. AI image generation, perfect text rendering"
        />
        <div className="text-muted-foreground mt-1 text-right text-xs">{tagline.length}/60</div>
      </div>

      <div>
        <Label htmlFor="edit-website">
          Website URL <span className="text-red-500">*</span>
        </Label>
        <Input
          id="edit-website"
          type="url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          required
        />
        {websiteUrl !== initial.websiteUrl && (
          <p className="text-muted-foreground mt-1 text-xs">
            ⚠️ Changing the URL resets badge verification.
          </p>
        )}
      </div>

      <div>
        <Label>
          Description <span className="text-red-500">*</span>
        </Label>
        <RichTextEditor
          content={description}
          onChange={(content) => setDescription(content)}
          placeholder="Describe your project"
          className="max-h-[250px] overflow-y-auto"
        />
      </div>

      <div className="space-y-2">
        <Label>
          Logo <span className="text-red-500">*</span>
        </Label>
        {logoUrl ? (
          <div className="bg-muted/30 relative w-fit rounded-md border p-3">
            <img
              src={logoUrl}
              alt="Logo"
              width={64}
              height={64}
              className="h-16 w-16 rounded object-contain"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground absolute top-1 right-1 h-6 w-6"
              onClick={() => setLogoUrl("")}
              aria-label="Remove logo"
            >
              <RiCloseCircleLine className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <UploadButton
            endpoint="projectLogo"
            onUploadBegin={() => {
              setIsUploadingLogo(true)
              setError(null)
            }}
            onClientUploadComplete={(res) => {
              setIsUploadingLogo(false)
              if (res?.[0]?.serverData?.fileUrl) setLogoUrl(res[0].serverData.fileUrl)
              else setError("Logo upload failed")
            }}
            onUploadError={(err: Error) => {
              setIsUploadingLogo(false)
              setError(`Logo upload failed: ${err.message}`)
            }}
          />
        )}
        {isUploadingLogo && <span className="text-muted-foreground text-xs">Uploading...</span>}
      </div>

      <div className="space-y-2">
        <Label>Product Image (Optional)</Label>
        {productImage ? (
          <div className="bg-muted/30 relative w-fit rounded-md border p-3">
            <img
              src={productImage}
              alt="Product"
              width={200}
              height={120}
              className="rounded object-contain"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground absolute top-1 right-1 h-6 w-6"
              onClick={() => setProductImage(null)}
              aria-label="Remove product image"
            >
              <RiCloseCircleLine className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <UploadButton
            endpoint="projectProductImage"
            onUploadBegin={() => {
              setIsUploadingProduct(true)
              setError(null)
            }}
            onClientUploadComplete={(res) => {
              setIsUploadingProduct(false)
              if (res?.[0]?.serverData?.fileUrl) setProductImage(res[0].serverData.fileUrl)
              else setError("Product image upload failed")
            }}
            onUploadError={(err: Error) => {
              setIsUploadingProduct(false)
              setError(`Product image upload failed: ${err.message}`)
            }}
          />
        )}
        {isUploadingProduct && <span className="text-muted-foreground text-xs">Uploading...</span>}
      </div>

      <div>
        <Label className="mb-2 block">
          Categories <span className="text-red-500">*</span>
          <span className="text-muted-foreground ml-2 text-xs">
            ({selectedCategoryIds.length}/3)
          </span>
        </Label>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
          {isLoadingCategories ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <RiLoader4Line className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            allCategories.map((cat) => (
              <div key={cat.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`edit-cat-${cat.id}`}
                  checked={selectedCategoryIds.includes(cat.id)}
                  onCheckedChange={(c) => toggleCategory(cat.id, !!c)}
                />
                <Label htmlFor={`edit-cat-${cat.id}`} className="cursor-pointer font-normal">
                  {cat.name}
                </Label>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <Label htmlFor={tagInputId}>
          Tags <span className="text-red-500">*</span>
          <span className="text-muted-foreground ml-2 text-xs">({techTags.length}/10)</span>
        </Label>
        <TagInput
          id={tagInputId}
          tags={techTags}
          setTags={(next) => {
            const arr = Array.isArray(next) ? next : []
            if (arr.length > 10) {
              setError("Maximum 10 tags")
              return
            }
            setError(null)
            setTechTags(arr)
          }}
          activeTagIndex={activeTagIndex}
          setActiveTagIndex={setActiveTagIndex}
          placeholder="ai, saas, open-source..."
          styleClasses={{
            inlineTagsContainer:
              "border-input rounded-md bg-background shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50 p-1 gap-1 mt-1",
            input: "w-full min-w-[80px] shadow-none px-2 h-7",
            tag: {
              body: "h-7 relative bg-background border border-input rounded-md font-medium text-xs ps-2 pe-7",
              closeButton:
                "absolute -inset-y-px -end-px p-0 rounded-e-md flex size-7 text-muted-foreground/80 hover:text-foreground",
            },
          }}
        />
      </div>

      <div>
        <Label className="mb-2 block">
          Platforms <span className="text-red-500">*</span>
        </Label>
        <div className="space-y-2 rounded-md border p-3">
          {Object.entries(platformType).map(([key, value]) => (
            <div key={value} className="flex items-center space-x-2">
              <Checkbox
                id={`edit-plat-${value}`}
                checked={platforms.includes(value)}
                onCheckedChange={(c) => togglePlatform(value, !!c)}
              />
              <Label htmlFor={`edit-plat-${value}`} className="cursor-pointer font-normal">
                {key.toLowerCase()}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">
          Pricing <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={pricing}
          onValueChange={setPricing}
          className="flex flex-col gap-3 sm:flex-row"
        >
          {Object.entries(pricingType).map(([key, value]) => (
            <div key={value} className="flex-1">
              <Label
                htmlFor={`edit-price-${value}`}
                className="hover:bg-muted/50 flex cursor-pointer items-center space-x-2 rounded-md border p-3"
              >
                <RadioGroupItem value={value} id={`edit-price-${value}`} />
                <span className="font-normal">{key.toLowerCase()}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="edit-github">GitHub URL (Optional)</Label>
          <Input
            id="edit-github"
            type="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
          />
        </div>
        <div>
          <Label htmlFor="edit-twitter">Twitter URL (Optional)</Label>
          <Input
            id="edit-twitter"
            type="url"
            value={twitterUrl}
            onChange={(e) => setTwitterUrl(e.target.value)}
            placeholder="https://twitter.com/username"
          />
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border-destructive/30 text-destructive rounded-md border p-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          <RiCloseLine className="mr-1 h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving || isUploadingLogo || isUploadingProduct}>
          {isSaving ? (
            <RiLoader4Line className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <RiCheckLine className="mr-1 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </form>
  )
}
