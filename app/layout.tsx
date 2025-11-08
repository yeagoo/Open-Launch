import type { Metadata } from "next"
import { Outfit as FontHeading, Inter as FontSans } from "next/font/google"
import Script from "next/script"

import { Toaster } from "sonner"

import Footer from "@/components/layout/footer"
import Nav from "@/components/layout/nav"
import { ThemeProvider } from "@/components/theme/theme-provider"

import "./globals.css"

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontHeading = FontHeading({
  subsets: ["latin"],
  variable: "--font-heading",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL!),
  title: "aat.ee – Discover New Startups, AI Tools & Product Launches | Product Hunt Alternative",
  description:
    "Explore the latest startups, AI tools, and SaaS launches on aat.ee — the modern Product Hunt alternative for makers and early adopters. Submit your own product, get discovered by a global tech audience, and grow your launch visibility.",
  keywords: [
    "aat.ee",
    "product discovery",
    "startup directory",
    "AI tools",
    "SaaS launches",
    "product hunt alternative",
    "startup community",
    "new product launch",
    "tech startups",
    "indie makers",
    "AI software",
    "app discovery",
    "early adopters platform",
  ],
  openGraph: {
    title: "aat.ee – Discover New Startups, AI Tools & Product Launches | Product Hunt Alternative",
    description:
      "Explore the latest startups, AI tools, and SaaS launches on aat.ee — the modern Product Hunt alternative for makers and early adopters. Submit your own product, get discovered by a global tech audience, and grow your launch visibility.",
    url: process.env.NEXT_PUBLIC_URL,
    siteName: "aat.ee",
    images: [
      {
        url: "og.png",
        width: 1200,
        height: 630,
        alt: "aat.ee – Discover New Startups, AI Tools & Product Launches",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "aat.ee – Discover New Startups, AI Tools & Product Launches | Product Hunt Alternative",
    description:
      "Explore the latest startups, AI tools, and SaaS launches on aat.ee — the modern Product Hunt alternative for makers and early adopters. Submit your own product, get discovered by a global tech audience, and grow your launch visibility.",
    images: ["og.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-RR1YB886D7"

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google Analytics */}
        {process.env.NODE_ENV === "production" && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
      </head>
      <body
        className={`font-sans antialiased ${fontSans.variable} ${fontHeading.variable} sm:overflow-y-scroll`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-dvh flex-col">
            <Nav />
            <main className="flex-grow">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  )
}
