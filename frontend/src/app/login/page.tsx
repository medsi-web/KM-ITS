import type { Metadata } from "next";
import LoginForm from "./_components/LoginForm";

export const metadata: Metadata = {
  title: "Masuk | Portal KM ITS",
  description: "Masuk khusus akun Ormawa dan pengurus internal KM ITS.",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <>
      <header className="kn-rise mb-9 text-center">
        <h1 className="text-[30px] font-bold leading-[38px] tracking-[-0.5px] text-navy">
          Hi, Selamat datang di
          <br />
          Portal KM ITS
        </h1>
        <p className="mt-1 text-[13px] leading-[19px] text-[#5b6270]">
          Khusus akun Ormawa dan pengurus internal KM ITS.
        </p>
      </header>
      <LoginForm />
    </>
  );
}
