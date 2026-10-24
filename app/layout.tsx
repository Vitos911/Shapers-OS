import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shapers OS · Skupaj ustvarjamo spremembe",
  description: "Delovni prostor za projekte, dogodke in prostovoljske ure skupnosti Shapers.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="sl"><body>{children}</body></html>;
}
