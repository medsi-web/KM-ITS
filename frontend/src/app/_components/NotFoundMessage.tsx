import Image from "next/image";
import Link from "next/link";

/**
 * Centered "Error 404" block. `inLayout` is for segments whose layout already
 * provides the navbar space (e.g. /knowledge), so no extra top padding is added.
 */
export default function NotFoundMessage({
  inLayout = false,
}: {
  inLayout?: boolean;
}) {
  return (
    <section
      className={`flex flex-1 items-center justify-center bg-white px-6 pb-12 ${
        inLayout ? "pt-0" : "pt-16"
      }`}
    >
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
    </section>
  );
}
