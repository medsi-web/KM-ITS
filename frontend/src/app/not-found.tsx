import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "404 - Halaman Tidak Ditemukan | Portal KM ITS",
};

const button =
  "flex h-11 items-center gap-2 rounded-lg px-5 text-base shadow-[0_1px_1px_rgba(0,0,0,0.05)]";

export default function NotFound() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-ink px-6 py-24 text-center text-white">
      <Image
        src="/not-found/photo.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
        style={{ objectPosition: "50% 62%" }}
      />
      <div aria-hidden className="absolute inset-0 bg-[rgba(44,44,48,0.36)]" />
      <div aria-hidden className="absolute inset-0 bg-black/[0.41]" />

      <div className="relative flex flex-col items-center">
        <h1 className="text-[72px] leading-[104px] font-normal tracking-[-0.025em] md:text-[96px]">
          404
        </h1>
        <h2 className="mt-2 text-base leading-6 font-normal">
          Halaman Tidak Ditemukan
        </h2>
        <p className="mt-3 max-w-[496px] text-base leading-[26px]">
          Maaf, halaman atau tautan yang kamu tuju tidak tersedia, telah
          dipindahkan, atau alamat URL yang dimasukkan salah. Silakan periksa
          kembali tautan Anda.
        </p>
        <div className="mt-[59px] flex flex-wrap items-center justify-center gap-[14px]">
          <Link href="/" className={`${button} bg-white text-[#1e2229]`}>
            <span className="relative h-[13.5px] w-[12px]">
              <Image src="/not-found/icon-home.svg" alt="" fill sizes="12px" />
            </span>
            Kembali ke Beranda
          </Link>
          <Link href="/knowledge" className={`${button} bg-navy text-white`}>
            <span className="relative size-[15px]">
              <Image
                src="/not-found/icon-knowledge.svg"
                alt=""
                fill
                sizes="15px"
              />
            </span>
            Jelajahi Knowledge
          </Link>
        </div>
      </div>
    </main>
  );
}
