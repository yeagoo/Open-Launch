import { createBetterAuthAdapter } from "@fuma-comment/server/adapters/better-auth"

import { auth } from "@/lib/auth"

export { commentStorage } from "@/lib/comment-storage"

// Création des adaptateurs pour Fuma Comment
export const commentAuth = createBetterAuthAdapter(auth)
