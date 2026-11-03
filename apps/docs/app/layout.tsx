import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";

export const metadata: Metadata = {
  title: "Vaeltrix Docs",
  description:
    "Testnet. Documentation for the Vaeltrix protocol - contracts, SDK, SLA templates, and integration guides.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="flex flex-col min-h-screen">
        <RootProvider theme={{ attribute: ["class", "data-theme"], defaultTheme: "dark" }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
