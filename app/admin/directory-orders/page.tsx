import Link from "next/link"

import { RiExternalLinkLine } from "@remixicon/react"
import { format, formatDistanceToNow } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { listDirectoryOrders } from "@/app/actions/directory-orders"

import { MarkFulfilledButton } from "./mark-fulfilled-button"

// Soft caps so the page stays scannable; the full count is always
// shown in the section header so the admin knows whether to dig
// into Stripe Dashboard for older history.
const FULFILLED_LIMIT = 50
const OTHER_LIMIT = 30

// Admin page = no caching — always show fresh order state.
export const dynamic = "force-dynamic"

const TIER_LABEL: Record<string, string> = {
  basic: "Basic",
  plus: "Plus",
  pro: "Pro",
  ultra: "Ultra",
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  paid: "default",
  fulfilled: "secondary",
  refunded: "destructive",
  failed: "destructive",
  canceled: "outline",
}

// Stripe Dashboard deep-links. Test-mode resources live under
// `/test/...` — we detect the test-mode environment from the
// session id's `cs_test_` prefix. Subscription IDs (`sub_*`) don't
// encode the environment, so we look at the row's session id (when
// present) to mirror the same mode for the subscription link.
//
// Path notes:
//   - Checkout sessions use `/checkout/sessions/<cs_id>`, NOT
//     `/payments/<id>` (that path is for `pi_*` PaymentIntent ids).
//   - Subscriptions use `/subscriptions/<sub_id>`.
function isTestModeSessionId(sessionId: string | null): boolean {
  return sessionId !== null && sessionId.startsWith("cs_test_")
}

function stripeSessionUrl(sessionId: string): string {
  const env = isTestModeSessionId(sessionId) ? "/test" : ""
  return `https://dashboard.stripe.com${env}/checkout/sessions/${sessionId}`
}

function stripeSubscriptionUrl(subId: string, sessionIdForMode: string | null): string {
  const env = isTestModeSessionId(sessionIdForMode) ? "/test" : ""
  return `https://dashboard.stripe.com${env}/subscriptions/${subId}`
}

function formatMoney(cents: number | null, currency: string | null): string {
  if (cents == null) return "—"
  const amount = (cents / 100).toFixed(2)
  return `${currency?.toUpperCase() ?? "USD"} ${amount}`
}

export default async function DirectoryOrdersAdminPage() {
  const orders = await listDirectoryOrders()

  // Group for the rendered sections — `paid` is what needs human
  // action so it goes first, then fulfilled history, then the rest
  // (failed / pending). `pending` rows are abandoned carts; we keep
  // them visible so you can spot patterns (e.g. broken Stripe link).
  const paid = orders.filter((o) => o.status === "paid")
  const fulfilled = orders.filter((o) => o.status === "fulfilled")
  const other = orders.filter((o) => !["paid", "fulfilled"].includes(o.status))

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Directory orders</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            One row per directory-listing purchase. Plus / Pro / Ultra need manual fulfilment after
            placing the user&apos;s URL on partner sites; Basic auto-fulfils on payment.
          </p>
        </div>

        <Section title="Awaiting fulfilment" count={paid.length} accent>
          {paid.length === 0 ? (
            <Empty text="Nothing in the queue — paid orders will appear here." />
          ) : (
            <OrderTable rows={paid} showFulfilAction />
          )}
        </Section>

        <Section title="Fulfilled" count={fulfilled.length}>
          {fulfilled.length === 0 ? (
            <Empty text="No fulfilled orders yet." />
          ) : (
            <>
              <OrderTable rows={fulfilled.slice(0, FULFILLED_LIMIT)} />
              {fulfilled.length > FULFILLED_LIMIT && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Showing {FULFILLED_LIMIT} of {fulfilled.length}. Older history is in Stripe
                  Dashboard.
                </p>
              )}
            </>
          )}
        </Section>

        <Section title="Pending / failed / canceled" count={other.length}>
          {other.length === 0 ? (
            <Empty text="No abandoned, failed, or canceled orders." />
          ) : (
            <>
              <OrderTable rows={other.slice(0, OTHER_LIMIT)} />
              {other.length > OTHER_LIMIT && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Showing {OTHER_LIMIT} of {other.length}.
                </p>
              )}
            </>
          )}
        </Section>
      </div>
    </main>
  )
}

