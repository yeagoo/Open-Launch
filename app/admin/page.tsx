"use client"

import { useEffect, useState } from "react"
import { MoreHorizontal, Ban, UserCog, Trash2, Search, Users, Shield, RefreshCw, Filter } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { getAdminStatsAndUsers } from "@/app/actions/projects"
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
  const router = useRouter()
  useIsMobile()

  // Fetch users and stats
  const fetchUsersAndStats = async () => {
    setLoading(true)
    try {
      const { users, stats } = await getAdminStatsAndUsers()
      const mappedUsers = users.map(u => ({
        ...u,
        role: u.role ?? undefined,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : undefined,
      }))
      setUsers(mappedUsers)
      setFilteredUsers(mappedUsers)
      setStats(stats)
    } catch {
      setUsers([])
      setFilteredUsers([])
      setStats({ totalLaunches: 0, premiumLaunches: 0, premiumPlusLaunches: 0, totalUsers: 0 })
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchUsersAndStats()
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
    <div className="max-w-5xl mx-auto pt-8 pb-16 px-2 sm:px-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Admin dashboard</h1>
      <div className="grid grid-cols-2 sm:flex sm:flex-row items-stretch justify-between gap-0 rounded-md border bg-card overflow-hidden mb-6 sm:divide-x divide-border">
        <div className="flex flex-col items-center justify-center flex-1 py-2 px-1 sm:py-3 sm:px-2">
          <span className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Users</span>
          <span className="font-bold text-base sm:text-xl">{stats.totalUsers}</span>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 py-2 px-1 sm:py-3 sm:px-2  ">
          <span className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Projects</span>
          <span className="font-bold text-base sm:text-xl">{stats.totalLaunches}</span>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 py-2 px-1 sm:py-3 sm:px-2 ">
          <span className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Premium</span>
          <span className="font-bold text-base sm:text-xl">{stats.premiumLaunches}</span>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 py-2 px-1 sm:py-3 sm:px-2 ">
          <span className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Premium Plus</span>
          <span className="font-bold text-base sm:text-xl">{stats.premiumPlusLaunches}</span>
        </div>
      </div>
      <div className="flex gap-1 mb-2 sm:gap-2">
        <div className="flex-1 min-w-0">
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
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-8 p-0 rounded-md flex items-center justify-center text-xs [&>svg:last-child]:hidden">
            <Users className="h-5 w-5 text-muted-foreground" />
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
            <Shield className="h-5 w-5 text-muted-foreground" />
          </SelectTrigger>
          <SelectContent className="rounded-md">
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="banned">Banned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(itemsPerPage)} onValueChange={v => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
          <SelectTrigger className="h-8 w-8 p-0 rounded-md flex items-center justify-center text-xs [&>svg:last-child]:hidden">
            <Filter className="h-5 w-5 text-muted-foreground" />
          </SelectTrigger>
          <SelectContent className="rounded-md">
            <SelectItem value="5">5 / page</SelectItem>
            <SelectItem value="10">10 / page</SelectItem>
            <SelectItem value="20">20 / page</SelectItem>
            <SelectItem value="50">50 / page</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={fetchUsersAndStats} className="h-8 w-8 p-0 rounded-md flex items-center justify-center">
          <RefreshCw className="h-5 w-5" />
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <svg className="animate-spin h-8 w-8 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
        </div>
      ) : (
        <>
          <div className="hidden sm:block">
            <div className="rounded-md overflow-hidden border">
              <table className="min-w-full text-sm bg-card">
                <thead className="bg-muted/40 rounded-t-md">
                  <tr>
                    <th className="p-2 text-left font-semibold rounded-tl-md">User</th>
                    <th className="p-2 text-left font-semibold">Email</th>
                    <th className="p-2 text-center font-semibold">Role</th>
                    <th className="p-2 text-center font-semibold">Status</th>
                    <th className="p-2 text-right font-semibold rounded-tr-md">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-card">
                  {currentUsers.map(user => (
                    <tr key={user.id} className="border-t hover:bg-muted/10">
                      <td className="p-2 font-medium truncate max-w-[120px]">{user.name || "—"}</td>
                      <td className="p-2 text-muted-foreground truncate max-w-[180px]">{user.email}</td>
                      <td className="p-2 text-center">
                        <Badge variant={user.role === "admin" ? "secondary" : "outline"}>{user.role || "user"}</Badge>
                      </td>
                      <td className="p-2 text-center">
                        {user.banned ? (
                          <Badge variant="destructive">Banned</Badge>
                        ) : (
                          <Badge variant="outline" className="border-green-200 bg-green-50 text-green-600">Active</Badge>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <DropdownMenuUserActions 
                          user={user} 
                          onRefresh={fetchUsersAndStats}
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
          <div className="sm:hidden divide-y rounded-md border bg-card overflow-hidden text-xs">
            <div className="flex font-semibold bg-muted/40 text-muted-foreground">
              <div className="w-1/3 px-2 py-2">User</div>
              <div className="w-1/3 px-2 py-2">Email</div>
              <div className="w-1/4 px-2 py-2 text-center">Status</div>
              <div className="w-1/6 px-2 py-2 text-right">Actions</div>
            </div>
            {currentUsers.map(user => (
              <div key={user.id} className="flex items-center">
                <div className="w-1/3 px-2 py-2 truncate font-medium">{user.name || "—"}</div>
                <div className="w-1/3 px-2 py-2 truncate text-muted-foreground">{user.email}</div>
                <div className="w-1/4 px-2 py-2 text-center">
                  {user.banned ? (
                    <Badge variant="destructive">Banned</Badge>
                  ) : (
                    <Badge variant="outline" className="border-green-200 bg-green-50 text-green-600">Active</Badge>
                  )}
                </div>
                <div className="w-1/6 px-2 py-2 text-right">
                  <DropdownMenuUserActions 
                    user={user} 
                    onRefresh={fetchUsersAndStats}
                    router={router}
                    setIsLoading={setIsLoading}
                    isLoading={isLoading}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="flex justify-center items-center mt-4 gap-2">
        <Button size="sm" variant="outline" onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>
          Previous
        </Button>
        <span className="text-xs font-medium">{currentPage}</span>
        <Button size="sm" variant="outline" onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages || totalPages === 0}>
          Next
        </Button>
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
