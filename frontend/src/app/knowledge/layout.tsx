import type { ReactNode } from "react";
import Navbar from "../_components/Navbar";
import Batik from "./_components/Batik";

export default function KnowledgeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="relative flex flex-1 flex-col overflow-hidden bg-white">
        <Batik />
        <main className="relative z-10 flex flex-1 flex-col pb-16 pt-28 md:pt-[111px]">
          {children}
        </main>
      </div>
    </>
  );
}