function Section({
  title,
  count,
  accent,
  children,
}: {
  title: string
  count: number
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <span
          className={`font-mono text-xs tabular-nums ${
            accent ? "text-primary" : "text-muted-foreground"
          }`}
        >
          ({count})
        </span>
      </div>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="bg-muted/30 text-muted-foreground rounded-md border px-4 py-6 text-center text-sm">
      {text}
    </p>
  )
}

interface OrderTableProps {
  rows: Awaited<ReturnType<typeof listDirectoryOrders>>
  showFulfilAction?: boolean
}

function OrderTable({ rows, showFulfilAction }: OrderTableProps) {
  return (
    <div className="bg-card overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr className="text-left">
            <Th>Project</Th>
            <Th>Tier</Th>
            <Th>URL</Th>
            <Th>Buyer</Th>
            <Th>Amount</Th>
            <Th>Paid</Th>
            <Th>Status</Th>
            <Th>Stripe</Th>
            {showFulfilAction && <Th>Action</Th>}
          </tr>
        </thead>
        <tbody className="divide-border/60 divide-y">
          {rows.map((o) => (
            <tr key={o.id}>
              <Td>
                {o.projectSlug ? (
                  <Link
                    href={`/projects/${o.projectSlug}`}
                    className="hover:text-primary underline-offset-2 hover:underline"
                  >
                    {o.projectName ?? o.projectId}
                  </Link>
                ) : (
                  <span>{o.projectName ?? o.projectId}</span>
                )}
              </Td>
              <Td>
                <span className="font-mono text-xs tracking-wide uppercase">
                  {TIER_LABEL[o.tier] ?? o.tier}
                </span>
              </Td>
              <Td>
                <span className="font-mono text-xs">{truncate(o.url, 32)}</span>
              </Td>
              <Td>
                <span className="text-muted-foreground text-xs">{o.buyerEmail ?? "—"}</span>
              </Td>
              <Td>
                <span className="font-mono tabular-nums">
                  {formatMoney(o.amountCents, o.currency)}
                </span>
              </Td>
              <Td>
                {o.paidAt ? (
                  <span title={format(o.paidAt, "PPpp")} className="text-muted-foreground text-xs">
                    {formatDistanceToNow(o.paidAt, { addSuffix: true })}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </Td>
              <Td>
                <Badge variant={STATUS_VARIANT[o.status] ?? "outline"} className="capitalize">
                  {o.status}
                </Badge>
              </Td>
              <Td>
                <StripeDeepLink
                  sessionId={o.stripeSessionId}
                  subscriptionId={o.stripeSubscriptionId}
                />
              </Td>
              {showFulfilAction && (
                <Td>
                  <MarkFulfilledButton orderId={o.id} />
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-muted-foreground px-3 py-2.5 text-left font-medium">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2.5 align-middle">{children}</td>
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + "…"
}

// Tiny Stripe Dashboard deep-link icon. Prefers the subscription URL
// when present (Ultra), otherwise falls back to the session payment.
function StripeDeepLink({
  sessionId,
  subscriptionId,
}: {
  sessionId: string | null
  subscriptionId: string | null
}) {
  const href = subscriptionId
    ? stripeSubscriptionUrl(subscriptionId, sessionId)
    : sessionId
      ? stripeSessionUrl(sessionId)
      : null
  if (!href) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-xs"
      title="Open in Stripe Dashboard"
    >
      Open
      <RiExternalLinkLine className="h-3 w-3" />
    </a>
  )
}
