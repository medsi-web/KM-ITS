import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Navbar from "./(portal)/_components/Navbar";
import "./(portal)/_components/portal.css";

export const metadata: Metadata = {
  title: "404 - Halaman Tidak Ditemukan | Portal KM ITS",
};

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 items-center justify-center bg-white px-6 pt-16 pb-12">
        <div className="flex max-w-xl flex-col items-center text-center">
          <p className="whitespace-nowrap text-6xl font-bold leading-none text-navy sm:text-7xl md:text-7xl">
            Error 404
          </p>
          <h1 className="mt-6 text-3xl font-bold text-black md:text-4xl">
            Halaman Tidak Ditemukan
          </h1>
          <p className="mt-4 text-sm text-ink md:text-base">
            Alamat yang kamu tuju tidak tersedia atau sudah dipindahkan. Kembali
            ke beranda untuk melanjutkan.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-2 rounded-[5px] bg-navy px-5 py-3 text-sm font-semibold text-white md:text-base"
          >
            Kembali ke Beranda
            <Image src="/portal/icon-chevron.svg" alt="" width={5} height={8} />
          </Link>
        </div>
      </main>
      <footer aria-hidden className="h-12 rounded-t-[10px] bg-navy md:h-16" />
    </>
  );
}
