export interface SubmitProjectValidationData {
  name: string
  websiteUrl: string
  tagline: string
  description: string
  categories: string[]
  techStack: string[]
  platforms: string[]
  pricing: string
  scheduledDate: string | null
}

export interface SubmitProjectValidationMessages {
  nameRequired: string
  websiteUrlRequired: string
  websiteUrlInvalid: string
  taglineTooLong: string
  descriptionRequired: string
  logoRequired: string
  categoriesMin: string
  categoriesMax: string
  techStackMin: string
  techStackMax: string
  platformsMin: string
  pricingRequired: string
  scheduledDateRequired: string
  scheduledDateOverLimit: string
}

interface SubmitProjectValidationContext {
  uploadedLogoUrl: string | null
  requireLogo: boolean
  isLaunchDateOverLimit: boolean
  launchDateLimitError: string | null
}

export function validateSubmitProjectStep(
  step: number,
  data: SubmitProjectValidationData,
  context: SubmitProjectValidationContext,
  messages: SubmitProjectValidationMessages,
): Record<string, string> {
  const errors: Record<string, string> = {}

  if (step === 1) {
    if (!data.name) errors.name = messages.nameRequired
    if (!data.websiteUrl) {
      errors.websiteUrl = messages.websiteUrlRequired
    } else {
      try {
        new URL(data.websiteUrl)
      } catch {
        errors.websiteUrl = messages.websiteUrlInvalid
      }
    }
    if (data.tagline.length > 60) errors.tagline = messages.taglineTooLong
    if (!data.description) errors.description = messages.descriptionRequired
    if (context.requireLogo && !context.uploadedLogoUrl) errors.logoUrl = messages.logoRequired
  } else if (step === 2) {
    if (data.categories.length === 0) {
      errors.categories = messages.categoriesMin
    } else if (data.categories.length > 3) {
      errors.categories = messages.categoriesMax
    }
    if (data.techStack.length === 0) {
      errors.techStack = messages.techStackMin
    } else if (data.techStack.length > 10) {
      errors.techStack = messages.techStackMax
    }
    if (data.platforms.length === 0) errors.platforms = messages.platformsMin
    if (!data.pricing) errors.pricing = messages.pricingRequired
  } else if (step === 3) {
    if (!data.scheduledDate) {
      errors.scheduledDate = messages.scheduledDateRequired
    } else if (context.isLaunchDateOverLimit) {
      errors.scheduledDate = context.launchDateLimitError || messages.scheduledDateOverLimit
    }
  }

  return errors
}
