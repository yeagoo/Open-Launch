/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useCallback, useEffect, useId, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"

import { platformType, pricingType } from "@/drizzle/db/schema"
import { routing } from "@/i18n/routing"
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCalendarLine,
  RiCheckboxCircleFill,
  RiCheckLine,
  RiCloseCircleLine,
  RiFileCheckLine,
  RiImageAddLine,
  RiInformation2Line,
  RiInformationLine,
  RiListCheck,
  RiLoader4Line,
  RiMagicLine,
  RiRocketLine,
  RiStarLine,
} from "@remixicon/react"
import { addDays, format, parseISO } from "date-fns"
import { Tag, TagInput } from "emblor"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  DATE_FORMAT,
  DOMAIN_AUTHORITY,
  LAUNCH_CROWDEDNESS_THRESHOLDS,
  LAUNCH_LIMITS,
  LAUNCH_SETTINGS,
  LAUNCH_TYPES,
} from "@/lib/constants"
import { DIRECTORY_TIER_CONFIG, DIRECTORY_TIERS, type DirectoryTier } from "@/lib/directory-tiers"
import { useFormDraft } from "@/lib/hooks/use-form-draft"
import { UploadButton } from "@/lib/r2-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { RichTextDisplay, RichTextEditor } from "@/components/ui/rich-text-editor"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createDirectoryOrder } from "@/app/actions/directory-orders"
import { notifyDiscordLaunch } from "@/app/actions/discord"
import {
  checkUserLaunchLimit,
  getLaunchAvailabilityRange,
  scheduleLaunch,
} from "@/app/actions/launch"
import type { LaunchAvailability } from "@/app/actions/launch"
import { deleteMyDraftProject, getAllCategories, submitProject } from "@/app/actions/projects"

interface ProjectFormData {
  name: string
  tagline: string
  websiteUrl: string
  description: string
  sourceLocale: (typeof routing.locales)[number]
  categories: string[]
  techStack: string[]

  platforms: string[]
  pricing: string
  githubUrl?: string
  twitterUrl?: string
  scheduledDate: string | null
  launchType: (typeof LAUNCH_TYPES)[keyof typeof LAUNCH_TYPES]
  // Directory tier picked when user goes paid. Drives which Stripe
  // Payment Link the submit redirect lands on, and which row gets
  // written to `directory_order`. Null when launchType is FREE /
  // FREE_WITH_BADGE — no payment in those flows.
  directoryTier: DirectoryTier | null
  productImage: string | null
  hasBadgeVerified: boolean
}

const SOURCE_LOCALE_LABELS: Record<(typeof routing.locales)[number], string> = {
  en: "English",
  zh: "简体中文",
  es: "Español",
  pt: "Português",
  fr: "Français",
  ja: "日本語",
  ko: "한국어",
  et: "Eesti",
}

interface DateGroup {
  key: string
  displayName: string
  dates: LaunchAvailability[]
}

interface SubmitProjectFormProps {
  userId: string
  /**
   * Top-N approved tag names sorted by usage, fetched server-side. Used
   * by the Step-2 TagInput autocomplete so users converge on existing
   * tag spellings instead of inventing fresh duplicates.
   */
  popularTags?: string[]
}

