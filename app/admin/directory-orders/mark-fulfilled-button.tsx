"use client"

import { useTransition } from "react"

import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { markDirectoryOrderFulfilled } from "@/app/actions/directory-orders"

export function MarkFulfilledButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            await markDirectoryOrderFulfilled(orderId)
            toast.success("Order marked as fulfilled")
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to mark fulfilled"
            toast.error(message)
          }
        })
      }}
    >
      {pending ? "…" : "Mark fulfilled"}
    </Button>
  )
}
