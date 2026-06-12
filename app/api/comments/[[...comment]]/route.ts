/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"

import { NextComment } from "@fuma-comment/next"

import { checkCommentRateLimit } from "@/lib/comment-rate-limit"
import { commentAuth, commentStorage } from "@/lib/comment.config"
import { extractTextFromContent } from "@/lib/content-utils"
import { sendDiscordCommentNotification } from "@/lib/discord-notification"

/**
 * Supprime tous les liens du contenu en transformant les nœuds "link" en texte simple
 * @param content Le contenu JSON du commentaire
 * @returns Le contenu modifié sans liens
 */
function removeLinksFromContent(content: any): any {
  if (!content) return content

  const processNode = (node: any): any => {
    if (!node || typeof node !== "object") return node

    // Si c'est un nœud link, on le transforme en texte simple
    if (node.type === "link") {
      // Récupérer le texte du lien depuis son contenu
      const linkText =
        node.content?.map((child: any) => child.text || "").join("") || node.attrs?.href || ""
      return {
        type: "text",
        text: linkText,
      }
    }

    // Traiter les marks (liens stockés comme marques)
    if (node.marks && Array.isArray(node.marks)) {
      node.marks = node.marks.filter((mark: any) => mark.type !== "link")
    }

    // Traitement récursif du contenu
    if (node.content && Array.isArray(node.content)) {
      node.content = node.content.map(processNode)
    }

    return node
  }

  return processNode(content)
}

/**
 * Strip links from a comment request body and return a fresh request
 * carrying the cleaned content, plus the parsed body (for notifications).
 *
 * Fails CLOSED: a non-empty body that isn't valid JSON throws so callers
 * reject the request, instead of the old behaviour of forwarding the
 * original (unstripped) request on parse error — which let a malformed
 * payload bypass link removal. An empty body (e.g. a like/rate action
 * that carries no JSON) passes through untouched.
 */
async function processRequestWithLinkRemoval(
  req: NextRequest,
): Promise<{ req: NextRequest; body: Record<string, any> | null }> {
  const raw = await req.text()
  if (!raw) {
    return {
      req: new NextRequest(req.url, { method: req.method, headers: req.headers }),
      body: null,
    }
  }

  let body: Record<string, any>
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error("INVALID_JSON")
  }

  if (body && body.content) {
    body.content = removeLinksFromContent(body.content)
  }

  return {
    req: new NextRequest(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(body),
    }),
    body,
  }
}

// Create standard Fuma Comment handler
const commentHandler = NextComment({
  mention: { enabled: true },
  auth: commentAuth,
  storage: commentStorage,
})

// Intercept POST requests to add Discord notification and rate limiting
export async function POST(req: NextRequest, context: any) {
  try {
    // Get parameters and user session
    const params = await context.params
    const commentParams = params.comment || []
    const session = await commentAuth.getSession(req as any)

    // Check if it's a new comment (only 1 segment = projectId)
    const isNewComment = commentParams.length === 1

    // Rate-limit BEFORE reading/parsing the body, so an over-quota user
    // can't force JSON parsing + link stripping on every rejected request.
    if (isNewComment && session) {
      const rateLimit = await checkCommentRateLimit(session.id)
      if (!rateLimit.success) {
        return NextResponse.json(
          {
            message:
              "You've posted too many comments. Please wait a few minutes before adding another one.",
            details: `Rate limit exceeded. You can comment again in ${rateLimit.reset} seconds. You have ${rateLimit.remaining} comments left for this period.`,
            type: "rate_limit_exceeded",
            resetInSeconds: rateLimit.reset,
          },
          { status: 429 },
        )
      }
    }

    // Strip links. Fail closed on a malformed body so it can't bypass link
    // removal by being unparseable.
    let processed: { req: NextRequest; body: Record<string, any> | null }
    try {
      processed = await processRequestWithLinkRemoval(req)
    } catch {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 })
    }

    // Fire the Discord notification for new comments with the stripped content.
    if (isNewComment && session && processed.body?.content) {
      const projectId = commentParams[0]
      const commentText = extractTextFromContent(processed.body.content)
      void sendDiscordCommentNotification(projectId, session.id || "", commentText)
    }

    return commentHandler.POST(processed.req, context)
  } catch (error) {
    console.error("Error intercepting request:", error)
    return NextResponse.json({ message: "Failed to process comment" }, { status: 500 })
  }
}

// Intercept PATCH requests (édition de commentaires) pour aussi supprimer les liens
export async function PATCH(req: NextRequest, context: any) {
  try {
    // Rate-limit edits too (same per-user bucket as new comments) so the
    // edit path can't be used to flood notifications / churn content.
    const session = await commentAuth.getSession(req as any)
    if (session) {
      const rateLimit = await checkCommentRateLimit(session.id)
      if (!rateLimit.success) {
        return NextResponse.json(
          {
            message: "Too many edits. Please wait a moment before trying again.",
            type: "rate_limit_exceeded",
            resetInSeconds: rateLimit.reset,
          },
          { status: 429 },
        )
      }
    }

    let processed: { req: NextRequest; body: Record<string, any> | null }
    try {
      processed = await processRequestWithLinkRemoval(req)
    } catch {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 })
    }
    return commentHandler.PATCH(processed.req, context)
  } catch (error) {
    console.error("Error intercepting PATCH request:", error)
    return NextResponse.json({ message: "Failed to process edit" }, { status: 500 })
  }
}

// Wrappers around fuma-comment's handler methods. Originally added to
// silence Next.js 15 type-compat noise; keeping them through Next 16
// because they're harmless and removing them risks regression.
export async function GET(req: NextRequest, context: any) {
  return commentHandler.GET(req, context)
}

export async function DELETE(req: NextRequest, context: any) {
  return commentHandler.DELETE(req, context)
}
