"use client"

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth"

import { auth } from "@/firebase/config"
import { getAuthErrorMessage } from "@/lib/firebaseErrors"
import { cn } from "@/utils/cn"
import { useAuth } from "@/context/AuthContext"
import { POST_LOGIN_REDIRECT_KEY } from "@/components/common/AuthGuard"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [googleBusy, setGoogleBusy] = React.useState(false)

  // Return to the deep link that bounced the user here, else the default route.
  const destinationAfterLogin = React.useCallback(() => {
    try {
      const target = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)
      sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
      if (target && target.startsWith("/") && !target.startsWith("//")) {
        return target
      }
    } catch {
      /* private mode */
    }
    return "/campaigns"
  }, [])

  React.useEffect(() => {
    if (!loading && user) {
      router.replace(destinationAfterLogin())
    }
  }, [loading, user, router, destinationAfterLogin])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.push(destinationAfterLogin())
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleGoogleLogin() {
    setError(null)
    setGoogleBusy(true)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
      router.push(destinationAfterLogin())
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setGoogleBusy(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="mystic-panel overflow-hidden p-0 ring-1 ring-border/70 shadow-[0_1px_0_0_var(--sheen)_inset,0_40px_90px_-45px_var(--halo)]">
        <CardContent className="grid p-0 md:grid-cols-[1.05fr_1fr]">
          <form className="p-7 md:p-10" onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="flex flex-col gap-2">
                <p className="label-rune text-primary/85">Hẻm Tarot</p>
                <h1 className="font-heading text-3xl leading-tight font-semibold tracking-[-0.02em]">
                  Mở cánh cửa
                  <span className="text-gilded"> Hẻm</span>
                </h1>
                <p className="text-balance text-sm text-muted-foreground">
                  Đăng nhập để tiếp tục điều phối nội dung cùng cả đội.
                </p>
                <div aria-hidden className="rune-divider mt-2" />
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <Field>
                <FieldLabel htmlFor="email" className="label-rune">
                  Email
                </FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="ten@hemtarot.vn"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password" className="label-rune">
                  Mật khẩu
                </FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <Button
                  type="submit"
                  size="lg"
                  className="h-10 w-full text-[0.9375rem]"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Đang mở cửa…" : "Đăng nhập"}
                </Button>
              </Field>

              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                hoặc
              </FieldSeparator>

              <Field>
                <Button
                  variant="outline"
                  type="button"
                  size="lg"
                  className="h-10 w-full gap-2.5 text-[0.9375rem]"
                  onClick={handleGoogleLogin}
                  disabled={googleBusy}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="size-[18px]"
                  >
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  {googleBusy ? "Đang kết nối…" : "Tiếp tục với Google"}
                </Button>
              </Field>

              <FieldDescription className="text-center text-xs">
                Chỉ dành cho thành viên Hẻm Tarot.
              </FieldDescription>
            </FieldGroup>
          </form>

          {/* Cánh cửa: vầng hào quang xoay chậm sau dấu ấn thương hiệu */}
          <div className="relative hidden overflow-hidden bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklch,var(--primary),black_38%),oklch(0.12_0.03_288)_62%,oklch(0.08_0.02_286))] md:block">
            <div
              aria-hidden
              className="absolute top-1/2 left-1/2 size-[132%] -translate-x-1/2 -translate-y-1/2 opacity-45 blur-[2px]"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0%, color-mix(in oklch, var(--gold), transparent 55%) 12%, transparent 26%, color-mix(in oklch, var(--primary), transparent 40%) 48%, transparent 62%, color-mix(in oklch, var(--gold), transparent 62%) 80%, transparent 92%)",
                maskImage:
                  "radial-gradient(circle at 50% 50%, transparent 33%, black 43%, black 64%, transparent 74%)",
                WebkitMaskImage:
                  "radial-gradient(circle at 50% 50%, transparent 33%, black 43%, black 64%, transparent 74%)",
                animation: "slow-spin 44s linear infinite",
              }}
            />
            <div
              aria-hidden
              className="absolute top-1/2 left-1/2 size-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl"
              style={{ animation: "glow-pulse 7s ease-in-out infinite" }}
            />
            {/* Logo là nét trắng trên nền đen đặc — blend "screen" khử nền đen
                để dấu ấn nổi thẳng trên vầng hào quang, không thành ô vuông đen */}
            <Image
              src="/hem-tarot-logo.png"
              alt="Hẻm Tarot"
              fill
              priority
              sizes="(min-width: 768px) 45vw, 0px"
              className="relative object-contain p-12 mix-blend-screen"
            />
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 p-6 text-center"
            >
              <span className="rune-divider w-24" />
              <p className="label-rune text-[0.5625rem] text-white/55">
                Content Performance Studio
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
