import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "./RegisterServiceWorker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "喫煙所ファインダー｜現在地から一番近い喫煙所を探す",
  description:
    "コンビニ・飲食店の口コミをAIが解析し、現在地から一番近い喫煙所を地図とリストで検索できます。紙タバコ・電子タバコ・店外灰皿の有無で色分け表示。",
  manifest: "/manifest.json",
  icons: {
    icon: ["/icons/icon-192.png", "/icons/icon-512.png"],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
