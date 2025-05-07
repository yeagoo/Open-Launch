"use client"

import { useEffect, useState } from "react"
import { MoreHorizontal, Ban, UserCog, Trash2, Search, Users, Folder, RefreshCw, Filter, Calendar, Shield, Sparkle, Sparkles, Plus, Tag, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { getAdminStatsAndUsers, getFreeLaunchAvailability, getCategories, addCategory } from "@/app/actions/admin"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { useIsMobile } from "@/hooks/use-mobile"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { admin } from "@/lib/auth-client"
import { format, parseISO } from "date-fns"
import { LAUNCH_SETTINGS } from "@/lib/constants"

type User = {
  id: string
  email: string
  name: string
  role?: string | undefined
  banned?: boolean | null
  createdAt?: string
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [stats, setStats] = useState<{ totalLaunches: number; premiumLaunches: number; premiumPlusLaunches: number; totalUsers: number }>({ totalLaunches: 0, premiumLaunches: 0, premiumPlusLaunches: 0, totalUsers: 0 })
  const [loading, setLoading] = useState(false)
  const [isLoading, setIsLoading] = useState<string | undefined>()
  const [freeLaunchAvailability, setFreeLaunchAvailability] = useState<{ date: string; freeSlots: number } | null>(null)
  const [categories, setCategories] = useState<{ name: string }[]>([])
  const [totalCategories, setTotalCategories] = useState(0)
  const [newCategory, setNewCategory] = useState("")
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const router = useRouter()
  useIsMobile()

  // Fetch users, stats and free launch availability
  const fetchData = async () => {
    setLoading(true)
    try {
      const [{ users, stats }, freeLaunchData] = await Promise.all([
        getAdminStatsAndUsers(),
        getFreeLaunchAvailability()
      ])
      const mappedUsers = users.map(u => ({
        ...u,
        role: u.role ?? undefined,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : undefined,
      }))
      setUsers(mappedUsers)
      setFilteredUsers(mappedUsers)
      setStats(stats)
      setFreeLaunchAvailability(freeLaunchData.firstAvailableDate)
    } catch {
      setUsers([])
      setFilteredUsers([])
      setStats({ totalLaunches: 0, premiumLaunches: 0, premiumPlusLaunches: 0, totalUsers: 0 })
      setFreeLaunchAvailability(null)
    }
    setLoading(false)
  }

  // Fetch categories
  const fetchCategories = async () => {
    try {
      const { categories: cats, totalCount } = await getCategories()
      setCategories(cats)
      setTotalCategories(totalCount)
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    }
  }

  // Handle category addition
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCategory.trim()) return

    setIsAddingCategory(true)
    setCategoryError(null)

    const result = await addCategory(newCategory)
    if (result.success) {
      setNewCategory("")
      fetchCategories()
      toast.success("Category added successfully")
    } else {
      setCategoryError(result.error || 'Failed to add category')
    }
    setIsAddingCategory(false)
  }

  useEffect(() => {
    fetchData()
    fetchCategories()
  }, [])

  // Filtres
  useEffect(() => {
    let result = [...users]
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (user) =>
          user.name?.toLowerCase().includes(query) || user.email?.toLowerCase().includes(query),
      )
    }
    if (roleFilter !== "all") {
      result = result.filter((user) => user.role === roleFilter)
    }
    if (statusFilter !== "all") {
      if (statusFilter === "banned") {
        result = result.filter((user) => user.banned === true)
      } else if (statusFilter === "active") {
        result = result.filter((user) => user.banned !== true)
      }
    }
    setFilteredUsers(result)
    setCurrentPage(1)
  }, [searchQuery, roleFilter, statusFilter, users])

  const indexOfLastUser = currentPage * itemsPerPage
  const indexOfFirstUser = indexOfLastUser - itemsPerPage
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser)
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage)

  const uniqueRoles = Array.from(new Set(users.map((user) => user.role || "user")))

  return (
    <div className="max-w-5xl mx-auto pt-6 pb-12 px-2 sm:px-4 space-y-4">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <Button size="sm" variant="outline" onClick={fetchData} className="h-8 gap-2">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Users</span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="mt-1 block text-xl font-semibold">{stats.totalUsers}</span>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Projects</span>
            <Folder className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="mt-1 block text-xl font-semibold">{stats.totalLaunches}</span>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Premium</span>
            <Sparkle className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="mt-1 block text-xl font-semibold">{stats.premiumLaunches}</span>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Premium Plus</span>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="mt-1 block text-xl font-semibold">{stats.premiumPlusLaunches}</span>
        </div>
      </div>

      {/* Free Launch Availability */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Free Launch Availability</h2>
          </div>
        </div>
        <div className="p-3">
          {freeLaunchAvailability ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm text-muted-foreground">Next available:</span>
                <div className="flex items-center gap-1">
                  <span className="font-medium">
                    {format(parseISO(freeLaunchAvailability.date), "MMMM d, yyyy")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({freeLaunchAvailability.freeSlots} slot{freeLaunchAvailability.freeSlots > 1 ? 's' : ''} available)
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No free launch slots available in the next {LAUNCH_SETTINGS.MAX_DAYS_AHEAD} days
            </div>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Users</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-2 rounded-md border text-xs w-24 max-w-[110px] sm:w-64 sm:max-w-full"
              />
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-8 w-8 p-0 rounded-md flex items-center justify-center text-xs [&>svg:last-child]:hidden">
                <Users className="h-4 w-4 text-muted-foreground" />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                <SelectItem value="all">All roles</SelectItem>
                {uniqueRoles.map(role => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-8 p-0 rounded-md flex items-center justify-center text-xs [&>svg:last-child]:hidden">
                <Shield className="h-4 w-4 text-muted-foreground" /> 
              </SelectTrigger>
              <SelectContent className="rounded-md">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="banned">Banned</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(itemsPerPage)} onValueChange={v => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
              <SelectTrigger className="h-8 w-8 p-0 rounded-md flex items-center justify-center text-xs [&>svg:last-child]:hidden">
                <Filter className="h-4 w-4 text-muted-foreground" />
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
          <div className="flex justify-center items-center py-8">
            <svg className="animate-spin h-6 w-6 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
          </div>
        ) : (
          <>
            <div className="hidden sm:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-left font-medium text-xs text-muted-foreground">User</th>
                      <th className="p-2 text-left font-medium text-xs text-muted-foreground">Email</th>
                      <th className="p-2 text-center font-medium text-xs text-muted-foreground">Role</th>
                      <th className="p-2 text-center font-medium text-xs text-muted-foreground">Status</th>
                      <th className="p-2 text-right font-medium text-xs text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentUsers.map(user => (
                      <tr key={user.id} className="border-t hover:bg-muted/10">
                        <td className="p-2 font-medium truncate max-w-[120px]">{user.name || "—"}</td>
                        <td className="p-2 text-muted-foreground truncate max-w-[180px]">{user.email}</td>
                        <td className="p-2 text-center">
                          <Badge variant={user.role === "admin" ? "secondary" : "outline"} className="text-xs">{user.role || "user"}</Badge>
                        </td>
                        <td className="p-2 text-center">
                          {user.banned ? (
                            <Badge variant="destructive" className="text-xs">Banned</Badge>
                          ) : (
                            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-600 text-xs">Active</Badge>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <DropdownMenuUserActions 
                            user={user} 
                            onRefresh={fetchData}
                            router={router}
                            setIsLoading={setIsLoading}
                            isLoading={isLoading}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="sm:hidden divide-y">
              {currentUsers.map(user => (
                <div key={user.id} className="flex items-center p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{user.name || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={user.role === "admin" ? "secondary" : "outline"} className="text-xs">{user.role || "user"}</Badge>
                      {user.banned ? (
                        <Badge variant="destructive" className="text-xs">Banned</Badge>
                      ) : (
                        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-600 text-xs">Active</Badge>
                      )}
                    </div>
                  </div>
                  <DropdownMenuUserActions 
                    user={user} 
                    onRefresh={fetchData}
                    router={router}
                    setIsLoading={setIsLoading}
                    isLoading={isLoading}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-between p-3 border-t">
          <span className="text-xs text-muted-foreground">
            Showing {indexOfFirstUser + 1}-{Math.min(indexOfLastUser, filteredUsers.length)} of {filteredUsers.length}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)} disabled={currentPage === 1} className="h-8">
              Previous
            </Button>
            <span className="text-xs font-medium">{currentPage}</span>
            <Button size="sm" variant="outline" onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages || totalPages === 0} className="h-8">
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Categories Management */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Categories</h2>
            <span className="text-xs text-muted-foreground">({totalCategories})</span>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8 gap-1.5"
            onClick={() => setIsAddingCategory(true)}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs">Add Category</span>
          </Button>
        </div>
        <div className="p-3 space-y-3">
          {isAddingCategory && (
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Enter category name"
                className="flex-1 h-8 px-2 text-sm rounded-md border bg-background"
              />
              <Button 
                type="submit" 
                size="sm" 
                className="h-8"
              >
                Add
              </Button>
              <Button 
                type="button" 
                size="sm" 
                variant="ghost" 
                className="h-8"
                onClick={() => {
                  setIsAddingCategory(false)
                  setNewCategory("")
                  setCategoryError(null)
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </form>
          )}
          {categoryError && (
            <div className="text-xs text-destructive">{categoryError}</div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <div 
                key={cat.name}
                className="px-2 py-1 text-xs rounded-md bg-muted/40 text-muted-foreground"
              >
                {cat.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DropdownMenuUserActions({ 
  user, 
  onRefresh,
  router,
  setIsLoading,
  isLoading
}: { 
  user: User,
  onRefresh: () => Promise<void>,
  router: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  setIsLoading: (value: string | undefined) => void,
  isLoading: string | undefined
}) {
  // Ban user
  const handleBanUser = async (id: string) => {
    setIsLoading(`ban-${id}`)
    try {
      // Ban for 30 days
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000
      await admin.banUser({
        userId: id,
        banReason: "Admin action",
        banExpiresIn: thirtyDaysInMs,
      })
      toast.success("User banned successfully")
      onRefresh() // Refresh the list
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to ban user")
    } finally {
      setIsLoading(undefined)
    }
  }

  // Unban user
  const handleUnbanUser = async (id: string) => {
    setIsLoading(`unban-${id}`)
    try {
      await admin.unbanUser({
        userId: id,
      })
      toast.success("User unbanned successfully")
      onRefresh() // Refresh the list
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unban user")
    } finally {
      setIsLoading(undefined)
    }
  }

  // Impersonate user
  const handleImpersonateUser = async (id: string) => {
    setIsLoading(`impersonate-${id}`)
    try {
      await admin.impersonateUser({ userId: id })
      toast.success("Impersonated user")
      router.push("/dashboard")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to impersonate user")
    } finally {
      setIsLoading(undefined)
    }
  }

  // Delete user
  const handleDeleteUser = async (id: string) => {
    setIsLoading(`delete-${id}`)
    try {
      await admin.removeUser({ userId: id })
      toast.success("User deleted successfully")
      onRefresh() // Refresh the list
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete user")
    } finally {
      setIsLoading(undefined)
    }
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-md">
        <DropdownMenuItem 
          onClick={() => user.banned ? handleUnbanUser(user.id) : handleBanUser(user.id)}
          disabled={isLoading?.startsWith(`ban-${user.id}`) || isLoading?.startsWith(`unban-${user.id}`)}
          className="focus:bg-accent focus:text-accent-foreground group rounded-md"
        >
          <Ban className="mr-2 h-4 w-4 group-focus:text-white group-hover:text-white text-muted-foreground transition-colors" />
          <span>{user.banned ? 'Unban' : 'Ban'} User</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleImpersonateUser(user.id)}
          disabled={isLoading === `impersonate-${user.id}`}
          className="focus:bg-accent focus:text-accent-foreground group rounded-md"
        >
          <UserCog className="mr-2 h-4 w-4 group-focus:text-white group-hover:text-white text-muted-foreground transition-colors" />
          <span>Impersonate</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleDeleteUser(user.id)}
          disabled={isLoading === `delete-${user.id}`}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive group rounded-md"
        >
          <Trash2 className="mr-2 h-4 w-4 group-focus:text-destructive group-hover:text-destructive text-muted-foreground transition-colors" />
          <span>Delete User</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
