"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  applyCommunityPostReaction,
  participationMessage,
  type CommunityPost,
  type CommunityViewer,
  type FeedPage,
  type FeedQuery,
} from "@/lib/community/contracts"
import { communityFeedHref, communityPostHref } from "@/lib/community/urls"
import { Button } from "@/components/ui/button"
import {
  loadMoreCommunityPosts,
  setCommunityBookmark,
  setCommunityVote,
} from "@/app/actions/community"

import {
  actionMessage,
  CommunityParticipationGate,
  communityProjectionKey,
  useCommunityActionLock,
} from "./community-client-utils"
import { CommunityState, PostActions, PostCard } from "./community-ui"

function headingFor(query: FeedQuery): { title: string; description: string } {
  if (query.view === "mine")
    return { title: "My posts", description: "Your updates, lessons and next steps." }
  if (query.view === "saved")
    return { title: "Saved posts", description: "Conversations you want to return to." }
  return {
    title: "Build. Share. Keep going.",
    description: "Small releases, honest lessons, and what comes next.",
  }
}

export function CommunityFeedClient({
  initial,
  query,
}: {
  initial: { feed: FeedPage; viewer: CommunityViewer; rateLimited?: boolean }
  query: FeedQuery
}) {
  const stateKey = communityProjectionKey({ initial, query })
  return <CommunityFeedClientState key={stateKey} initial={initial} query={query} />
}

