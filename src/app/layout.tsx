import { Geist, Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { AppProviders } from "@/providers/AppProviders"
import { cn } from "@/utils/cn";

const inter = Inter({subsets:['latin'],variable:'--font-sans'})

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
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
