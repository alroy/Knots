import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Todo App",
  description: "Intelligent todo app that learns from your Slack, Monday.com, and Google Drive",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
