import { stripeClient } from "@better-auth/stripe/client"
import { adminClient, oneTapClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

const authClient = createAuthClient({
  // No baseURL is intentional: in the browser Better Auth uses the current
  // origin. This keeps localized/custom-domain visits same-origin and avoids
  // bundling a server-only BETTER_AUTH_URL or the retired open-launch.com host.
  plugins: [
    stripeClient({
      subscription: true, //if you want to enable subscription management
    }),
    oneTapClient({
      clientId: process.env.NEXT_PUBLIC_ONE_TAP_CLIENT_ID!,
      promptOptions: {
        maxAttempts: 1,
      },
    }),
    adminClient(),
  ],
})

export const {
  signIn,
  signUp,
  useSession,
  signOut,
  getSession,
  updateUser,
  changePassword,
  resetPassword,
  oneTap,
  admin,
} = authClient

export const forgetPassword = authClient.requestPasswordReset
