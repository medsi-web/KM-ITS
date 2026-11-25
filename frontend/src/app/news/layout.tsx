import type { ReactNode } from "react";
import Footer from "../_components/Footer";
import Navbar from "../_components/Navbar";

export default function NewsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="relative flex flex-1 flex-col overflow-hidden bg-white">
        {/* Blue fade behind the bottom of the page; its lower part sits under the footer. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-[-148px] h-[555px] bg-gradient-to-b from-[rgba(244,246,248,0)] to-[rgba(18,123,190,0.6)]"
        />
        <main className="relative z-10 flex flex-1 flex-col pb-10 pt-28 md:pt-[111px]">
          {children}
        </main>
      </div>
      <Footer />
    </>
  );
}