function CommunityFeedClientState({
  initial,
  query,
}: {
  initial: { feed: FeedPage; viewer: CommunityViewer; rateLimited?: boolean }
  query: FeedQuery
}) {
  const router = useRouter()
  const [feed, setFeed] = useState<FeedPage>(initial.feed)
  const [error, setError] = useState("")
  const [loadingMore, startLoadingMore] = useTransition()
  const [mutating, startMutation] = useTransition()
  const [tryAcquireActionLock, releaseActionLock] = useCommunityActionLock()
  const [tryAcquireLoadMoreLock, releaseLoadMoreLock] = useCommunityActionLock()
  const { title, description } = headingFor(query)

  function updateQuery(next: FeedQuery) {
    router.push(communityFeedHref({ ...next, cursor: undefined }))
  }

  function requireParticipant(): boolean {
    if (initial.viewer.canParticipate) return true
    setError(participationMessage(initial.viewer.role) ?? "Community participation is unavailable.")
    return false
  }

  function reactToPost(post: CommunityPost, kind: "vote" | "bookmark") {
    if (!requireParticipant() || !tryAcquireActionLock()) return
    const optimistic =
      kind === "vote"
        ? { ...post, voted: !post.voted, votes: post.votes + (post.voted ? -1 : 1) }
        : { ...post, saved: !post.saved }
    setError("")
    setFeed((current) => ({
      ...current,
      posts: current.posts.map((item) => (item.id === post.id ? optimistic : item)),
    }))
    startMutation(async () => {
      try {
        const result =
          kind === "vote"
            ? await setCommunityVote(post.id, optimistic.voted)
            : await setCommunityBookmark(post.id, optimistic.saved)
        if (!result.ok) {
          setFeed((current) => ({
            ...current,
            posts: current.posts.map((item) => (item.id === post.id ? post : item)),
          }))
          setError(actionMessage(result) ?? "Unable to update this post.")
          return
        }
        setFeed((current) => ({
          ...current,
          posts: current.posts
            .map((item) => applyCommunityPostReaction(item, result.value))
            .filter((item) => query.view !== "saved" || item.saved),
        }))
      } catch {
        setFeed((current) => ({
          ...current,
          posts: current.posts.map((item) => (item.id === post.id ? post : item)),
        }))
        setError("Unable to update this post. Please retry.")
      } finally {
        releaseActionLock()
      }
    })
  }

  function loadMore() {
    if (!feed.nextCursor || loadingMore || !tryAcquireLoadMoreLock()) return
    setError("")
    startLoadingMore(async () => {
      try {
        const result = await loadMoreCommunityPosts({ ...query, cursor: feed.nextCursor })
        if (!result.ok) {
          setError(actionMessage(result) ?? "Unable to load more posts.")
          return
        }
        setFeed((current) => ({
          posts: [
            ...current.posts,
            ...result.value.posts.filter(
              (next) => !current.posts.some((post) => post.id === next.id),
            ),
          ],
          nextCursor: result.value.nextCursor,
        }))
      } catch {
        setError("Unable to load more posts. Please retry.")
      } finally {
        releaseLoadMoreLock()
      }
    })
  }

  const isAnonymousPersonalView = !initial.viewer.id && query.view !== "all"
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 tabIndex={-1}>{title}</h1>
          <p>{description}</p>
        </div>
        {initial.viewer.canParticipate ? (
          <Button asChild className="c-button">
            <Link href="/community/new">Share an update ↗</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in to post</Link>
          </Button>
        )}
      </div>

      <form
        className="c-field-pair"
        onSubmit={(event) => {
          event.preventDefault()
          const search = String(new FormData(event.currentTarget).get("search") ?? "").trim()
          if (search && search.length < 3) {
            setError("Use at least 3 characters to search community posts.")
            return
          }
          updateQuery({ ...query, search })
        }}
      >
        <label className="c-field">
          Search posts or products
          <input
            name="search"
            defaultValue={query.search}
            maxLength={200}
            minLength={3}
            type="search"
          />
        </label>
        <Button variant="outline" style={{ alignSelf: "end", marginBottom: 12 }}>
          Search
        </Button>
      </form>

      <div className="c-toolbar">
        <button
          aria-pressed={query.sort === "Latest" || query.view !== "all"}
          onClick={() => updateQuery({ ...query, sort: "Latest" })}
          type="button"
        >
          Latest
        </button>
        {query.view === "all" && (
          <button
            aria-pressed={query.sort === "Hot"}
            onClick={() => updateQuery({ ...query, sort: "Hot" })}
            type="button"
          >
            Hot
          </button>
        )}
        <small>{`${feed.posts.length} posts shown`}</small>
      </div>

      {error && (
        <p className="c-error" role="alert">
          {error}
        </p>
      )}
      <CommunityParticipationGate viewer={initial.viewer} />
      {initial.rateLimited ? (
        <CommunityState title="Search is temporarily limited">
          <button className="c-text-button" onClick={() => updateQuery({ ...query, search: "" })}>
            Return to all posts
          </button>
        </CommunityState>
      ) : isAnonymousPersonalView ? (
        <CommunityState title="Sign in to see your community activity">
          Your saved posts and updates stay private to your account.
        </CommunityState>
      ) : feed.posts.length === 0 ? (
        <CommunityState
          title={
            query.search
              ? "No matching posts"
              : query.view === "saved"
                ? "No saved posts yet"
                : "No posts here yet"
          }
        >
          {query.search ? (
            <button className="c-text-button" onClick={() => updateQuery({ ...query, search: "" })}>
              Clear search
            </button>
          ) : (
            "Share your next step, or save a useful conversation."
          )}
        </CommunityState>
      ) : (
        <>
          {feed.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpen={() => router.push(communityPostHref(post.id))}
            >
              {post.state === "public" ? (
                <PostActions
                  post={post}
                  pending={mutating}
                  onVote={() => reactToPost(post, "vote")}
                  onSave={() => reactToPost(post, "bookmark")}
                  onOpen={() => router.push(communityPostHref(post.id))}
                />
              ) : (
                <Button variant="outline" onClick={() => router.push(communityPostHref(post.id))}>
                  View post status
                </Button>
              )}
            </PostCard>
          ))}
          {feed.nextCursor && (
            <Button className="c-button" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "Loading more…" : "Load more"}
            </Button>
          )}
        </>
      )}
    </>
  )
}
