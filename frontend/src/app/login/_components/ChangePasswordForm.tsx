"use client";

import { useState, type FormEvent } from "react";
import { field } from "./LoginForm";

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Kata sandi lama salah.",
  PASSWORD_UNCHANGED: "Kata sandi baru harus berbeda dari yang lama.",
  UNAUTHENTICATED: "Sesi sudah berakhir. Masuk lagi, lalu ulangi.",
  CSRF_REJECTED: "Buka situs ini dari alamat resmi portal, lalu coba lagi.",
};

const inputs = [
  { name: "oldPassword", label: "Kata sandi lama", autoComplete: "current-password" },
  { name: "newPassword", label: "Kata sandi baru", autoComplete: "new-password" },
  { name: "confirm", label: "Ulangi kata sandi baru", autoComplete: "new-password" },
];

const button =
  "flex h-11 w-full items-center justify-center rounded-lg bg-navy text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

export default function ChangePasswordForm() {
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const oldPassword = String(data.get("oldPassword"));
    const newPassword = String(data.get("newPassword"));
    if (newPassword !== data.get("confirm")) {
      setError("Ulangan kata sandi baru tidak sama.");
      return;
    }
    setPending(true);
    setError("");
    try {
      let res = await fetch("/api/auth/me");
      let body = await res.json().catch(() => null);
      if (res.ok) {
        res = await fetch("/api/auth/password", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": body.data.csrfToken },
          body: JSON.stringify({ oldPassword, newPassword }),
        });
        body = await res.json().catch(() => null);
      }
      if (res.ok) setDone(true);
      else setError(messages[body?.error?.code] ?? "Kata sandi belum bisa diganti. Coba lagi.");
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda.");
    }
    setPending(false);
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-6 text-center">
        <p className="text-sm text-[#1e2229]">
          Kata sandi sudah diganti. Masuk lagi dengan kata sandi baru.
        </p>
        {/* Full page load, so the login form starts empty. */}
        <a href="/login" className={button}>
          Masuk lagi
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {inputs.map((input) => (
        <div key={input.name}>
          <label htmlFor={input.name} className="mb-1.5 block text-sm font-semibold text-[#1e2229]">
            {input.label} <span className="text-danger">*</span>
          </label>
          <input
            id={input.name}
            name={input.name}
            type={show ? "text" : "password"}
            required
            autoComplete={input.autoComplete}
            className={field}
          />
        </div>
      ))}

      <label className="-mt-2 flex items-center gap-2 text-[13px] text-[#5b6270]">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Tampilkan kata sandi
      </label>

      <div role="alert" aria-live="polite">
        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>

      <button type="submit" disabled={pending} className={`${button} -mt-3`}>
        {pending ? "Memproses..." : "Simpan kata sandi"}
      </button>
      <a href="/login" className="-mt-2 text-center text-xs font-semibold text-azure underline-offset-4 hover:underline">
        Kembali ke halaman masuk
      </a>
    </form>
  );
}
