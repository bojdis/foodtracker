import type { Metadata, Viewport } from "next";
import { PwaServiceWorker } from "@/components/PwaServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "FoodTracker – Kalorie & Makra",
  description:
    "Osobní mobilní deník kalorického příjmu, výdeje, makroživin a pravidelných jídel s AI agenty na pozadí.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FoodTracker",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#090d16" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className="antialiased">
      <body className="min-h-dvh bg-slate-50 text-slate-900 selection:bg-emerald-500/20 selection:text-emerald-700 dark:bg-[#090d16] dark:text-slate-100 dark:selection:bg-emerald-300">
        <PwaServiceWorker />
        {children}
      </body>
    </html>
  );
}
