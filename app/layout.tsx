import type { Metadata } from "next";
import "./globals.css";
import "./liquid-glass.css";

export const metadata: Metadata = {
  title: "WemryOS for Business · Your team. One workspace.",
  description: "WemryOS for Business — Your team. One workspace. Projekti, naloge in sodelovanje za tvojo ekipo.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="sl"><body>{children}</body></html>;
}
