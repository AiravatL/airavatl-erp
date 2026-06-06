import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppQueryProvider } from "@/components/providers/query-provider";
import { AuthInit } from "@/lib/auth/auth-context";
import { PwaRegister } from "@/components/pwa/pwa-register";
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
  title: "AiravatL ERP",
  description: "Internal ERP for AiravatL Logistics",
  applicationName: "AiravatL ERP",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AiravatL ERP",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/airavat-logo.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4c1d95",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppQueryProvider>
          <AuthInit>{children}</AuthInit>
        </AppQueryProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
