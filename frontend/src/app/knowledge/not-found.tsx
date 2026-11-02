import type { Metadata } from "next";
import NotFoundMessage from "@/app/_components/NotFoundMessage";

export const metadata: Metadata = {
  title: "404 - Halaman Tidak Ditemukan | Portal KM ITS",
};

/** Rendered inside the knowledge layout, which already has the navbar and footer. */
export default function KnowledgeNotFound() {
  return <NotFoundMessage inLayout />;
}
