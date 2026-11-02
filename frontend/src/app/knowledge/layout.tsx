import type { ReactNode } from "react";
import Footer from "../_components/Footer";
import Navbar from "../_components/Navbar";
import Batik from "./_components/Batik";

export default function KnowledgeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="relative flex flex-1 flex-col overflow-hidden bg-white">
        <Batik />
        <main className="relative z-10 flex flex-1 flex-col pt-28 md:pt-[111px]">
          {children}
        </main>
        <div className="relative z-10 mt-16">
          <Footer />
        </div>
      </div>
    </>
  );
}
