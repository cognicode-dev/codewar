import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coding Arena",
  description: "Competitive multiplayer coding platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">{children}</body>
    </html>
  );
}
