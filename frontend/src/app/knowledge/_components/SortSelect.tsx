"use client";

import Image from "next/image";
import { sortOptions, type SortValue } from "../_data/groups";

/** "Urutkan: <option>" pill. Changing it submits the surrounding search form. */
export default function SortSelect({ value }: { value: SortValue }) {
  const current = sortOptions.find((o) => o.value === value) ?? sortOptions[0];

  return (
    <label className="relative flex h-6 items-center gap-[6px] rounded-[6px] border border-[#e5e5e5] bg-white pl-[10px] pr-[26px] text-[9.6px] leading-none text-[#737373] focus-within:border-navy">
      <span>Urutkan:</span>
      <span className="font-semibold text-[#171717]">{current.label}</span>
      <Image
        src="/knowledge/sort-chevron.svg"
        alt=""
        width={21}
        height={21}
        className="pointer-events-none absolute right-[-2px] top-1/2 -translate-y-1/2"
      />
      <select
        name="sort"
        defaultValue={value}
        aria-label="Urutkan group"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
