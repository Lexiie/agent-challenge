import type { Metadata } from "next";
import { Cabin_Condensed, Geist_Mono } from "next/font/google";
import { CopilotKit } from "@copilotkit/react-core";
import "./globals.css";
import "@copilotkit/react-ui/styles.css";

const cabinCondensed = Cabin_Condensed({
  variable: "--font-cabin-condensed",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lablr",
  description: "Drop label photos for quick ingredient insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${cabinCondensed.variable} ${geistMono.variable} antialiased`}>
        <CopilotKit runtimeUrl="/api/copilotkit" agent="weatherAgent">
          {children}
        </CopilotKit>
      </body>
    </html>
  );
}
