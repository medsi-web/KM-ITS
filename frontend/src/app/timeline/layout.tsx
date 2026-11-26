import type { ReactNode } from "react";
import Footer from "../_components/Footer";
import Navbar from "../_components/Navbar";

export default function TimelineLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="flex flex-1 flex-col bg-white">
        <main className="flex flex-1 flex-col pb-16 pt-28 md:pt-[111px]">{children}</main>
      </div>
      <Footer />
    </>
  );
}
