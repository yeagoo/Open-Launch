"use client"

import { useState, useTransition } from "react"

import {
  RiAddLine,
  RiClipboardLine,
  RiDeleteBinLine,
  RiKey2Line,
  RiLoader4Line,
} from "@remixicon/react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createSkillApiKey,
  revokeSkillApiKey,
  type SkillApiKeyListItem,
} from "@/app/actions/skill-api-keys"

export function SkillApiKeysCard({ initialKeys }: { initialKeys: SkillApiKeyListItem[] }) {
  const [keys, setKeys] = useState(initialKeys)
  const [label, setLabel] = useState("")
  const [rawKey, setRawKey] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      try {
        const created = await createSkillApiKey(label)
        setKeys((current) => [created.key, ...current])
        setRawKey(created.rawKey)
        setLabel("")
        toast.success("API key created")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create API key")
      }
    })
  }

  function handleRevoke(id: string) {
    setRevokingId(id)
    startTransition(async () => {
      try {
        await revokeSkillApiKey(id)
        const revokedAt = new Date().toISOString()
        setKeys((current) => current.map((key) => (key.id === id ? { ...key, revokedAt } : key)))
        toast.success("API key revoked")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to revoke API key")
      } finally {
        setRevokingId(null)
      }
    })
  }

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Copied")
    } catch {
      toast.error("Copy failed")
    }
  }

  const isCreating = isPending && revokingId === null

  return (
    <Card id="skill-api-keys" className="scroll-mt-24 border dark:border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <RiKey2Line className="text-muted-foreground h-5 w-5" />
          <CardTitle className="font-heading text-xl font-semibold">API Keys</CardTitle>
        </div>
        <CardDescription>Skill submission access</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleCreate} className="space-y-2">
          <Label htmlFor="skill-api-key-label">Label</Label>
          <div className="flex gap-2">
            <Input
              id="skill-api-key-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Local agent"
              maxLength={80}
              disabled={isCreating}
            />
            <Button
              type="submit"
              size="icon"
              title="Create API key"
              disabled={isCreating || label.trim().length === 0}
            >
              {isCreating ? (
                <RiLoader4Line className="h-4 w-4 animate-spin" />
              ) : (
                <RiAddLine className="h-4 w-4" />
              )}
              <span className="sr-only">Create API key</span>
            </Button>
          </div>
        </form>

        {rawKey && (
          <div className="border-border bg-muted/35 rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">New key</p>
              <Button type="button" variant="outline" size="sm" onClick={() => handleCopy(rawKey)}>
                <RiClipboardLine className="h-4 w-4" />
                Copy
              </Button>
            </div>
            <code className="block max-h-24 overflow-auto rounded-sm text-xs break-all">
              {rawKey}
            </code>
          </div>
        )}

        <div className="space-y-2">
          {keys.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-sm">
              No API keys yet.
            </p>
          ) : (
            keys.map((key) => {
              const revoked = key.revokedAt !== null
              const isRevoking = revokingId === key.id
              return (
                <div key={key.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{key.label}</p>
                        {revoked && <Badge variant="secondary">Revoked</Badge>}
                      </div>
                      <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
                        {key.keyPrefix}...
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Last used {formatDate(key.lastUsedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Revoke API key"
                      disabled={revoked || isRevoking}
                      onClick={() => handleRevoke(key.id)}
                    >
                      {isRevoking ? (
                        <RiLoader4Line className="h-4 w-4 animate-spin" />
                      ) : (
                        <RiDeleteBinLine className="h-4 w-4" />
                      )}
                      <span className="sr-only">Revoke API key</span>
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function formatDate(value: string | null): string {
  if (!value) return "never"
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}
