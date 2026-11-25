import type { ReactNode } from "react";
import Footer from "../_components/Footer";
import Navbar from "../_components/Navbar";
import "./_components/portal.css";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
