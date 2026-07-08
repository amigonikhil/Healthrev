import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RK Recovery Ops",
  description:
    "Back-office operations platform for RK Solutions — HDFC 4-wheeler loan recovery.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
