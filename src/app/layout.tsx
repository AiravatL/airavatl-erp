import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppQueryProvider } from "@/components/providers/query-provider";
import { AuthInit } from "@/lib/auth/auth-context";
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
      </body>
    </html>
  );
}
