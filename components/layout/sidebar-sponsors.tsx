"use client"

import Image from "next/image"
import Link from "next/link"

import { ExternalLink } from "lucide-react"

interface Sponsor {
  name: string
  description: string
  url: string
  logoUrl: string
}

const sponsors: Sponsor[] = [
  {
    name: "ii.Pe",
    description: "A zero-upload, browser-based file conversion tool.",
    url: "https://ii.pe",
    logoUrl:
      "https://www.aat.ee/_next/image?url=https%3A%2F%2Fstatics.aat.ee%2Flogos%2F1768923821937-3jd6itzhhxa.avif&w=128&q=95",
  },
  {
    name: "ScreenHello",
    description: "Beautiful Screenshots in Seconds | Online Mockup Generator",
    url: "https://screenhello.com",
    logoUrl:
      "https://www.aat.ee/_next/image?url=https%3A%2F%2Fstatics.aat.ee%2Flogos%2F1768924192870-5aa3cxgphay.avif&w=128&q=75",
  },
]

export function SidebarSponsors() {
  return (
    <div className="space-y-4 py-4">
      <h3 className="flex items-center gap-2 font-semibold">Sponsors</h3>
      <div className="space-y-3">
        {sponsors.map((sponsor) => (
          <Link
            key={sponsor.name}
            href={sponsor.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="group hover:bg-muted/50 block rounded-lg border p-3 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="bg-background shrink-0 overflow-hidden rounded-md border p-1">
                <Image
                  src={sponsor.logoUrl}
                  alt={`${sponsor.name} Logo`}
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-foreground group-hover:text-primary text-sm font-medium transition-colors">
                    {sponsor.name}
                  </span>
                  <ExternalLink className="text-muted-foreground h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="text-muted-foreground line-clamp-2 text-xs">{sponsor.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
