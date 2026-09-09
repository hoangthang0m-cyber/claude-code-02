import { Geist_Mono, Inter, Playfair_Display } from "next/font/google"

import "./globals.css"
import { MysticBackground } from "@/components/common/MysticBackground"
import { AppProviders } from "@/providers/AppProviders"
import { cn } from "@/utils/cn";

// Thân bài: Inter — kèm subset "vietnamese" để chữ có dấu không bị fallback.
const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-sans",
})

// Tiêu đề: Playfair Display — serif tương phản cao, có đủ dấu tiếng Việt.
const fontDisplay = Playfair_Display({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        fontDisplay.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body className="relative min-h-svh">
        <AppProviders>
          <MysticBackground />
          {children}
        </AppProviders>
      </body>
    </html>
  )
}
