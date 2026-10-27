import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Arka Day Tracker",
  description:
    "Track Allan's daily tasks, log supplier research, and auto-build an end-of-day report.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="shell">
          <Sidebar />
          {children}
        </div>
      </body>
    </html>
  );
}
