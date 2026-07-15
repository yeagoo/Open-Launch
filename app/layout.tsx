import { Suspense } from "react"
import type { Metadata } from "next"
import {
  IBM_Plex_Serif as FontEditorial,
  Outfit as FontHeading,
  Inter as FontSans,
} from "next/font/google"
import Script from "next/script"

import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { Toaster } from "sonner"

import {
  MATOMO_BASE_URL,
  MATOMO_SENSITIVE_QUERY_PARAMETERS,
  MATOMO_SITE_ID,
} from "@/lib/analytics/matomo"
import { footerNavSites } from "@/lib/directories-links"
import { MatomoRouteTracker } from "@/components/analytics/matomo-route-tracker"
import Footer from "@/components/layout/footer"
import Nav from "@/components/layout/nav"
import { OrganizationSchema } from "@/components/seo/structured-data"
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

// Editorial-feel serif used for the editorial home feed's hero titles
// and section labels. Loaded with restricted weights to keep the bundle
// small.
const fontEditorial = FontEditorial({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-editorial",
})

const publicBaseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

export const metadata: Metadata = {
  metadataBase: new URL(publicBaseUrl),
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
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "aat.ee – Discover New Startups, AI Tools & Product Launches | Product Hunt Alternative",
    description:
      "Explore the latest startups, AI tools, and SaaS launches on aat.ee — the modern Product Hunt alternative for makers and early adopters. Submit your own product, get discovered by a global tech audience, and grow your launch visibility.",
    url: publicBaseUrl,
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
    site: "@aat_ee",
    creator: "@aat_ee",
    title: "aat.ee – Discover New Startups, AI Tools & Product Launches | Product Hunt Alternative",
    description:
      "Explore the latest startups, AI tools, and SaaS launches on aat.ee — the modern Product Hunt alternative for makers and early adopters. Submit your own product, get discovered by a global tech audience, and grow your launch visibility.",
    images: ["og.png"],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-RR1YB886D7"
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
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

            {/* Matomo Analytics: the bootstrap tracks the initial page load. */}
            <Script id="matomo-analytics" strategy="afterInteractive">
              {`
                var _paq = window._paq = window._paq || [];
                var matomoUrl = new URL(window.location.href);
                var sensitiveParameters = new Set(${JSON.stringify(MATOMO_SENSITIVE_QUERY_PARAMETERS)});
                Array.from(matomoUrl.searchParams.keys()).forEach(function(parameter) {
                  if (sensitiveParameters.has(parameter.toLowerCase())) {
                    matomoUrl.searchParams.delete(parameter);
                  }
                });
                _paq.push(['setCustomUrl', matomoUrl.toString()]);
                _paq.push(['trackPageView']);
                _paq.push(['enableLinkTracking']);
                (function() {
                  var u=${JSON.stringify(MATOMO_BASE_URL)};
                  _paq.push(['setTrackerUrl', u+'matomo.php']);
                  _paq.push(['setSiteId', ${JSON.stringify(MATOMO_SITE_ID)}]);
                  var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
                  g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
                })();
              `}
            </Script>
          </>
        )}

        {/* RSS Feed */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="aat.ee RSS Feed"
          href={`${publicBaseUrl}/feed.xml`}
        />

        {/* Structured Data - Organization Schema */}
        <OrganizationSchema />
      </head>
      <body
        className={`font-sans antialiased ${fontSans.variable} ${fontHeading.variable} ${fontEditorial.variable} sm:overflow-y-scroll`}
        suppressHydrationWarning
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <div className="flex min-h-dvh flex-col">
              <Nav />
              <main className="flex-grow">{children}</main>
              <Footer navSites={footerNavSites} />
            </div>
          </ThemeProvider>
          <Toaster />
          {process.env.NODE_ENV === "production" && (
            <Suspense fallback={null}>
              <MatomoRouteTracker />
            </Suspense>
          )}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
