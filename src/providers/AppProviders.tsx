import { AuthProvider } from "@/context/AuthContext"
import { ThemeProvider } from "@/providers/ThemeProvider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  )
}
