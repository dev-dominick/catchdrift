import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const siteDescription =
  "AI-assisted tracking failure detection for active ad campaigns, with deterministic incident evidence, exposure estimates, and recovery verification.";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CatchDrift",
  description: siteDescription,
  metadataBase: new URL("https://catchdrift.media"),
  openGraph: {
    title: "CatchDrift",
    description: siteDescription,
    url: "https://catchdrift.media/",
    siteName: "CatchDrift",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CatchDrift",
    description: siteDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-100 text-slate-900">
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <Link href="/" className="text-sm font-semibold tracking-wide text-slate-900">
              CatchDrift
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-700">
              <Link href="/incidents" className="hover:text-slate-900">
                Incidents
              </Link>
              <Link href="/sources" className="hover:text-slate-900">
                Demo environment
              </Link>
            </nav>
          </div>
        </div>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 py-3 sm:px-6 lg:px-8">
            <a
              href="https://github.com/dev-dominick/catchdrift#technical-notes"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-500 underline hover:text-slate-700"
            >
              Technical notes
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
