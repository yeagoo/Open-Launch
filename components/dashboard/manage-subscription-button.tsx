"use client"

import { useTransition } from "react"

import { RiSettings3Line } from "@remixicon/react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { createCustomerPortalSession } from "@/app/actions/directory-orders"

interface ManageSubscriptionButtonProps {
  projectId: string
}

export function ManageSubscriptionButton({ projectId }: ManageSubscriptionButtonProps) {
  const t = useTranslations("dashboardBoost")
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      try {
        const { redirectUrl } = await createCustomerPortalSession(projectId)
        window.location.href = redirectUrl
      } catch (err) {
        const message = err instanceof Error ? err.message : t("errors.portalFailed")
        toast.error(message)
      }
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 w-full px-3 text-xs font-semibold sm:w-auto"
      disabled={pending}
      onClick={handleClick}
    >
      <RiSettings3Line className="mr-1.5 h-3.5 w-3.5" />
      {pending ? t("redirecting") : t("manageSubscription")}
    </Button>
  )
}
