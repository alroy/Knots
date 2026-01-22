import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knots - Smart Task Manager",
  description: "Your intelligent task manager that learns from your workflow",
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
