import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Galaxy CMMC Portal",
  description: "CMMC Compliance Assessment Platform — Galaxy Consulting, LLC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
