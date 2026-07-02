import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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
  description: "Deployment-aware campaign protection MVP",
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
                Exceptions
              </Link>
              <Link href="/sources" className="hover:text-slate-900">
                Sources
              </Link>
              <Link href="/architecture" className="hover:text-slate-900">
                Architecture
              </Link>
            </nav>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
