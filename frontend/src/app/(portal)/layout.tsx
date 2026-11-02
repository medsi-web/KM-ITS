import type { ReactNode } from "react";
import Navbar from "../_components/Navbar";
import "./_components/portal.css";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
