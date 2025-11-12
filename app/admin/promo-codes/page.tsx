"use client"

import { useEffect, useState } from "react"

import { format } from "date-fns"
import { Check, Copy, Plus, RefreshCw, Tag, Ticket } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type PromoCode = {
  id: string
  code: string
  discountAmount: number
  usageLimit: number | null
  usedCount: number
  expiresAt: Date | null
  isActive: boolean
  createdAt: Date
}

export default function PromoCodesPage() {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Generation form state
  const [count, setCount] = useState(1)
  const [prefix, setPrefix] = useState("LAUNCH")
  const [discountAmount, setDiscountAmount] = useState(2.99)
  const [usageLimit, setUsageLimit] = useState<string>("unlimited")
  const [customUsageLimit, setCustomUsageLimit] = useState<number>(10)
  const [validityDays, setValidityDays] = useState(30)

  const fetchPromoCodes = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/promo-codes/list")
      const data = await response.json()

      if (data.success) {
        setPromoCodes(data.promoCodes)
      } else {
        toast.error("Failed to fetch promo codes")
      }
    } catch (error) {
      console.error("Error fetching promo codes:", error)
      toast.error("Failed to fetch promo codes")
    }
    setLoading(false)
  }

  const generatePromoCodes = async () => {
    setGenerating(true)
    try {
      const response = await fetch("/api/admin/promo-codes/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          count,
          prefix,
          discountAmount,
          usageLimit: usageLimit === "unlimited" ? null : customUsageLimit,
          validityDays,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`Generated ${data.count} promo code(s)`)
        fetchPromoCodes()

        // Copy codes to clipboard if there are multiple
        if (data.promoCodes.length > 1) {
          const codesText = data.promoCodes.join("\n")
          await navigator.clipboard.writeText(codesText)
          toast.success("Promo codes copied to clipboard")
        } else if (data.promoCodes.length === 1) {
          await navigator.clipboard.writeText(data.promoCodes[0])
          toast.success("Promo code copied to clipboard")
        }
      } else {
        toast.error(data.error || "Failed to generate promo codes")
      }
    } catch (error) {
      console.error("Error generating promo codes:", error)
      toast.error("Failed to generate promo codes")
    }
    setGenerating(false)
  }

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      toast.success("Copied to clipboard")
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (error) {
      console.error("Error copying to clipboard:", error)
      toast.error("Failed to copy")
    }
  }

  useEffect(() => {
    fetchPromoCodes()
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-2 pt-6 pb-12 sm:px-4">
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Promo Codes</h1>
        </div>
        <Button size="sm" variant="outline" onClick={fetchPromoCodes} className="h-8 gap-2">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Generate Promo Codes Form */}
      <div className="bg-card overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <Plus className="text-muted-foreground h-4 w-4" />
            <h2 className="text-sm font-medium">Generate New Promo Codes</h2>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="count">Number of Codes</Label>
              <Input
                id="count"
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prefix">Code Prefix</Label>
              <Input
                id="prefix"
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                placeholder="LAUNCH"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount">Discount Amount ($)</Label>
              <Input
                id="discount"
                type="number"
                step="0.01"
                min="0"
                max="1000"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="validity">Validity (Days)</Label>
              <Input
                id="validity"
                type="number"
                min="1"
                max="365"
                value={validityDays}
                onChange={(e) => setValidityDays(parseInt(e.target.value) || 30)}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="usage">Usage Limit</Label>
              <div className="flex gap-2">
                <Select value={usageLimit} onValueChange={setUsageLimit}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {usageLimit === "custom" && (
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={customUsageLimit}
                    onChange={(e) => setCustomUsageLimit(parseInt(e.target.value) || 10)}
                    className="w-[120px]"
                  />
                )}
              </div>
            </div>
          </div>

          <Button onClick={generatePromoCodes} disabled={generating} className="w-full sm:w-auto">
            {generating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Generate Promo Codes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Promo Codes List */}
      <div className="bg-card overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <Tag className="text-muted-foreground h-4 w-4" />
            <h2 className="text-sm font-medium">Existing Promo Codes</h2>
            <span className="text-muted-foreground text-xs">({promoCodes.length})</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Desktop View */}
            <div className="hidden sm:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-muted-foreground p-2 text-left text-xs font-medium">
                        Code
                      </th>
                      <th className="text-muted-foreground p-2 text-center text-xs font-medium">
                        Discount
                      </th>
                      <th className="text-muted-foreground p-2 text-center text-xs font-medium">
                        Usage
                      </th>
                      <th className="text-muted-foreground p-2 text-center text-xs font-medium">
                        Expires
                      </th>
                      <th className="text-muted-foreground p-2 text-center text-xs font-medium">
                        Status
                      </th>
                      <th className="text-muted-foreground p-2 text-right text-xs font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {promoCodes.map((promo) => {
                      const isExpired = promo.expiresAt && new Date(promo.expiresAt) < new Date()
                      const isLimitReached = promo.usageLimit && promo.usedCount >= promo.usageLimit

                      return (
                        <tr key={promo.id} className="hover:bg-muted/10 border-t">
                          <td className="p-2 font-mono text-sm font-medium">{promo.code}</td>
                          <td className="p-2 text-center">${promo.discountAmount.toFixed(2)}</td>
                          <td className="p-2 text-center">
                            {promo.usedCount} / {promo.usageLimit || "∞"}
                          </td>
                          <td className="p-2 text-center text-xs">
                            {promo.expiresAt
                              ? format(new Date(promo.expiresAt), "MMM d, yyyy")
                              : "Never"}
                          </td>
                          <td className="p-2 text-center">
                            {isExpired ? (
                              <Badge variant="secondary" className="text-xs">
                                Expired
                              </Badge>
                            ) : isLimitReached ? (
                              <Badge variant="secondary" className="text-xs">
                                Limit Reached
                              </Badge>
                            ) : promo.isActive ? (
                              <Badge variant="default" className="text-xs">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Inactive
                              </Badge>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(promo.code)}
                              className="h-7"
                            >
                              {copiedCode === promo.code ? (
                                <Check className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile View */}
            <div className="divide-y sm:hidden">
              {promoCodes.map((promo) => {
                const isExpired = promo.expiresAt && new Date(promo.expiresAt) < new Date()
                const isLimitReached = promo.usageLimit && promo.usedCount >= promo.usageLimit

                return (
                  <div key={promo.id} className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs font-medium">
                          {promo.code}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(promo.code)}
                          className="h-6 w-6 p-0"
                        >
                          {copiedCode === promo.code ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <div className="text-muted-foreground flex items-center gap-2 text-xs">
                        <span>${promo.discountAmount.toFixed(2)} off</span>
                        <span>•</span>
                        <span>
                          {promo.usedCount} / {promo.usageLimit || "∞"} used
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isExpired ? (
                          <Badge variant="secondary" className="text-xs">
                            Expired
                          </Badge>
                        ) : isLimitReached ? (
                          <Badge variant="secondary" className="text-xs">
                            Limit Reached
                          </Badge>
                        ) : promo.isActive ? (
                          <Badge variant="default" className="text-xs">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                        {promo.expiresAt && (
                          <span className="text-muted-foreground text-xs">
                            Expires {format(new Date(promo.expiresAt), "MMM d")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
