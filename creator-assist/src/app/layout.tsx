import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import { ToastFromQuery, ToastProvider } from "@/components/client";
import { FeedbackButton } from "@/components/feedback";
import "./globals.css";

const space = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-space", display: "swap" });

export const metadata: Metadata = {
  title: "Creator Assist",
  description: "Get paid on time for every brand deal. Agreements, GST invoices, reminders and TDS tracking for Indian creators.",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F4EE" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={space.variable}>
      <body>
        <ToastProvider>
          <div className="phone">
            {children}
            <FeedbackButton />
          </div>
          <Suspense><ToastFromQuery /></Suspense>
        </ToastProvider>
        <Analytics />
      </body>
    </html>
  );
}
