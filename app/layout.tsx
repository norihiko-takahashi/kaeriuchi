import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import { AppStateProvider } from "@/components/app-state";
import { SwUpdateProvider } from "@/components/sw-update";
import "./globals.css";

export const metadata: Metadata = {
  title: "かえりうち",
  description: "まちがえた もんだいを とって、ミスモンを かえりうちに しよう",
  applicationName: "かえりうち",
  appleWebApp: {
    capable: true,
    title: "かえりうち",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#c2410c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" data-mode="junior">
      <body className="min-h-dvh">
        <SerwistProvider
          swUrl="/serwist/sw.js"
          disable={process.env.NODE_ENV === "development"}
        >
          <SwUpdateProvider>
            <AppStateProvider>{children}</AppStateProvider>
          </SwUpdateProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
