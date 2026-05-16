import type { Metadata } from "next"
import { Inter, Outfit } from "next/font/google"
import "./globals.css"
import { Navbar } from "@/components/navbar"
import { SessionProvider } from "@/components/session-provider"
import { VenueProvider } from "@/components/venue-context"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
})

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "XIV Venue Manager",
  description: "The ultimate venue management platform for Final Fantasy XIV. Track events, manage staff, monitor sales, and grow your community.",
  icons: {
    icon: [
      { url: "/icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-2048x2048.png", sizes: "2048x2048", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${outfit.variable} antialiased font-sans`}
      >
        <SessionProvider>
          <VenueProvider>
            {/* Skip Navigation Link for Accessibility */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:ring-2 focus:ring-ring focus:outline-none"
            >
              Skip to main content
            </a>
            <Navbar />
            <main id="main-content">
              {children}
            </main>
          </VenueProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
