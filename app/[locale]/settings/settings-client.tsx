"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"

import {
  RiEditLine,
  RiLockPasswordLine,
  RiLogoutCircleLine,
  RiShieldUserLine,
  RiUserLine,
} from "@remixicon/react"
import { Loader2, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { changePassword, signOut, updateUser, useSession } from "@/lib/auth-client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function SettingsClient() {
  const { data: session } = useSession()
  const router = useRouter()
  const t = useTranslations("settingsPage")

  // The server wrapper guarantees a session; useSession can briefly be
  // null while hydrating.
  if (!session) {
    return null
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-10">
      <div className="mb-8 border-b pb-6 dark:border-zinc-800">
        <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="space-y-10">
        <section>
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2.5">
              <RiUserLine className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-semibold">{t("profileTitle")}</h2>
              <p className="text-muted-foreground text-sm">{t("profileDesc")}</p>
            </div>
          </div>

          <div className="bg-card rounded-xl border p-6 shadow-sm dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarImage
                    src={session.user.image || undefined}
                    alt="Avatar"
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {session.user.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-medium">{session.user.name}</p>
                  <p className="text-muted-foreground max-w-[170px] truncate text-sm">
                    {session.user.email}
                  </p>
                </div>
              </div>
              <EditProfileDialog />
            </div>
          </div>
        </section>

        <section>
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2.5">
              <RiShieldUserLine className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-semibold">{t("securityTitle")}</h2>
              <p className="text-muted-foreground text-sm">{t("securityDesc")}</p>
            </div>
          </div>

          <div className="bg-card rounded-xl border p-6 shadow-sm dark:border-zinc-800">
            <h3 className="mb-1 text-base font-medium">{t("passwordTitle")}</h3>
            <p className="text-muted-foreground mb-4 text-sm">{t("passwordDesc")}</p>
            <ChangePasswordDialog />
          </div>
        </section>

        <section>
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2.5">
              <RiLogoutCircleLine className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-semibold">{t("sessionTitle")}</h2>
              <p className="text-muted-foreground text-sm">{t("sessionDesc")}</p>
            </div>
          </div>

          <div className="bg-card rounded-xl border p-6 shadow-sm dark:border-zinc-800">
            <div>
              <h3 className="mb-1 text-base font-medium">{t("currentSessionTitle")}</h3>
              <p className="text-muted-foreground mb-4 text-sm">{t("currentSessionDesc")}</p>
              <Button
                variant="destructive"
                className="hover:bg-destructive/90 cursor-pointer gap-2"
                onClick={() => {
                  signOut({
                    fetchOptions: {
                      onSuccess: () => {
                        router.push("/")
                        router.refresh()
                      },
                    },
                  })
                }}
              >
                <RiLogoutCircleLine className="h-4 w-4" />
                {t("signOut")}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function EditProfileDialog() {
  const { data: session } = useSession()
  const router = useRouter()
  const t = useTranslations("settingsPage")
  const [name, setName] = useState<string>("")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 1024 * 1024) {
      toast.error(t("imageTooBig"))
      e.target.value = ""
      return
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.type)) {
      toast.error(t("imageBadType"))
      e.target.value = ""
      return
    }

    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="hover:bg-primary/5 cursor-pointer gap-2">
          <RiEditLine className="text-primary h-4 w-4" />
          <span className="hover:text-primary hidden md:block">{t("editProfile")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-xl border sm:max-w-[425px] dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl font-semibold">
            {t("editProfileTitle")}
          </DialogTitle>
          <DialogDescription>{t("editProfileDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="name" className="font-medium">
              {t("nameLabel")}
            </Label>
            <Input
              id="name"
              placeholder={session?.user.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border dark:border-zinc-700"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="image" className="font-medium">
              {t("profileImageLabel")}
            </Label>
            <div className="flex items-end gap-4">
              {imagePreview && (
                <div className="border-primary/10 relative h-16 w-16 overflow-hidden rounded-md border-2">
                  <Image src={imagePreview} alt="Profile preview" layout="fill" objectFit="cover" />
                </div>
              )}
              <div className="flex w-full items-center gap-2">
                <Input
                  id="image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  onChange={handleImageChange}
                  className="w-full cursor-pointer border dark:border-zinc-700"
                />
                {imagePreview && (
                  <X
                    className="hover:text-destructive cursor-pointer"
                    onClick={() => {
                      setImage(null)
                      setImagePreview(null)
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button
            disabled={isLoading}
            onClick={async () => {
              setIsLoading(true)
              try {
                let imageUrl: string | undefined
                if (image) {
                  const formData = new FormData()
                  formData.append("file", image)
                  formData.append("folder", "avatars")
                  const response = await fetch("/api/upload", { method: "POST", body: formData })
                  const payload = (await response.json()) as { fileUrl?: string; error?: string }
                  if (!response.ok || !payload.fileUrl) {
                    throw new Error(payload.error || t("uploadFailed"))
                  }
                  imageUrl = payload.fileUrl
                }

                await updateUser({
                  name: name || undefined,
                  image: imageUrl,
                })
                toast.success(t("profileUpdated"))
                router.refresh()
                setOpen(false)
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t("profileUpdateFailed"))
              }
              setIsLoading(false)
              setName("")
              setImage(null)
              setImagePreview(null)
            }}
            className="bg-primary hover:bg-primary/90 cursor-pointer"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChangePasswordDialog() {
  const t = useTranslations("settingsPage")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="hover:bg-primary/5 hover:text-primary max-w-fit cursor-pointer justify-start gap-2"
        >
          <RiLockPasswordLine className="text-primary h-4 w-4" />
          {t("changePassword")}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-xl border sm:max-w-[425px] dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl font-semibold">
            {t("changePasswordTitle")}
          </DialogTitle>
          <DialogDescription>{t("changePasswordDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="current" className="font-medium">
              {t("currentPassword")}
            </Label>
            <Input
              id="current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="border dark:border-zinc-700"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new" className="font-medium">
              {t("newPassword")}
            </Label>
            <Input
              id="new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="border dark:border-zinc-700"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm" className="font-medium">
              {t("confirmPassword")}
            </Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="border dark:border-zinc-700"
            />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button
            disabled={loading}
            onClick={async () => {
              if (newPassword !== confirmPassword) {
                toast.error(t("passwordsMismatch"))
                return
              }
              if (newPassword.length < 8) {
                toast.error(t("passwordTooShort"))
                return
              }
              setLoading(true)
              try {
                await changePassword({
                  currentPassword,
                  newPassword,
                })
                toast.success(t("passwordChanged"))
                setOpen(false)
              } catch {
                toast.error(t("passwordChangeFailed"))
              }
              setLoading(false)
              setCurrentPassword("")
              setNewPassword("")
              setConfirmPassword("")
            }}
            className="bg-primary hover:bg-primary/90 cursor-pointer"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("changePassword")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
