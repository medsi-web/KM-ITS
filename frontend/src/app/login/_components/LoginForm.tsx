"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

const field =
  "h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-medium text-[#1e2229] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#6b7280] hover:border-navy/60 focus:border-navy focus:shadow-[0_0_0_3px_rgba(36,63,129,0.15)]";

// Messages for the backend error codes (see backend auth handlers); anything else is generic.
const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Nama akun atau kata sandi salah.",
  // The backend answers 503 when MongoDB or APP_ORIGIN is not ready.
  UNAVAILABLE: "Layanan sedang tidak tersedia. Coba lagi nanti.",
};

/** Staggered entrance; the delay is the step index. */
const rise = (i: number) => ({ animationDelay: `${80 + i * 70}ms` });

export default function LoginForm() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: String(data.get("username")).trim(),
          password: String(data.get("password")),
        }),
      });
      if (res.ok) {
        router.replace("/");
        return;
      }
      const body = await res.json().catch(() => null);
      setError(
        res.status === 503
          ? messages.UNAVAILABLE
          : (messages[body?.error?.code] ?? "Gagal masuk. Coba lagi."),
      );
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="kn-rise" style={rise(0)}>
        <label htmlFor="username" className="mb-1.5 block text-sm font-semibold text-[#1e2229]">
          Email atau nama akun <span className="text-danger">*</span>
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="contoh@its.ac.id atau nama_ormawa"
          className={field}
        />
      </div>

      <div className="kn-rise" style={rise(1)}>
        <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-[#1e2229]">
          Kata sandi <span className="text-danger">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Masukkan kata sandi"
            className={`${field} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={show}
            className="absolute right-2 top-1/2 grid h-8 w-9 -translate-y-1/2 place-items-center rounded-md text-[#5b6270] transition-[color,background-color,transform] duration-200 hover:bg-[#eef1f6] hover:text-navy active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-azure"
          >
            <Eye off={show} />
          </button>
        </div>
      </div>

      <div role="alert" aria-live="polite">
        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger animate-[kn-rise_0.3s_ease-out_both]">
            {error}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        style={rise(2)}
        className="kn-rise group -mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-navy text-base font-semibold text-white transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[color-mix(in_srgb,var(--color-navy)_88%,#fff)] hover:shadow-[0_10px_22px_-8px_rgba(36,63,129,0.55)] active:translate-y-0 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        {pending ? "Memproses..." : "Masuk"}
        {!pending && (
          <svg
            aria-hidden
            viewBox="0 0 13.5 13.5"
            className="h-[14px] w-[14px] fill-current transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
          >
            <path d="M6.75 13.5V12H12V1.5H6.75V0H12a1.5 1.5 0 0 1 1.5 1.5V12A1.5 1.5 0 0 1 12 13.5H6.75Zm-1.5-3-1.031-1.088L6.131 7.5H0V6h6.131L4.219 4.088 5.25 3 9 6.75 5.25 10.5Z" />
          </svg>
        )}
      </button>

      <div
        className="kn-rise flex items-start gap-2.5 rounded-lg bg-white p-3 shadow-[0_1px_3px_rgba(30,34,41,0.08)] ring-1 ring-black/5"
        style={rise(3)}
      >
        <Image src="/login/info.svg" alt="" width={18} height={22} className="mt-[-3px] shrink-0" />
        <p className="text-xs leading-[19px] text-[#5b6270]">
          Akun diberikan oleh BEM ITS untuk setiap Ormawa. Tidak tersedia pendaftaran mandiri.
        </p>
      </div>

      <p className="kn-rise text-center text-xs font-medium text-[#5b6270]" style={rise(4)}>
        Lupa kata sandi?{" "}
        {/* shortcut: no support contact exists in the repo; point this at the admin's channel when known. */}
        <Support href="#">Hubungi admin BEM ITS</Support>
      </p>
    </form>
  );
}

function Support({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="group/support inline-flex items-center gap-1 text-sm font-semibold text-azure underline-offset-4 hover:underline focus-visible:underline"
    >
      {children}
      <svg
        aria-hidden
        viewBox="3.98 0 10.5 10.5"
        className="h-[14px] w-[14px] fill-current transition-transform duration-200 group-hover/support:-translate-y-0.5 group-hover/support:translate-x-0.5 motion-reduce:transition-none"
      >
        <path d="M5.148 10.5a1.16 1.16 0 0 1-1.167-1.167V1.167C3.981.525 4.506 0 5.148 0h4.083v1.167H5.148v8.166h8.166V5.25h1.167v4.083c0 .642-.525 1.167-1.167 1.167H5.148Zm2.741-3.092-.816-.816 5.425-5.425h-2.1V0h4.083v4.083h-1.167v-2.1L7.89 7.408Z" />
      </svg>
    </a>
  );
}

function Eye({ off }: { off: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}
