import { handleStripeWebhookPost } from "@/lib/stripe-webhook-handler"

export async function POST(request: Request) {
  return handleStripeWebhookPost(request)
}
