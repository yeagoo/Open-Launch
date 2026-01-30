"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"

import { format } from "date-fns"
import {
  Calendar,
  CreditCard,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  Sparkle,
  Sparkles,
  Trash2,
  User,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { deleteProject, getPaidProjects } from "@/app/actions/admin"

type PaidProject = {
  id: string
  name: string
  slug: string
  websiteUrl: string
  logoUrl: string
  launchType: string | null
  launchStatus: string | null
  scheduledLaunchDate: Date | null
  createdAt: Date
  updatedAt: Date
  userId: string | null
  userName: string | null
  userEmail: string | null
}

type Stats = {
  total: number
  premium: number
  premiumPlus: number
  scheduled: number
  launched: number
  ongoing: number
}

export default function PaidProjectsPage() {
  const [projects, setProjects] = useState<PaidProject[]>([])
  const [filteredProjects, setFilteredProjects] = useState<PaidProject[]>([])
  const [stats, setStats] = useState<Stats>({
    total: 0,
    premium: 0,
    premiumPlus: 0,
    scheduled: 0,
    launched: 0,
    ongoing: 0,
  })
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const fetchPaidProjects = async () => {
    setLoading(true)
    try {
      const data = await getPaidProjects()
      setProjects(data.projects)
      setFilteredProjects(data.projects)
      setStats(data.stats)
    } catch (error) {
      console.error("Error fetching paid projects:", error)
      toast.error("Failed to fetch paid projects")
    }
    setLoading(false)
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      return
    }

    const previousProjects = [...projects]
    setProjects((prev) => prev.filter((p) => p.id !== projectId))
    setFilteredProjects((prev) => prev.filter((p) => p.id !== projectId))

    try {
      const result = await deleteProject(projectId)
      if (result.success) {
        toast.success("Project deleted successfully")
        fetchPaidProjects()
      } else {
        setProjects(previousProjects)
        setFilteredProjects(previousProjects)
        toast.error(result.error || "Failed to delete project")
      }
    } catch {
      setProjects(previousProjects)
      setFilteredProjects(previousProjects)
      toast.error("An error occurred while deleting the project")
    }
  }

  useEffect(() => {
    fetchPaidProjects()
  }, [])

  useEffect(() => {
    let result = [...projects]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (project) =>
          project.name?.toLowerCase().includes(query) ||
          project.userName?.toLowerCase().includes(query) ||
          project.userEmail?.toLowerCase().includes(query),
      )
    }

    if (typeFilter !== "all") {
      result = result.filter((project) => project.launchType === typeFilter)
    }

    if (statusFilter !== "all") {
      result = result.filter((project) => project.launchStatus === statusFilter)
    }

    setFilteredProjects(result)
    setCurrentPage(1)
  }, [searchQuery, typeFilter, statusFilter, projects])

  const indexOfLastProject = currentPage * itemsPerPage
  const indexOfFirstProject = indexOfLastProject - itemsPerPage
  const currentProjects = filteredProjects.slice(indexOfFirstProject, indexOfLastProject)
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage)

  const getLaunchStatusBadge = (status: string | null) => {
    switch (status) {
      case "launched":
        return (
          <Badge variant="default" className="bg-green-500 text-xs">
            Launched
          </Badge>
        )
      case "ongoing":
        return (
          <Badge variant="default" className="bg-blue-500 text-xs">
            Ongoing
          </Badge>
        )
      case "scheduled":
        return (
          <Badge
            variant="outline"
            className="border-yellow-300 bg-yellow-50 text-xs text-yellow-700"
          >
            Scheduled
          </Badge>
        )
      case "payment_pending":
        return (
          <Badge
            variant="outline"
            className="border-orange-300 bg-orange-50 text-xs text-orange-700"
          >
            Payment Pending
          </Badge>
        )
      case "payment_failed":
        return (
          <Badge variant="destructive" className="text-xs">
            Payment Failed
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="text-xs">
            {status || "Unknown"}
          </Badge>
        )
    }
  }

  const getLaunchTypeBadge = (type: string | null) => {
    switch (type) {
      case "premium":
        return (
          <Badge variant="default" className="text-xs">
            <Sparkle className="mr-1 h-3 w-3" />
            Premium
          </Badge>
        )
      case "premium_plus":
        return (
          <Badge variant="default" className="bg-purple-500 text-xs">
            <Sparkles className="mr-1 h-3 w-3" />
            Premium Plus
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-2 pt-6 pb-12 sm:px-4">
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Paid Projects</h1>
        </div>
        <Button size="sm" variant="outline" onClick={fetchPaidProjects} className="h-8 gap-2">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="bg-card rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Total Paid</span>
            <CreditCard className="text-muted-foreground h-4 w-4" />
          </div>
          <span className="mt-1 block text-xl font-semibold">{stats.total}</span>
        </div>
        <div className="bg-card rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Premium</span>
            <Sparkle className="text-muted-foreground h-4 w-4" />
          </div>
          <span className="mt-1 block text-xl font-semibold">{stats.premium}</span>
        </div>
        <div className="bg-card rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Premium Plus</span>
            <Sparkles className="text-muted-foreground h-4 w-4" />
          </div>
          <span className="mt-1 block text-xl font-semibold">{stats.premiumPlus}</span>
        </div>
        <div className="bg-card rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Launched</span>
            <Calendar className="text-muted-foreground h-4 w-4" />
          </div>
          <span className="mt-1 block text-xl font-semibold">{stats.launched}</span>
        </div>
      </div>

      {/* Projects List */}
      <div className="bg-card overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <CreditCard className="text-muted-foreground h-4 w-4" />
            <h2 className="text-sm font-medium">All Paid Projects</h2>
            <span className="text-muted-foreground text-xs">({filteredProjects.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-24 max-w-[110px] rounded-md border pr-2 pl-8 text-xs sm:w-64 sm:max-w-full"
              />
              <Search className="text-muted-foreground absolute top-2 left-2 h-4 w-4" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="flex h-8 w-8 items-center justify-center rounded-md p-0 text-xs [&>svg:last-child]:hidden">
                <Sparkle className="text-muted-foreground h-4 w-4" />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="premium_plus">Premium Plus</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex h-8 w-8 items-center justify-center rounded-md p-0 text-xs [&>svg:last-child]:hidden">
                <Calendar className="text-muted-foreground h-4 w-4" />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="ongoing">Ongoing</SelectItem>
                <SelectItem value="launched">Launched</SelectItem>
                <SelectItem value="payment_pending">Payment Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={String(itemsPerPage)}
              onValueChange={(v) => {
                setItemsPerPage(Number(v))
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="flex h-8 w-8 items-center justify-center rounded-md p-0 text-xs [&>svg:last-child]:hidden">
                <Filter className="text-muted-foreground h-4 w-4" />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                <SelectItem value="5">5 / page</SelectItem>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
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
                        Project
                      </th>
                      <th className="text-muted-foreground p-2 text-left text-xs font-medium">
                        User
                      </th>
                      <th className="text-muted-foreground p-2 text-center text-xs font-medium">
                        Type
                      </th>
                      <th className="text-muted-foreground p-2 text-center text-xs font-medium">
                        Status
                      </th>
                      <th className="text-muted-foreground p-2 text-center text-xs font-medium">
                        Launch Date
                      </th>
                      <th className="text-muted-foreground p-2 text-center text-xs font-medium">
                        Updated
                      </th>
                      <th className="text-muted-foreground p-2 text-right text-xs font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentProjects.map((proj) => (
                      <tr key={proj.id} className="hover:bg-muted/10 border-t">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {proj.logoUrl && (
                              <Image
                                src={proj.logoUrl}
                                alt={proj.name}
                                width={24}
                                height={24}
                                className="rounded"
                              />
                            )}
                            <div className="min-w-0">
                              <Link
                                href={`/projects/${proj.slug}`}
                                target="_blank"
                                className="hover:text-primary truncate font-medium transition-colors"
                              >
                                {proj.name}
                              </Link>
                            </div>
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                            <User className="h-3 w-3" />
                            <span className="max-w-[120px] truncate">
                              {proj.userName || proj.userEmail || "Unknown"}
                            </span>
                          </div>
                        </td>
                        <td className="p-2 text-center">{getLaunchTypeBadge(proj.launchType)}</td>
                        <td className="p-2 text-center">
                          {getLaunchStatusBadge(proj.launchStatus)}
                        </td>
                        <td className="text-muted-foreground p-2 text-center text-xs">
                          {proj.scheduledLaunchDate
                            ? format(new Date(proj.scheduledLaunchDate), "MMM d, yyyy")
                            : "—"}
                        </td>
                        <td className="text-muted-foreground p-2 text-center text-xs">
                          {format(new Date(proj.updatedAt), "MMM d, yyyy")}
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <Link href={proj.websiteUrl} target="_blank">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-7 w-7"
                              onClick={() => handleDeleteProject(proj.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {currentProjects.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-muted-foreground p-8 text-center text-sm">
                          No paid projects found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile View */}
            <div className="divide-y sm:hidden">
              {currentProjects.map((proj) => (
                <div key={proj.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {proj.logoUrl && (
                        <Image
                          src={proj.logoUrl}
                          alt={proj.name}
                          width={32}
                          height={32}
                          className="rounded"
                        />
                      )}
                      <div>
                        <Link
                          href={`/projects/${proj.slug}`}
                          target="_blank"
                          className="hover:text-primary font-medium transition-colors"
                        >
                          {proj.name}
                        </Link>
                        <div className="text-muted-foreground flex items-center gap-1 text-xs">
                          <User className="h-3 w-3" />
                          {proj.userName || proj.userEmail || "Unknown"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                        <Link href={proj.websiteUrl} target="_blank">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-7 w-7"
                        onClick={() => handleDeleteProject(proj.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {getLaunchTypeBadge(proj.launchType)}
                    {getLaunchStatusBadge(proj.launchStatus)}
                  </div>
                  <div className="text-muted-foreground flex items-center gap-4 text-xs">
                    <span>
                      Launch:{" "}
                      {proj.scheduledLaunchDate
                        ? format(new Date(proj.scheduledLaunchDate), "MMM d, yyyy")
                        : "—"}
                    </span>
                    <span>Updated: {format(new Date(proj.updatedAt), "MMM d, yyyy")}</span>
                  </div>
                </div>
              ))}
              {currentProjects.length === 0 && (
                <div className="text-muted-foreground p-8 text-center text-sm">
                  No paid projects found
                </div>
              )}
            </div>
          </>
        )}

        {/* Pagination */}
        {filteredProjects.length > 0 && (
          <div className="flex items-center justify-between border-t p-3">
            <span className="text-muted-foreground text-xs">
              Showing {indexOfFirstProject + 1}-
              {Math.min(indexOfLastProject, filteredProjects.length)} of {filteredProjects.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8"
              >
                Previous
              </Button>
              <span className="text-xs font-medium">{currentPage}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="h-8"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
