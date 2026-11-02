import Image from "next/image";
import { inset, Tilted } from "@/app/_components/geometry";

/**
 * Batik key graphic in the top-right corner. Positioned in % of a box with the
 * Figma frame's aspect ratio (963.364 x 541.892), so it scales with the page width.
 */
export default function Batik() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-0 aspect-[963.3637/541.8921] w-full"
    >
      <Tilted
        box={inset(-18.5, -7.76, 49.6, 61.96)}
        angle={0.19}
        width={[99.7276, 0.38081]}
        height={[-0.27239, 99.6192]}
      >
        <Image src="/knowledge/batik-top.svg" alt="" fill sizes="40vw" />
      </Tilted>
      <Tilted
        box={inset(25.7, -25.31, -37.55, 54.19)}
        angle={-15}
        width={[82.1962, -24.895]}
        height={[17.8038, 75.105]}
      >
        <Image src="/knowledge/batik-mid.svg" alt="" fill sizes="50vw" />
      </Tilted>
    </div>
  );
}
