import type { Metadata } from "next";
import Navbar from "@/app/_components/Navbar";
import NotFoundMessage from "@/app/_components/NotFoundMessage";

export const metadata: Metadata = {
  title: "404 - Halaman Tidak Ditemukan | Portal KM ITS",
};

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 flex-col">
        <NotFoundMessage />
      </main>
      <footer aria-hidden className="h-12 rounded-t-[10px] bg-navy md:h-16" />
    </>
  );
}
