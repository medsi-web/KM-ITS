import Image from "next/image";
import type { ReactNode } from "react";
import "./login.css";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen flex-1 lg:grid-cols-[36fr_64fr]">
      <section
        className="flex items-center justify-center px-6 py-12 lg:px-[4.2%]"
        style={{
          backgroundImage:
            "linear-gradient(196deg, #fefefe 44.6%, rgba(18, 123, 190, 0.6) 205.7%)",
        }}>
        <div className="w-full max-w-[400px]">{children}</div>
      </section>

      <aside
        aria-hidden
        className="relative hidden overflow-hidden bg-ink lg:block">
        <Image
          src="/login/photo.png"
          alt=""
          fill
          priority
          sizes="64vw"
          className="ln-photo object-cover"
        />
        <div className="absolute inset-0 bg-[rgba(44,44,48,0.54)]" />
        <p className="absolute bottom-7 right-7 text-[17px] text-white">
          Badan Eksekutif Mahasiswa ITS 2026
        </p>
      </aside>
    </main>
  );
}
