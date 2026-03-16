import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SuperLiving | Ad Generator",
  description:
    "Transform your scripts into high-impact video ads for Tier 3 & 4 India · Powered by AI",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
