import { LoginForm } from "@/components/forms/LoginForm"

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="animate-in fade-in zoom-in-95 w-full max-w-sm duration-400 md:max-w-4xl">
        <LoginForm />
      </div>
    </div>
  )
}
