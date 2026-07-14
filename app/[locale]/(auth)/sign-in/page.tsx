import { getTranslations } from "next-intl/server"

import { SignInForm } from "@/components/auth/sign-in-form"

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [{ error }, t] = await Promise.all([searchParams, getTranslations("auth.signIn")])
  const initialError = oauthErrorMessage(error, t)

  return (
    <div className="mx-auto flex min-h-screen max-w-sm items-center justify-center">
      <SignInForm initialError={initialError} />
    </div>
  )
}

function oauthErrorMessage(
  error: string | undefined,
  t: Awaited<ReturnType<typeof getTranslations<"auth.signIn">>>,
): string | undefined {
  if (!error) return undefined
  if (error === "account_not_linked") return t("accountNotLinkedError")
  if (error.startsWith("state_") || error === "state_mismatch") return t("oauthStateError")
  return t("oauthGenericError")
}
