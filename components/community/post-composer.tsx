"use client"

import { useId, useRef, useState } from "react"

import {
  postTypes,
  validateDraft,
  type PostDraft,
  type ProductContext,
} from "@/lib/community/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const prompts = {
  Shipped: "What did you ship? Who does it help? What changed?",
  Learning: "What did you try, observe and learn?",
  Question: "What are you stuck on? What have you already tried?",
  Milestone: "What did you reach? How did you get there?",
  Todo: "What will you work on next? What would success look like?",
}
export function PostComposer({
  draft,
  onChange,
  products,
  pending,
  error,
  onSubmit,
  onSave,
  editing = false,
}: {
  draft: PostDraft
  onChange: (draft: PostDraft) => void
  products: ProductContext[]
  pending: boolean
  error: string
  onSubmit: () => void
  onSave?: () => void
  editing?: boolean
}) {
  const id = useId()
  const form = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<ReturnType<typeof validateDraft>>({})
  function change<K extends keyof PostDraft>(key: K, value: PostDraft[K]) {
    onChange({ ...draft, [key]: value })
    setErrors({})
  }
  return (
    <form
      ref={form}
      className="c-composer"
      aria-busy={pending}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        const nextErrors = validateDraft(draft)
        setErrors(nextErrors)
        const first = Object.keys(nextErrors)[0]
        if (first) {
          form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
          return
        }
        onSubmit()
      }}
    >
      <h2>{editing ? "Edit your post" : "What are you building?"}</h2>
      <small>Share an update or ask a question · English only</small>
      <label className="c-field">
        Your update
        <Textarea
          name="body"
          aria-label="Your update"
          value={draft.body}
          disabled={pending}
          maxLength={10000}
          aria-invalid={!!errors.body}
          aria-describedby={`${id}-body-error`}
          placeholder={prompts[draft.type]}
          onChange={(e) => change("body", e.target.value)}
        />
        <span id={`${id}-body-error`} className="c-error">
          {errors.body}
        </span>
      </label>
      <div className="c-field-pair">
        <label className="c-field">
          Post type
          <select
            name="type"
            disabled={pending}
            value={draft.type}
            onChange={(e) => change("type", e.target.value as PostDraft["type"])}
          >
            {postTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="c-field">
          Related product
          <select
            disabled={pending}
            value={draft.productId}
            onChange={(e) => change("productId", e.target.value)}
          >
            <option value="">No product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="c-field">
        Title (optional)
        <Input
          name="title"
          aria-label="Title (optional)"
          disabled={pending}
          value={draft.title}
          maxLength={160}
          aria-invalid={!!errors.title}
          aria-describedby={`${id}-title-error`}
          placeholder="A heading for a longer discussion"
          onChange={(e) => change("title", e.target.value)}
        />
        <span id={`${id}-title-error`} className="c-error">
          {errors.title}
        </span>
      </label>
      {error && (
        <p className="c-error" role="alert">
          {error}
        </p>
      )}
      <div className="c-actions">
        {onSave && (
          <Button type="button" variant="ghost" disabled={pending} onClick={onSave}>
            Save draft
          </Button>
        )}
        <Button className="c-button" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Post update ↗"}
        </Button>
      </div>
    </form>
  )
}
export function ReplyComposer({
  value,
  onChange,
  pending,
  error,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  pending: boolean
  error: string
  onSubmit: () => void
}) {
  const id = useId()
  const [invalid, setInvalid] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  return (
    <form
      className="c-reply-form"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault()
        if (!value.trim()) {
          setInvalid(true)
          input.current?.focus()
          return
        }
        if (!pending) onSubmit()
      }}
    >
      <label className="c-field">
        Your reply
        <Textarea
          ref={input}
          aria-label="Your reply"
          value={value}
          maxLength={4000}
          disabled={pending}
          aria-invalid={invalid}
          aria-describedby={id}
          onChange={(e) => {
            setInvalid(false)
            onChange(e.target.value)
          }}
        />
      </label>
      <p id={id} className="c-error" role="alert">
        {invalid ? "Write a reply before posting." : error}
      </p>
      <Button className="c-button" disabled={pending}>
        {pending ? "Posting…" : "Post reply"}
      </Button>
    </form>
  )
}
