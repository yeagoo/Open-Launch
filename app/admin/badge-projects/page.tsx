"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"

import { format, formatDistanceToNow } from "date-fns"
import { Award, ExternalLink, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getBadgeProjects } from "@/app/actions/admin"

type BadgeProject = Awaited<ReturnType<typeof getBadgeProjects>>["projects"][number]
type Stats = Awaited<ReturnType<typeof getBadgeProjects>>["stats"]

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  scheduled: "outline",
  ongoing: "default",
  launched: "secondary",
}

export default function BadgeProjectsPage() {
  const [projects, setProjects] = useState<BadgeProject[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, scheduled: 0, launched: 0, ongoing: 0 })
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getBadgeProjects()
      setProjects(data.projects)
      setStats(data.stats)
    } catch (err) {
      console.error("Error fetching badge projects:", err)
      toast.error(err instanceof Error ? err.message : "Failed to fetch badge projects")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.websiteUrl?.toLowerCase().includes(q) ||
          p.userEmail?.toLowerCase().includes(q),
      )
    : projects

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <Award className="text-primary h-7 w-7" />
              Badge Fast Track projects
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Projects that skipped the queue by installing the aat.ee badge on their site (free
              path). Auditing: confirm the badge is still present periodically — removed badges
              should trigger project removal.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Scheduled" value={stats.scheduled} />
          <StatCard label="Ongoing" value={stats.ongoing} />
          <StatCard label="Launched" value={stats.launched} />
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search by name, URL, or buyer email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <div className="bg-card overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left">
                <Th>Project</Th>
                <Th>Website</Th>
                <Th>User</Th>
                <Th>Verified</Th>
                <Th>Launch</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-border/60 divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground px-3 py-8 text-center text-sm">
                    {loading
                      ? "Loading…"
                      : projects.length === 0
                        ? "No Badge Fast Track projects yet."
                        : "No matches for that search."}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        {p.logoUrl ? (
                          <Image
                            src={p.logoUrl}
                            alt={p.name}
                            width={28}
                            height={28}
                            className="rounded-md border bg-white object-contain p-0.5 dark:bg-zinc-800"
                          />
                        ) : (
                          <div className="bg-muted h-7 w-7 rounded-md" />
                        )}
                        <Link
                          href={`/projects/${p.slug}`}
                          className="hover:text-primary font-medium underline-offset-2 hover:underline"
                        >
                          {p.name}
                        </Link>
                      </div>
                    </Td>
                    <Td>
                      {p.websiteUrl ? (
                        <a
                          href={p.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 font-mono text-xs"
                        >
                          {truncate(p.websiteUrl.replace(/^https?:\/\//, ""), 32)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td>
                      <div className="text-xs">
                        <div>{p.userName ?? "Unknown"}</div>
                        <div className="text-muted-foreground">{p.userEmail ?? ""}</div>
                      </div>
                    </Td>
                    <Td>
                      {p.badgeVerifiedAt ? (
                        <span
                          title={format(p.badgeVerifiedAt, "PPpp")}
                          className="text-muted-foreground text-xs"
                        >
                          {formatDistanceToNow(p.badgeVerifiedAt, { addSuffix: true })}
                        </span>
                      ) : p.hasBadgeVerified ? (
                        <span className="text-muted-foreground text-xs">verified (no ts)</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </Td>
                    <Td>
                      {p.scheduledLaunchDate ? (
                        <span className="font-mono text-xs">
                          {format(p.scheduledLaunchDate, "yyyy-MM-dd")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </Td>
                    <Td>
                      <Badge
                        variant={STATUS_VARIANT[p.launchStatus ?? ""] ?? "outline"}
                        className="capitalize"
                      >
                        {p.launchStatus ?? "—"}
                      </Badge>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {projects.length > 0 && (
          <p className="text-muted-foreground mt-3 text-xs">
            Showing {filtered.length} of {projects.length}
          </p>
        )}
      </div>
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-lg border p-3">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </p>
      <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
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
