import Image from "next/image";
import Link from "next/link";

/** Centered message used when there are no groups or no search results. */
export default function EmptyState({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
  className = "",
}: {
  icon: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto flex w-full max-w-[868px] flex-col items-center px-6 text-center ${className}`}
    >
      <div className="flex size-[98px] items-center justify-center rounded-full bg-icon-tint">
        <Image src={icon} alt="" width={44} height={44} />
      </div>
      <h2 className="mt-[33px] text-[32px] font-semibold leading-[43px] tracking-[-0.8px] text-[#233f7c]">
        {title}
      </h2>
      <p className="mt-[11px] max-w-[628px] text-[19px] leading-[30px] text-[#5b6270]">
        {description}
      </p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-[33px] rounded-[11px] border border-[#d9dde3] bg-white px-7 py-[13px] text-[19px] font-semibold leading-[28px] text-[#233f7c] shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:border-navy"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
