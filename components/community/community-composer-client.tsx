"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { toast } from "sonner"

import {
  emptyDraft,
  type CommunityPost,
  type CommunityViewer,
  type PostDraft,
  type ProductContext,
} from "@/lib/community/contracts"
import { communityPostHref } from "@/lib/community/urls"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  editCommunityPost,
  publishCommunityPost,
  saveCommunityDraft,
} from "@/app/actions/community"

import {
  actionMessage,
  CommunityParticipationGate,
  newCommunityRequestKey,
  useCommunityActionLock,
} from "./community-client-utils"
import { CommunityState } from "./community-ui"
import { PostComposer } from "./post-composer"

export function CommunityComposerClient({
  initialDraft,
  products,
  viewer,
  post,
}: {
  initialDraft: PostDraft | null
  products: ProductContext[]
  viewer: CommunityViewer
  post?: CommunityPost
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<PostDraft>(
    initialDraft ??
      (post
        ? { title: post.title, body: post.body, type: post.type, productId: post.product?.id ?? "" }
        : emptyDraft()),
  )
  const [error, setError] = useState("")
  const [discardOpen, setDiscardOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [tryAcquireActionLock, releaseActionLock] = useCommunityActionLock()
  const requestKey = useRef<string | null>(null)
  const editing = !!post
  const canEdit =
    !!post &&
    viewer.canParticipate &&
    viewer.id === post.authorId &&
    post.state !== "hidden" &&
    post.state !== "deleted" &&
    !post.locked

  if (editing && !canEdit)
    return (
      <>
        <Button asChild variant="ghost" className="c-text-button">
          <Link href={post ? communityPostHref(post.id) : "/community"}>← Back to community</Link>
        </Button>
        <CommunityParticipationGate viewer={viewer} />
        <CommunityState title="Editing unavailable">
          Only the author of an open post can edit it.
        </CommunityState>
      </>
    )

  function change(next: PostDraft) {
    requestKey.current = null
    setDraft(next)
  }

  function saveDraft() {
    if (!tryAcquireActionLock()) return
    setError("")
    startTransition(async () => {
      try {
        const result = await saveCommunityDraft(draft)
        if (!result.ok) {
          setError(actionMessage(result) ?? "Unable to save this draft.")
          return
        }
        toast.success("Draft saved. It is visible only to you.")
        router.refresh()
      } catch {
        setError("Unable to save this draft. Please retry.")
      } finally {
        releaseActionLock()
      }
    })
  }

  function submit() {
    if (!tryAcquireActionLock()) return
    setError("")
    startTransition(async () => {
      try {
        if (post) {
          const result = await editCommunityPost(post.id, draft, post.version)
          if (!result.ok) {
            setError(actionMessage(result) ?? "Unable to save your changes.")
            return
          }
          router.replace(communityPostHref(post.id))
          return
        }
        requestKey.current ??= newCommunityRequestKey()
        const result = await publishCommunityPost(draft, requestKey.current)
        if (!result.ok) {
          setError(actionMessage(result) ?? "Unable to publish this post.")
          return
        }
        requestKey.current = null
        router.replace(communityPostHref(result.value))
      } catch {
        setError(
          post
            ? "Unable to save your changes. Please retry."
            : "Unable to publish this post. Please retry.",
        )
      } finally {
        releaseActionLock()
      }
    })
  }

  function discardDraft() {
    if (!tryAcquireActionLock()) return
    setError("")
    startTransition(async () => {
      try {
        const result = await saveCommunityDraft(emptyDraft())
        if (!result.ok) {
          setError(actionMessage(result) ?? "Unable to discard this draft.")
          return
        }
        setDraft(emptyDraft())
        requestKey.current = null
        setDiscardOpen(false)
        toast.success("Draft discarded.")
        router.refresh()
      } catch {
        setError("Unable to discard this draft. Please retry.")
      } finally {
        releaseActionLock()
      }
    })
  }

  return (
    <>
      <CommunityParticipationGate viewer={viewer} />
      {viewer.canParticipate && (
        <>
          <PostComposer
            draft={draft}
            onChange={change}
            products={products}
            pending={pending}
            error={error}
            onSubmit={submit}
            onSave={editing ? undefined : saveDraft}
            editing={editing}
          />
          <div className="c-actions">
            <Button asChild variant="ghost" disabled={pending}>
              <Link href={post ? communityPostHref(post.id) : "/community"}>
                {editing ? "Back to post" : "Back to community"}
              </Link>
            </Button>
            {!editing && (draft.body || draft.title) && (
              <Button variant="ghost" disabled={pending} onClick={() => setDiscardOpen(true)}>
                Discard draft
              </Button>
            )}
          </div>
        </>
      )}
      <Dialog open={discardOpen} onOpenChange={(open) => !pending && setDiscardOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard your draft?</DialogTitle>
            <DialogDescription>
              This clears the private saved draft and the current composer. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDiscardOpen(false)}>
              Keep it
            </Button>
            <Button disabled={pending} onClick={discardDraft}>
              {pending ? "Saving…" : "Discard draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
