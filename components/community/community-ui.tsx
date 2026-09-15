import type { ElementType, ReactNode } from "react"

import { ArrowUp, Bookmark, MessageCircle } from "lucide-react"

import {
  participationMessage,
  postTypes,
  type CommunityPost,
  type FeedQuery,
  type MemberRole,
} from "@/lib/community/contracts"
import { Button } from "@/components/ui/button"

type CommunityLinkProps = {
  href: string
  className?: string
  children: ReactNode
}

export function CommunityShell({
  children,
  sidebar,
  tools,
  showHeader = true,
  mode = "preview",
  composeHref = "#new",
  linkComponent,
}: {
  children: ReactNode
  sidebar: ReactNode
  tools?: ReactNode
  showHeader?: boolean
  mode?: "preview" | "live"
  composeHref?: string
  /** Lets the live Next route use Link while the standalone preview stays framework-free. */
  linkComponent?: ElementType<CommunityLinkProps>
}) {
  const CommunityLink = linkComponent ?? "a"
  // The application layout already owns the document's main landmark. The
  // standalone preview does not, so it keeps a main element for its own a11y
  // outline while live pages use a neutral content container.
  const Content = mode === "live" ? "div" : "main"
  return (
    <section className={`community-preview ${mode === "live" ? "community-live" : ""}`} lang="en">
      <a className="c-skip" href="#community-content">
        Skip to community
      </a>
      {showHeader && (
        <header className="c-header">
          <a className="c-brand" href="https://www.aat.ee">
            <span className="c-logo" aria-hidden="true" />
            aat.ee
          </a>
          <nav aria-label="Site">
            <a href="https://www.aat.ee/projects">Explore</a>
            <a href="#" aria-current="page">
              Community
            </a>
            <CommunityLink href={composeHref} className="c-primary">
              Post update ↗
            </CommunityLink>
          </nav>
        </header>
      )}
      {mode === "preview" && (
        <div className="c-preview-label">
          PHASE 1 FRONTEND PREVIEW · Fictional data · Changes reset on refresh · Planned:
          www.aat.ee/community
        </div>
      )}
      {tools}
      <div className="c-layout">
        <aside className="c-sidebar" aria-label="Community navigation">
          {sidebar}
        </aside>
        <Content id="community-content" tabIndex={-1}>
          {children}
        </Content>
        <aside className="c-right">
          <div className="c-callout">
            <small>MADE FOR MAKERS</small>
            <h2>
              Build in the open.
              <br />
              Learn together.
            </h2>
            <p>
              A small release. An honest lesson. Your next step. There is room for all of it here.
            </p>
            <CommunityLink className="c-primary" href={composeHref}>
              Share an update ↗
            </CommunityLink>
          </div>
          <h3>A little common ground.</h3>
          <p>
            <strong>Be useful. Be kind.</strong>
            <br />
            Share context and make room for another perspective.
          </p>
          <p>
            <strong>Give your product context.</strong>
            <br />
            Tell us what changed or what you need help with.
          </p>
          <p>
            <strong>Keep it in English.</strong>
            <br />
            One shared language so everyone can join in.
          </p>
        </aside>
      </div>
      {mode === "preview" && (
        <footer className="c-footer">
          aat.ee community / An open notebook for people building things.
        </footer>
      )}
    </section>
  )
}
export function PostTypeNav({
  query,
  onChange,
  onAdmin,
  role,
}: {
  query: FeedQuery
  onChange: (query: FeedQuery) => void
  onAdmin: () => void
  role: MemberRole
}) {
  return (
    <>
      <small className="c-eyebrow">COMMUNITY</small>
      {(["All", ...postTypes] as const).map((type) => (
        <Button
          key={type}
          variant="ghost"
          className="c-nav"
          aria-pressed={query.view === "all" && query.type === type}
          onClick={() => onChange({ ...query, view: "all", type, cursor: undefined })}
        >
          {type === "All" ? "All posts" : type}
        </Button>
      ))}
      <div className="c-personal">
        {(["saved", "mine"] as const).map((view) => (
          <Button
            key={view}
            variant="ghost"
            className="c-nav"
            aria-pressed={query.view === view}
            onClick={() => onChange({ ...query, view, type: "All", cursor: undefined })}
          >
            {view === "saved" ? "Saved" : "My posts"}
          </Button>
        ))}
        {role === "moderator" && (
          <Button variant="ghost" className="c-nav" onClick={onAdmin}>
            Moderation
          </Button>
        )}
      </div>
    </>
  )
}
export function CommunityState({
  title,
  children,
  retry,
  busy = false,
}: {
  title: string
  children?: ReactNode
  retry?: () => void
  busy?: boolean
}) {
  return (
    <section className="c-state" aria-busy={busy}>
      <h2>{title}</h2>
      {/* Callers may supply a button or link, so this cannot be a paragraph. */}
      {children && <div className="c-state-description">{children}</div>}
      {busy && <div className="c-skeleton" aria-label="Loading content" />}
      {retry && (
        <Button className="c-button" onClick={retry}>
          Try again
        </Button>
      )}
    </section>
  )
}
export function ParticipationNotice({ role }: { role: MemberRole }) {
  const message = participationMessage(role)
  return message ? (
    <div className="c-notice" role="status">
      {message}
      <small>Use the preview role selector to explore the signed-in state.</small>
    </div>
  ) : null
}
export function ProductContextCard({ post }: { post: CommunityPost }) {
  return post.product ? (
    <div className="c-product">
      <span>{post.product.name.slice(0, 1)}</span>
      <div>
        <strong>{post.product.name}</strong>
        <small>{post.product.description}</small>
      </div>
    </div>
  ) : null
}
export function PostMeta({ post }: { post: CommunityPost }) {
  return (
    <div className="c-meta">
      <span className="c-avatar">
        {post.author
          .split(" ")
          .slice(0, 2)
          .map((part) => part[0])
          .join("")}
      </span>
      <strong>{post.author}</strong>
      <span className="c-pill">{post.type}</span>
      {post.pinned && <span>Pinned</span>}
      {post.locked && <span>Replies closed</span>}
      {post.state !== "public" && (
        <span>
          {post.state === "pending"
            ? "Pending review"
            : post.state === "hidden"
              ? "Hidden"
              : "Deleted"}
        </span>
      )}
    </div>
  )
}
export function PostActions({
  post,
  pending,
  onVote,
  onSave,
  onOpen,
}: {
  post: CommunityPost
  pending: boolean
  onVote: () => void
  onSave: () => void
  onOpen?: () => void
}) {
  return (
    <div className="c-post-actions">
      <Button
        variant="outline"
        disabled={pending}
        aria-label={`Upvote ${post.title || post.type + " update"}`}
        aria-pressed={post.voted}
        onClick={onVote}
      >
        <ArrowUp size={14} />
        {post.votes}
      </Button>
      {onOpen && (
        <Button variant="ghost" onClick={onOpen}>
          <MessageCircle size={14} />
          {post.replyCount ?? post.replies.length} replies
        </Button>
      )}
      <Button variant="ghost" disabled={pending} aria-pressed={post.saved} onClick={onSave}>
        <Bookmark size={14} />
        {post.saved ? "Saved" : "Save"}
      </Button>
      {pending && <small role="status">Saving…</small>}
    </div>
  )
}
export function PostCard({
  post,
  children,
  onOpen,
}: {
  post: CommunityPost
  children: ReactNode
  onOpen: () => void
}) {
  return (
    <article className="c-post" data-post-id={post.id}>
      <PostMeta post={post} />
      {post.title && (
        <h3>
          <button onClick={onOpen}>{post.title}</button>
        </h3>
      )}
      <p className="c-body">
        {post.bodyTruncated ? `${post.body}…` : post.body.slice(0, 480)}
        {!post.bodyTruncated && post.body.length > 480 ? "…" : ""}
      </p>
      {(post.bodyTruncated || post.body.length > 480) && (
        <button className="c-text-button" onClick={onOpen}>
          Read full post →
        </button>
      )}
      <ProductContextCard post={post} />
      {children}
    </article>
  )
}
