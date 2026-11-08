import type { Metadata } from "next";
import { Archivo_Black, Geist, Geist_Mono, VT323 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const vt323 = VT323({ variable: "--font-vt323", weight: "400", subsets: ["latin"] });
const archivo = Archivo_Black({ variable: "--font-archivo", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Outfit Lab",
  description: "Build and score outfits with a Polyvore compatibility model.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${vt323.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
