"use client"

import { useEffect, useState } from "react"

import { format } from "date-fns"
import { AlertTriangle, Check, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { approveTag, deleteTag, getFlaggedTags } from "@/app/actions/tags"

type FlaggedTag = {
  id: string
  name: string
  slug: string
  moderationNote: string | null
  projectCount: number
  createdAt: Date
}

export default function FlaggedTagsPage() {
  const [tags, setTags] = useState<FlaggedTag[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTags = async () => {
    setLoading(true)
    try {
      const data = await getFlaggedTags()
      setTags(data as FlaggedTag[])
    } catch {
      toast.error("Failed to fetch flagged tags")
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTags()
  }, [])

  const handleApprove = async (tagId: string) => {
    try {
      await approveTag(tagId)
      toast.success("Tag approved")
      setTags((prev) => prev.filter((t) => t.id !== tagId))
    } catch {
      toast.error("Failed to approve tag")
    }
  }

  const handleDelete = async (tagId: string) => {
    try {
      await deleteTag(tagId)
      toast.success("Tag deleted")
      setTags((prev) => prev.filter((t) => t.id !== tagId))
    } catch {
      toast.error("Failed to delete tag")
    }
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flagged Tags</h1>
          <p className="text-muted-foreground text-sm">
            Tags flagged by AI moderation for manual review
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchTags} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground py-12 text-center">Loading...</div>
      ) : tags.length === 0 ? (
        <div className="text-muted-foreground border-border bg-card rounded-lg border border-dashed py-12 text-center text-sm">
          No flagged tags. All clear!
        </div>
      ) : (
        <div className="space-y-3">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="bg-card border-border flex items-center justify-between rounded-lg border p-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">#{tag.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {tag.projectCount} projects
                  </Badge>
                </div>
                {tag.moderationNote && (
                  <p className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {tag.moderationNote}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Created {format(new Date(tag.createdAt), "MMM d, yyyy HH:mm")}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApprove(tag.id)}
                  className="gap-1 text-green-600 hover:text-green-700"
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(tag.id)}
                  className="gap-1 text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