export function SubmitProjectForm({ userId, popularTags = [] }: SubmitProjectFormProps) {
  const t = useTranslations("submitProject")

  // Stabilize the autocomplete options across re-renders. Without this,
  // every keystroke on any field would build a fresh array of 200 new
  // tag objects and pass it to emblor, which compares by reference and
  // could reset its dropdown state.
  const autocompleteTags = useMemo(
    () => popularTags.map((name) => ({ id: `popular-${name}`, text: name })),
    [popularTags],
  )
  const router = useRouter()
  const locale = useLocale() as (typeof routing.locales)[number]
  const defaultSourceLocale = (routing.locales as readonly string[]).includes(locale)
    ? locale
    : routing.defaultLocale
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<ProjectFormData>({
    name: "",
    tagline: "",
    websiteUrl: "",
    description: "",
    sourceLocale: defaultSourceLocale as (typeof routing.locales)[number],
    categories: [],
    techStack: [],
    platforms: [],
    pricing: "",
    githubUrl: "",
    twitterUrl: "",
    scheduledDate: null,
    launchType: LAUNCH_TYPES.FREE,
    directoryTier: null,
    productImage: null,
    hasBadgeVerified: false,
  })

  const [uploadedLogoUrl, setUploadedLogoUrl] = useState<string | null>(null)

  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isUploadingProductImage, setIsUploadingProductImage] = useState(false)

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(false)
  const [availableDates, setAvailableDates] = useState<LaunchAvailability[]>([])
  const [isLoadingDates, setIsLoadingDates] = useState(false)
  // Two-tier error model:
  //   - fieldErrors: per-field validation messages rendered inline below
  //     the relevant input. Populated by nextStep / handleFinalSubmit.
  //   - formError: cross-cutting messages with no obvious field anchor
  //     (network failures, server submit errors, upload failures).
  //     Rendered as a top banner.
  // Field IDs in this map double as DOM ids — see scrollToFirstError.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  function clearAllErrors() {
    setFieldErrors({})
    setFormError(null)
    setLaunchDateLimitError(null)
  }

  // Inline error renderer. Returned as a JSX fragment from a plain helper
  // (NOT a component) so React doesn't see a new component identity on
  // every parent render — that would unmount + remount the <p> and make
  // screen readers re-announce the alert on every keystroke.
  const renderFieldError = (field: string) =>
    fieldErrors[field] ? (
      <p className="mt-1 text-xs text-red-600" role="alert">
        {fieldErrors[field]}
      </p>
    ) : null

  // Scroll the first errored field into view and focus it if focusable.
  // The order of fields in the returned object matters — the iteration
  // order matches insertion order, so callers should add errors in the
  // visual top-to-bottom order they appear on the form.
  function scrollToFirstError(errors: Record<string, string>) {
    const firstField = Object.keys(errors)[0]
    if (!firstField) return
    setTimeout(() => {
      const el = document.getElementById(firstField)
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        el.focus({ preventScroll: true })
      }
    }, 0)
  }

  const [isLaunchDateOverLimit, setIsLaunchDateOverLimit] = useState(false)
  const [launchDateLimitError, setLaunchDateLimitError] = useState<string | null>(null)
  const [isLoadingDateCheck, setIsLoadingDateCheck] = useState(false)

  const [isAutoFilling, setIsAutoFilling] = useState(false)
  const [isVerifyingBadge, setIsVerifyingBadge] = useState(false)
  const [badgeVerificationMessage, setBadgeVerificationMessage] = useState<string | null>(null)
  // Inline warning shown under the websiteUrl field as the user types.
  // Non-blocking — the final submit still has its own check, this is just
  // an early heads-up so users don't fill in a 4-step form for a URL
  // that's already taken.
  const [urlDuplicateWarning, setUrlDuplicateWarning] = useState(false)
  const [isCheckingUrl, setIsCheckingUrl] = useState(false)

  const tagInputId = useId()

  const [techStackTags, setTechStackTags] = useState<Tag[]>([])
  const [activeTechTagIndex, setActiveTechTagIndex] = useState<number | null>(null)

  // Persist form-in-progress to localStorage so a refresh / accidental
  // tab close doesn't lose typed content. Logo + product image URLs are
  // already stored on R2, safe to persist their URLs. Badge verification
  // is intentionally NOT restored — the user must re-prove ownership of
  // the website each session.
  interface DraftPayload {
    formData: ProjectFormData
    uploadedLogoUrl: string | null
  }
  const draft = useFormDraft<DraftPayload>(
    `submit-form-draft:${userId}`,
    { formData, uploadedLogoUrl },
    (saved) => {
      // Only restore if the draft is meaningfully populated. An empty
      // shell would just trigger a confusing toast on first visit.
      const hasContent =
        !!saved.formData.name ||
        !!saved.formData.websiteUrl ||
        !!saved.formData.description ||
        !!saved.uploadedLogoUrl ||
        saved.formData.categories?.length > 0 ||
        saved.formData.techStack?.length > 0
      if (!hasContent) return
      // Defend against stale drafts from before a routing change.
      // If the saved sourceLocale was removed from the locale list, fall
      // back to the user's current UI locale so the Select doesn't show
      // an empty value.
      const restoredLocale = (routing.locales as readonly string[]).includes(
        saved.formData.sourceLocale,
      )
        ? saved.formData.sourceLocale
        : (defaultSourceLocale as (typeof routing.locales)[number])
      setFormData({
        ...saved.formData,
        sourceLocale: restoredLocale,
        hasBadgeVerified: false,
      })
      setUploadedLogoUrl(saved.uploadedLogoUrl)
      toast.info(t("toast.draftRestored"))
    },
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    // Reset badge verification when website URL changes
    if (name === "websiteUrl") {
      setFormData((prev) => ({ ...prev, hasBadgeVerified: false }))
      setBadgeVerificationMessage(null)
    }
  }

  const checkWebsiteUrl = async (url: string) => {
    try {
      const response = await fetch(`/api/projects/check-url?url=${encodeURIComponent(url)}`)
      const data = await response.json()
      return data.exists
    } catch (error) {
      console.error("Error checking website URL:", error)
      return false
    }
  }

  const verifyBadge = async () => {
    if (!formData.websiteUrl) {
      setBadgeVerificationMessage(t("step3.badgeCard.urlRequired"))
      return
    }

    setIsVerifyingBadge(true)
    setBadgeVerificationMessage(null)

    try {
      const response = await fetch("/api/projects/verify-badge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: formData.websiteUrl }),
      })

      const data = await response.json()

      if (data.verified) {
        setFormData((prev) => ({ ...prev, hasBadgeVerified: true }))
        // Server-side success message stays as-is (English) for now;
        // out of scope for this PR. The local "not found" / "failed"
        // fallbacks below are translated.
        setBadgeVerificationMessage(data.message)
        // Reload available dates with new permissions
        if (formData.launchType) {
          await loadAvailableDates()
        }
      } else {
        setBadgeVerificationMessage(data.message || t("step3.badgeCard.notFound"))
      }
    } catch (error) {
      console.error("Error verifying badge:", error)
      setBadgeVerificationMessage(t("step3.badgeCard.verifyFailed"))
    } finally {
      setIsVerifyingBadge(false)
    }
  }

  const loadAvailableDates = useCallback(async () => {
    setIsLoadingDates(true)
    try {
      let startDate, endDate
      const today = new Date()

      if (formData.launchType === LAUNCH_TYPES.PREMIUM) {
        startDate = format(addDays(today, LAUNCH_SETTINGS.PREMIUM_MIN_DAYS_AHEAD), DATE_FORMAT.API)
        endDate = format(addDays(today, LAUNCH_SETTINGS.PREMIUM_MAX_DAYS_AHEAD), DATE_FORMAT.API)
      } else if (formData.launchType === LAUNCH_TYPES.FREE_WITH_BADGE) {
        // Badge Fast Track users skip the regular queue.
        startDate = format(addDays(today, LAUNCH_SETTINGS.BADGE_MIN_DAYS_AHEAD), DATE_FORMAT.API)
        endDate = format(addDays(today, LAUNCH_SETTINGS.MAX_DAYS_AHEAD), DATE_FORMAT.API)
      } else {
        // Regular free launch
        startDate = format(addDays(today, LAUNCH_SETTINGS.MIN_DAYS_AHEAD), DATE_FORMAT.API)
        endDate = format(addDays(today, LAUNCH_SETTINGS.MAX_DAYS_AHEAD), DATE_FORMAT.API)
      }

      const availability = await getLaunchAvailabilityRange(startDate, endDate, formData.launchType)
      setAvailableDates(availability)
    } catch (err) {
      console.error("Error loading dates:", err)
      setFormError(t("errors.form.loadDatesFailed"))
    } finally {
      setIsLoadingDates(false)
    }
  }, [formData.launchType, formData.hasBadgeVerified])

  useEffect(() => {
    fetchCategories()
  }, [])

  useEffect(() => {
    if (currentStep === 3) {
      loadAvailableDates()
    }
  }, [currentStep, loadAvailableDates])

  useEffect(() => {
    const tagsFromFormData = formData.techStack.map((tech, index) => ({
      id: `${index}-${tech}`,
      text: tech,
    }))
    if (JSON.stringify(tagsFromFormData) !== JSON.stringify(techStackTags)) {
      setTechStackTags(tagsFromFormData)
    }
  }, [formData.techStack])

  useEffect(() => {
    const techStringArray = techStackTags.map((tag) => tag.text)
    if (JSON.stringify(techStringArray) !== JSON.stringify(formData.techStack)) {
      setFormData((prev) => ({ ...prev, techStack: techStringArray }))
    }
  }, [techStackTags])

  async function fetchCategories() {
    setIsLoadingCategories(true)
    try {
      const data = await getAllCategories()
      setCategories(data)
    } catch (err) {
      console.error("Error fetching categories:", err)
      setFormError(t("errors.form.loadCategoriesFailed"))
    } finally {
      setIsLoadingCategories(false)
    }
  }

  const handleAutoFill = async () => {
    if (!formData.websiteUrl || isAutoFilling) return

    try {
      new URL(formData.websiteUrl)
    } catch {
      setFieldErrors((prev) => ({
        ...prev,
        websiteUrl: t("errors.fields.websiteUrlInvalidQuick"),
      }))
      return
    }

    setIsAutoFilling(true)
    clearAllErrors()

    try {
      const response = await fetch("/api/projects/auto-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: formData.websiteUrl,
          // Tells the AI to write the description in the user's chosen
          // description language. Brand name / tags / categories stay
          // language-neutral; only the description is localized.
          sourceLocale: formData.sourceLocale,
        }),
        signal: AbortSignal.timeout(90000),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Failed to analyze website (${response.status})`)
      }

      const data = await response.json()

      // Only fill fields the user hasn't manually entered yet
      setFormData((prev) => ({
        ...prev,
        name: prev.name || data.name || prev.name,
        tagline: prev.tagline || data.tagline || prev.tagline,
        description: prev.description || data.description || prev.description,
        categories: prev.categories.length > 0 ? prev.categories : data.categories || [],
        pricing: prev.pricing || data.pricing || prev.pricing,
        platforms: prev.platforms.length > 0 ? prev.platforms : data.platforms || [],
      }))

      // Tags: only set if user hasn't added any
      if (techStackTags.length === 0 && data.tags?.length > 0) {
        const newTags = data.tags.map((t: string, i: number) => ({
          id: `autofill-${i}-${t}`,
          text: t,
        }))
        setTechStackTags(newTags)
      }

      // Logo: only set if user hasn't uploaded one
      if (!uploadedLogoUrl && data.logoUrl) {
        setUploadedLogoUrl(data.logoUrl)
      }
    } catch (err) {
      console.error("Auto-fill error:", err)
      setFormError(err instanceof Error ? err.message : t("errors.form.autoFillFailed"))
    } finally {
      setIsAutoFilling(false)
    }
  }

  const handleLaunchTypeChange = (type: (typeof LAUNCH_TYPES)[keyof typeof LAUNCH_TYPES]) => {
    setFormData((prev) => ({
      ...prev,
      launchType: type,
      // Switching back to a free path discards any prior tier
      // selection so the submit redirect doesn't try to charge.
      directoryTier: type === LAUNCH_TYPES.PREMIUM ? prev.directoryTier : null,
      scheduledDate: null,
    }))
  }

  function groupDatesByMonth(dates: LaunchAvailability[]): DateGroup[] {
    const uniqueDates = Array.from(new Map(dates.map((date) => [date.date, date])).values())

    const groups = new Map<string, DateGroup>()

    const sortedDates = [...uniqueDates].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )

    sortedDates.forEach((date) => {
      const dateObj = new Date(date.date)
      const year = dateObj.getFullYear()
      const month = dateObj.getMonth()
      const groupKey = `${year}-${month}`
      const displayMonth = format(dateObj, DATE_FORMAT.DISPLAY_MONTH)

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          displayName: displayMonth,
          dates: [],
        })
      }
      groups.get(groupKey)?.dates.push(date)
    })

    return Array.from(groups.values()).sort((a, b) => {
      const aDate = new Date(a.dates[0].date)
      const bDate = new Date(b.dates[0].date)
      return aDate.getTime() - bDate.getTime()
    })
  }

  const validateLaunchDateLimit = useCallback(
    async (date: string | null) => {
      if (!date || !userId) {
        setIsLaunchDateOverLimit(false)
        setLaunchDateLimitError(null)
        setIsLoadingDateCheck(false)
        return
      }
      setIsLoadingDateCheck(true)
      setLaunchDateLimitError(null)
      try {
        const result = await checkUserLaunchLimit(userId, date)
        if (!result.allowed) {
          setIsLaunchDateOverLimit(true)
          setLaunchDateLimitError(
            t("errors.fields.scheduledDateOverLimitDetail", {
              count: result.count,
              limit: result.limit,
            }),
          )
        } else {
          setIsLaunchDateOverLimit(false)
        }
      } catch (err) {
        console.error("Error checking launch date limit:", err)
        setIsLaunchDateOverLimit(false)
        setLaunchDateLimitError(t("errors.fields.scheduledDateCheckFailed"))
      } finally {
        setIsLoadingDateCheck(false)
      }
    },
    [userId],
  )

  useEffect(() => {
    if (formData.scheduledDate && currentStep === 3) {
      validateLaunchDateLimit(formData.scheduledDate)
    }
  }, [formData.scheduledDate, currentStep, validateLaunchDateLimit])

  // Debounced inline duplicate-URL check — runs as the user types so they
  // get the heads-up at Step 1 instead of after filling out the entire
  // 4-step form. Cleared on each keystroke + when URL becomes invalid.
  useEffect(() => {
    setUrlDuplicateWarning(false)
    const url = formData.websiteUrl.trim()
    if (!url) {
      setIsCheckingUrl(false)
      return
    }
    try {
      new URL(url)
    } catch {
      setIsCheckingUrl(false)
      return
    }
    // `aborted` guards against in-flight fetches resolving after the user
    // has already typed something else. Without it, slow networks would
    // briefly flash stale warnings on the new URL.
    let aborted = false
    setIsCheckingUrl(true)
    const handle = setTimeout(async () => {
      const exists = await checkWebsiteUrl(url)
      if (aborted) return
      setUrlDuplicateWarning(exists)
      setIsCheckingUrl(false)
    }, 800)
    return () => {
      aborted = true
      clearTimeout(handle)
    }
  }, [formData.websiteUrl])

  // Validate the visible step. Collect ALL field errors at once (insertion
  // order matches visual top-to-bottom) so the user can see every problem
  // and the scroll target lands on the topmost one.
  const validateStep = (step: number): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (step === 1) {
      if (!formData.name) errs.name = t("errors.fields.nameRequired")
      if (!formData.websiteUrl) {
        errs.websiteUrl = t("errors.fields.websiteUrlRequired")
      } else {
        try {
          new URL(formData.websiteUrl)
        } catch {
          errs.websiteUrl = t("errors.fields.websiteUrlInvalid")
        }
      }
      if (formData.tagline.length > 60) errs.tagline = t("errors.fields.taglineTooLong")
      if (!formData.description) errs.description = t("errors.fields.descriptionRequired")
      if (process.env.NODE_ENV !== "development" && !uploadedLogoUrl) {
        errs.logoUrl = t("errors.fields.logoRequired")
      }
    } else if (step === 2) {
      if (formData.categories.length === 0) {
        errs.categories = t("errors.fields.categoriesMin")
      } else if (formData.categories.length > 3) {
        errs.categories = t("errors.fields.categoriesMax")
      }
      if (formData.techStack.length === 0) {
        errs.techStack = t("errors.fields.techStackMin")
      } else if (formData.techStack.length > 10) {
        errs.techStack = t("errors.fields.techStackMax")
      }
      if (formData.platforms.length === 0) {
        errs.platforms = t("errors.fields.platformsMin")
      }
      if (!formData.pricing) errs.pricing = t("errors.fields.pricingRequired")
    } else if (step === 3) {
      if (!formData.scheduledDate) {
        errs.scheduledDate = t("errors.fields.scheduledDateRequired")
      } else if (isLaunchDateOverLimit) {
        errs.scheduledDate = launchDateLimitError || t("errors.fields.scheduledDateOverLimit")
      }
    }
    return errs
  }

  const nextStep = () => {
    clearAllErrors()
    const errs = validateStep(currentStep)
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      scrollToFirstError(errs)
      return
    }

    setCurrentStep((prev) => Math.min(prev + 1, 4))

    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }, 0)
  }

  const prevStep = () => {
    clearAllErrors()
    setCurrentStep((prev) => Math.max(prev - 1, 1))
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }, 0)
  }

  const handleFinalSubmit = async () => {
    clearAllErrors()

    // Re-validate every step from scratch — the user may have jumped
    // back and edited Step 1 fields after Review.
    const allErrs: Record<string, string> = {
      ...validateStep(1),
      ...validateStep(2),
      ...validateStep(3),
    }

    if (Object.keys(allErrs).length > 0) {
      setFieldErrors(allErrs)
      scrollToFirstError(allErrs)
      return
    }

    setIsPending(true)

    const urlExists = await checkWebsiteUrl(formData.websiteUrl)
    if (urlExists) {
      const dupErrs = { websiteUrl: t("errors.fields.websiteUrlDuplicate") }
      setFieldErrors(dupErrs)
      scrollToFirstError(dupErrs)
      setIsPending(false)
      return
    }

    try {
      const finalLogoUrl =
        process.env.NODE_ENV === "development" && !uploadedLogoUrl
          ? "https://placehold.co/128x128/E2E8F0/718096?text=Logo"
          : uploadedLogoUrl!

      const projectData = {
        name: formData.name,
        tagline: formData.tagline.trim() || null,
        description: formData.description,
        sourceLocale: formData.sourceLocale,
        websiteUrl: formData.websiteUrl,
        logoUrl: finalLogoUrl,
        productImage: formData.productImage,
        categories: formData.categories,
        techStack: formData.techStack,
        platforms: formData.platforms,
        pricing: formData.pricing,
        githubUrl: formData.githubUrl || null,
        twitterUrl: formData.twitterUrl || null,
        hasBadgeVerified: formData.hasBadgeVerified,
        tags: formData.techStack,
      }

      const submissionResult = await submitProject(projectData)

      if (!submissionResult.success || !submissionResult.projectId || !submissionResult.slug) {
        throw new Error(submissionResult.error || "Failed to submit project data.")
      }

      const projectId = submissionResult.projectId
      const projectSlug = submissionResult.slug

      if (formData.scheduledDate) {
        try {
          const formattedDate = format(parseISO(formData.scheduledDate), DATE_FORMAT.API)
          const launchSuccess = await scheduleLaunch(projectId, formattedDate, formData.launchType)

          if (!launchSuccess) {
            console.error(
              `Project ${projectId} created but failed to schedule for ${formattedDate}`,
            )
            throw new Error("Project created, but failed to schedule the launch.")
          }

          try {
            await notifyDiscordLaunch(
              formData.name,
              format(parseISO(formData.scheduledDate), DATE_FORMAT.DISPLAY),
              formData.launchType,
              formData.websiteUrl,
              `${process.env.NEXT_PUBLIC_URL || ""}/projects/${projectSlug}`,
            )
          } catch (discordError) {
            console.error("Failed to send Discord notification:", discordError)
          }
        } catch (scheduleError: unknown) {
          console.error("Error during launch scheduling:", scheduleError)
          // Clean up the orphaned project so the user can retry with the same URL
          await deleteMyDraftProject(projectId).catch((e) =>
            console.error("Failed to clean up draft project:", e),
          )
          setFormError(
            scheduleError instanceof Error
              ? scheduleError.message
              : t("errors.form.scheduleFailed"),
          )
          setIsPending(false)
          return
        }
      }

      // Clear the draft only after we've made it past every async step
      // — server submit, schedule launch, discord notify. If any of
      // those threw, the user can come back and resume from where they
      // were instead of re-typing.
      draft.clear()

      if (
        formData.launchType === LAUNCH_TYPES.FREE ||
        formData.launchType === LAUNCH_TYPES.FREE_WITH_BADGE
      ) {
        router.push(`/projects/${projectSlug}`)
      } else {
        // Paid path: create a `pending` directory_order row tied to
        // this freshly-submitted project, then redirect to the
        // tier-specific Stripe Payment Link. The webhook will flip
        // the project from `payment_pending → SCHEDULED` once the
        // funds settle (see `scheduleProjectIfPendingPayment` in
        // `app/api/auth/stripe/webhook/route.ts`).
        const tier: DirectoryTier = formData.directoryTier ?? "basic"
        try {
          const { redirectUrl } = await createDirectoryOrder({ projectId, tier })
          window.location.href = redirectUrl
        } catch (orderError: unknown) {
          console.error("Failed to start checkout:", orderError)
          setFormError(
            orderError instanceof Error ? orderError.message : t("errors.form.submitFailed"),
          )
          setIsPending(false)
        }
      }
    } catch (submissionError: unknown) {
      console.error("Error during final submission:", submissionError)
      setFormError(
        submissionError instanceof Error ? submissionError.message : t("errors.form.submitFailed"),
      )
      setIsPending(false)
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    handleFinalSubmit()
  }

  // Allow back-navigation to any step the user has already passed; future
  // steps stay locked (validation happens forward in nextStep). Skips
  // forward in two clicks make it easy to fix mistakes after Review.
  const goToStep = (step: number) => {
    if (step >= currentStep) return
    clearAllErrors()
    setCurrentStep(step)
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0)
  }

  const renderStepper = () => (
    <div className="mb-8 sm:mb-10">
      <div className="container mx-auto max-w-3xl">
        <div className="flex items-center justify-between pt-2 sm:px-4 sm:pt-0">
          {[
            { step: 1, label: t("stepper.step1"), icon: RiListCheck },
            {
              step: 2,
              label: t("stepper.step2"),
              shortLabel: t("stepper.step2"),
              icon: RiInformation2Line,
            },
            { step: 3, label: t("stepper.step3"), icon: RiCalendarLine },
            { step: 4, label: t("stepper.step4"), icon: RiFileCheckLine },
          ].map(({ step, label, shortLabel, icon: Icon }) => {
            const canJump = step < currentStep
            return (
              <div
                key={`step-${step}`}
                className="relative flex w-[120px] flex-col items-center sm:w-[140px]"
              >
                {step < 3 && (
                  <div className="absolute top-5 left-[calc(50%+1.5rem)] -z-10 hidden h-[2px] w-[calc(100%-1rem)] sm:block">
                    <div
                      className={`h-full ${
                        currentStep > step ? "bg-primary" : "bg-muted"
                      } transition-all duration-300`}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => goToStep(step)}
                  disabled={!canJump}
                  aria-label={
                    canJump ? t("stepper.ariaJump", { label }) : t("stepper.ariaCurrent", { label })
                  }
                  className={`focus-visible:ring-primary/40 relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 focus-visible:ring-4 focus-visible:outline-none sm:h-12 sm:w-12 ${
                    currentStep > step
                      ? "bg-primary ring-primary/10 hover:ring-primary/30 cursor-pointer text-white ring-4"
                      : currentStep === step
                        ? "bg-primary ring-primary/20 cursor-default text-white ring-4"
                        : "bg-muted/50 text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  {currentStep > step ? (
                    <RiCheckLine className="h-5 w-5 sm:h-6 sm:w-6" />
                  ) : (
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  )}

                  {currentStep === step && (
                    <span className="border-primary absolute inset-0 animate-pulse rounded-full border-2" />
                  )}
                </button>

                <div className="mt-3 w-full text-center sm:mt-4">
                  <span
                    className={`mb-0.5 block text-xs font-medium sm:text-sm ${
                      currentStep >= step ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <span className="hidden sm:inline">{label}</span>
                    <span className="inline sm:hidden">{shortLabel || label}</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-3 px-2 sm:mt-6 sm:px-4">
        <div className="bg-muted/50 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )

  const handleCheckboxChange = (
    field: "categories" | "platforms",
    value: string,
    checked: boolean,
  ) => {
    setFormData((prev) => {
      const currentValues = prev[field] || []
      if (checked) {
        return { ...prev, [field]: [...currentValues, value] }
      } else {
        return {
          ...prev,
          [field]: currentValues.filter((item) => item !== value),
        }
      }
    })
  }

  const handleRadioChange = (field: "pricing", value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const getCategoryName = (id: string) => categories.find((cat) => cat.id === id)?.name || id

  // Both helpers now go through t() so Step 4 review badges match the
  // Step 2 selection labels in the user's locale. The `as` cast tells
  // next-intl the path resolves at runtime — since both DB enums are a
  // closed set (web|mobile|desktop|api|other and free|freemium|paid),
  // the only failure mode is forgetting to add a new enum value to the
  // messages catalog, which would render the literal key path.
  const getPlatformLabel = (value: string) => t(`step2.platforms.options.${value as "web"}`)
  const getPricingLabel = (value: string) => t(`step2.pricing.options.${value as "free"}`)

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="name">
                {t("step1.name.label")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder={t("step1.name.placeholder")}
                required
              />
              {renderFieldError("name")}
            </div>
            <div>
              <Label htmlFor="websiteUrl">
                {t("step1.websiteUrl.label")} <span className="text-red-500">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  type="url"
                  value={formData.websiteUrl}
                  onChange={handleInputChange}
                  placeholder={t("step1.websiteUrl.placeholder")}
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFill}
                  disabled={!formData.websiteUrl || isAutoFilling}
                  className="shrink-0"
                >
                  {isAutoFilling ? (
                    <RiLoader4Line className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <RiMagicLine className="mr-1.5 h-4 w-4" />
                  )}
                  {isAutoFilling ? t("step1.autoFill.loading") : t("step1.autoFill.button")}
                </Button>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{t("step1.websiteUrl.help")}</p>
              {urlDuplicateWarning && !isCheckingUrl && !fieldErrors.websiteUrl && (
                <p className="mt-1.5 text-xs text-red-600">
                  {t("step1.websiteUrl.duplicateWarning")}
                </p>
              )}
              {renderFieldError("websiteUrl")}
            </div>
            <div>
              <Label htmlFor="tagline">
                {t("step1.tagline.label")}{" "}
                <span className="text-muted-foreground">{t("step1.tagline.optional")}</span>
              </Label>
              <p className="text-muted-foreground mb-2 text-xs">{t("step1.tagline.help")}</p>
              <Input
                id="tagline"
                name="tagline"
                value={formData.tagline}
                onChange={handleInputChange}
                placeholder={t("step1.tagline.placeholder")}
                maxLength={60}
              />
              <div className="text-muted-foreground mt-1 text-right text-xs">
                {formData.tagline.length}/60
              </div>
              {renderFieldError("tagline")}
            </div>
            <div>
              <Label htmlFor="sourceLocale">
                {t("step1.sourceLocale.label")} <span className="text-red-500">*</span>
              </Label>
              <p className="text-muted-foreground mb-2 text-xs">{t("step1.sourceLocale.help")}</p>
              <Select
                value={formData.sourceLocale}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    sourceLocale: value as (typeof routing.locales)[number],
                  }))
                }
              >
                <SelectTrigger id="sourceLocale" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {routing.locales.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {SOURCE_LOCALE_LABELS[loc]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div id="description">
              <Label htmlFor="description">
                {t("step1.description.label")} <span className="text-red-500">*</span>
              </Label>
              <RichTextEditor
                content={formData.description}
                onChange={(content) => setFormData((prev) => ({ ...prev, description: content }))}
                placeholder={t("step1.description.placeholder")}
                className="max-h-[300px] overflow-y-auto"
              />
              {renderFieldError("description")}
            </div>
            <div id="logoUrl" className="space-y-2">
              <Label htmlFor="logoUrl">
                {t("step1.logo.label")} <span className="text-red-500">*</span>
              </Label>
              <p className="text-muted-foreground text-xs">{t("step1.logo.help")}</p>
              {uploadedLogoUrl ? (
                <div className="bg-muted/30 relative w-fit rounded-md border p-3">
                  <Image
                    src={uploadedLogoUrl}
                    alt={t("step1.logo.preview")}
                    width={64}
                    height={64}
                    className="rounded object-contain"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground absolute top-1 right-1 h-6 w-6"
                    onClick={() => setUploadedLogoUrl(null)}
                    aria-label={t("step1.logo.remove")}
                  >
                    <RiCloseCircleLine className="h-5 w-5" />
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <UploadButton
                    endpoint="projectLogo"
                    onUploadBegin={() => {
                      console.log("Upload Begin (Logo)")
                      setIsUploadingLogo(true)
                      setFieldErrors((prev) => ({ ...prev, logoUrl: "" }))
                      setFormError(null)
                    }}
                    onClientUploadComplete={(res) => {
                      console.log("Upload Response (Logo):", res)
                      setIsUploadingLogo(false)
                      if (res && res.length > 0 && res[0].serverData?.fileUrl) {
                        setUploadedLogoUrl(res[0].serverData.fileUrl)
                        console.log("Logo URL set:", res[0].serverData.fileUrl)
                      } else {
                        console.error("Logo upload failed: No URL", res)
                        setFieldErrors((prev) => ({
                          ...prev,
                          logoUrl: t("errors.fields.logoUploadFailedNoUrl"),
                        }))
                      }
                    }}
                    onUploadError={(error: Error) => {
                      console.error("Upload Error (Logo):", error)
                      setIsUploadingLogo(false)
                      setFieldErrors((prev) => ({
                        ...prev,
                        logoUrl: t("errors.fields.logoUploadFailed", { message: error.message }),
                      }))
                    }}
                    appearance={{
                      button: `ut-button border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm h-9 px-3 inline-flex items-center justify-center gap-2 rounded-md ${isUploadingLogo ? "opacity-50 pointer-events-none" : ""}`,
                      allowedContent: "",
                    }}
                    content={{
                      button({ ready, isUploading }) {
                        if (isUploading) return <RiLoader4Line className="h-4 w-4 animate-spin" />
                        if (ready)
                          return (
                            <>
                              <RiImageAddLine className="h-4 w-4" /> {t("step1.logo.upload")}
                            </>
                          )
                        return t("step1.logo.preparing")
                      },
                    }}
                  />
                  {isUploadingLogo && (
                    <span className="text-muted-foreground text-xs">
                      {t("step1.logo.uploading")}
                    </span>
                  )}
                </div>
              )}
              {renderFieldError("logoUrl")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="productImage">
                {t("step1.productImage.label")} <span>{t("step1.productImage.optional")}</span>
              </Label>
              <p className="text-muted-foreground text-xs">{t("step1.productImage.help")}</p>
              {formData.productImage ? (
                <div className="bg-muted/30 relative w-fit rounded-md border p-3">
                  <Image
                    src={formData.productImage}
                    alt={t("step1.productImage.preview")}
                    width={256}
                    height={256}
                    className="rounded object-contain"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground absolute top-1 right-1 h-6 w-6"
                    onClick={() => setFormData((prev) => ({ ...prev, productImage: null }))}
                    aria-label={t("step1.productImage.remove")}
                  >
                    <RiCloseCircleLine className="h-5 w-5" />
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <UploadButton
                    endpoint="projectProductImage"
                    onUploadBegin={() => {
                      console.log("Upload Begin (Product Image)")
                      setIsUploadingProductImage(true)
                      setFormError(null)
                    }}
                    onClientUploadComplete={(res) => {
                      console.log("Upload Response (Product Image):", res)
                      setIsUploadingProductImage(false)
                      if (res && res.length > 0 && res[0].serverData?.fileUrl) {
                        setFormData((prev) => ({
                          ...prev,
                          productImage: res[0].serverData.fileUrl,
                        }))
                        console.log("Product Image URL set:", res[0].serverData.fileUrl)
                      } else {
                        console.error("Product image upload failed: No URL", res)
                        setFormError(t("errors.form.productImageUploadFailedNoUrl"))
                      }
                    }}
                    onUploadError={(error: Error) => {
                      console.error("Upload Error (Product Image):", error)
                      setIsUploadingProductImage(false)
                      setFormError(
                        t("errors.form.productImageUploadFailed", { message: error.message }),
                      )
                    }}
                    appearance={{
                      button: `ut-button flex items-center w-fit gap-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm h-9 px-3 rounded-md ${isUploadingProductImage ? "opacity-50 pointer-events-none" : ""}`,
                      allowedContent: "",
                    }}
                    content={{
                      button({ ready, isUploading }) {
                        if (isUploading) return <RiLoader4Line className="h-4 w-4 animate-spin" />
                        if (ready)
                          return (
                            <>
                              <RiImageAddLine className="h-4 w-4" /> {t("step1.productImage.add")}
                            </>
                          )
                        return t("step1.logo.preparing")
                      },
                    }}
                  />
                  {isUploadingProductImage && (
                    <span className="text-muted-foreground text-xs">
                      {t("step1.logo.uploading")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      case 2:
        return (
          <div className="space-y-8">
            <div id="categories">
              <Label className="mb-2 block">
                {t("step2.categories.label")} <span className="text-red-500">*</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {t("step2.categories.counter", { count: formData.categories.length })}
                </span>
              </Label>
              {isLoadingCategories ? (
                <div className="text-muted-foreground flex items-center gap-2">
                  <RiLoader4Line className="h-4 w-4 animate-spin" /> {t("step2.categories.loading")}
                </div>
              ) : categories.length > 0 ? (
                <div className="max-h-60 space-y-3 overflow-y-auto rounded-md border p-4">
                  {categories.map((cat) => (
                    <div key={cat.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`cat-${cat.id}`}
                        checked={formData.categories.includes(cat.id)}
                        onCheckedChange={(checked) => {
                          if (checked && formData.categories.length >= 3) {
                            setFieldErrors((prev) => ({
                              ...prev,
                              categories: t("errors.fields.categoriesMax"),
                            }))
                            return
                          }
                          setFieldErrors((prev) => ({ ...prev, categories: "" }))
                          handleCheckboxChange("categories", cat.id, !!checked)
                        }}
                      />
                      <Label htmlFor={`cat-${cat.id}`} className="cursor-pointer font-normal">
                        {cat.name}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t("step2.categories.empty")}</p>
              )}
              <p className="text-muted-foreground mt-1 text-xs">{t("step2.categories.help")}</p>
              {renderFieldError("categories")}
            </div>

            <div id="techStack">
              <Label htmlFor={tagInputId}>
                {t("step2.tags.label")} <span className="text-red-500">*</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {t("step2.tags.counter", { count: formData.techStack.length })}
                </span>
              </Label>
              <TagInput
                id={tagInputId}
                tags={techStackTags}
                setTags={(newTags) => {
                  if (newTags.length > 10) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      techStack: t("errors.fields.techStackMax"),
                    }))
                    return
                  }
                  setFieldErrors((prev) => ({ ...prev, techStack: "" }))
                  setTechStackTags(newTags)
                }}
                placeholder={t("step2.tags.placeholder")}
                enableAutocomplete={autocompleteTags.length > 0}
                autocompleteOptions={autocompleteTags}
                styleClasses={{
                  inlineTagsContainer:
                    "border-input rounded-md bg-background shadow-xs transition-[color,box-shadow] focus-within:border-ring outline-none focus-within:ring-[3px] focus-within:ring-ring/50 p-1 gap-1 mt-1",
                  input: "w-full min-w-[80px] shadow-none px-2 h-7",
                  tag: {
                    body: "h-7 relative bg-background border border-input hover:bg-background rounded-md font-medium text-xs ps-2 pe-7",
                    closeButton:
                      "absolute -inset-y-px -end-px p-0 rounded-e-md flex size-7 transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] text-muted-foreground/80 hover:text-foreground",
                  },
                }}
                activeTagIndex={activeTechTagIndex}
                setActiveTagIndex={setActiveTechTagIndex}
              />
              <p className="text-muted-foreground mt-1 text-xs">{t("step2.tags.help")}</p>
              {renderFieldError("techStack")}
            </div>

            <div id="platforms">
              <Label className="mb-2 block">
                {t("step2.platforms.label")} <span className="text-red-500">*</span>
              </Label>
              <div className="space-y-3 rounded-md border p-4">
                {Object.entries(platformType).map(([key, value]) => (
                  <div key={value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`platform-${value}`}
                      checked={formData.platforms.includes(value)}
                      onCheckedChange={(checked) =>
                        handleCheckboxChange("platforms", value, !!checked)
                      }
                    />
                    <Label
                      htmlFor={`platform-${value}`}
                      className="cursor-pointer font-normal capitalize"
                    >
                      {t(`step2.platforms.options.${key.toLowerCase() as "web"}`)}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{t("step2.platforms.help")}</p>
              {renderFieldError("platforms")}
            </div>

            <div id="pricing">
              <Label className="mb-2 block">
                {t("step2.pricing.label")} <span className="text-red-500">*</span>
              </Label>
              <RadioGroup
                value={formData.pricing}
                onValueChange={(value) => handleRadioChange("pricing", value)}
                className="flex flex-col gap-4 sm:flex-row"
              >
                {Object.entries(pricingType).map(([key, value]) => (
                  <div key={value} className="flex-1">
                    <Label
                      htmlFor={`pricing-${value}`}
                      className="hover:bg-muted/50 flex h-full cursor-pointer items-center space-x-2 rounded-md border p-3 transition-colors"
                    >
                      <RadioGroupItem value={value} id={`pricing-${value}`} />
                      <span className="font-normal capitalize">
                        {t(`step2.pricing.options.${key.toLowerCase() as "free"}`)}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {renderFieldError("pricing")}
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <Label htmlFor="githubUrl">{t("step2.githubUrl.label")}</Label>
                <Input
                  id="githubUrl"
                  name="githubUrl"
                  type="url"
                  value={formData.githubUrl}
                  onChange={handleInputChange}
                  placeholder={t("step2.githubUrl.placeholder")}
                />
              </div>
              <div>
                <Label htmlFor="twitterUrl">{t("step2.twitterUrl.label")}</Label>
                <Input
                  id="twitterUrl"
                  name="twitterUrl"
                  type="url"
                  value={formData.twitterUrl}
                  onChange={handleInputChange}
                  placeholder={t("step2.twitterUrl.placeholder")}
                />
              </div>
            </div>
          </div>
        )
      case 3:
        return (
          <div className="space-y-8">
            <div className="flex items-center gap-2">
              <RiCalendarLine className="h-5 w-5" />
              <h3 className="text-lg font-medium">{t("step3.title")}</h3>
            </div>

            <div className="bg-muted/30 border-muted flex items-start gap-2 rounded-lg border p-3 sm:p-4">
              <RiInformationLine className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="text-xs sm:text-sm">
                <p className="font-medium">{t("step3.infoBanner.heading")}</p>
                <p className="text-muted-foreground mt-1">
                  {t("step3.infoBanner.body", { hour: LAUNCH_SETTINGS.LAUNCH_HOUR_UTC })}
                </p>
              </div>
            </div>

            {/* Badge Verification Card - Only for Free Launch */}
            {formData.launchType === LAUNCH_TYPES.FREE && !formData.hasBadgeVerified && (
              <div className="bg-primary/5 border-primary/20 rounded-lg border p-4">
                <div className="mb-3 flex items-start gap-2">
                  <RiStarLine className="text-primary mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">{t("step3.badgeCard.heading")}</h4>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {t("step3.badgeCard.body")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open("/badge", "_blank")}
                  >
                    <RiInformationLine className="mr-1.5 h-4 w-4" />
                    {t("step3.badgeCard.getCode")}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={verifyBadge}
                    disabled={isVerifyingBadge || !formData.websiteUrl}
                  >
                    {isVerifyingBadge ? (
                      <>
                        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {t("step3.badgeCard.verifying")}
                      </>
                    ) : (
                      <>
                        <RiCheckboxCircleFill className="mr-1.5 h-4 w-4" />
                        {t("step3.badgeCard.verify")}
                      </>
                    )}
                  </Button>
                </div>
                {badgeVerificationMessage && (
                  <p
                    className={`mt-3 text-sm ${formData.hasBadgeVerified ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    {badgeVerificationMessage}
                  </p>
                )}
              </div>
            )}

            {/* Badge Verified Success Message & Quota Selection */}
            {(formData.launchType === LAUNCH_TYPES.FREE ||
              formData.launchType === LAUNCH_TYPES.FREE_WITH_BADGE) &&
              formData.hasBadgeVerified && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                    <RiCheckboxCircleFill className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                    <div>
                      <h4 className="font-semibold text-green-900 dark:text-green-100">
                        {t("step3.badgeVerified.heading")}
                      </h4>
                      <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                        {t("step3.badgeVerified.body")}
                      </p>
                    </div>
                  </div>

                  {/* Quota Selection */}
                  <div>
                    <h4 className="mb-3 text-sm font-medium">{t("step3.quota.heading")}</h4>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div
                        className={`cursor-pointer rounded-lg border p-3 transition-all ${
                          formData.launchType === LAUNCH_TYPES.FREE
                            ? "border-primary bg-primary/5 ring-primary ring-1"
                            : "hover:border-foreground/30 hover:bg-muted/50"
                        }`}
                        onClick={() => handleLaunchTypeChange(LAUNCH_TYPES.FREE)}
                      >
                        <h5 className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                          <RiRocketLine className="h-4 w-4" />
                          {t("step3.quota.free.name")}
                        </h5>
                        <ul className="text-muted-foreground space-y-0.5 text-xs">
                          <li>
                            • {t("step3.quota.free.slots", { n: LAUNCH_LIMITS.FREE_DAILY_LIMIT })}
                          </li>
                          <li>• {t("step3.quota.free.queue")}</li>
                          <li>• {t("step3.quota.free.dofollow")}</li>
                        </ul>
                      </div>

                      <div
                        className={`cursor-pointer rounded-lg border p-3 transition-all ${
                          formData.launchType === LAUNCH_TYPES.FREE_WITH_BADGE
                            ? "border-primary bg-primary/5 ring-primary ring-1"
                            : "hover:border-foreground/30 hover:bg-muted/50"
                        }`}
                        onClick={() => handleLaunchTypeChange(LAUNCH_TYPES.FREE_WITH_BADGE)}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <h5 className="flex items-center gap-1.5 text-sm font-medium">
                            <RiStarLine className="h-4 w-4 text-amber-500" />
                            {t("step3.quota.badge.name")}
                          </h5>
                          <Badge variant="secondary" className="text-[10px]">
                            {t("step3.quota.badge.tag")}
                          </Badge>
                        </div>
                        <ul className="text-muted-foreground space-y-0.5 text-xs">
                          <li>
                            • {t("step3.quota.badge.slots", { n: LAUNCH_LIMITS.BADGE_DAILY_LIMIT })}
                          </li>
                          <li className="font-medium text-green-600 dark:text-green-400">
                            • {t("step3.quota.badge.tomorrow")}
                          </li>
                          <li>• {t("step3.quota.badge.dofollow")}</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Badge Warning - Only shown when Badge Fast Track is selected */}
                  {formData.launchType === LAUNCH_TYPES.FREE_WITH_BADGE && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/30">
                      <RiInformation2Line className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                      <div>
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          <strong>{t("step3.quota.warningPrefix")}</strong>{" "}
                          {t("step3.quota.warningBody")}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

            <div>
              <h4 className="mb-4 text-sm font-medium">{t("step3.launchType.heading")}</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div
                  className={`cursor-pointer rounded-lg border p-4 transition-all duration-150 ${formData.launchType === LAUNCH_TYPES.FREE ? "border-primary ring-primary bg-primary/5 relative shadow-sm ring-1" : "hover:border-foreground/20 hover:bg-muted/50"}`}
                  onClick={() => handleLaunchTypeChange(LAUNCH_TYPES.FREE)}
                >
                  {formData.launchType === LAUNCH_TYPES.FREE && (
                    <Badge
                      variant="default"
                      className="bg-primary text-primary-foreground absolute -top-2 -right-2 text-xs"
                    >
                      {t("step3.launchType.selected")}
                    </Badge>
                  )}
                  <h5 className="mb-2 flex items-center gap-1.5 font-medium">
                    <RiRocketLine className="h-4 w-4" />
                    {t("step3.launchType.free.name")}
                  </h5>
                  <p className="mb-3 text-2xl font-bold">$0</p>
                  <ul className="text-muted-foreground space-y-1 text-sm">
                    <li className="flex items-center gap-1.5">
                      <RiCheckboxCircleFill className="text-foreground/60 h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        {t("step3.launchType.free.slotsLabel", {
                          n: LAUNCH_LIMITS.FREE_DAILY_LIMIT,
                        })}
                      </span>
                    </li>

                    <li className="flex items-center gap-1.5">
                      <RiCheckboxCircleFill className="text-foreground/60 h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        {t("step3.launchType.free.scheduling", {
                          n: LAUNCH_SETTINGS.MAX_DAYS_AHEAD,
                        })}
                      </span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <RiCheckboxCircleFill className="text-foreground/60 h-3.5 w-3.5 flex-shrink-0" />
                      <span>{t("step3.launchType.free.dofollowConditional")}</span>
                    </li>
                    <li className="flex items-start gap-1.5 pl-5">
                      <span className="text-muted-foreground text-xs">
                        {t("step3.launchType.free.topRanking")}
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5 pl-5">
                      <span className="text-muted-foreground text-xs">
                        {t("step3.launchType.free.displayBadge")}
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Boost (paid) — 4 directory tiers stacked. Picking
                    any of these sets launchType=PREMIUM (queue-skip
                    semantics) AND directoryTier=<picked> (drives
                    which Stripe Payment Link the submit redirect
                    lands on, and which row gets written to
                    `directory_order`). */}
                <div
                  className={`rounded-lg border p-3 transition-all duration-150 ${formData.launchType === LAUNCH_TYPES.PREMIUM ? "border-primary/70 ring-primary/70 bg-primary/5 shadow-sm ring-1" : "hover:border-primary/50"}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h5 className="flex items-center gap-1.5 text-sm font-semibold">
                      <RiStarLine className="text-primary h-4 w-4" />
                      Boost (paid)
                    </h5>
                    <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
                      Skip the queue · pick a tier
                    </span>
                  </div>
                  <div className="space-y-2">
                    {DIRECTORY_TIERS.map((tierKey) => {
                      const cfg = DIRECTORY_TIER_CONFIG[tierKey]
                      const selected =
                        formData.launchType === LAUNCH_TYPES.PREMIUM &&
                        formData.directoryTier === tierKey
                      const label = tierKey.charAt(0).toUpperCase() + tierKey.slice(1)
                      const priceText = cfg.isSubscription
                        ? `$${(cfg.amountCents / 100).toFixed(2)}/mo`
                        : `$${(cfg.amountCents / 100).toFixed(2)}`
                      const summary: Record<DirectoryTier, string> = {
                        basic: "Skip queue · dofollow link on aat.ee",
                        plus: "Basic + 3 partner directories (manually placed)",
                        pro: "Plus + 8 high-DR documentation sites",
                        ultra: "Pro + permanent sidebar sponsor slot",
                      }
                      return (
                        <button
                          type="button"
                          key={tierKey}
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              launchType: LAUNCH_TYPES.PREMIUM,
                              directoryTier: tierKey,
                            }))
                          }}
                          className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-all ${
                            selected
                              ? "border-primary bg-primary/10 ring-primary/40 ring-1"
                              : "border-border hover:border-primary/40 hover:bg-primary/5"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{label}</span>
                              {selected && (
                                <RiCheckboxCircleFill className="text-primary h-3.5 w-3.5" />
                              )}
                            </div>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              {summary[tierKey]}
                            </p>
                          </div>
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            {priceText}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* <div
                  className={`cursor-pointer rounded-lg border p-4 transition-all duration-150 ${
                    formData.launchType === LAUNCH_TYPES.PREMIUM_PLUS
                      ? "border-primary ring-primary bg-primary/5 relative shadow-sm ring-1"
                      : "hover:border-primary hover:bg-primary/5"
                  }`}
                  onClick={() => handleLaunchTypeChange(LAUNCH_TYPES.PREMIUM_PLUS)}
                >
                  {formData.launchType === LAUNCH_TYPES.PREMIUM_PLUS && (
                    <Badge
                      variant="default"
                      className="bg-primary text-primary-foreground absolute -top-2 -right-2 text-xs"
                    >
                      Selected
                    </Badge>
                  )}
                  <h5 className="mb-2 flex items-center gap-1.5 font-medium">
                    <RiVipCrownLine className="text-primary h-4 w-4" />
                    Premium Plus
                  </h5>
                  <p className="mb-1 text-2xl font-bold">
                    ${LAUNCH_SETTINGS.PREMIUM_PLUS_PRICE}{" "}
                    <span className="text-muted-foreground text-xs line-through">$25</span>
                  </p>
                  <span className="bg-primary/10 text-primary mb-2 inline-block rounded-full px-2 py-0.5 text-xs">
                    -50% for early users
                  </span>
                  <ul className="text-muted-foreground space-y-1.5 text-xs">
                    <li className="flex items-center gap-1.5">
                      <RiCheckboxCircleFill className="text-primary h-3.5 w-3.5 flex-shrink-0" />
                      <span>Premium Spotlight Placement</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <RiCheckboxCircleFill className="text-primary h-3.5 w-3.5 flex-shrink-0" />
                      <span>{LAUNCH_LIMITS.PREMIUM_PLUS_DAILY_LIMIT} exclusive slots/day</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <RiCheckboxCircleFill className="text-primary h-3.5 w-3.5 flex-shrink-0" />
                      <span>Guaranteed Dofollow Backlink</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <RiCheckboxCircleFill className="text-primary h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        Up to {LAUNCH_SETTINGS.PREMIUM_PLUS_MAX_DAYS_AHEAD} days scheduling
                      </span>
                    </li>
                  </ul>
                </div> */}
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-medium">
                {t("step3.date.label")} <span className="text-red-500">*</span>
              </h4>
              {isLoadingDates ? (
                <div className="text-muted-foreground flex items-center justify-center gap-2 py-4">
                  <RiLoader4Line className="h-5 w-5 animate-spin" /> {t("step3.date.loading")}
                </div>
              ) : availableDates.length === 0 && !isLoadingDates ? (
                <p className="text-muted-foreground rounded-md border p-4 text-center text-sm">
                  {t("step3.date.empty")}
                </p>
              ) : (
                <div id="scheduledDate">
                  <Select
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, scheduledDate: value }))
                    }
                    value={formData.scheduledDate || ""}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("step3.date.placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {groupDatesByMonth(availableDates).map((group) => (
                        <SelectGroup key={group.key}>
                          <SelectLabel>{group.displayName}</SelectLabel>
                          {group.dates.map((date) => {
                            const dateObj = parseISO(date.date)
                            let slotsAvailable = 0
                            let isDisabled = true
                            if (formData.launchType === LAUNCH_TYPES.FREE) {
                              slotsAvailable = date.freeSlots
                              isDisabled = date.freeSlots <= 0
                            } else if (formData.launchType === LAUNCH_TYPES.FREE_WITH_BADGE) {
                              slotsAvailable = date.badgeSlots
                              isDisabled = date.badgeSlots <= 0
                            } else if (formData.launchType === LAUNCH_TYPES.PREMIUM) {
                              slotsAvailable = date.premiumSlots
                              isDisabled = date.premiumSlots <= 0
                            }

                            if (date.totalSlots <= 0) isDisabled = true

                            const slotTypeLabel =
                              formData.launchType === LAUNCH_TYPES.FREE
                                ? t("step3.date.slotTypeFree")
                                : formData.launchType === LAUNCH_TYPES.FREE_WITH_BADGE
                                  ? t("step3.date.slotTypeBadge")
                                  : t("step3.date.slotTypePremium")
                            const slotsText = t("step3.date.slotsAvailable", {
                              n: slotsAvailable,
                              type: slotTypeLabel,
                            })

                            // Crowdedness signal: how many other projects
                            // are already scheduled on this day. Helps
                            // users pick less-competitive days.
                            const crowdedness =
                              date.scheduledCount <= LAUNCH_CROWDEDNESS_THRESHOLDS.LOW
                                ? {
                                    icon: "🟢",
                                    color: "text-emerald-600 dark:text-emerald-400",
                                  }
                                : date.scheduledCount <= LAUNCH_CROWDEDNESS_THRESHOLDS.MEDIUM
                                  ? {
                                      icon: "🟡",
                                      color: "text-amber-600 dark:text-amber-400",
                                    }
                                  : {
                                      icon: "🔴",
                                      color: "text-red-600 dark:text-red-400",
                                    }

                            return (
                              <SelectItem
                                key={date.date}
                                value={date.date}
                                disabled={isDisabled}
                                className="group text-sm"
                              >
                                <div className="flex w-full items-center justify-between gap-2">
                                  <span>{format(dateObj, "EEE, MMM d")}</span>
                                  <span className="flex items-center gap-2 text-xs">
                                    <span
                                      className={`${isDisabled ? "text-muted-foreground/50" : crowdedness.color}`}
                                      title={t("step3.date.crowdednessTooltip", {
                                        n: date.scheduledCount,
                                      })}
                                    >
                                      {crowdedness.icon} {date.scheduledCount}
                                    </span>
                                    <span
                                      className={`${isDisabled ? "text-muted-foreground/50" : "text-muted-foreground group-hover:text-foreground group-data-[highlighted]:text-foreground"}`}
                                    >
                                      {slotsText}
                                    </span>
                                  </span>
                                </div>
                              </SelectItem>
                            )
                          })}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>

                  {launchDateLimitError && !fieldErrors.scheduledDate && (
                    <p className="text-destructive mt-2 text-xs sm:text-sm">
                      {launchDateLimitError}
                    </p>
                  )}
                  {renderFieldError("scheduledDate")}

                  {formData.scheduledDate && !isLaunchDateOverLimit && (
                    <div className="bg-primary/5 border-primary/10 mt-3 rounded-md border p-3 text-sm">
                      <div
                        className={`flex w-full items-center gap-1.5 ${
                          formData.launchType === LAUNCH_TYPES.FREE &&
                          (() => {
                            const today = new Date()
                            const selectedDate = parseISO(formData.scheduledDate)
                            const daysUntilLaunch = Math.ceil(
                              (selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
                            )
                            return daysUntilLaunch > LAUNCH_SETTINGS.PREMIUM_MIN_DAYS_AHEAD
                          })()
                            ? "mb-3"
                            : ""
                        }`}
                      >
                        <RiCalendarLine className="text-primary/80 h-4 w-4 flex-shrink-0" />
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">
                              {t("step3.date.scheduledFor")}
                            </span>
                            <span className="text-foreground font-medium">
                              {format(parseISO(formData.scheduledDate), DATE_FORMAT.DISPLAY)}
                            </span>
                          </div>
                          <span className="text-muted-foreground/70 text-xs">
                            {LAUNCH_SETTINGS.LAUNCH_HOUR_UTC}:00 UTC
                          </span>
                        </div>
                      </div>

                      {formData.launchType === LAUNCH_TYPES.FREE &&
                        (() => {
                          const today = new Date()
                          const selectedDate = parseISO(formData.scheduledDate)
                          const daysUntilLaunch = Math.ceil(
                            (selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
                          )
                          const premiumEarliestDate = addDays(
                            today,
                            LAUNCH_SETTINGS.PREMIUM_MIN_DAYS_AHEAD,
                          )
                          const daysSaved = daysUntilLaunch - LAUNCH_SETTINGS.PREMIUM_MIN_DAYS_AHEAD

                          return (
                            daysUntilLaunch > LAUNCH_SETTINGS.PREMIUM_MIN_DAYS_AHEAD && (
                              <div className="border-primary/20 border-t pt-3">
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 space-y-2">
                                    <p className="text-primary text-sm font-medium">
                                      {t("step3.premiumUpsell.heading", { days: daysSaved })}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      {t("step3.premiumUpsell.body", {
                                        date: format(premiumEarliestDate, "MMM d"),
                                        dr: DOMAIN_AUTHORITY,
                                      })}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        // Switch to Premium and find earliest available date
                                        setFormData((prev) => ({
                                          ...prev,
                                          launchType: LAUNCH_TYPES.PREMIUM,
                                        }))

                                        // Load premium dates and auto-select the earliest
                                        try {
                                          const startDate = format(
                                            addDays(today, LAUNCH_SETTINGS.PREMIUM_MIN_DAYS_AHEAD),
                                            DATE_FORMAT.API,
                                          )
                                          const endDate = format(
                                            addDays(today, LAUNCH_SETTINGS.PREMIUM_MAX_DAYS_AHEAD),
                                            DATE_FORMAT.API,
                                          )
                                          const availability = await getLaunchAvailabilityRange(
                                            startDate,
                                            endDate,
                                            LAUNCH_TYPES.PREMIUM,
                                          )

                                          // Find first available premium date
                                          const firstAvailableDate = availability.find(
                                            (date) => date.premiumSlots > 0 && date.totalSlots > 0,
                                          )
                                          if (firstAvailableDate) {
                                            setFormData((prev) => ({
                                              ...prev,
                                              scheduledDate: firstAvailableDate.date,
                                            }))
                                          }
                                          setAvailableDates(availability)
                                        } catch (err) {
                                          console.error("Error loading premium dates:", err)
                                          setFormData((prev) => ({ ...prev, scheduledDate: null }))
                                          loadAvailableDates()
                                        }
                                      }}
                                      className="bg-primary hover:bg-primary/90 text-primary-foreground inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                                    >
                                      <RiStarLine className="h-3 w-3" />
                                      {t("step3.premiumUpsell.button", {
                                        price: LAUNCH_SETTINGS.PREMIUM_PRICE,
                                      })}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          )
                        })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      case 4:
        return (
          <div className="space-y-8">
            <div className="flex items-center gap-2">
              <RiCheckLine className="h-5 w-5" />
              <h3 className="text-lg font-medium">{t("step4.title")}</h3>
            </div>

            <div className="bg-card overflow-hidden rounded-lg border">
              <div className="space-y-6 p-6">
                <div>
                  <h4 className="mb-3 border-b pb-2 text-base font-semibold">
                    {t("step4.projectInfo")}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>{t("step4.fields.name")}</strong> {formData.name}
                    </p>
                    <p>
                      <strong>{t("step4.fields.website")}</strong>{" "}
                      <a
                        href={formData.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {formData.websiteUrl}
                      </a>
                    </p>
                    <p>
                      <strong>{t("step4.fields.description")}</strong>
                    </p>
                    <RichTextDisplay
                      content={formData.description}
                      className="mt-1 max-h-[200px] overflow-y-auto rounded-md border p-2 text-sm"
                    />
                    {uploadedLogoUrl && (
                      <p className="flex flex-col items-start gap-2">
                        <strong>{t("step4.fields.logo")}</strong>
                        <Image
                          src={uploadedLogoUrl}
                          alt={t("step4.logoAlt")}
                          width={48}
                          height={48}
                          className="rounded border"
                        />
                      </p>
                    )}
                    {formData.productImage && (
                      <p className="flex flex-col items-start gap-2">
                        <strong>{t("step4.fields.productImage")}</strong>
                        <Image
                          src={formData.productImage}
                          alt={t("step4.productImageAlt")}
                          width={128}
                          height={128}
                          className="rounded border object-cover"
                        />
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 border-b pb-2 text-base font-semibold">
                    {t("step4.details")}
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <strong>{t("step4.fields.categories")}</strong>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {formData.categories.map((catId) => (
                          <Badge key={catId} variant="secondary">
                            {getCategoryName(catId)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <strong>{t("step4.fields.tags")}</strong>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {formData.techStack.map((tech) => (
                          <Badge key={tech} variant="outline">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <strong>{t("step4.fields.platforms")}</strong>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {formData.platforms.map((plat) => (
                          <Badge key={plat} variant="secondary" className="capitalize">
                            {getPlatformLabel(plat)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <p>
                      <strong>{t("step4.fields.pricing")}</strong>{" "}
                      <span className="capitalize">
                        <Badge variant="outline">{getPricingLabel(formData.pricing)}</Badge>
                      </span>
                    </p>
                    {formData.githubUrl && (
                      <p>
                        <strong>{t("step4.fields.github")}</strong>{" "}
                        <a
                          href={formData.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {formData.githubUrl}
                        </a>
                      </p>
                    )}
                    {formData.twitterUrl && (
                      <p>
                        <strong>{t("step4.fields.twitter")}</strong>{" "}
                        <a
                          href={formData.twitterUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {formData.twitterUrl}
                        </a>
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 border-b pb-2 text-base font-semibold">
                    {t("step4.launchPlan")}
                  </h4>
                  <div className="flex flex-col gap-4 text-sm sm:flex-row">
                    <div
                      className={`flex w-fit items-center gap-2 rounded-md border px-3 py-2 ${
                        formData.launchType === LAUNCH_TYPES.FREE
                          ? "bg-foreground/5 border-foreground/10"
                          : formData.launchType === LAUNCH_TYPES.PREMIUM
                            ? "bg-primary/5 border-primary/20"
                            : "bg-primary/5 border-primary/20"
                      }`}
                    >
                      {formData.launchType === LAUNCH_TYPES.FREE && (
                        <>
                          <RiRocketLine className="text-foreground/70 h-4 w-4" />{" "}
                          <span className="text-foreground/70 font-medium">
                            {t("step3.launchType.free.name")}
                          </span>
                        </>
                      )}
                      {formData.launchType === LAUNCH_TYPES.PREMIUM && (
                        <>
                          <RiStarLine className="text-primary h-4 w-4" />{" "}
                          <span className="text-primary font-medium">
                            {t("step4.premiumPriceLabel", { price: LAUNCH_SETTINGS.PREMIUM_PRICE })}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="bg-muted/30 flex h-full min-h-[60px] w-fit flex-col justify-center rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <RiCalendarLine className="text-muted-foreground h-4 w-4" />
                        <span>
                          {formData.scheduledDate
                            ? format(parseISO(formData.scheduledDate), DATE_FORMAT.DISPLAY)
                            : t("step3.date.noDate")}
                        </span>
                      </div>
                      {formData.scheduledDate && (
                        <span className="text-muted-foreground/70 ml-6 text-xs">
                          {LAUNCH_SETTINGS.LAUNCH_HOUR_UTC}:00 UTC
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-muted/30 border-t px-6 py-4">
                <div className="flex items-start gap-3">
                  <RiInformationLine className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{t("step4.readyToSubmit.heading")}</p>
                    <p className="text-muted-foreground text-xs">
                      {t("step4.readyToSubmit.body")}
                      {formData.launchType !== LAUNCH_TYPES.FREE && (
                        <span className="mt-1 block">
                          {t("step4.readyToSubmit.paymentRedirect")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {renderStepper()}

      {renderStepContent()}

      {formError && (
        <div className="bg-destructive/10 border-destructive/30 text-destructive rounded-md border p-3 text-sm">
          {formError}
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={prevStep}
          disabled={currentStep === 1 || isPending || isUploadingLogo || isUploadingProductImage}
        >
          <RiArrowLeftLine className="mr-2 h-4 w-4" />
          {t("buttons.previous")}
        </Button>

        {currentStep < 4 ? (
          <Button
            type="button"
            onClick={nextStep}
            disabled={
              isPending ||
              isUploadingLogo ||
              isUploadingProductImage ||
              (currentStep === 3 && isLoadingDateCheck)
            }
          >
            {currentStep === 3 && isLoadingDateCheck && (
              <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t("buttons.next")}
            <RiArrowRightLine className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleFinalSubmit}
            disabled={isPending || isUploadingLogo || isUploadingProductImage}
          >
            {isPending ? (
              <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RiRocketLine className="mr-2 h-4 w-4" />
            )}
            {t("buttons.submit")}
          </Button>
        )}
      </div>
    </form>
  )
}
