import type { Metadata } from "next";
import ChangePasswordForm from "../_components/ChangePasswordForm";

export const metadata: Metadata = {
  title: "Ganti Kata Sandi | Portal KM ITS",
  robots: { index: false },
};

export default function ChangePasswordPage() {
  return (
    <>
      <header className="kn-rise mb-9 text-center">
        <h1 className="text-[30px] font-bold leading-[38px] tracking-[-0.5px] text-navy">
          Ganti kata sandi
        </h1>
        <p className="mt-1 text-[13px] leading-[19px] text-[#5b6270]">
          Kata sandi sementara harus diganti sebelum akun bisa dipakai.
        </p>
      </header>
      <ChangePasswordForm />
    </>
  );
}
