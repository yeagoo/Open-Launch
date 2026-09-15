import { notFound } from "next/navigation"

/** `/community/t` is a namespace, never a discussion. */
export default function CommunityThreadNamespace() {
  notFound()
}
