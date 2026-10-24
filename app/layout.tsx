import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import Navbar from "./components/Navbar";
import "./globals.css";
import "./components/portal.css";

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Portal KM ITS",
  description: "Arsip, agenda, dan berita KM ITS terintegrasi dalam 1 platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${workSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
