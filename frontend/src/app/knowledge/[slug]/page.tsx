import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import DocumentRow from "../_components/DocumentRow";
import {
  documents,
  formatLongDate,
  getGroup,
  groupDescription,
  groups,
} from "../_data/groups";

export function generateStaticParams() {
  return groups.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/knowledge/[slug]">): Promise<Metadata> {
  const group = getGroup((await params).slug);
  if (!group) return {};
  return { title: `${group.title ?? group.name} | KM ITS Knowledge` };
}

export default async function KnowledgeGroupPage({
  params,
}: PageProps<"/knowledge/[slug]">) {
  const group = getGroup((await params).slug);
  if (!group) notFound();

  const title = group.title ?? group.name;

  return (
    <div className="grid gap-y-10 px-5 pb-4 md:pl-[5.7%] md:pr-[8.5%] lg:grid-cols-[minmax(0,1fr)_449px] lg:gap-x-[117px]">
      {/* Group info + document list */}
      <div className="min-w-0">
        <nav
          aria-label="Breadcrumb"
          className="text-[10.6px] leading-[20.8px] text-[#525252]"
        >
          <Link href="/knowledge" className="font-bold text-[#5b6270]">
            KNOWLEDGE
          </Link>{" "}
          / {title}
        </nav>
        <p className="-mt-px text-[15px] uppercase leading-[36px] tracking-[1.2px] text-azure">
          Knowledge Group
        </p>
        <h1 className="-mt-[7px] max-w-[737px] text-[32px] font-bold leading-[38px] tracking-[-1px] md:text-[48.5px] md:leading-[54.5px] md:tracking-[-1.5px] text-navy">
          {title}
        </h1>
        <p className="mt-[5px] max-w-[624px] text-pretty text-[15.2px] leading-[21.2px] text-[#525252]">
          {groupDescription}
        </p>
        <p className="mt-1 flex items-center gap-[6px] text-[15.2px] font-bold leading-[36px] text-[#737373]">
          <Image src="/knowledge/clock-detail.svg" alt="" width={12} height={12} />
          Diperbarui {formatLongDate(group.updatedAt)}
        </p>

        <section
          aria-labelledby="doc-registry"
          className="-ml-2 mt-3 max-w-[659px] rounded-xl border border-dashed border-[#c4c9d1] bg-white p-[25px] shadow-[0_1px_1px_rgba(0,0,0,0.05)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#e5e5e5] pb-[17px]">
            <div className="flex items-center gap-2">
              <Image src="/knowledge/folder.svg" alt="" width={28} height={21} />
              <h2
                id="doc-registry"
                className="text-base leading-6 text-[#1e2229]"
              >
                Daftar Dokumen di dalam Group
              </h2>
            </div>
            <span className="rounded-full border border-[#e5e7eb] px-[11px] py-[3px] text-[11px] font-semibold leading-[16.5px] text-[#171717]">
              Belum diputuskan
            </span>
          </div>
          <ul>
            {documents.map((doc, i) => (
              <DocumentRow key={doc.name} doc={doc} first={i === 0} />
            ))}
          </ul>
          <p className="border-t border-[#e5e5e5] pt-[13px] text-right text-base leading-6 text-[#737373]">
            Menampilkan {documents.length} dokumen terverifikasi
          </p>
        </section>
      </div>

      {/* Side cards */}
      <aside className="lg:mt-[30px]">
        <div className="flex min-h-[380px] flex-col rounded-2xl border border-[#e5e7eb] bg-white p-[33px] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex size-[57px] items-center justify-center rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
            <Image src="/knowledge/drive-callout.svg" alt="" width={41} height={33} />
          </div>
          <h2 className="mt-5 text-[20px] font-bold leading-[26px] text-[#1e2229]">
            Referensi tersimpan di Google Drive
          </h2>
          <p className="mt-2 text-[14.2px] leading-[22px] text-[#525252]">
            Semua dokumen group ini dikelola dalam satu folder Google Drive
            resmi KM ITS. Anda dapat melihat pratinjau, mengunduh lampiran asli,
            atau menyalin template kerja langsung.
          </p>
          <div className="mt-auto flex flex-col gap-2 pt-5">
            <a
              href={group.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[49px] items-center justify-center gap-2 rounded-xl bg-navy text-base text-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#1c3369]"
            >
              Buka folder Google Drive
              <Image src="/knowledge/external-white.svg" alt="" width={14} height={14} />
            </a>
            <p className="flex items-center justify-center gap-[6px] pt-1 text-base leading-6 text-[#737373]">
              <Image src="/knowledge/info.svg" alt="" width={17} height={17} />
              Membuka drive.google.com di tab baru.
            </p>
          </div>
        </div>

        <div className="mt-[22px] rounded-2xl border border-[#e5e5e5] bg-white p-[25px] shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-3">
            <Image src="/knowledge/verified.svg" alt="" width={33} height={32} />
            <div>
              <h2 className="text-base leading-6 text-[#171717]">
                Validitas Sumber Data
              </h2>
              <p className="text-base leading-6 text-[#737373]">
                Biro Manajemen Informasi BEM KM ITS
              </p>
            </div>
          </div>
          <p className="mt-[11px] text-xs leading-5 text-[#525252]">
            Dokumen pada repositori ini telah ditinjau sesuai mekanisme
            keterbukaan informasi publik organisasi mahasiswa ITS. Hubungi biro
            terkait jika menemukan ketidaksesuaian salinan.
          </p>
        </div>
      </aside>
    </div>
  );
}
